import os
import base64
import re
from pathlib import Path
from typing import Optional
from google import genai
from google.genai import types
from openai import AsyncOpenAI, OpenAI
import httpx
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

def get_recraft_api_key():
    api_key = os.getenv("RECRAFT_API_KEY")
    if not api_key:
        raise ValueError("RECRAFT_API_KEY not found in environment variables")
    return api_key

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
# 손으로 그린 패널과 생성한 패널이 섞이면 한 보드로 안 읽힌다. 정해 둔
# 그림체로 다시 그려 맞추는 쪽은 '보태기'와 지시가 정반대라 파일을 나눈다.
with open(PROMPTS_DIR / "restyle_sketch.txt", "r") as f:
    RESTYLE_PROMPT = f.read()
with open(PROMPTS_DIR / "generate_sketch.txt", "r") as f:
    GENERATE_PROMPT = f.read()
with open(PROMPTS_DIR / "reframe_sketch.txt", "r") as f:
    REFRAME_PROMPT = f.read()
_ROUGH_PROMPT_PATH = PROMPTS_DIR / "generate_sketch_rough.txt"
if _ROUGH_PROMPT_PATH.exists():
    with open(_ROUGH_PROMPT_PATH, "r") as f:
        GENERATE_ROUGH_PROMPT = f.read()
else:
    GENERATE_ROUGH_PROMPT = GENERATE_PROMPT


def _clamp_detail_level(detail_level: int) -> int:
    return max(0, min(100, int(detail_level)))


def _get_svg_complexity_profile(detail_level: int) -> dict:
    level = _clamp_detail_level(detail_level)
    if level <= 15:
        return {
            "name": "ultra-minimal editable draft",
            "target_elements": "8-14",
            "max_elements": 18,
            "interior_strokes": "0-1",
            "environment_detail": "only the 1-3 most important environment shapes",
        }
    if level <= 35:
        return {
            "name": "minimal editable storyboard",
            "target_elements": "12-22",
            "max_elements": 28,
            "interior_strokes": "0-2",
            "environment_detail": "only essential geometry and anchor props",
        }
    if level <= 60:
        return {
            "name": "balanced storyboard sketch",
            "target_elements": "20-36",
            "max_elements": 44,
            "interior_strokes": "1-3",
            "environment_detail": "moderate environment context only",
        }
    if level <= 80:
        return {
            "name": "detailed storyboard sketch",
            "target_elements": "30-55",
            "max_elements": 70,
            "interior_strokes": "2-4",
            "environment_detail": "clear secondary forms allowed",
        }
    return {
        "name": "high-detail storyboard illustration",
        "target_elements": "50-80",
        "max_elements": 96,
        "interior_strokes": "3-5",
        "environment_detail": "rich secondary detail allowed only when compositionally necessary",
    }


def _build_svg_editability_constraints(detail_level: int) -> str:
    profile = _get_svg_complexity_profile(detail_level)
    return f"""SVG EDITABILITY PRIORITY:
- Highest priority: make the SVG easy for a human to manually edit after generation.
- Treat this as a {profile["name"]}.
- Use as FEW visible vector elements as possible. Target about {profile["target_elements"]} drawable elements total. Try to stay under {profile["max_elements"]} visible elements.
- Each major object should be drawn with one clean outer contour plus only {profile["interior_strokes"]} interior strokes.
- Show {profile["environment_detail"]}. If a shape is not compositionally important, omit it.
- Prefer simple open strokes and primitive geometry over fragmented tiny paths.
- NO hatching, NO cross-hatching, NO texture strokes, NO scribble shading, NO decorative detail, NO tiny repeated marks.
- NO masks, clipPaths, filters, gradients, patterns, embedded rasters, opacity tricks, or complex filled black regions.
- Pure black strokes on a pure white background. Keep large empty areas empty.
- Favor clear silhouettes, eyelines, limb direction, horizon/architecture lines, and only the key props needed to understand the shot.
- Simplicity is more important than realism. When in doubt, leave details out."""


RECRAFT_PROMPT_MAX_CHARS = 950


