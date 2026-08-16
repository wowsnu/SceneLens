"""미장센: 인물과 공간의 레퍼런스 그림을 만든다.

씬 기준을 글로만 두면 컷마다 다르게 해석된다. "비에 젖은 상태"가 컷 1과
컷 15에서 다른 사람으로 그려지는 것을 글로는 막을 수 없다.

그래서 기준을 **그림으로도** 세우고, 패널을 그릴 때 그 그림을 참조로
물린다(panel_image.py). 텍스트가 아니라 이미지가 기준이 되면 얼굴과
옷차림이 실제로 이어진다.

레퍼런스는 상황이 없는 그림이다 — 인물은 선 채로, 공간은 사람 없이.
행동이 들어가면 그것까지 따라 그려져 패널의 내용을 침범한다.
"""

import base64
import os

from openai import AsyncOpenAI

from app.models.schemas import ReferenceImageRequest, ReferenceImageResponse


# 어떤 밀도에서도 지켜야 할 것. 글자와 테두리는 레퍼런스를 망치고, 배경이
# 있으면 그 배경까지 패널에 따라온다.
REFERENCE_CLEAN = (
    "Plain white background. "
    "No text, no lettering, no labels, no captions, no watermark, no border."
)

# 표현 밀도. 패널과 같은 값을 써야 한다 — 레퍼런스만 다른 화풍이면 참조로
# 물렸을 때 패널의 화풍이 흔들린다. panel_style.style_prelude와 짝이다.
PRESET_LOOKS = {
    "rough": (
        "Black-and-white cinematic line drawing, clear restrained contours, "
        f"light tonal indication. {REFERENCE_CLEAN}"
    ),
    "detailed": (
        "Monochrome graphite drawing with clear controlled linework and moderate "
        f"tonal shading. Hand-drawn planning-image quality. {REFERENCE_CLEAN}"
    ),
    # 실사 보드의 기준은 실사여야 한다. 선화를 기준으로 물리면 패널이
    # 실사로 나오지 않거나, 두 화풍이 한 그림 안에서 섞인다.
    "photoreal": (
        "Photorealistic reference still. Natural materials, believable lighting, "
        "restrained neutral grade, real camera perspective. "
        f"Not concept art, not a beauty portrait. {REFERENCE_CLEAN}"
    ),
}


def _base_style(preset: str) -> str:
    return PRESET_LOOKS.get(preset, PRESET_LOOKS["rough"])


CHARACTER_BODY = (
    "One single standing figure, full body, front view, neutral pose, "
    "arms relaxed at the sides. "
    # 얼굴이 잘리면 레퍼런스가 아니다. 컷마다 같은 인물로 보이게 하는 것이
    # 이 그림의 목적인데, 그것을 결정하는 것은 얼굴과 머리다.
    "FRAMING IS CRITICAL: the entire figure must fit inside the frame, "
    "from the top of the head to the feet, with clear empty margin above "
    "the head and below the feet. Do not crop the head, face, or feet. "
    "Do not zoom in. The figure should occupy about 80% of the frame height. "
    # 성별·나이가 프롬프트에 있으면 반드시 따라야 한다. 이 그림이 모든
    # 패널의 기준이 되므로, 여기서 틀리면 씬 전체가 틀린 채로 이어진다.
    "Follow the stated gender and age exactly. "
    # 상황을 그리면 그 행동까지 패널에 따라온다. 레퍼런스는 사람만 담는다.
    "No background scenery, no props other than what is described, "
    "no action, no story situation."
)

LOCATION_BODY = (
    "Wide establishing view of an empty space. "
    # 사람이 들어가면 패널마다 그 사람이 따라 나온다.
    "No people, no figures, no characters in the frame."
)


def _subject_style(kind: str, preset: str) -> str:
    """이 레퍼런스의 화풍 + 담을 것. 화풍은 preset이, 나머지는 kind가 정한다."""
    base = _base_style(preset)
    if kind == "character":
        return f"Character reference sheet. {base} {CHARACTER_BODY}"
    return f"Location reference. {base} {LOCATION_BODY}"


async def generate_reference(request: ReferenceImageRequest) -> ReferenceImageResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.prompt.strip():
        raise ValueError("prompt is empty")

    subject_style = _subject_style(request.kind, request.style_preset)
    # 표현 밀도(style_preset)가 화풍을 정하고, 그림체(style)는 그 안에서
    # 감독이 덧붙이는 문장이다. 비워 두면 밀도의 기본 화풍을 그대로 쓴다.
    scene_style = request.style.strip() if request.style else ""
    style = (
        f"Scene-wide visual style (use it exactly): {scene_style}. {subject_style}"
        if scene_style else subject_style
    )
    # 인물은 서 있는 전신이라 세로가 맞고, 공간은 가로가 맞다.
    size = "1024x1536" if request.kind == "character" else "1536x1024"

    client = AsyncOpenAI(api_key=api_key)
    result = await client.images.generate(
        model="gpt-image-1",
        prompt=f"{style}\n\n{request.prompt}",
        size=size,
        quality="low",
        n=1,
    )

    data = result.data[0]
    if getattr(data, "b64_json", None):
        return ReferenceImageResponse(image=data.b64_json)

    if getattr(data, "url", None):
        import httpx

        async with httpx.AsyncClient(timeout=60) as http:
            response = await http.get(data.url)
            response.raise_for_status()
            return ReferenceImageResponse(image=base64.b64encode(response.content).decode())

    raise ValueError("image response contained neither b64_json nor url")
