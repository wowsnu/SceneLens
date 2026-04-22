import os
import json
import asyncio
import logging
from pathlib import Path
from typing import List, Dict  # noqa: F401  (used in commented v1 code)
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

# ── [v1 DEPRECATED] Theory DB keyword-matching path ──────────────────
# v2 (Context Cache) is the default. v1 kept commented for reference.
#
# # Load Theory DB
# DB_PATH = Path(__file__).parent.parent / "db" / "theory_db.json"
# with open(DB_PATH, "r", encoding="utf-8") as f:
#     THEORY_DB = json.load(f)
#
# print(f"[TheoryDB] Loaded from: {DB_PATH}")
# print(f"[TheoryDB] {len(THEORY_DB.get('theory_units', []))} theory units, "
#       f"{len(THEORY_DB.get('operations', []))} operations, "
#       f"{len(THEORY_DB.get('books', []))} books")
#
# # Build lookup indexes for fast querying
# _THEORY_BY_ID: Dict[str, dict] = {
#     t["id"]: t for t in THEORY_DB.get("theory_units", [])
# }
# _OPS_BY_THEORY_ID: Dict[str, List[dict]] = {}
# for op in THEORY_DB.get("operations", []):
#     tid = op.get("theory_unit_id", "")
#     _OPS_BY_THEORY_ID.setdefault(tid, []).append(op)
#
# _BOOKS_BY_ID: Dict[str, dict] = {
#     b["id"]: b for b in THEORY_DB.get("books", [])
# }
#
# def _get_book_source(book_id: str) -> str:
#     """Get clean book title from book_id via direct lookup."""
#     book = _BOOKS_BY_ID.get(book_id)
#     if not book:
#         return "Film Theory Reference"
#     # Clean up PDF filename → readable title
#     title = book["title"]
#     for remove in [".pdf", "(1)", "_UPLOAD", "UPLOAD", " (pdf)"]:
#         title = title.replace(remove, "")
#     title = title.replace("_", " ").replace("-", " ").replace("  ", " ").strip()
#     # Remove trailing/leading artifacts
#     title = title.strip("_ .-")
#     return title

# ── [v1 DEPRECATED] CIR/Intent keyword tables ───────────────────────
# # CIR attribute → related_dimensions keyword mapping
# # Maps each CIR field to keywords that appear in operations' related_dimensions
# CIR_TO_DIMENSIONS = {
#     "shotSize": [
#         "shot size", "close-up", "close up", "wide shot", "medium shot",
#         "framing", "shot type", "shot composition", "frame size",
#     ],
#     "cameraAngle": [
#         "camera angle", "high angle", "low angle", "viewpoint",
#         "camera perspective", "angle",
#     ],
#     "cameraLevel": [
#         "camera height", "camera position", "camera level",
#         "head room", "headroom", "player height", "camera placement",
#     ],
#     "relation": [
#         "blocking", "actor blocking", "character blocking", "staging",
#         "subject placement", "actor positioning", "character placement",
#         "two-shot", "over the shoulder", "single shot",
#     ],
#     "blockingDistance": [
#         "camera distance", "subject-to-camera distance", "camera proximity",
#         "depth", "depth of field", "lens type", "lens choice",
#         "subject-camera distance", "camera-to-subject distance",
#     ],
#     "eyeline": [
#         "eye-line", "eyeline", "eye line", "actor gaze", "character gaze",
#         "player gaze", "performer gaze", "screen direction", "visual axis",
#     ],
#     "occlusion": [
#         "foreground", "background", "obstruction", "silhouette",
#         "foreground elements", "background elements", "depth",
#     ],
#     "motionHint": [
#         "camera movement", "motion", "movement", "actor movement",
#         "subject movement", "player movement", "character movement",
#         "movement direction", "motion path",
#     ],
# }
#
# # Intent keyword mapping (Korean → English tags for soft_tags matching)
# INTENT_KEYWORD_MAP = {
#     "긴장": ["tension", "suspense", "pressure", "conflict"],
#     "감정": ["emotion", "intimacy", "feeling", "empathy"],
#     "대립": ["confrontation", "power", "conflict", "opposition"],
#     "거리": ["distance", "isolation", "separation", "proximity"],
#     "친밀": ["intimacy", "connection", "closeness", "personal"],
#     "추격": ["chase", "action", "pursuit", "movement"],
#     "대화": ["dialogue", "conversation", "exchange", "verbal"],
#     "고립": ["isolation", "loneliness", "entrapment", "confinement"],
#     "권력": ["power", "dominance", "authority", "hierarchy"],
#     "밝히": ["revelation", "discovery", "exposure", "truth"],
#     "공포": ["fear", "horror", "dread", "anxiety"],
#     "슬픔": ["sadness", "grief", "loss", "melancholy"],
#     "사랑": ["love", "romance", "affection", "attraction"],
#     "분노": ["anger", "rage", "fury", "aggression"],
#     "반전": ["twist", "reversal", "surprise", "subversion"],
#     "압박": ["pressure", "tension", "claustrophobia", "confinement"],
#     "위협": ["threat", "menace", "danger", "intimidation"],
#     "서스펜스": ["suspense", "tension", "anticipation"],
#     "클라이맥스": ["climax", "peak", "culmination"],
# }