def _normalize_prompt_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _truncate_prompt_text(text: str, max_chars: int) -> str:
    text = _normalize_prompt_text(text)
    if len(text) <= max_chars:
        return text
    if max_chars <= 3:
        return text[:max_chars]
    return text[: max_chars - 3].rstrip() + "..."


def _compact_cir_line(cir: Optional[dict]) -> str:
    if not cir:
        return ""
    items = []
    for key, value in cir.items():
        if value and key not in ("motionHint", "depth"):
            items.append(f"{key}={value}")
    return "; ".join(items)


def _build_recraft_svg_prompt(
    script_context: str,
    intent: str,
    cir: Optional[dict],
    scene_script: str,
    detail_level: int,
) -> str:
    profile = _get_svg_complexity_profile(detail_level)
    style_note = "rough line-art storyboard sketch" if detail_level <= 60 else "clean line-art storyboard sketch"
    focus = _truncate_prompt_text(script_context or scene_script or "Storyboard beat", 280)
    scene = _truncate_prompt_text(scene_script, 180)
    intent_text = _truncate_prompt_text(intent or "Cinematic storyboard for this beat", 140)
    cir_line = _truncate_prompt_text(_compact_cir_line(cir), 180)

    parts = [
        f"Single 16:9 black-and-white SVG storyboard panel. {style_note}. White background.",
        f"Beat: {focus}",
        f"Intent: {intent_text}",
        f"Complexity {detail_level}/100. Keep it {profile['name']}. Target {profile['target_elements']} visible elements, under {profile['max_elements']} if possible.",
        "Editable SVG priority: few clean strokes, one outer contour per subject, minimal interior lines, large empty areas, no text, no hatching, no texture, no masks, no clipPath, no filters.",
    ]
    if cir_line:
        parts.append(f"CIR: {cir_line}")
    if scene and scene != focus:
        parts.append(f"Context: {scene}")

    prompt = "\n".join(parts)
    return _truncate_prompt_text(prompt, RECRAFT_PROMPT_MAX_CHARS)


def _build_recraft_svg_prompt_legacy(
    script_context: str,
    intent: str,
    cir: Optional[dict],
    scene_script: str,
    detail_level: int,
) -> str:
    """Preserve the original verbose storyboard SVG prompt for future tuning/debugging."""
    focus_block = (script_context or "").strip()
    full_scene = (scene_script or "").strip()
    if not focus_block:
        focus_block = full_scene or "Use the highlighted beat below to draw the storyboard."

    cir_block = ""
    if cir:
        cir_lines = []
        for k, v in cir.items():
            if v and k not in ("motionHint", "depth"):
                cir_lines.append(f"  - {k}: {v}")
        if cir_lines:
            cir_block = "\n[Suggested Composition (CIR)]\n" + "\n".join(cir_lines)

    scene_section = ""
    if full_scene:
        scene_section = (
            "[Scene Script - full scene]\n"
            f"{full_scene}\n\n"
        )

    focus_section = (
        "[Frame Focus - draw exactly this beat]\n"
        "<<< Everything inside the brackets MUST be visualized. Other lines are only context. >>>\n"
        "[[FOCUS]]\n"
        f"{focus_block}\n"
        "[[/FOCUS]]"
    )
    editability_constraints = _build_svg_editability_constraints(detail_level)

    return f"""{GENERATE_PROMPT}

{scene_section}{focus_section}

[Director's Intent]
{intent or 'Cinematic storyboard for this exact beat'}{cir_block}

Additional constraints:
- Render exactly ONE storyboard panel (a single 16:9 frame). Do not draw multiple frames or a sequence.
- Black and white line drawing delivered as crisp SVG vector lines. Pure white background.
- ABSOLUTELY NO text, speech bubbles, dialogue, captions, labels, or written words of any kind in the image.
- Drawing complexity: {detail_level}/100. (0 = extremely simple iconic sketch with minimal bold strokes and very few paths, easy to edit. 100 = highly detailed illustration with hatching, cross-hatching, fine textures, expressive line work, and rich visual detail.) Adjust stroke count, line detail, and rendering complexity to match this level.
- Output should feel like a rough production blocking sketch, not a polished illustration.

{editability_constraints}
"""


