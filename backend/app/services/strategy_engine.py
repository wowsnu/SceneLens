import os
import json
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Set
from google import genai
from google.genai import types
from app.models.schemas import CIR, Strategy, Shot, SuggestStrategiesResponse

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lazy initialization - client will be created when first needed
_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        _client = genai.Client(api_key=api_key)
    return _client

# Load prompt
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
with open(PROMPTS_DIR / "strategy_suggest.txt", "r") as f:
    STRATEGY_PROMPT = f.read()

# Load Theory DB
DB_PATH = Path(__file__).parent.parent / "db" / "theory_db.json"
with open(DB_PATH, "r", encoding="utf-8") as f:
    THEORY_DB = json.load(f)

print(f"[TheoryDB] Loaded from: {DB_PATH}")
print(f"[TheoryDB] {len(THEORY_DB.get('theory_units', []))} theory units, "
      f"{len(THEORY_DB.get('operations', []))} operations, "
      f"{len(THEORY_DB.get('books', []))} books")

# Build lookup indexes for fast querying
_THEORY_BY_ID: Dict[str, dict] = {
    t["id"]: t for t in THEORY_DB.get("theory_units", [])
}
_OPS_BY_THEORY_ID: Dict[str, List[dict]] = {}
for op in THEORY_DB.get("operations", []):
    tid = op.get("theory_unit_id", "")
    _OPS_BY_THEORY_ID.setdefault(tid, []).append(op)

_BOOKS_BY_ID: Dict[str, dict] = {
    b["id"]: b for b in THEORY_DB.get("books", [])
}

def _get_book_source(book_id: str) -> str:
    """Get clean book title from book_id via direct lookup."""
    book = _BOOKS_BY_ID.get(book_id)
    if not book:
        return "Film Theory Reference"
    # Clean up PDF filename → readable title
    title = book["title"]
    for remove in [".pdf", "(1)", "_UPLOAD", "UPLOAD", " (pdf)"]:
        title = title.replace(remove, "")
    title = title.replace("_", " ").replace("-", " ").replace("  ", " ").strip()
    # Remove trailing/leading artifacts
    title = title.strip("_ .-")
    return title

# CIR attribute → related_dimensions keyword mapping
# Maps each CIR field to keywords that appear in operations' related_dimensions
CIR_TO_DIMENSIONS = {
    "shotSize": [
        "shot size", "close-up", "close up", "wide shot", "medium shot",
        "framing", "shot type", "shot composition", "frame size",
    ],
    "cameraAngle": [
        "camera angle", "high angle", "low angle", "viewpoint",
        "camera perspective", "angle",
    ],
    "cameraLevel": [
        "camera height", "camera position", "camera level",
        "head room", "headroom", "player height", "camera placement",
    ],
    "relation": [
        "blocking", "actor blocking", "character blocking", "staging",
        "subject placement", "actor positioning", "character placement",
        "two-shot", "over the shoulder", "single shot",
    ],
    "blockingDistance": [
        "camera distance", "subject-to-camera distance", "camera proximity",
        "depth", "depth of field", "lens type", "lens choice",
        "subject-camera distance", "camera-to-subject distance",
    ],
    "eyeline": [
        "eye-line", "eyeline", "eye line", "actor gaze", "character gaze",
        "player gaze", "performer gaze", "screen direction", "visual axis",
    ],
    "occlusion": [
        "foreground", "background", "obstruction", "silhouette",
        "foreground elements", "background elements", "depth",
    ],
    "motionHint": [
        "camera movement", "motion", "movement", "actor movement",
        "subject movement", "player movement", "character movement",
        "movement direction", "motion path",
    ],
}