def _build_shot_model(shot: dict) -> Shot:
    from app.models.schemas import MiseEnScene, Lighting
    cir_val = shot.get("cir")
    mise_val = shot.get("mise")
    lighting_val = shot.get("lighting")
    return Shot(
        order=shot["order"],
        cir=CIR(**cir_val) if cir_val else None,
        mise=MiseEnScene(**mise_val) if mise_val else None,
        lighting=Lighting(**lighting_val) if lighting_val else None,
        freeform=shot.get("freeform"),
        theory_rationale=shot.get("theory_rationale", ""),
        source=shot.get("source", ""),
        recommendation_summary=shot.get("recommendation_summary", ""),
        theory_fit_summary=shot.get("theory_fit_summary", ""),
        current_shot_connection=shot.get("current_shot_connection", ""),
        expected_effect_summary=shot.get("expected_effect_summary", ""),
    )


# ── [v1 DEPRECATED] Keyword-matching strategy suggestion ────────────
# def _normalize_dim(dim: str) -> str:
#     """Normalize a dimension string for matching."""
#     return dim.lower().strip()
#
#
# def filter_theories_by_cir_and_intent(
#     cir: CIR,
#     intent: str,
#     max_theories: int = 8,
# ) -> List[dict]:
#     """
#     Two-stage filtering:
#     1. CIR-based: Find operations whose related_dimensions match current CIR attributes,
#        then pull their linked theory_units
#     2. Intent-based: Filter theory_units by soft_tags matching the director's intent
#
#     Combines both sets, scores by relevance, returns top results with their operations.
#     """
#     intent_lower = intent.lower()
#
#     # --- Stage 1: CIR-dimension matching ---
#     # For each CIR attribute, find operations that touch those dimensions
#     cir_dict = cir.model_dump()
#     cir_matched_theory_ids: Dict[str, float] = {}  # theory_id → score
#
#     for cir_field, dim_keywords in CIR_TO_DIMENSIONS.items():
#         cir_value = cir_dict.get(cir_field, "")
#         if not cir_value or cir_value == "Unknown":
#             continue
#
#         for op in THEORY_DB.get("operations", []):
#             op_dims = [_normalize_dim(d) for d in op.get("related_dimensions", [])]
#             # Check if any CIR-mapped keyword appears in this operation's dimensions
#             if any(kw in dim_text for kw in dim_keywords for dim_text in op_dims):
#                 tid = op.get("theory_unit_id", "")
#                 if tid in _THEORY_BY_ID:
#                     cir_matched_theory_ids[tid] = cir_matched_theory_ids.get(tid, 0) + 1.0
#
#     # --- Stage 2: Intent soft_tags matching ---
#     relevant_tags: Set[str] = set()
#     for korean, english_tags in INTENT_KEYWORD_MAP.items():
#         if korean in intent_lower:
#             relevant_tags.update(english_tags)
#
#     # Also use raw English words from intent
#     for word in intent_lower.split():
#         if len(word) > 3:
#             relevant_tags.add(word)
#
#     intent_matched_theory_ids: Dict[str, float] = {}
#     for theory in THEORY_DB.get("theory_units", []):
#         soft_tags = theory.get("soft_tags", [])
#         tags_text = " ".join(soft_tags).lower()
#
#         match_count = sum(1 for tag in relevant_tags if tag in tags_text)
#         if match_count > 0:
#             intent_matched_theory_ids[theory["id"]] = match_count
#
#     # --- Combine scores ---
#     all_theory_ids: Dict[str, float] = {}
#     for tid, score in cir_matched_theory_ids.items():
#         all_theory_ids[tid] = all_theory_ids.get(tid, 0) + score
#     for tid, score in intent_matched_theory_ids.items():
#         all_theory_ids[tid] = all_theory_ids.get(tid, 0) + score * 2.0  # Boost intent match
#
#     # Sort by score descending
#     sorted_ids = sorted(all_theory_ids.items(), key=lambda x: -x[1])
#
#     # --- Build results with operations ---
#     results = []
#     for tid, score in sorted_ids[:max_theories]:
#         theory = _THEORY_BY_ID.get(tid)
#         if not theory:
#             continue
#
#         # Only include shot/scene level theories
#         level = theory.get("level", "shot")
#         if level not in ("shot", "scene"):
#             continue
#
#         # Get linked operations
#         ops = _OPS_BY_THEORY_ID.get(tid, [])
#         ops_data = []
#         for op in ops[:1]:  # Max 1 operation per theory to keep prompt compact
#             ops_data.append({
#                 "suggested_change": op.get("suggested_change", {}),
#                 "related_dimensions": op.get("related_dimensions", []),
#                 "explanation": op.get("explanation_template", ""),
#             })
#
#         # Get book source
#         source = _get_book_source(theory.get("book_id", ""))
#
#         results.append({
#             "id": theory["id"],
#             "title": theory["title"],
#             "summary": theory["summary"],
#             "applies_when": theory.get("applies_when", ""),
#             "expected_effect": theory.get("expected_effect", ""),
#             "caution": theory.get("caution", ""),
#             "source": source,
#             "soft_tags": theory.get("soft_tags", []),
#             "level": level,
#             "operations": ops_data,
#             "relevance_score": score,
#         })
#
#     # Fallback: if no matches, return some general theories
#     if not results:
#         for theory in THEORY_DB.get("theory_units", [])[:5]:
#             source = _get_book_source(theory.get("book_id", ""))
#             results.append({
#                 "id": theory["id"],
#                 "title": theory["title"],
#                 "summary": theory["summary"],
#                 "applies_when": theory.get("applies_when", ""),
#                 "expected_effect": theory.get("expected_effect", ""),
#                 "source": source,
#                 "soft_tags": theory.get("soft_tags", []),
#                 "operations": [],
#                 "relevance_score": 0,
#             })
#
#     return results
#
#
# async def suggest_strategies_v1(
#     cir: CIR,
#     intent: str,
#     script_context: str = "",
#     preferred_theories: list = None,
# ) -> SuggestStrategiesResponse:
#     """
#     [Method 1] Keyword-matching based strategy suggestion.
#     Uses CIR-dimension + intent-tag filtering from theory_db.json.
#     If preferred_theories provided (from theory_answer), uses those directly.
#     """
#     # Use preferred theories if provided, otherwise filter from DB
#     if preferred_theories:
#         relevant_theories = preferred_theories
#     else:
#         relevant_theories = filter_theories_by_cir_and_intent(cir, intent)
#
#     print(f"[Strategy] Matched {len(relevant_theories)} theories for intent='{intent}'")
#     for t in relevant_theories[:5]:
#         print(f"  - [{t['relevance_score']:.1f}] {t['title']} ({t['source']})")
#
#     # Prepare prompt
#     prompt = f"""{STRATEGY_PROMPT}
#
# [Current CIR State]
# {cir.model_dump_json(indent=2)}
#
# [Director's Intent]
# {intent}
#
# [Scene Context]
# {script_context}
#
# [Relevant Film Theories & Operations]
# {json.dumps(relevant_theories, indent=2, ensure_ascii=False)}
#
# Based on the above current CIR and relevant theories, generate 2-3 alternative REFRAMING strategies as valid JSON (no markdown, no code fences).
#
# CRITICAL: Each strategy has exactly 1 shot — an adjusted version of the CURRENT composition.
# Only change 2-4 CIR attributes per strategy. Keep the rest identical to the current CIR.
# Do NOT propose a completely different shot type. The sketch already exists.
#
# Format:
# {{
#   "strategies": [
#     {{
#       "name": "감정을 담은 짧은 한글 이름 (예: 숨막히는 거리감, 시선의 압박)",
#       "short_title": "구체적인 구도 변화 한 줄, 15자 이내 (예: 클로즈업으로 전환, 로우 앵글 강조)",
#       "shots": [
#         {{
#           "order": 1,
#           "cir": {{ "shotSize": "...", "cameraAngle": "...", "cameraLevel": "...", "relation": "...", "blockingDistance": "...", "eyeline": "...", "occlusion": "...", "motionHint": "..." }},
#           "recommendation_summary": "지금 샷에서 무엇을 어떻게 바꾸는지 한 줄로 설명",
#           "theory_fit_summary": "어떤 책/이론 개념이 왜 여기 맞는지 한 줄 요약",
#           "current_shot_connection": "현재 분석된 샷과 이 추천이 어떻게 연결되는지 한 줄 설명",
#           "expected_effect_summary": "이 변화가 줄 감정적/서사적 효과를 한 줄 설명",
#           "theory_rationale": "한글로 이론 근거 설명...",
#           "source": "Book title"
#         }}
#       ],
#       "intention_tags": ["tension", "emotion"]
#     }}
#   ]
# }}
# """
#
#     client = get_client()
#     response = None
#     for attempt in range(3):
#         try:
#             response = client.models.generate_content(
#                 model='gemini-2.5-flash',
#                 contents=prompt
#             )
#             break
#         except Exception as e:
#             err_str = str(e)
#             if '503' in err_str or 'UNAVAILABLE' in err_str or 'overloaded' in err_str.lower():
#                 wait = (attempt + 1) * 3
#                 print(f"[Strategy] Gemini 503, retry {attempt+1}/3 in {wait}s...")
#                 await asyncio.sleep(wait)
#             else:
#                 raise
#     if response is None:
#         raise Exception("Gemini API unavailable after 3 retries")
#
#     # Parse JSON response
#     try:
#         text = response.text.strip()
#         if text.startswith('```'):
#             text = text.split('```')[1]
#             if text.startswith('json'):
#                 text = text[4:]
#             text = text.strip()
#
#         data = json.loads(text)
#
#         # Convert to Pydantic models
#         strategies = []
#         for strat_data in data.get("strategies", []):
#             shots = [
#                 _build_shot_model(shot)
#                 for shot in strat_data["shots"]
#             ]
#             strategies.append(Strategy(
#                 name=strat_data["name"],
#                 short_title=strat_data.get("short_title"),
#                 shots=shots,
#                 intention_tags=strat_data.get("intention_tags", [])
#             ))
#
#         return SuggestStrategiesResponse(strategies=strategies)
#
#     except (json.JSONDecodeError, KeyError) as e:
#         print(f"Failed to parse strategy response: {response.text}")
#         return SuggestStrategiesResponse(strategies=[])


