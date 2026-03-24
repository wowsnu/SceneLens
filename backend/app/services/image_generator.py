import os
import io
import base64
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image
try:
    from rembg import remove as rembg_remove
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False
    print("[ImageGen] WARNING: rembg not installed, background removal disabled")

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

# Load prompts
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
with open(PROMPTS_DIR / "enhance_sketch.txt", "r") as f:
    ENHANCE_PROMPT = f.read()
with open(PROMPTS_DIR / "generate_sketch.txt", "r") as f:
    GENERATE_PROMPT = f.read()


def _remove_background(image_bytes: bytes) -> bytes:
    """Remove background from image using rembg, return transparent PNG bytes."""
    if HAS_REMBG:
        return rembg_remove(image_bytes)
    return image_bytes


def _image_bytes_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode('utf-8')


def _gemini_generate_image(prompt: str, input_image_bytes: bytes = None) -> bytes:
    """Call Gemini image model and return raw image bytes."""
    client = get_client()

    contents = [prompt]
    if input_image_bytes:
        contents.append(types.Part.from_bytes(data=input_image_bytes, mime_type='image/png'))

    response = client.models.generate_content(
        model='gemini-2.5-flash-image',
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
        ),
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return part.inline_data.data

    raise ValueError("Gemini did not return an image")


async def enhance_sketch(
    image_base64: str,
    script_context: str,
    intent: str = "",
) -> str:
    """Enhance a rough sketch. Returns base64 PNG."""
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)

    prompt = f"""{ENHANCE_PROMPT}

[Scene Context]
{script_context}

[Director's Intent]
{intent or 'Professional storyboard for this scene'}

Now enhance the provided rough sketch into a professional storyboard panel. Keep the same composition and characters.
"""

    result_bytes = _gemini_generate_image(prompt, image_bytes)
    return _image_bytes_to_base64(result_bytes)


async def generate_sketch(
    script_context: str,
    intent: str = "",
    cir: dict = None,
) -> str:
    """Generate a full storyboard sketch. Returns base64 PNG."""
    cir_desc = ""
    if cir:
        cir_desc = "\n[Suggested Composition (CIR)]\n" + "\n".join(
            f"  - {k}: {v}" for k, v in cir.items()
        )

    prompt = f"""{GENERATE_PROMPT}

[Scene Description]
{script_context}

[Director's Intent]
{intent or 'Cinematic storyboard for this scene'}
{cir_desc}

Now generate a professional storyboard sketch for this scene.
"""

    result_bytes = _gemini_generate_image(prompt)
    return _image_bytes_to_base64(result_bytes)


LAYER_PROMPTS = {
    'background': """You are generating a BACKGROUND-ONLY layer for compositing.

CRITICAL RULES:
- Draw ONLY the environment: walls, floor, ceiling, windows, shelves, lighting fixtures, atmosphere.
- ABSOLUTELY NO people, characters, faces, hands, or human figures of any kind.
- ABSOLUTELY NO text, speech bubbles, labels, captions, or written words.
- The scene should look like an empty room/location with no one in it.

Style: Black-and-white pencil storyboard sketch, exactly 16:9 landscape (1024x576 pixels).""",

    'midground': """You are generating a MIDGROUND-ONLY layer for compositing.

CRITICAL RULES:
- Draw ONLY mid-level objects: tables, counters, chairs, props that characters interact with.
- ABSOLUTELY NO people, characters, faces, hands, or human figures of any kind.
- ABSOLUTELY NO background walls or sky — draw on a plain white background.
- ABSOLUTELY NO text, speech bubbles, labels, captions, or written words.

Style: Black-and-white pencil storyboard sketch, exactly 16:9 landscape (1024x576 pixels).""",

    'foreground': """You are generating a FOREGROUND-ONLY layer for compositing.

CRITICAL RULES:
- Draw ONLY the characters/people described in the scene.
- Draw their expressions, poses, body language, and clothing.
- ABSOLUTELY NO background, environment, walls, furniture, or props behind them.
- Draw on a plain WHITE background — the background will be removed for compositing.
- ABSOLUTELY NO text, speech bubbles, labels, captions, or written words.

Style: Black-and-white pencil storyboard sketch, exactly 16:9 landscape (1024x576 pixels).""",
}


async def generate_single_layer(
    script_context: str,
    intent: str = "",
    layer: str = "background",
) -> str:
    """Generate a single layer. Returns base64 PNG."""
    layer_prompt = LAYER_PROMPTS.get(layer, LAYER_PROMPTS['foreground'])

    prompt = f"""{layer_prompt}

[Scene Description]
{script_context}

[Director's Intent]
{intent or 'Cinematic storyboard'}

Generate this layer now.
"""

    print(f"[ImageGen] Generating layer: {layer}")
    raw_bytes = _gemini_generate_image(prompt)

    if layer != 'background':
        print(f"[ImageGen] Removing background for layer: {layer}")
        raw_bytes = _remove_background(raw_bytes)

    return _image_bytes_to_base64(raw_bytes)


async def generate_sketch_layers(
    script_context: str,
    intent: str = "",
    layers: list = None,
) -> dict:
    """
    Generate storyboard sketch as separate layers.

    Args:
        script_context: Scene description
        intent: Director's intent
        layers: List of layer names to generate (e.g., ['background', 'midground', 'foreground'])

    Returns:
        Dict of { layer_name: base64_png } with transparent backgrounds (except background layer)
    """
    if not layers:
        layers = ['background', 'foreground']

    results = {}

    for layer_name in layers:
        layer_prompt = LAYER_PROMPTS.get(layer_name, LAYER_PROMPTS['foreground'])

        prompt = f"""{layer_prompt}

[Scene Description]
{script_context}

[Director's Intent]
{intent or 'Cinematic storyboard'}

Generate this layer now.
"""

        print(f"[ImageGen] Generating layer: {layer_name}")
        raw_bytes = _gemini_generate_image(prompt)

        # Remove background for non-background layers
        if layer_name != 'background':
            print(f"[ImageGen] Removing background for layer: {layer_name}")
            raw_bytes = _remove_background(raw_bytes)

        results[layer_name] = _image_bytes_to_base64(raw_bytes)

    return results