# Intent keyword mapping (Korean → English tags for soft_tags matching)
INTENT_KEYWORD_MAP = {
    "긴장": ["tension", "suspense", "pressure", "conflict"],
    "감정": ["emotion", "intimacy", "feeling", "empathy"],
    "대립": ["confrontation", "power", "conflict", "opposition"],
    "거리": ["distance", "isolation", "separation", "proximity"],
    "친밀": ["intimacy", "connection", "closeness", "personal"],
    "추격": ["chase", "action", "pursuit", "movement"],
    "대화": ["dialogue", "conversation", "exchange", "verbal"],
    "고립": ["isolation", "loneliness", "entrapment", "confinement"],
    "권력": ["power", "dominance", "authority", "hierarchy"],
    "밝히": ["revelation", "discovery", "exposure", "truth"],
    "공포": ["fear", "horror", "dread", "anxiety"],
    "슬픔": ["sadness", "grief", "loss", "melancholy"],
    "사랑": ["love", "romance", "affection", "attraction"],
    "분노": ["anger", "rage", "fury", "aggression"],
    "반전": ["twist", "reversal", "surprise", "subversion"],
    "압박": ["pressure", "tension", "claustrophobia", "confinement"],
    "위협": ["threat", "menace", "danger", "intimidation"],
    "서스펜스": ["suspense", "tension", "anticipation"],
    "클라이맥스": ["climax", "peak", "culmination"],
}


def _normalize_dim(dim: str) -> str:
    """Normalize a dimension string for matching."""
    return dim.lower().strip()


def filter_theories_by_cir_and_intent(
    cir: CIR,
    intent: str,
    max_theories: int = 8,
) -> List[dict]:
    """
    Two-stage filtering:
    1. CIR-based: Find operations whose related_dimensions match current CIR attributes,
       then pull their linked theory_units
    2. Intent-based: Filter theory_units by soft_tags matching the director's intent

    Combines both sets, scores by relevance, returns top results with their operations.
    """
    intent_lower = intent.lower()

    # --- Stage 1: CIR-dimension matching ---
    # For each CIR attribute, find operations that touch those dimensions
    cir_dict = cir.model_dump()
    cir_matched_theory_ids: Dict[str, float] = {}  # theory_id → score

    for cir_field, dim_keywords in CIR_TO_DIMENSIONS.items():
        cir_value = cir_dict.get(cir_field, "")
        if not cir_value or cir_value == "Unknown":
            continue

        for op in THEORY_DB.get("operations", []):
            op_dims = [_normalize_dim(d) for d in op.get("related_dimensions", [])]
            # Check if any CIR-mapped keyword appears in this operation's dimensions
            if any(kw in dim_text for kw in dim_keywords for dim_text in op_dims):
                tid = op.get("theory_unit_id", "")
                if tid in _THEORY_BY_ID:
                    cir_matched_theory_ids[tid] = cir_matched_theory_ids.get(tid, 0) + 1.0

    # --- Stage 2: Intent soft_tags matching ---
    relevant_tags: Set[str] = set()
    for korean, english_tags in INTENT_KEYWORD_MAP.items():
        if korean in intent_lower:
            relevant_tags.update(english_tags)

    # Also use raw English words from intent
    for word in intent_lower.split():
        if len(word) > 3:
            relevant_tags.add(word)

    intent_matched_theory_ids: Dict[str, float] = {}
    for theory in THEORY_DB.get("theory_units", []):
        soft_tags = theory.get("soft_tags", [])
        tags_text = " ".join(soft_tags).lower()

        match_count = sum(1 for tag in relevant_tags if tag in tags_text)
        if match_count > 0:
            intent_matched_theory_ids[theory["id"]] = match_count

    # --- Combine scores ---
    all_theory_ids: Dict[str, float] = {}
    for tid, score in cir_matched_theory_ids.items():
        all_theory_ids[tid] = all_theory_ids.get(tid, 0) + score
    for tid, score in intent_matched_theory_ids.items():
        all_theory_ids[tid] = all_theory_ids.get(tid, 0) + score * 2.0  # Boost intent match

    # Sort by score descending
    sorted_ids = sorted(all_theory_ids.items(), key=lambda x: -x[1])

    # --- Build results with operations ---
    results = []
    for tid, score in sorted_ids[:max_theories]:
        theory = _THEORY_BY_ID.get(tid)
        if not theory:
            continue

        # Only include shot/scene level theories
        level = theory.get("level", "shot")
        if level not in ("shot", "scene"):
            continue

        # Get linked operations
        ops = _OPS_BY_THEORY_ID.get(tid, [])
        ops_data = []
        for op in ops[:1]:  # Max 1 operation per theory to keep prompt compact
            ops_data.append({
                "suggested_change": op.get("suggested_change", {}),
                "related_dimensions": op.get("related_dimensions", []),
                "explanation": op.get("explanation_template", ""),
            })

        # Get book source
        source = _get_book_source(theory.get("book_id", ""))

        results.append({
            "id": theory["id"],
            "title": theory["title"],
            "summary": theory["summary"],
            "applies_when": theory.get("applies_when", ""),
            "expected_effect": theory.get("expected_effect", ""),
            "caution": theory.get("caution", ""),
            "source": source,
            "soft_tags": theory.get("soft_tags", []),
            "level": level,
            "operations": ops_data,
            "relevance_score": score,
        })

    # Fallback: if no matches, return some general theories
    if not results:
        for theory in THEORY_DB.get("theory_units", [])[:5]:
            source = _get_book_source(theory.get("book_id", ""))
            results.append({
                "id": theory["id"],
                "title": theory["title"],
                "summary": theory["summary"],
                "applies_when": theory.get("applies_when", ""),
                "expected_effect": theory.get("expected_effect", ""),
                "source": source,
                "soft_tags": theory.get("soft_tags", []),
                "operations": [],
                "relevance_score": 0,
            })

    return results