async def theory_answer(
    cir: CIR,
    intent: str,
    script_context: str = ""
) -> dict:
    """
    캐시된 영화 이론 책을 바탕으로 감독의 의도에 맞는 답변 생성.
    v2와 동일한 소스(Context Cache)를 사용해 일관성 확보.
    반환: { answer: str }
    """
    cache_name = warmup_theory_cache()

    prompt = f"""당신은 영화 촬영 이론에 정통한 전문가입니다.
캐시된 영화 이론 서적들을 참고하여 아래 질문에 답하세요.

감독의 의도: {intent}
현재 구도 (CIR): {cir.model_dump_json()}
씬 맥락: {script_context or '없음'}

위 상황에서 감독의 의도를 어떻게 구현할 수 있는지 2-3문장으로 간결하게 한국어로 설명해주세요.
참고한 이론과 출처(책 제목)를 자연스럽게 언급하고, 실제 촬영에 바로 적용할 수 있는 조언으로 마무리하세요.
마크다운 없이 평문으로만 답하세요."""

    client = get_client()
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[prompt],
        config=types.GenerateContentConfig(
            cached_content=cache_name
        ) if cache_name else None
    )
    return {"answer": response.text.strip()}


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


# ── Per-axis prompt blocks ───────────────────────────────────────────
# 각 축의 LLM 지시문 + 해당 축의 JSON 출력 필드 스펙
AXIS_BLOCKS = {
    "reframe": {
        "instruction": (
            "• REFRAME: 현재 스케치의 구도를 조정한다. shotSize/angle/level/framing 등 CIR 속성을 "
            "2-4개만 변경하고 나머지는 현재와 동일하게 유지. 완전히 다른 샷을 제안하지 말 것."
        ),
        "json_fields": (
            '"cir": { "shotSize": "...", "horizontalAngle": "...", "verticalLevel": "...", '
            '"viewpointFraming": "...", "occlusion": "...", "depth": "...", "motionHint": "..." }'
        ),
    },
    "mise": {
        "instruction": (
            "• MISE-EN-SCÈNE: 인물 블로킹, 소품, 세트 배치 측면에서 구체적 지시를 제안한다. "
            "프레임 내 요소의 배치/상징/밀도를 이론적으로 설계."
        ),
        "json_fields": (
            '"mise": { "blocking": "인물 위치/동선", "props": ["소품1","소품2"], '
            '"set_dressing": "배경/세트 구성" }'
        ),
    },
    "lighting": {
        "instruction": (
            "• LIGHTING: 조명 설계를 제안한다. 주광/보조광 방향·강도, 전체 무드(high-key/low-key/chiaroscuro). "
            "감정·서사와 연결해 설명."
        ),
        "json_fields": (
            '"lighting": { "key": "주광 방향/강도", "fill": "보조광", '
            '"mood": "high-key|low-key|chiaroscuro 등" }'
        ),
    },
    "freeform": {
        "instruction": (
            "• FREEFORM: 위 축에 얽매이지 않고 자유롭게 연출 아이디어를 제시한다. "
            "다만 반드시 이론 1개 이상을 근거로 삼는다."
        ),
        "json_fields": '"freeform": "자유 연출 아이디어를 한 문단으로"',
    },
}

