import os
import json
import base64
from pathlib import Path
from openai import AsyncOpenAI
from app.models.schemas import AnalyzeSketchResponse, CIR

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
    )

    text = response.choices[0].message.content.strip()

    # Parse JSON response
    try:
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
        print(f"Failed to parse GPT response: {text}")
        return AnalyzeSketchResponse(
            alignment=text,
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