async def suggest_strategies_v1(
    cir: CIR,
    intent: str,
    script_context: str = ""
) -> SuggestStrategiesResponse:
    """
    [Method 1] Keyword-matching based strategy suggestion.
    Uses CIR-dimension + intent-tag filtering from theory_db.json.

    Args:
        cir: Current cinematic intermediate representation
        intent: Director's intention/goal
        script_context: Scene context

    Returns:
        SuggestStrategiesResponse with 2-3 strategy alternatives
    """
    # Filter relevant theories using CIR + intent matching
    relevant_theories = filter_theories_by_cir_and_intent(cir, intent)

    print(f"[Strategy] Matched {len(relevant_theories)} theories for intent='{intent}'")
    for t in relevant_theories[:5]:
        print(f"  - [{t['relevance_score']:.1f}] {t['title']} ({t['source']})")

    # Prepare prompt
    prompt = f"""{STRATEGY_PROMPT}

[Current CIR State]
{cir.model_dump_json(indent=2)}

[Director's Intent]
{intent}

[Scene Context]
{script_context}

[Relevant Film Theories & Operations]
{json.dumps(relevant_theories, indent=2, ensure_ascii=False)}

Based on the above current CIR and relevant theories, generate 2-3 alternative REFRAMING strategies as valid JSON (no markdown, no code fences).

CRITICAL: Each strategy has exactly 1 shot — an adjusted version of the CURRENT composition.
Only change 2-4 CIR attributes per strategy. Keep the rest identical to the current CIR.
Do NOT propose a completely different shot type. The sketch already exists.

Format:
{{
  "strategies": [
    {{
      "name": "감정을 담은 짧은 한글 이름 (예: 숨막히는 거리감, 시선의 압박)",
      "shots": [
        {{
          "order": 1,
          "cir": {{ "shotSize": "...", "cameraAngle": "...", "cameraLevel": "...", "relation": "...", "blockingDistance": "...", "eyeline": "...", "occlusion": "...", "motionHint": "..." }},
          "theory_rationale": "한글로 이론 근거 설명...",
          "source": "Book title"
        }}
      ],
      "intention_tags": ["tension", "emotion"]
    }}
  ]
}}
"""

    client = get_client()
    response = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt
            )
            break
        except Exception as e:
            err_str = str(e)
            if '503' in err_str or 'UNAVAILABLE' in err_str or 'overloaded' in err_str.lower():
                wait = (attempt + 1) * 3
                print(f"[Strategy] Gemini 503, retry {attempt+1}/3 in {wait}s...")
                await asyncio.sleep(wait)
            else:
                raise
    if response is None:
        raise Exception("Gemini API unavailable after 3 retries")

    # Parse JSON response
    try:
        text = response.text.strip()
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()

        data = json.loads(text)

        # Convert to Pydantic models
        strategies = []
        for strat_data in data.get("strategies", []):
            shots = [
                Shot(
                    order=shot["order"],
                    cir=CIR(**shot["cir"]),
                    theory_rationale=shot["theory_rationale"],
                    source=shot["source"]
                )
                for shot in strat_data["shots"]
            ]
            strategies.append(Strategy(
                name=strat_data["name"],
                shots=shots,
                intention_tags=strat_data.get("intention_tags", [])
            ))

        return SuggestStrategiesResponse(strategies=strategies)

    except (json.JSONDecodeError, KeyError) as e:
        print(f"Failed to parse strategy response: {response.text}")
        return SuggestStrategiesResponse(strategies=[])