MISE_OPTION_BLOCKS = {
    "blocking": {
        "instruction": "인물 위치, 거리감, 동선을 프레임 안에서 어떻게 설계할지 제안한다.",
        "json_field": '"blocking": "인물 위치/동선"',
    },
    "props": {
        "instruction": "감정과 서사를 강화하는 핵심 소품만 선별해 제안한다.",
        "json_field": '"props": ["소품1","소품2"]',
    },
    "set_dressing": {
        "instruction": "배경, 세트 밀도, 공간의 질감을 통해 정서를 조직한다.",
        "json_field": '"set_dressing": "배경/세트 구성"',
    },
}


def _build_mise_block(mise_options: list | None) -> tuple[str, str] | None:
    valid_mise_options = [
        option for option in (mise_options or list(MISE_OPTION_BLOCKS.keys()))
        if option in MISE_OPTION_BLOCKS
    ]
    if not valid_mise_options:
        return None

    option_instructions = " ".join(
        f"- {MISE_OPTION_BLOCKS[option]['instruction']}"
        for option in valid_mise_options
    )
    json_fields = ", ".join(
        MISE_OPTION_BLOCKS[option]["json_field"]
        for option in valid_mise_options
    )
    instruction = (
        "• MISE-EN-SCÈNE: 선택된 하위 요소만 다룬다. "
        f"{option_instructions}"
    )
    return instruction, f'"mise": {{ {json_fields} }}'


