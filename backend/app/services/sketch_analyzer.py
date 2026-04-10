import os
import json
import base64
import asyncio
from pathlib import Path
from google import genai
from google.genai import types
from app.models.schemas import AnalyzeSketchResponse, CIR

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
with open(PROMPTS_DIR / "sketch_to_cir.txt", "r") as f:
    SKETCH_PROMPT = f.read()

async def analyze_sketch(image_base64: str, script_context: str) -> AnalyzeSketchResponse:
    """
    Analyze a storyboard sketch using Gemini Vision API.

    Args:
        image_base64: Base64-encoded image (with or without data URI prefix)
        script_context: Scene/script context for better understanding

    Returns:
        AnalyzeSketchResponse with alignment description and CIR attributes
    """
    # Strip data URI prefix if present
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    # Decode base64 to bytes
    image_bytes = base64.b64decode(image_base64)

    # Prepare prompt
    prompt = f"""{SKETCH_PROMPT}

[Scene Context]
{script_context}

Analyze the provided storyboard sketch image and return your response as valid JSON only (no markdown, no code fences).
Format:
{{
  "alignment": "...(Korean description)...",
  "cir": {{
    "shotSize": "Extreme Close-Up|Close-Up|Medium Close-Up|Medium Shot|Medium Long Shot|Long Shot|Extreme Wide Shot",
    "horizontalAngle": "Frontal|Three-Quarter|Profile|Rear",
    "verticalLevel": "High|Eye|Low|Top-Down|Ground",
    "subjectConfig": "Single|Two-Shot|Group|Insert",
    "viewpointFraming": "Objective|OTS|POV",
    "eyeline": "Toward Subject|Averted|Off-Screen|Toward Camera",
    "occlusion": "None|Partial|Heavy",
    "depth": "Shallow|Deep (optional, omit if not discernible)",
    "motionHint": "Static|Pan|Tilt|Track|Zoom|Handheld (comma-separated if multiple)"
  }}
}}
"""

    # Generate content with retry on transient errors
    client = get_client()
    response = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type='image/png')]
            )
            break
        except Exception as e:
            err_str = str(e)
            if '503' in err_str or 'UNAVAILABLE' in err_str or 'overloaded' in err_str.lower():
                wait = (attempt + 1) * 3
                print(f"[Analyzer] Gemini 503, retry {attempt+1}/3 in {wait}s...")
                await asyncio.sleep(wait)
            else:
                raise
    if response is None:
        raise Exception("Gemini API unavailable after 3 retries")

    # Parse JSON response
    try:
        text = response.text.strip()
        # Remove markdown code fences if present
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()

        data = json.loads(text)

        return AnalyzeSketchResponse(
            alignment=data.get("alignment", ""),
            cir=CIR(**data.get("cir", {}))
        )
    except (json.JSONDecodeError, KeyError) as e:
        # Fallback if parsing fails
        print(f"Failed to parse Gemini response: {response.text}")
        return AnalyzeSketchResponse(
            alignment=response.text,
            cir=CIR(
                shotSize="Unknown",
                cameraAngle="Unknown",
                cameraLevel="Unknown",
                relation="Unknown",
                blockingDistance="Unknown",
                eyeline="Unknown",
                occlusion="Unknown",
                motionHint="Unknown"
            )
        )