# ── Context Cache Lifecycle ───────────────────────────────────────────

THEORY_TEXTS_PATH = Path(__file__).parent.parent / "db" / "theory_texts.json"
_THEORY_CACHE_NAME = None

def warmup_theory_cache():
    """
    Initialize and warmup the context cache by uploading theory books.
    This should be called at server startup to prevent first-request timeouts.
    """
    global _THEORY_CACHE_NAME
    if _THEORY_CACHE_NAME:
        logger.info(f"[TheoryEngine] Cache already warmed up: {_THEORY_CACHE_NAME}")
        return _THEORY_CACHE_NAME

    logger.info("[TheoryEngine] Warming up context cache with film theory books...")
    try:
        if not THEORY_TEXTS_PATH.exists():
            logger.warning(f"[TheoryEngine] Warning: {THEORY_TEXTS_PATH} not found. Caching skipped.")
            return None

        with open(THEORY_TEXTS_PATH, "r", encoding="utf-8") as f:
            theory_texts = json.load(f)

        reference_text = ""
        for filename, text in theory_texts.items():
            clean_name = filename.replace(".pdf", "").replace("_", " ").replace("(1)", "").strip()
            reference_text += f"\n\n{'='*60}\n[Book: {clean_name}]\n{'='*60}\n{text}\n"

        client = get_client()
        
        # Check if a cache with the same display name already exists
        try:
            existing_caches = client.caches.list()
            for c in existing_caches:
                if c.display_name == "Film Theory Library":
                    _THEORY_CACHE_NAME = c.name
                    logger.info(f"[TheoryEngine] Found existing cache: {_THEORY_CACHE_NAME}")
                    return _THEORY_CACHE_NAME
        except Exception as cache_list_err:
            logger.debug(f"Could not list caches: {cache_list_err}")

        # Create a new context cache
        cache = client.caches.create(
            model='gemini-2.5-flash',
            config={
                'display_name': 'Film Theory Library',
                'system_instruction': 'You are an expert film director and cinematographer. Use the provided film theory books to provide strategic advice.',
                'contents': [reference_text],
                'ttl': '7200s', # 2 hours
            }
        )
        _THEORY_CACHE_NAME = cache.name
        logger.info(f"[TheoryEngine] Context Cache created and warmed up: {_THEORY_CACHE_NAME}")
        return _THEORY_CACHE_NAME
    except Exception as e:
        logger.error(f"[TheoryEngine] Failed to warmup cache: {e}")
        import traceback
        traceback.print_exc()
        return None