def _build_axes_block(
    axes: list,
    theory_preference: str | None,
    mise_options: list | None = None,
) -> tuple[list, str, str]:
    """axes 리스트 → (normalized_axes, instructions_text, json_fields_text)"""
    normalized_axes = []
    instructions_by_axis = []
    json_fields_by_axis = []

    for axis in axes or ["reframe"]:
        if axis not in AXIS_BLOCKS:
            continue
        if axis == "mise":
            mise_block = _build_mise_block(mise_options)
            if not mise_block:
                continue
            instruction, json_fields = mise_block
        else:
            instruction = AXIS_BLOCKS[axis]["instruction"]
            json_fields = AXIS_BLOCKS[axis]["json_fields"]

        normalized_axes.append(axis)
        instructions_by_axis.append(instruction)
        json_fields_by_axis.append(json_fields)

    if not normalized_axes:
        normalized_axes = ["reframe"]
        instructions_by_axis = [AXIS_BLOCKS["reframe"]["instruction"]]
        json_fields_by_axis = [AXIS_BLOCKS["reframe"]["json_fields"]]

    instructions = "\n".join(instructions_by_axis)
    json_fields = ",\n          ".join(json_fields_by_axis)
    if theory_preference and "freeform" in normalized_axes:
        instructions += f"\n• THEORY CONSTRAINT: freeform 축은 반드시 다음 이론/책만 참고하라 → {theory_preference}"
    return normalized_axes, instructions, json_fields


