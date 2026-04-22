import os
import json
import base64
from pathlib import Path
from openai import AsyncOpenAI
from app.models.schemas import AnalyzeSketchResponse, CIR

# Allowed enum values — must match schemas.CIR comments
CIR_ENUMS = {
    "shotSize": ["Extreme Close-Up", "Close-Up", "Medium Close-Up", "Medium Shot", "Medium Long Shot", "Long Shot", "Extreme Wide Shot"],
    "horizontalAngle": ["Frontal", "Three-Quarter", "Profile", "Rear"],
    "verticalLevel": ["High", "Eye", "Low", "Top-Down", "Ground"],
    "viewpointFraming": ["Objective", "OTS", "POV"],
    "occlusion": ["None", "Partial", "Heavy"],
    "depth": ["Shallow", "Deep"],
    "motionHint": ["Static", "Pan", "Tilt", "Track", "Zoom", "Handheld"],
}

CIR_DEFAULTS = {
    "shotSize": "Medium Shot",
    "horizontalAngle": "Frontal",
    "verticalLevel": "Eye",
    "viewpointFraming": "Objective",
    "occlusion": "None",
    "motionHint": "Static",
}

# Aliases GPT commonly emits despite the enum constraint
VALUE_ALIASES = {
    "viewpointFraming": {"Subjective": "POV", "First-Person": "POV", "Third-Person": "Objective"},
    "horizontalAngle": {"3/4 View": "Three-Quarter", "Three Quarter": "Three-Quarter"},
    "verticalLevel": {"Eye Level": "Eye", "Overhead": "Top-Down", "Bird's Eye": "Top-Down"},
}

CIR_JSON_SCHEMA = {
    "name": "sketch_cir_analysis",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["alignment", "cir"],
        "properties": {
            "alignment": {"type": "string"},
            "cir": {
                "type": "object",
                "additionalProperties": False,
                "required": ["shotSize", "horizontalAngle", "verticalLevel", "viewpointFraming", "occlusion", "depth", "motionHint"],
                "properties": {
                    "shotSize": {"type": "string", "enum": CIR_ENUMS["shotSize"]},
                    "horizontalAngle": {"type": "string", "enum": CIR_ENUMS["horizontalAngle"]},
                    "verticalLevel": {"type": "string", "enum": CIR_ENUMS["verticalLevel"]},
                    "viewpointFraming": {"type": "string", "enum": CIR_ENUMS["viewpointFraming"]},
                    "occlusion": {"type": "string", "enum": CIR_ENUMS["occlusion"]},
                    "depth": {"type": ["string", "null"], "enum": CIR_ENUMS["depth"] + [None]},
                    "motionHint": {"type": "string", "enum": CIR_ENUMS["motionHint"]},
                },
            },
        },
    },
}


def _coerce_cir(raw: dict) -> dict:
    """Clamp each field to its enum; fill missing required fields with defaults."""
    out = {}
    for field, allowed in CIR_ENUMS.items():
        val = raw.get(field)
        if isinstance(val, str):
            val = VALUE_ALIASES.get(field, {}).get(val, val)
            if field == "motionHint" and "," in val:
                first = val.split(",")[0].strip()
                val = first if first in allowed else None
            elif val not in allowed:
                val = None
        else:
            val = None

        if val is None and field in CIR_DEFAULTS:
            val = CIR_DEFAULTS[field]
        if val is not None:
            out[field] = val
    return out

# Lazy initialization
_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        _client = AsyncOpenAI(api_key=api_key)
    return _client

# Load prompt
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
with open(PROMPTS_DIR / "sketch_to_cir.txt", "r") as f:
    SKETCH_PROMPT = f.read()

async def analyze_sketch(image_base64: str, script_context: str) -> AnalyzeSketchResponse:
    # Strip data URI prefix if present
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    prompt = f"""{SKETCH_PROMPT}

[Scene Context]
{script_context}

Analyze the provided storyboard sketch image. Use ONLY the option names listed above — do not invent synonyms (e.g. never emit "Subjective"; use "POV" instead).
If a field cannot be determined from the sketch, pick the closest valid option. For `depth`, use null if not discernible.
"""

    client = get_client()
    response = await client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}",
                            "detail": "low"
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ],
        max_tokens=1024,
        response_format={"type": "json_schema", "json_schema": CIR_JSON_SCHEMA},
    )

    text = response.choices[0].message.content.strip()

    try:
        data = json.loads(text)
        cir_raw = data.get("cir", {}) or {}
        cir_clean = _coerce_cir(cir_raw)
        if cir_raw.get("depth") in CIR_ENUMS["depth"]:
            cir_clean["depth"] = cir_raw["depth"]
        return AnalyzeSketchResponse(
            alignment=data.get("alignment", ""),
            cir=CIR(**cir_clean),
        )
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"[analyze-sketch] parse/validate failed ({e}); raw response: {text[:500]}")
        return AnalyzeSketchResponse(
            alignment=text if isinstance(text, str) else "",
            cir=CIR(**CIR_DEFAULTS, depth=None),
        )