async def suggest_strategies_v2(
    cir: CIR,
    intent: str,
    script_context: str = "",
    image_base64: str = None
) -> SuggestStrategiesResponse:
    """
    [Method 2] Context Caching + Multimodal approach.
    Uses cached film theory books and the actual sketch image for analysis.
    """
    cache_name = warmup_theory_cache()
    
    prompt = f"""{STRATEGY_PROMPT}

[Current CIR State]
{cir.model_dump_json(indent=2)}

[Director's Intent]
{intent}

[Scene Context]
{script_context}

[Instruction]
1. ANALYZE the provided sketch image and its current CIR metadata against the Director's Intent and Scene Context.
2. REFERENCE specific cinematographic principles from your cached film theory library.
3. PROPOSE 2-3 alternative REFRAMING strategies as valid JSON.
4. Each strategy must include a clear 'theory_rationale' citing the specific book and principle used.

CRITICAL: Each strategy has exactly 1 shot — an adjusted version of the CURRENT composition.
Only change 2-4 CIR attributes per strategy. Keep the rest identical to the current CIR.
Do NOT propose a completely different shot type. The sketch already exists.

Format:
{{
  "strategies": [
    {{
      "name": "감정을 담은 짧은 한글 이름 (예: 숨막히는 거리감, 시선의 압박)",
      "shots": [
        {{
          "order": 1,
          "cir": {{ 
            "shotSize": "...", 
            "horizontalAngle": "...", 
            "verticalLevel": "...", 
            "viewpointFraming": "...", 
            "occlusion": "...", 
            "depth": "...", 
            "motionHint": "..." 
          }},
          "theory_rationale": "한글로 이론 근거 설명 (어떤 책의 어떤 원리를 참고했는지 포함)...",
          "source": "Book title"
        }}
      ],
      "intention_tags": ["tension", "emotion"]
    }}
  ]
}}
"""

    contents = [prompt]
    if image_base64:
        # Add the image to the multimodal prompt
        contents.append(types.Part.from_bytes(
            data=image_base64,
            mime_type="image/png" if not image_base64.startswith("data:image/jpeg") else "image/jpeg"
        ))

    client = get_client()
    response = None
    for attempt in range(3):
        try:
            # Use the cached context for generation
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents,
                config=types.GenerateContentConfig(
                    cached_content=cache_name
                ) if cache_name else None
            )
            break
        except Exception as e:
            err_str = str(e)
            if '503' in err_str or 'UNAVAILABLE' in err_str or 'overloaded' in err_str.lower():
                wait = (attempt + 1) * 3
                print(f"[Strategy v2] Gemini 503, retry {attempt+1}/3 in {wait}s...")
                await asyncio.sleep(wait)
            else:
                raise

    if response is None:
        raise Exception("Gemini API unavailable after 3 retries")

    try:
        text = response.text.strip()
        # Clean up markdown if present
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()

        data = json.loads(text)

        strategies = []
        for strat_data in data.get("strategies", []):
            # Map verticalLevel back to verticalLevel (the schema uses verticalLevel, verticalLevel, horizontalAngle, etc.)
            # Ensure CIR mapping is correct for the Pydantic model
            shots = [
                Shot(
                    order=shot["order"],
                    cir=CIR(**shot["cir"]),
                    theory_rationale=shot["theory_rationale"],
                    source=shot["source"]
                )
                for shot in strat_data["shots"]
            ]
            strategies.append(Strategy(
                name=strat_data["name"],
                shots=shots,
                intention_tags=strat_data.get("intention_tags", [])
            ))

        return SuggestStrategiesResponse(strategies=strategies)

    except (json.JSONDecodeError, KeyError) as e:
        print(f"[Strategy v2] Failed to parse response: {response.text}")
        return SuggestStrategiesResponse(strategies=[])


# ── Default: use v2 if available, fallback to v1 ─────────────────

async def suggest_strategies(
    cir: CIR,
    intent: str,
    script_context: str = "",
    image_base64: str = None
) -> SuggestStrategiesResponse:
    # Always prefer v2 (now with caching and multimodal support)
    if THEORY_TEXTS_PATH.exists():
        print("[Strategy] Using method 2 (Context Caching + Multimodal)")
        return await suggest_strategies_v2(cir, intent, script_context, image_base64)
    else:
        print("[Strategy] Using method 1 (Keyword matching fallback)")
        return await suggest_strategies_v1(cir, intent, script_context)