def _build_recraft_v4_rough_svg_prompt(
    script_context: str,
    intent: str,
    cir: Optional[dict],
    scene_script: str,
    detail_level: int,
) -> str:
    profile = _get_svg_complexity_profile(detail_level)
    focus = _normalize_prompt_text(script_context or scene_script or "Storyboard beat")
    scene = _normalize_prompt_text(scene_script)
    intent_line = _normalize_prompt_text(intent)
    cir_line = _normalize_prompt_text(_compact_cir_line(cir))

    base_prompt = GENERATE_ROUGH_PROMPT

    cir_block = f"\nCIR reference: {cir_line}" if cir_line else ""
    intent_block = f"\nDirector intent: {intent_line}" if intent_line else ""
    scene_block = f"\nFull scene context: {scene}" if scene and scene != focus else ""

    return f"""{base_prompt}

[Frame Focus - draw exactly this beat]
{focus}{intent_block}{cir_block}{scene_block}

ROUGH BLOCKING SKETCH MODE:
- IMPORTANT: Do NOT create polished line art, clean illustration, pretty rendering, or finished artwork.
- This must look like an unfinished production blocking sketch a human would edit afterward.
- Ugly, rough, under-drawn, and incomplete is BETTER than detailed or beautiful.
- Use as FEW visible vector elements as possible for this detail level.
- Strong target: about {profile['target_elements']} visible paths/shapes total.
- Hard preference: stay under {profile['max_elements']} visible paths/shapes.
- Count path, line, polyline, polygon, rect, circle, and ellipse toward this budget.
- Use one rough contour per subject when possible. Leave contours open or incomplete if needed.
- Keep only silhouette, pose direction, eyeline, horizon, and 1-2 anchor environment lines.
- Omit clothing folds, facial details, fingers, hair texture, surface detail, and secondary props unless absolutely required for composition.
- NO decorative line work, NO shading, NO rendering, NO texture, NO hatch marks, NO tiny repeated strokes.
- Do not beautify anatomy. Do not clean up proportions. Do not add expressive details just to make the image look better.
- If unsure whether to include a detail, omit it.
- Editable SVG simplicity is more important than realism, finish, or attractiveness.

Primary beat to preserve:
{focus}
"""


def _build_recraft_svg_layer_prompt(
    script_context: str,
    layer_name: str,
    layer_desc: str,
    intent: str,
    cir: Optional[dict],
    detail_level: int,
) -> str:
    profile = _get_svg_complexity_profile(detail_level)
    scene = _truncate_prompt_text(script_context, 220)
    intent_text = _truncate_prompt_text(intent, 120)
    cir_line = _truncate_prompt_text(_compact_cir_line(cir), 160)
    layer_desc = _truncate_prompt_text(layer_desc, 240)

    parts = [
        f"Single 16:9 black-and-white SVG {layer_name} layer. White background. Output exactly one drawing.",
        f"Scene: {scene}",
        f"Layer: {layer_desc}",
        f"Complexity {detail_level}/100. Keep it {profile['name']}. Target {profile['target_elements']} visible elements, under {profile['max_elements']} if possible.",
        "Editable SVG priority: simple clean outlines, minimal interior lines, no text, no hatching, no texture, no masks, no clipPath, no filters.",
    ]
    if intent_text:
        parts.append(f"Intent: {intent_text}")
    if cir_line:
        parts.append(f"CIR: {cir_line}")

    prompt = "\n".join(parts)
    return _truncate_prompt_text(prompt, RECRAFT_PROMPT_MAX_CHARS)


