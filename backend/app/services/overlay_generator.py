import os
import json
import base64
from pathlib import Path
from google import genai
from google.genai import types

# Lazy initialization
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
with open(PROMPTS_DIR / "overlay_guide.txt", "r") as f:
    OVERLAY_PROMPT = f.read()


async def generate_overlay(
    image_base64: str,
    strategy_name: str,
    cir: dict,
    theory_rationale: str,
    intent: str,
) -> str:
    """
    Generate a red overlay guide image using Gemini's image generation.

    Takes the original sketch and draws red composition guides on top,
    showing the director how to reframe according to the strategy.

    Args:
        image_base64: Base64-encoded original sketch image
        strategy_name: Name of the strategy (e.g., "Intimate Confrontation")
        cir: CIR dict with 8 cinematic attributes for this strategy's shot
        theory_rationale: Why this shot composition works
        intent: Director's intent

    Returns:
        Base64-encoded overlay image (PNG)
    """
    # Strip data URI prefix if present
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)

    # Build the prompt with strategy-specific details
    cir_desc = "\n".join(f"  - {k}: {v}" for k, v in cir.items())

    prompt = f"""{OVERLAY_PROMPT}

[Strategy]
Name: {strategy_name}
Goal: {intent}

[Suggested CIR (Cinematic Attributes)]
{cir_desc}

[Theory Rationale]
{theory_rationale}

Now edit the provided storyboard sketch image by adding RED overlay guides that visualize this cinematic strategy. Keep the original sketch intact and draw only in red.
"""

    client = get_client()

    # Use Gemini's image generation model for image editing
    response = client.models.generate_content(
        model='gemini-2.5-flash-image',
        contents=[
            prompt,
            types.Part.from_bytes(data=image_bytes, mime_type='image/png'),
        ],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
        ),
    )

    # Extract the generated image from response
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            # Return as base64
            return base64.b64encode(part.inline_data.data).decode('utf-8')

    # Fallback: if no image was generated, raise error
    raise ValueError("Gemini did not return an overlay image")
