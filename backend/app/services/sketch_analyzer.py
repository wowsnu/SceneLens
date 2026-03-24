import os
import json
import base64
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
  "alignment": "Description of what you see in the sketch",
  "cir": {{
    "shotSize": "Wide|Medium|Close",
    "cameraAngle": "High|Neutral|Low",
    "cameraLevel": "High|Eye|Low",
    "relation": "Single|Two-shot|OTS",
    "blockingDistance": "Far|Mid|Near",
    "eyeline": "Face-to-face|Averted",
    "occlusion": "None|Partial",
    "motionHint": "Static|Moving"
  }}
}}
"""

    # Generate content with new API
    client = get_client()
    response = client.models.generate_content(
        model='gemini-3-flash-preview',
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type='image/png')]
    )

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
