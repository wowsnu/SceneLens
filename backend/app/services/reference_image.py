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
from app.services.image_ai_gate import run_image_ai


# 어떤 밀도에서도 지켜야 할 것. 글자와 테두리는 레퍼런스를 망치고, 배경이
# 있으면 그 배경까지 패널에 따라온다.
REFERENCE_CLEAN = (
    "Plain white background. "
    "No text, no lettering, no labels, no captions, no watermark, no border."
)

# 표현 밀도. 패널과 같은 값을 써야 한다 — 레퍼런스만 다른 화풍이면 참조로
# 물렸을 때 패널의 화풍이 흔들린다. panel_style.style_prelude와 짝이다.
# 패널과 같은 네 항목(선 / 얼굴 / 음영 / 배경)으로 쓴다. panel_style과
# 어긋나면 기준 그림이 패널보다 완성돼 나오고, 그것이 참조로 물려 패널까지
# 끌어올린다 — 실제로 러프인데 얼굴이 다 그려진 기준이 나왔다.
#
# `cinematic`, `tonal indication` 같은 말은 쓰지 않는다. 완성도를 낮추라는
# 지시와 반대로 당긴다.
PRESET_LOOKS = {
    # 감독이 종이에 펜으로 20초 만에 긋는 그림. 얼굴은 **비운다** —
    # 이목구비를 하나라도 요구하면 모델이 거기서부터 그리기 시작해
    # detailed 수준으로 올라간다.
    "rough": (
        "A crude pen thumbnail scribbled on paper in twenty seconds to block out "
        "a composition. Stick-figure level. "
        "Bodies: a few straight strokes for limbs and a simple shape for the "
        "torso. No anatomy, no muscle, no clothing folds. "
        # 패널과 같은 규칙. 눈까지만 — 시선을 보는 연출 규칙이 셋 있어
        # 얼굴을 완전히 비우면 그 셋이 판단할 근거가 없어진다.
        "FACES: two small dots for the eyes and nothing else — no mouth, no "
        "nose, no eyebrows, no hair strands, no expression. A head is an empty "
        "oval plus two eye marks. "
        "Objects: plain boxes and lines standing in for furniture and props. "
        "Shading: none, except a few quick parallel strokes if an area must read "
        "as dark. Most of the paper stays blank. "
        "Wobbly, uneven, obviously hand-drawn in haste. This is a planning "
        f"scribble, not a drawing — it should look almost too crude. {REFERENCE_CLEAN}"
    ),
    "detailed": (
        "A monochrome graphite drawing with controlled, cleaned-up linework. "
        "Face: features readable — eyes, nose and mouth resolved, hair as shaped "
        "masses. No skin texture, no individual hairs. "
        "Shading: moderate tone where it gives form. "
        f"Still hand-drawn: a planning image, not a finished illustration. {REFERENCE_CLEAN}"
    ),
    # 실사 보드의 기준은 실사여야 한다. 선화를 기준으로 물리면 패널이
    # 실사로 나오지 않거나, 두 화풍이 한 그림 안에서 섞인다.
    "photoreal": (
        "A photorealistic reference photograph. Natural materials, believable "
        "lighting, restrained neutral grade, real camera perspective. "
        f"Not concept art, not a beauty portrait. {REFERENCE_CLEAN}"
    ),
}


def _base_style(preset: str) -> str:
    return PRESET_LOOKS.get(preset, PRESET_LOOKS["rough"])


CHARACTER_BODY = (
    "One single standing figure, full body, front view, neutral pose, "
    "arms relaxed at the sides. "
    # 대본은 한국어이고 인물 이름도 한국 이름인데, 모델은 그냥 두면 서양
    # 인물을 그린다. 대본이 다른 국적을 말하면 그 값이 프롬프트 뒤쪽에
    # 오므로 이 기본값을 덮는다.
    "The character is Korean unless the description says otherwise. "
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
    # 국적·문화 지시를 넣지 않는다. 넣으면 대본과 무관하게 특정 양식의
    # 건축·간판·가구가 강제된다. 장소의 성격은 설명이 정하고, 없으면
    # 모델의 기본값에 맡긴다.
    "Do not impose any specific country, culture, or regional architectural "
    "style unless the description states one. "
    # 사람이 들어가면 패널마다 그 사람이 따라 나온다.
    "No people, no figures, no characters in the frame."
)


def _subject_style(kind: str, preset: str) -> str:
    """이 레퍼런스의 화풍 + 담을 것. 화풍은 preset이, 나머지는 kind가 정한다."""
    base = _base_style(preset)
    # `reference sheet`는 쓰지 않는다 — 모델이 잡지 화보 같은 캐릭터 시트로
    # 읽어 완성도를 올린다. 무엇에 쓰는 그림인지는 아래 본문이 이미 말한다.
    if kind == "character":
        return f"{base} {CHARACTER_BODY}"
    return f"{base} {LOCATION_BODY}"


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
    result = await run_image_ai(lambda: client.images.generate(
        # 패널 생성에서 고른 모델을 그대로 쓴다. 기준 그림만 다른 모델로
        # 그리면 지시를 받아들이는 정도가 달라 화풍이 그 지점에서 갈린다.
        model=request.model,
        prompt=f"{style}\n\n{request.prompt}",
        size=size,
        # 기준 그림은 인물·공간마다 여러 장을 만들고, 마음에 안 들면 다시
        # 그린다. 화질보다 기다리는 시간이 작업을 막는다.
        quality="low",
        n=1,
    ))

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
