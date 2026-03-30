import os
import base64
from pathlib import Path
from google import genai
from google.genai import types
from openai import OpenAI
try:
    from rembg import remove as rembg_remove
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False
    print("[ImageGen] WARNING: rembg not installed, background removal disabled")

# Lazy initialization
_client = None
_openai_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        _client = genai.Client(api_key=api_key)
    return _client

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client

# Load prompts
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
EXAMPLES_DIR = PROMPTS_DIR / "examples"

# Visual examples for specific CIR values
CIR_VISUAL_EXAMPLES = {
    'shotSize': {
        'Extreme Wide Shot': EXAMPLES_DIR / "extreme_wide_shot.jpg",
    }
}

# Per-attribute, per-value detailed descriptions for changed CIR fields
CIR_DESCRIPTIONS = {
    'shotSize': {
        'Extreme Close-Up': (
            "Shot on a 100mm macro lens. This is the tightest possible framing. Fill the ENTIRE frame with a single facial feature — eyes, mouth, or a specific object detail. "
            "The face must occupy 80%+ of the frame height. The frame is tightly cropped at the forehead and chin, ensuring only the central features are within the boundaries. "
            "Every pore, wrinkle, and texture should be readable, creating maximum psychological intensity. "
            "If the subject is an object, it must scale to touch the frame edges."
        ),
        'Close-Up': (
            "Shot on an 85mm portrait telephoto lens. Frame is cropped from the top of the head to just below the shoulders. "
            "The face is the dominant element, taking up roughly 50-60% of the frame height. "
            "Both eyes, nose, and mouth are fully visible and emotionally readable. "
            "The background is present but compressed and soft, preventing it from competing with the subject's face."
        ),
        'Medium Close-Up': (
            "Shot on a 50mm standard lens. Frame is cropped from the top of the head to approximately mid-chest. "
            "The face is prominent and readable, while the upper body provides clear context about posture and clothing. "
            "Background elements are visible and structured, providing clear environmental context for dialogue."
        ),
        'Medium Shot': (
            "Shot on a 35mm lens. Frame is cropped from the top of the head to the waist/belt line. "
            "Full upper body is visible, capturing character gestures and hand movements clearly. "
            "The background occupies roughly 1/3 of the frame, establishing a balanced 3D spatial relationship between character and environment."
        ),
        'Medium Long Shot': (
            "Shot on a 24mm wide lens. Frame is cropped from the top of the head to just below the knees. "
            "Nearly full body visible, revealing full posture, stance, and movement. "
            "Background and environment are distinct and wrap around the character, giving equal visual weight to the physical space."
        ),
        'Long Shot': (
            "Shot on an 18mm wide lens. The full body is entirely visible from head to toe within the frame boundaries. "
            "Feet rest near the bottom edge. The character is clearly identifiable, but the surrounding environment — room, street, or landscape — "
            "takes up at least 60% of the frame, establishing the character's exact physical scale within the space."
        ),
        'Extreme Wide Shot': (
            "CRITICAL: Shot on a 14mm ultra-wide lens. The environment and location COMPLETELY dominate this shot. "
            "Characters must appear TINY — no taller than 10-15% of the total frame height. "
            "Characters appear as small, unreadable figures integrated into a vast, expansive space. "
            "The entire room, building exterior, or landscape stretches across the frame, emphasizing massive scale and isolation."
        ),
    },
    'horizontalAngle': {
        'Frontal': (
            "0-degree camera axis. The subject faces the camera directly and squarely. "
            "Both eyes are fully visible and symmetrically placed. The full front of the face and body is completely parallel to the camera lens. "
            "The subject appears to be looking straight at — or just past — the camera lens."
        ),
        'Three-Quarter': (
            "45-degree camera axis. The subject is turned diagonally away from the camera. "
            "Both eyes are visible, but the facial structure shows deep 3D volume. The nose breaks the far eye's silhouette. "
            "The body shoulders are physically angled, creating a clear sense of depth and natural conversation perspective."
        ),
        'Profile': (
            "90-degree orthogonal camera axis. A pure side view. Only one exact half of the face and body is visible. "
            "The far eye and far shoulder are completely occluded by the near side. The ear is centrally visible. "
            "The subject looks directly toward the left or right edge of the frame, perpendicular to the lens."
        ),
        'Rear': (
            "180-degree camera axis. The camera is positioned physically behind the subject. "
            "The back of the head and the full back of the torso face the lens. "
            "The viewer sees exactly what the subject is looking at, looking past their back into the forward environment."
        ),
    },
    'verticalLevel': {
        'High': (
            "CRITICAL: The camera is mounted HIGH above the scene, angled steeply DOWNWARD. "
            "You are looking DOWN at the subjects from above their heads. "
            "The TOP of the subjects' heads must be clearly visible — you can see the crown of their heads. "
            "The FLOOR takes up a large portion of the frame. "
            "Subjects appear SMALL and compressed. The ceiling is NOT visible. "
            "This is NOT eye level — the perspective must show strong downward convergence. "
            "Imagine a security camera mounted near the ceiling looking down at the room."
        ),
        'Eye': (
            "Neutral vertical axis. The camera lens is perfectly aligned with the subject's eye level. "
            "Zero vertical tilt. The horizon line rests exactly at mid-frame, with perfectly parallel vertical lines and no perspective distortion."
        ),
        'Low': (
            "CRITICAL: Shot on a 14mm wide-angle lens from below the waist, tilting sharply UPWARD. "
            "Extreme upward perspective distortion. The ceiling, sky, or tall background structures fill the top 40% of the frame. "
            "The underside of the subject's chin is prominent, and their body dramatically converges upward, making them look towering and imposing."
        ),
        'Top-Down': (
            "Overhead drone perspective. The camera is locked at a 90-degree downward tilt, directly above the scene. "
            "Orthographic-like flat projection. The floor fills the entire frame, and subjects appear as flat 2D shapes viewed strictly from above. "
            "No vertical walls or standing profiles are visible."
        ),
        'Ground': (
            "Worm's-eye view. The camera physical body is resting directly on the floor surface, pointing horizontally. "
            "The textured floor surface (tiles, dirt, asphalt) heavily dominates the immediate foreground. "
            "Subjects' feet and legs dominate the midground at eye level."
        ),
    },
    'viewpointFraming': {
        'Objective': (
            "Third-person omniscient perspective. A detached, invisible camera observing the scene. "
            "Clean framing with no foreground obstructions or implied psychological connection to any character."
        ),
        'OTS': (
            "Over-the-shoulder shot. CRITICAL RULES: "
            "1. DO NOT add new characters. Use ONLY the characters already present in the input sketch. "
            "2. Physically place the camera behind ONE of the existing characters (Character A). "
            "3. Character A's shoulder and the back of their head occupy the foreground corner — dark, slightly blurred, silhouetted. "
            "4. The OTHER existing character (Character B) is in the midground, facing the camera, fully lit and sharp. "
            "5. SPATIAL REASONING: Infer where Character A is physically standing from the input sketch. "
            "Move the camera to that position, behind their shoulder. The background must reflect this new camera position — "
            "you are now seeing the scene from Character A's side, looking toward Character B. "
            "The environment around Character B should be visible in the background."
        ),
        'POV': (
            "Point-of-view shot. CRITICAL RULES: "
            "1. DO NOT add new characters. Use ONLY the characters already present in the input sketch. "
            "2. The camera IS the physical eyes of one specific character. Zero parts of that character are visible. "
            "3. SPATIAL REASONING: Determine where the POV character is standing in the scene. "
            "Reconstruct the full 3D environment from their exact eye position and height. "
            "4. The other character(s) should be seen as if looking back at the POV character — facing toward the camera. "
            "5. The background must reflect the POV character's actual physical viewpoint in the scene."
        ),
    },
    'occlusion': {
        'None': (
            "Clear, completely unobstructed line of sight. The primary subject is fully visible from edge to edge within their framing. "
            "No environmental elements overlap the subject."
        ),
        'Partial': (
            "A distinct FOREGROUND element (like a door frame, plant, or furniture) partially intersects the line of sight to the MIDGROUND subject. "
            "The subject remains readable, but physical depth is established through this overlapping of 3D objects."
        ),
        'Heavy': (
            "A massive FOREGROUND obstacle blocks 70-90% of the MIDGROUND subject. "
            "The subject is tightly framed through a narrow gap, crack, or window, creating a voyeuristic and constrained spatial relationship."
        ),
    },
    'depth': {
        'Shallow': (
            "Shot with an f/1.4 wide aperture. Extreme shallow depth of field. "
            "The primary subject is incredibly sharp, while the background and foreground instantly fall off into creamy, abstract bokeh blur. "
            "Complete visual isolation of the subject."
        ),
        'Deep': (
            "Shot with an f/16 narrow aperture. Extreme deep focus. "
            "Every single element — from the closest foreground object to the infinite background — is rendered with crisp, sharp, equal clarity. "
            "Complex spatial layouts are perfectly readable."
        ),
    },
    'motionHint': {
        'Static': (
            "Shot with a very fast shutter speed (1/1000s). Completely locked-off camera. "
            "Tack-sharp image with absolutely zero motion blur or streaking on any element."
        ),
        'Pan': (
            "Photographic motion blur caused by a slow shutter speed during a horizontal camera sweep. "
            "The background environment forms distinct horizontal streaks, while the tracked subject remains relatively sharp."
        ),
        'Tilt': (
            "Photographic motion blur caused by a vertical camera sweep. "
            "The background environment forms distinct vertical streaks, simulating rapid upward or downward camera movement."
        ),
        'Track': (
            "Depth-based motion parallax blur. The camera moves through 3D space alongside the subject. "
            "Foreground objects blur aggressively as they pass the lens, while the midground subject stays sharp."
        ),
        'Zoom': (
            "Radial lens zoom blur effect. Distinct motion blur lines aggressively expand outward from the dead center of the frame, "
            "simulating a rapid push-in or pull-out of the focal length."
        ),
        'Handheld': (
            "Organic, un-stabilized camera movement. The framing is slightly dutch-angled (tilted horizon). "
            "Composition feels raw, imperfect, and slightly off-center, imitating a heavy shoulder-mounted camera."
        ),
    },
}
with open(PROMPTS_DIR / "enhance_sketch.txt", "r") as f:
    ENHANCE_PROMPT = f.read()