def _build_recraft_v4_rough_svg_layer_prompt(
    script_context: str,
    layer_name: str,
    layer_desc: str,
    intent: str,
    cir: Optional[dict],
    detail_level: int,
) -> str:
    profile = _get_svg_complexity_profile(detail_level)
    cir_block = ""
    if cir:
        cir_line = _compact_cir_line(cir)
        if cir_line:
            cir_block = f"\nCIR reference: {cir_line}"

    intent_line = _normalize_prompt_text(intent)
    scene = _normalize_prompt_text(script_context)
    layer_desc = _normalize_prompt_text(layer_desc)

    return f"""Generate exactly ONE black-and-white 16:9 SVG drawing for the '{layer_name}' layer only.

Scene context:
{scene}

Layer requirement:
{layer_desc}
{f"Director intent: {intent_line}" if intent_line else ""}{cir_block}

ROUGH BLOCKING SKETCH MODE:
- Do NOT create polished line art or a finished illustration.
- Keep this rough, unfinished, and easy for a human to edit afterward.
- Strong target: about {profile['target_elements']} visible paths/shapes total.
- Hard preference: stay under {profile['max_elements']} visible paths/shapes.
- Count path, line, polyline, polygon, rect, circle, and ellipse toward this budget.
- Use simple contours and only the few strokes needed to identify the layer.
- No shading, no hatching, no texture, no tiny repeated marks, no decorative cleanup.
- White background. No text. No filters, masks, clipPath, patterns, or embedded rasters.
"""


def _get_recraft_svg_generation_config(detail_level: int) -> dict:
    return {
        "model": "recraftv4_vector",
        "style": None,
        "prompt_mode": "rough_v4",
    }


def _count_svg_drawable_elements(svg_str: str) -> dict:
    counts = {}
    for tag in ("path", "line", "polyline", "polygon", "rect", "circle", "ellipse"):
        counts[tag] = len(re.findall(rf"<{tag}\b", svg_str))
    counts["total"] = sum(counts.values())
    return counts


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


def _closest_edit_size(image_bytes: bytes) -> str:
    """gpt-image-1이 받는 세 크기 중 입력 비율에 가장 가까운 것.

    고정 크기를 쓰면 정사각형 패널이 가로로 늘어나 돌아온다. 원본 비율을
    지키라는 지시는 프롬프트가 아니라 이 값이 정한다.
    """
    options = {"1024x1024": 1.0, "1536x1024": 1.5, "1024x1536": 1 / 1.5}
    try:
        from PIL import Image
        import io
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
        if not height:
            return "1536x1024"
        ratio = width / height
    except Exception:
        # 크기를 못 읽으면 지금까지 쓰던 값으로 둔다.
        return "1536x1024"
    return min(options, key=lambda name: abs(options[name] - ratio))