async def suggest_strategies_v2(
    cir: CIR,
    intent: str,
    script_context: str = "",
    image_base64: str = None,
    axes: list = None,
    mise_options: list | None = None,
    theory_preference: str | None = None,
) -> SuggestStrategiesResponse:
    """
    [Method 2] Context Caching + Multimodal approach.
    Uses cached film theory books and the actual sketch image for analysis.
    `axes`에 따라 축별 지시/출력 스키마를 동적으로 조립한다.
    """
    cache_name = warmup_theory_cache()
    normalized_axes, axis_instructions, axis_json_fields = _build_axes_block(
        axes or ["reframe"],
        theory_preference,
        mise_options=mise_options,
    )

    prompt = f"""{STRATEGY_PROMPT}

[Current CIR State]
{cir.model_dump_json(indent=2)}

[Director's Intent]
{intent}

[Scene Context]
{script_context}

[Selected Axes] {", ".join(normalized_axes)}
아래 축들을 **통합적으로** 고려해 하나의 전략 안에 녹여낸다.
{axis_instructions}

[Instruction]
1. ANALYZE the provided sketch image and CIR against Director's Intent and Scene Context.
2. REFERENCE specific cinematographic principles from your cached film theory library.
3. PROPOSE exactly 3 strategies that integrate ALL selected axes. 각 전략은 선택된 축 전부에 대한 구체적 지시를 포함.
4. Each strategy must cite theory with book/principle.
5. For each shot, also generate four short Korean summaries (recommendation/theory_fit/current_shot_connection/expected_effect).

CRITICAL:
- Each strategy has exactly 1 shot.
- 선택되지 않은 축의 필드는 JSON에서 생략하거나 null로 둘 것.
- Write name, summaries, theory_rationale in KOREAN.

Format:
{{
  "strategies": [
    {{
      "name": "감정을 담은 짧은 한글 이름",
      "short_title": "15자 이내 구도 변화 요약",
      "shots": [
        {{
          "order": 1,
          {axis_json_fields},
          "recommendation_summary": "...",
          "theory_fit_summary": "...",
          "current_shot_connection": "...",
          "expected_effect_summary": "...",
          "theory_rationale": "...",
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
                _build_shot_model(shot)
                for shot in strat_data["shots"]
            ]
            strategies.append(Strategy(
                name=strat_data["name"],
                short_title=strat_data.get("short_title"),
                shots=shots,
                intention_tags=strat_data.get("intention_tags", [])
            ))

        return SuggestStrategiesResponse(strategies=strategies)

    except (json.JSONDecodeError, KeyError) as e:
        print(f"[Strategy v2] Failed to parse response: {response.text}")
        return SuggestStrategiesResponse(strategies=[])


# ── Default: v2 (Context Caching + Multimodal) ───────────────────

async def suggest_strategies(
    cir: CIR,
    intent: str,
    script_context: str = "",
    image_base64: str = None,
    axes: list = None,
    mise_options: list | None = None,
    theory_preference: str | None = None,
) -> SuggestStrategiesResponse:
    return await suggest_strategies_v2(
        cir, intent, script_context, image_base64,
        axes=axes,
        mise_options=mise_options,
        theory_preference=theory_preference,
    )