with open(PROMPTS_DIR / "generate_sketch.txt", "r") as f:
    GENERATE_PROMPT = f.read()
with open(PROMPTS_DIR / "reframe_sketch.txt", "r") as f:
    REFRAME_PROMPT = f.read()


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


async def reframe_sketch(
    image_base64: str,
    cir: dict,
    script_context: str = "",
    original_cir: dict = None,
    include_description: bool = True,
    model: str = "gemini-2.5-flash-image",
    intent: str = "",
) -> dict:
    """Redraw sketch with new CIR composition. Returns dict with reframed_image and description."""
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)

    # Find changed attributes
    changed_attrs = {}
    if original_cir:
        for k, v in cir.items():
            if original_cir.get(k) != v:
                changed_attrs[k] = v
    else:
        changed_attrs = dict(cir)

    # Build focused prompt for changed attributes only
    changed_section = ""
    if changed_attrs:
        lines = []
        for k, v in changed_attrs.items():
            desc = CIR_DESCRIPTIONS.get(k, {}).get(v, v)
            from_val = original_cir.get(k) if original_cir else None
            from_str = f" (was: {from_val})" if from_val else ""
            lines.append(f"  - {k}: {v}{from_str}\n    → {desc}")
        changed_section = "[What to change]\n" + "\n".join(lines)
    else:
        changed_section = "[What to change]\n- Apply requested CIR values as-is."

    print(f"[reframe-sketch] changed_attrs={list(changed_attrs.keys())}")
    print(f"[reframe-sketch] changed_section=\n{changed_section}")

    intent_section = f"[Director's Intent — HIGHEST PRIORITY]\n{intent}\nApply this intent above all else. It overrides default compositional choices." if intent else ""

    prompt = f"""{REFRAME_PROMPT}

{intent_section}

[Scene Context]
{script_context or 'Same scene as the input sketch'}

{changed_section}

SPEED AND QUALITY INSTRUCTIONS:
- Do NOT overthink or over-render. Draw quickly and simply.
- Match the rough, hand-drawn quality of the input sketch exactly. Do NOT improve or polish it.
- No high detail, no photorealism, no clean lines. Keep the same loose, sketchy style as the original.
- The output should look like it was drawn in the same session as the input.

Now redraw the sketch applying ONLY the changes above. Keep everything else identical to the input.
"""

    import asyncio

    gemini_client = get_client()

    def _gen_img():
        if model == 'gpt-image-1.5':
            oai = get_openai_client()
            response = oai.images.edit(
                model='gpt-image-1.5',
                image=("sketch.png", image_bytes, "image/png"),
                prompt=prompt,
                n=1,
                size="1024x1024",
            )
            img_b64 = response.data[0].b64_json
            return base64.b64decode(img_b64)
        else:
            contents = [prompt, "\n[Input sketch to reframe:]\n", types.Part.from_bytes(data=image_bytes, mime_type='image/png')]
            gen_config = types.GenerateContentConfig(response_modalities=['IMAGE'])
            if model == 'gemini-3.1-flash-image-preview':
                gen_config = types.GenerateContentConfig(
                    response_modalities=['IMAGE'],
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                )
            res = gemini_client.models.generate_content(model=model, contents=contents, config=gen_config)
            for part in res.candidates[0].content.parts:
                if part.inline_data is not None:
                    return part.inline_data.data
            raise ValueError("Gemini did not return an image")

    def _gen_desc():
        desc_prompt = f"""[Scene Context]\n{script_context or 'Same scene'}\n\n[What to change]\n{changed_section}\n\n위 변경사항(What to change)을 바탕으로, 1. 기존 구도에서 무엇이 바뀌었는지 2. 이로 인해 어떤 영화적/시각적 효과가 생기는지 한국어로 2~3문장으로 짧고 명확하게 설명해주세요. 포맷 태그 없이 오직 설명 텍스트만 출력하세요."""
        res = gemini_client.models.generate_content(model='gemini-2.5-flash', contents=[desc_prompt])
        return res.text.strip()

    img_task = asyncio.create_task(asyncio.to_thread(_gen_img))
    description = ""
    if include_description:
        desc_task = asyncio.create_task(asyncio.to_thread(_gen_desc))
        result_image, description = await asyncio.gather(img_task, desc_task)
    else:
        result_image = await img_task

    if result_image is None:
        raise ValueError("Model did not return an image")

    return {
        "reframed_image": _image_bytes_to_base64(result_image),
        "description": description,
    }


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