async def enhance_sketch(
    image_base64: str,
    script_context: str,
    intent: str = "",
    prompt: str = "",
    shared: str = "",
    previous: str = "",
    references: list = None,
    style: str = "",
    layout: str = "",
    mode: str = "add",
) -> str:
    """Clean up a sketch, or draw the finished panel from it.

    mode="add"     — 보태기. 그린 것을 그대로 두고 선만 고르게 다시 그린다.
                     구도·인물·소품은 바뀌지 않고, 흐린 것은 흐린 채로 둔다.
    mode="restyle" — 그림체 맞추기. 스케치를 배치도로 삼아 다른 패널과 같은
                     방식으로 완성한다. 동그라미는 레퍼런스의 얼굴이 되고,
                     네모는 컷이 말하는 소품이 된다.
    Returns base64 PNG.
    """
    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)

    reference_inventory = "\n".join(
        f"- Image {index + 2}: {getattr(ref, 'kind', 'reference')} reference for {getattr(ref, 'name', 'scene element')}"
        for index, ref in enumerate(references or [])
    ) or "- No additional reference images."

    restyling = mode == "restyle"
    base_prompt = RESTYLE_PROMPT if restyling else ENHANCE_PROMPT
    # 두 모드가 레퍼런스를 쓰는 방식이 정반대다. 보태기에서 레퍼런스는
    # '이미 그려진 것이 무엇인지' 알아보는 용도이고, 그림체 맞추기에서는
    # '동그라미를 무엇으로 그릴지' 정하는 근거다. 꼬리말을 섞으면 보태기가
    # 스케치에 없던 얼굴을 그려 넣는다.
    default_note = (
        'No extra instruction. Draw the finished panel from this staging.'
        if restyling
        else 'No extra instruction. Redraw the same drawing with a steadier hand.'
    )
    closing = (
        "Image 1 is the director's sketch and fixes the staging — who stands where, at what size,\n"
        "facing which way, seen from which angle. The later images listed above are identity\n"
        "references: draw those exact people and that exact place, posed as image 1 stages them.\n"
        "Do not copy the references' own poses or framing."
        if restyling
        else "Image 1 is the director's sketch and is the drawing itself. The later images listed above are\n"
        "character, location, or layout references, provided only to recognize what image 1 already\n"
        "shows. Do not draw a face, prop, or place from those references that image 1 does not\n"
        "already contain — whatever the sketch leaves blank stays blank."
    )

    edit_prompt = f"""{base_prompt}

[Scene Context]
{script_context}

[Current cut — use only to recognize elements already visible, never to add new ones]
{prompt}

[Shared scene basis]
{shared}

[Previous cut, for continuity only]
{previous}

[Layout basis]
{layout}

[Requested drawing style]
{style}

[Reference image inventory]
{reference_inventory}

[Optional Director Note — never use this to alter the existing composition]
{intent or default_note}

{closing}
"""

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    # The original always comes first so visual identity, crop, and existing
    # strokes remain authoritative. Later references only resolve ambiguity.
    files = [("director-sketch.png", image_bytes, "image/png")]
    for ref in references or []:
        try:
            ref_bytes = base64.b64decode(ref.image, validate=True)
            files.append((f"{ref.kind}-reference.png", ref_bytes, "image/png"))
        except (ValueError, TypeError):
            print(f"[enhance-sketch] skipping unreadable {getattr(ref, 'kind', 'reference')} reference")

    # 패널·레퍼런스와 같은 이미지 모델로 편집한다. 첫 파일은 사용자의
    # 스케치이고 뒤 파일은 식별 보조용 기준 그림이다.
    client = AsyncOpenAI(api_key=api_key)
    result = await client.images.edit(
        model="gpt-image-1",
        image=files,
        prompt=edit_prompt,
        # 크기를 가로로 고정하면 프롬프트에 무엇을 써도 정사각형 패널이
        # 늘어나거나 잘려서 돌아온다. 들어온 그림의 비율에서 고른다.
        size=_closest_edit_size(image_bytes),
        quality="low",
        n=1,
    )

    data = result.data[0]
    if getattr(data, "b64_json", None):
        edited_bytes = base64.b64decode(data.b64_json)
    elif getattr(data, "url", None):
        async with httpx.AsyncClient(timeout=60) as http:
            response = await http.get(data.url)
            response.raise_for_status()
            edited_bytes = response.content
    else:
        raise ValueError("GPT Image returned neither b64_json nor url")

    # 원본을 되돌려 덮지 않는다. 두 모드 다 선을 다시 그리는 것이 목적이라,
    # 여기서 원본을 얹으면 옛 선과 새 선이 나란히 남아 두 겹이 된다.
    return _image_bytes_to_base64(edited_bytes)


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


async def generate_sketch_svg(
    script_context: str,
    intent: str = "",
    cir: dict = None,
    scene_script: str = "",
    detail_level: int = 50,
) -> str:
    """Generate a storyboard sketch as SVG using Recraft API. Returns SVG string."""
    api_key = get_recraft_api_key()
    detail_level = _clamp_detail_level(detail_level)
    recraft_config = _get_recraft_svg_generation_config(detail_level)
    legacy_prompt = _build_recraft_svg_prompt_legacy(
        script_context=script_context,
        intent=intent,
        cir=cir,
        scene_script=scene_script,
        detail_level=detail_level,
    )
    if recraft_config["prompt_mode"] == "rough_v4":
        prompt = _build_recraft_v4_rough_svg_prompt(
            script_context=script_context,
            intent=intent,
            cir=cir,
            scene_script=scene_script,
            detail_level=detail_level,
        )
    else:
        prompt = _build_recraft_svg_prompt(
            script_context=script_context,
            intent=intent,
            cir=cir,
            scene_script=scene_script,
            detail_level=detail_level,
        )

    print(
        f"[recraft] Generating SVG sketch, detail_level={detail_level}, "
        f"model={recraft_config['model']}, style={recraft_config['style']}, prompt_mode={recraft_config['prompt_mode']}, "
        f"prompt length={len(prompt)}, legacy_prompt_length={len(legacy_prompt)}"
    )

    request_json = {
        "prompt": prompt,
        "model": recraft_config["model"],
        "size": "16:9",
        "response_format": "b64_json",
    }
    if recraft_config["style"]:
        request_json["style"] = recraft_config["style"]

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://external.api.recraft.ai/v1/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=request_json,
        )

    if response.status_code != 200:
        raise ValueError(f"Recraft API error: {response.status_code} {response.text}")

    data = response.json()
    b64 = data["data"][0].get("b64_json")
    if not b64:
        raise ValueError("Recraft did not return b64_json")

    # b64_json for SVG is the raw SVG bytes encoded in base64
    svg_bytes = base64.b64decode(b64)
    svg_str = svg_bytes.decode("utf-8")

    svg_counts = _count_svg_drawable_elements(svg_str)
    print(f"[recraft] SVG generated, size={len(svg_str)} chars, drawable_elements={svg_counts['total']}, breakdown={svg_counts}")
    return svg_str


