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
            "This is the tightest possible framing. Fill the ENTIRE frame with a single facial feature — eyes, mouth, or a specific object detail. "
            "The face must occupy 80%+ of the frame height. No neck, no shoulders, no background should be visible. "
            "Every pore, wrinkle, and texture should be readable. This shot creates maximum psychological intensity and forces the viewer to focus on one single detail. "
            "If the subject is an object (e.g. a hand, a coin), it should fill the frame completely."
        ),
        'Close-Up': (
            "Frame from the top of the head to just below the shoulders. The face is the dominant element — it should take up roughly 50-60% of the frame height. "
            "Both eyes, nose, and mouth are fully visible and emotionally readable. "
            "The background is present but out of focus or minimal — it should not compete with the face. "
            "This shot communicates emotion, reaction, and inner state clearly."
        ),
        'Medium Close-Up': (
            "Frame from the top of the head to approximately mid-chest (just below the collar/tie/neckline). "
            "The face is prominent and readable but the upper body provides context about posture and clothing. "
            "Background is visible and provides environmental context. "
            "This is the most common shot for dialogue — intimate enough to read emotion, wide enough to show body language."
        ),
        'Medium Shot': (
            "Frame from the top of the head to the waist/belt line. Full upper body visible including arms and hands. "
            "The character's gestures and hand movements are visible and meaningful. "
            "Background occupies roughly 1/3 of the frame and clearly establishes the environment. "
            "This shot balances character and space — used for action, conversation, and interaction."
        ),
        'Medium Long Shot': (
            "Frame from the top of the head to just below the knees. Nearly full body visible. "
            "The character's full posture, stance, and movement are readable. "
            "Background and environment are clearly visible and contextually important. "
            "This shot is used when both the character's full physicality AND the environment matter equally."
        ),
        'Long Shot': (
            "The full body is visible from head to toe. Feet are near the bottom edge of the frame. "
            "The character is clearly identifiable but their face is not the focus. "
            "The surrounding environment — room, street, landscape — is equally important and takes up at least half the frame. "
            "This shot establishes the character's relationship to their physical space."
        ),
        'Extreme Wide Shot': (
            "CRITICAL: The environment and location COMPLETELY dominate this shot. "
            "Characters, if present at all, must appear TINY — no taller than 10-15% of the total frame height. "
            "Individual faces are completely unreadable. Characters appear as small figures in a vast space. "
            "The entire room, building exterior, landscape, or environment should be visible. "
            "This shot is about place, isolation, and scale — NOT about people. "
            "Think of an aerial view of a building, or a person standing alone in a massive empty field."
        ),
    },
    'horizontalAngle': {
        'Frontal': (
            "The subject faces the camera directly and squarely at exactly 0°. "
            "Both eyes are fully visible and symmetrically placed. The full front of the face and body is toward the lens. "
            "This creates a direct, confrontational, or confessional feeling. "
            "The subject should appear to be looking straight at — or just past — the camera."
        ),
        'Three-Quarter': (
            "The subject is turned approximately 45° away from the camera, showing a diagonal view of the face and body. "
            "Both eyes are still visible, but one side of the face is more prominent. The nose breaks the far eye's silhouette. "
            "This is the most natural and commonly used angle for conversation and drama — it gives depth to the face without full profile. "
            "The body should also be angled, not just the face."
        ),
        'Profile': (
            "The subject is at a strict 90° angle — a pure side view. Only one side of the face and body is visible. "
            "The far eye is completely hidden behind the nose. The ear is fully visible. "
            "The subject should be looking toward the left or right edge of the frame, not toward the camera. "
            "This angle creates a graphic, silhouette-like quality and is used for isolation, contemplation, or stylized shots."
        ),
        'Rear': (
            "The camera is positioned directly behind the subject. The back of the head and the full back of the body face the camera. "
            "The subject's face is NOT visible. The viewer sees what the subject is looking at — the scene in front of them. "
            "This creates mystery, distance, and a sense of the subject observing something. "
            "The environment in front of the subject should be clearly visible."
        ),
    },
    'verticalLevel': {
        'High': (
            "The camera is positioned significantly above the subject's head, angled downward. "
            "The top of the subject's head is visible. The floor or ground plane is prominent in the frame. "
            "The subject appears smaller, more vulnerable, and less powerful than normal. "
            "This angle gives the viewer a sense of superiority or surveillance over the subject. "
            "The horizon line is above mid-frame. Vertical lines in the scene converge downward."
        ),
        'Eye': (
            "The camera is positioned exactly at the subject's eye level — neither above nor below. "
            "This is the neutral, natural perspective that mirrors how we see other people in real life. "
            "The horizon line falls at approximately mid-frame. No distortion or perspective skew. "
            "Used for straightforward, balanced scenes without a power dynamic implied by camera angle."
        ),
        'Low': (
            "IMPORTANT: This must look dramatically different from Eye level. "
            "The camera is positioned at or below the subject's waist, angled sharply UPWARD. "
            "The ceiling, sky, or upper environment fills the top portion of the frame — at least 30-40%. "
            "The underside of the subject's chin and jaw is prominently visible. "
            "The subject's body converges upward due to perspective distortion, making them appear tall and imposing. "
            "Feet may be near the bottom of the frame. The subject looks powerful, threatening, or heroic. "
            "The horizon line is very LOW in the frame — near the bottom third."
        ),
        'Top-Down': (
            "The camera is directly overhead, looking straight down at 90° perpendicular to the ground. "
            "The ground/floor fills the entire frame. Subjects appear as flat, two-dimensional shapes viewed from above. "
            "No vertical walls or standing objects are visible — only horizontal surfaces. "
            "Characters appear as flat figures on the floor. This is a pure bird's-eye view."
        ),
        'Ground': (
            "The camera is placed at floor level, nearly touching the ground. "
            "The camera looks horizontally across the ground plane or slightly upward. "
            "The floor surface — tiles, carpet, dirt, pavement — dominates the lower portion of the frame. "
            "Subjects' feet and legs are at eye level. This creates an insect-eye perspective, "
            "making the environment feel vast and subjects feel towering."
        ),
    },
    'viewpointFraming': {
        'Objective': (
            "The camera is a neutral, invisible observer outside the scene. "
            "No character's perspective is implied. No foreground obstructions. "
            "The viewer watches the scene as a detached third party. "
            "This is the default cinematic perspective — the camera has no relationship with any character."
        ),
        'OTS': (
            "The camera is positioned just behind and to the side of one character (Character A). "
            "Character A's shoulder, the back of their head, and part of their body occupy approximately 1/4 of a frame corner in the foreground — rendered dark or silhouetted. "
            "Character B is in the background, facing the camera and clearly lit. Character B is the focus of the shot. "
            "The spatial relationship between the two characters must be clear — they are facing each other. "
            "This shot creates intimacy and shows the dynamic between two characters."
        ),
        'POV': (
            "The camera IS the eyes of a specific character. This is pure first-person perspective. "
            "ABSOLUTE RULE: Zero parts of the POV character are visible — no hands, no nose, no body, no shadow. "
            "The frame shows ONLY what that character would literally see from their exact physical position and eye height. "
            "Infer the POV character's position from the scene context and reconstruct the spatial layout accordingly. "
            "Other characters in the scene should appear as if they are looking back at the POV character — i.e., looking toward the camera."
        ),
    },
    'occlusion': {
        'None': (
            "The primary subject is fully and clearly visible with no obstructions. "
            "Nothing blocks any part of the subject's body or face. Clean, unobstructed framing."
        ),
        'Partial': (
            "A foreground element partially blocks the view of the primary subject. "
            "This could be a shoulder in OTS, a door frame, furniture, another person's arm, or any object. "
            "The subject is still recognizable and readable, but part of their body is cut off or hidden. "
            "This adds depth, realism, and a sense that the camera is embedded in the scene."
        ),
        'Heavy': (
            "Large portions of the primary subject are intentionally hidden or obscured. "
            "The subject may be barely visible — seen through a crack, behind a wall, or with most of their body blocked. "
            "The obstruction should be clearly intentional and dramatically motivated. "
            "This creates mystery, tension, and a sense of surveillance or concealment."
        ),
    },
    'depth': {
        'Shallow': (
            "Apply a shallow depth of field. The primary subject is rendered in sharp, crisp detail. "
            "The background is significantly blurred, softened, or simplified to near-abstraction. "
            "This isolates the subject visually and directs 100% of the viewer's attention to them. "
            "In a sketch, render background elements with lighter, less detailed lines."
        ),
        'Deep': (
            "Everything in the frame — foreground, midground, and background — is in sharp, equal focus. "
            "Every element of the environment is rendered with equal detail and clarity. "
            "This allows the viewer to read the entire scene simultaneously and creates a sense of spatial depth and context."
        ),
    },
    'motionHint': {
        'Static': "No camera movement. Completely still, locked-off composition. Clean lines with no motion blur.",
        'Pan': (
            "Suggest a horizontal camera sweep using motion blur lines or streaking on background elements. "
            "Horizontal blur lines extend from the edges of moving elements. The subject may be sharp while background streaks horizontally."
        ),
        'Tilt': (
            "Suggest a vertical camera sweep. Vertical blur lines or streaking on elements. "
            "The composition implies the camera is moving up or down."
        ),
        'Track': (
            "Suggest the camera physically moving through space alongside the subject. "
            "Background elements show depth-based motion parallax — objects closer to the camera blur more than distant ones."
        ),
        'Zoom': (
            "Suggest a focal length change (push-in or pull-out). "
            "Converging perspective lines toward the center of the frame. "
            "Background elements appear to rush toward or away from the camera."
        ),
        'Handheld': (
            "Slight frame instability and organic, unsteady framing. "
            "The composition is slightly off-center or tilted. Lines are not perfectly straight. "
            "Creates a documentary, urgent, or intimate feeling."
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
            from_val = original_cir.get(k) if original_cir else None
            from_str = f" (was: {from_val})" if from_val else ""
            lines.append(f"- {k}: {v}{from_str}")
        changed_section = "[What to change]\n" + "\n".join(lines)
    else:
        changed_section = "[What to change]\n- Apply requested CIR values as-is."

    prompt = f"""{REFRAME_PROMPT}

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
                size="512x512",
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