async def generate_svg_layer(
    script_context: str,
    layer_name: str,
    intent: str = "",
    cir: dict = None,
    detail_level: int = 50,
) -> str:
    """Generate a single SVG layer (e.g. 'background', 'character') using Recraft API."""
    api_key = get_recraft_api_key()
    detail_level = _clamp_detail_level(detail_level)
    recraft_config = _get_recraft_svg_generation_config(detail_level)

    cir_block = ""
    if cir:
        cir_lines = []
        for k, v in cir.items():
            if v and k not in ('motionHint', 'depth'):
                cir_lines.append(f"  - {k}: {v}")
        if cir_lines:
            cir_block = "\n[Composition Reference]\n" + "\n".join(cir_lines)

    layer_instructions = {
        "background": (
            "Draw ONLY the background environment/setting with NO characters or people. "
            "Include architecture, furniture, landscape, sky, walls, floors — everything that forms the scene's space. "
            "Leave the areas where characters would stand EMPTY."
        ),
        "character": (
            "Draw the character in a SINGLE illustration — exactly ONE image, ONE frame. "
            "NEVER draw multiple panels, thumbnails, a grid, or a sequence. "
            "NO background, NO furniture, NO environment. Pure white background only. "
            "Draw full body with pose and expression."
        ),
        "props": (
            "Draw ONLY the key props and objects mentioned in the scene (books, cups, weapons, vehicles, etc). "
            "NO background, NO characters. Pure white/transparent background. "
            "Draw each prop clearly and separately."
        ),
        "foreground": (
            "Draw ONLY foreground elements that would appear closest to the camera. "
            "This could include objects in the extreme foreground used for depth (door frames, plants, shoulders). "
            "NO background, NO main characters. Pure white/transparent background."
        ),
    }

    # Parse "category:detail" format (e.g. "character:철수", "props:sword")
    base_category = layer_name
    detail_name = None
    if ':' in layer_name:
        base_category, detail_name = layer_name.split(':', 1)
        base_category = base_category.strip().lower()
        detail_name = detail_name.strip()

    if detail_name and base_category == 'character':
        layer_desc = (
            f"Draw ONLY the character '{detail_name}' as a SINGLE illustration — exactly ONE person on ONE frame. "
            f"DO NOT draw multiple panels, frames, or a storyboard grid. "
            f"DO NOT draw any other characters — ONLY '{detail_name}'. "
            f"NO background, NO furniture, NO environment. Pure white/transparent background. "
            f"Draw the full body with pose and expression as described in the scene."
        )
    elif detail_name and base_category == 'props':
        layer_desc = (
            f"Draw ONLY the prop '{detail_name}' — nothing else. "
            f"NO background, NO characters. Pure white/transparent background. "
            f"Draw it clearly as a single object."
        )
    elif detail_name:
        layer_desc = (
            f"Draw ONLY '{detail_name}' from the '{base_category}' category. Nothing else. "
            f"Pure white/transparent background."
        )
    else:
        layer_desc = layer_instructions.get(
            layer_name,
            f"Draw ONLY the '{layer_name}' elements of the scene. "
            f"NO other elements — no background, no characters, no props unless they ARE the '{layer_name}' layer. "
            f"Pure white/transparent background. Each element should be a clear, self-contained outline."
        )
    if recraft_config["prompt_mode"] == "rough_v4":
        prompt = _build_recraft_v4_rough_svg_layer_prompt(
            script_context=script_context,
            layer_name=layer_name,
            layer_desc=layer_desc,
            intent=intent,
            cir=cir,
            detail_level=detail_level,
        )
    else:
        prompt = _build_recraft_svg_layer_prompt(
            script_context=script_context,
            layer_name=layer_name,
            layer_desc=layer_desc,
            intent=intent,
            cir=cir,
            detail_level=detail_level,
        )

    print(
        f"[recraft] Generating SVG layer '{layer_name}', detail_level={detail_level}, "
        f"model={recraft_config['model']}, style={recraft_config['style']}, "
        f"prompt_mode={recraft_config['prompt_mode']}, prompt length={len(prompt)}"
    )

    request_json = {
        "prompt": prompt,
        "model": recraft_config["model"],
        "size": "16:9",
        "response_format": "b64_json",
    }
    if recraft_config["style"]:
        request_json["style"] = recraft_config["style"]

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://external.api.recraft.ai/v1/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=request_json,
        )

    if response.status_code != 200:
        raise ValueError(f"Recraft API error for layer '{layer_name}': {response.status_code} {response.text}")

    data = response.json()
    b64 = data["data"][0].get("b64_json")
    if not b64:
        raise ValueError(f"Recraft did not return b64_json for layer '{layer_name}'")

    svg_bytes = base64.b64decode(b64)
    svg_str = svg_bytes.decode("utf-8")
    svg_counts = _count_svg_drawable_elements(svg_str)
    print(
        f"[recraft] SVG layer '{layer_name}' generated, size={len(svg_str)} chars, "
        f"drawable_elements={svg_counts['total']}, breakdown={svg_counts}"
    )
    return svg_str


async def generate_svg_layers(
    script_context: str,
    intent: str = "",
    cir: dict = None,
    layers: list = None,
    detail_level: int = 50,
) -> dict:
    """Generate multiple SVG layers in parallel. Returns {layer_name: svg_string}."""
    import asyncio
    if not layers:
        layers = ["background", "character"]

    tasks = [
        generate_svg_layer(script_context, layer_name, intent, cir, detail_level)
        for layer_name in layers
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    layer_svgs = {}
    for layer_name, result in zip(layers, results):
        if isinstance(result, Exception):
            print(f"[recraft] Layer '{layer_name}' failed: {result}")
            layer_svgs[layer_name] = None
        else:
            layer_svgs[layer_name] = result

    return layer_svgs


async def reframe_sketch(
    image_base64: str,
    cir: dict,
    script_context: str = "",
    original_cir: dict = None,
    include_description: bool = True,
    model: str = "gpt-image-2",
    intent: str = "",
    strategy_context: str = "",
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
    elif (intent and intent.strip()) or (strategy_context and strategy_context.strip()):
        # Mise-only mode: no CIR change, just apply intent / strategy guidance to existing composition.
        changed_section = (
            "[What to change]\n"
            "  - Keep the existing camera composition (shot size, angle, framing) unchanged.\n"
            "  - Apply only the mise-en-scène / staging adjustments described in the Director's Intent\n"
            "    and the Selected Strategy Guidance below (e.g. blocking, props, set dressing, lighting).\n"
            "  - Do NOT alter the underlying framing geometry. Modify only the in-frame staging."
        )
    else:
        raise ValueError("No CIR changes requested. Change at least one attribute before reframing.")

    print(f"[reframe-sketch] changed_attrs={list(changed_attrs.keys())}")
    print(f"[reframe-sketch] changed_section=\n{changed_section}")

    intent_section = f"[Director's Intent — HIGHEST PRIORITY]\n{intent}\nApply this intent above all else. It overrides default compositional choices." if intent else ""
    strategy_section = (
        "[Selected Strategy Guidance]\n"
        f"{strategy_context}\n"
        "Use this strategy guidance to keep the reframed image aligned with the recommended theory and intended effect."
        if strategy_context else ""
    )

    prompt = f"""{REFRAME_PROMPT}

{intent_section}
{strategy_section}

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
        if model in {'gpt-image-2', 'gpt-image-1.5'}:
            import time
            oai = get_openai_client()
            last_err = None
            for attempt in range(3):
                try:
                    response = oai.images.edit(
                        model=model,
                        image=("sketch.png", image_bytes, "image/png"),
                        prompt=prompt,
                        n=1,
                        size="1536x1024",
                    )
                    img_b64 = response.data[0].b64_json
                    return base64.b64decode(img_b64)
                except Exception as e:
                    last_err = e
                    err_str = str(e)
                    if '429' in err_str or 'rate_limit' in err_str:
                        wait = (attempt + 1) * 15
                        print(f"[reframe-sketch] GPT 429, retry {attempt+1}/3 in {wait}s...")
                        time.sleep(wait)
                    elif 'moderation_blocked' in err_str or 'safety' in err_str:
                        print(f"[reframe-sketch] GPT moderation blocked, falling back to Gemini")
                        break  # fall through to Gemini
                    else:
                        raise
            # Fallback to Gemini if GPT failed
            print(f"[reframe-sketch] GPT failed ({last_err}), using Gemini fallback")
            contents = [prompt, "\n[Input sketch to reframe:]\n", types.Part.from_bytes(data=image_bytes, mime_type='image/png')]
            gen_config = types.GenerateContentConfig(response_modalities=['IMAGE'])
            res = gemini_client.models.generate_content(model='gemini-2.5-flash-image', contents=contents, config=gen_config)
            for part in res.candidates[0].content.parts:
                if part.inline_data is not None:
                    return part.inline_data.data
            raise ValueError("Gemini fallback did not return an image")
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
        desc_prompt = f"""[Scene Context]\n{script_context or 'Same scene'}\n\n{strategy_section}\n\n[What to change]\n{changed_section}\n\n위 변경사항(What to change)을 바탕으로, 1. 기존 구도에서 무엇이 바뀌었는지 2. 이로 인해 어떤 영화적/시각적 효과가 생기는지 한국어로 2~3문장으로 짧고 명확하게 설명해주세요. 전략 가이드가 있으면 그 방향과도 일치하게 설명하세요. 포맷 태그 없이 오직 설명 텍스트만 출력하세요."""
        res = gemini_client.models.generate_content(model='gemini-2.5-flash-lite', contents=[desc_prompt])
        return res.text.strip()

    img_task = asyncio.create_task(asyncio.to_thread(_gen_img))
    description = ""
    if include_description:
        desc_task = asyncio.create_task(asyncio.to_thread(_gen_desc))
        result_image, desc_result = await asyncio.gather(img_task, desc_task, return_exceptions=True)
        if isinstance(result_image, Exception):
            raise result_image
        if isinstance(desc_result, Exception):
            print(f"[reframe-sketch] WARNING description generation failed: {desc_result}")
        else:
            description = desc_result
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


async def vectorize_image(image_base64: str) -> str:
    """Convert a raster image (PNG) to SVG using Recraft vectorize API. Returns SVG string."""
    api_key = get_recraft_api_key()

    if image_base64.startswith('data:'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)

    print(f"[recraft] Vectorizing image, size={len(image_bytes)} bytes")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://external.api.recraft.ai/v1/images/vectorize",
            headers={
                "Authorization": f"Bearer {api_key}",
            },
            files={
                "file": ("sketch.png", image_bytes, "image/png"),
            },
            data={
                "response_format": "b64_json",
            },
        )

    if response.status_code != 200:
        raise ValueError(f"Recraft vectorize error: {response.status_code} {response.text}")

    data = response.json()
    b64 = data.get("image", {}).get("b64_json")
    if not b64:
        raise ValueError("Recraft vectorize did not return b64_json")

    svg_bytes = base64.b64decode(b64)
    svg_str = svg_bytes.decode("utf-8")
    print(f"[recraft] Vectorized, SVG size={len(svg_str)} chars")
    return svg_str
