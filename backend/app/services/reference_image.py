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


# 패널과 같은 그림체여야 한다. 레퍼런스만 다른 화풍이면 참조로 물렸을 때
# 패널의 화풍이 흔들린다.
BASE_STYLE = (
    "Black and white rough pencil sketch, clean confident line art, "
    "minimal shading. Plain white background. "
    "No text, no lettering, no labels, no captions, no watermark, no border."
)

CHARACTER_STYLE = (
    f"Character reference sheet. {BASE_STYLE} "
    "One single standing figure, full body, front view, neutral pose, "
    "arms relaxed at the sides. "
    # 성별·나이가 프롬프트에 있으면 반드시 따라야 한다. 이 그림이 모든
    # 패널의 기준이 되므로, 여기서 틀리면 씬 전체가 틀린 채로 이어진다.
    "Follow the stated gender and age exactly. "
    # 상황을 그리면 그 행동까지 패널에 따라온다. 레퍼런스는 사람만 담는다.
    "No background scenery, no props other than what is described, "
    "no action, no story situation."
)

LOCATION_STYLE = (
    f"Location reference. {BASE_STYLE} "
    "Wide establishing view of an empty space. "
    # 사람이 들어가면 패널마다 그 사람이 따라 나온다.
    "No people, no figures, no characters in the frame."
)


async def generate_reference(request: ReferenceImageRequest) -> ReferenceImageResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.prompt.strip():
        raise ValueError("prompt is empty")

    subject_style = CHARACTER_STYLE if request.kind == "character" else LOCATION_STYLE
    # Panels에서 선택한 그림체를 레퍼런스에도 같은 우선순위로 적용한다.
    # 비워 두면 기존의 통일된 흑백 스토리보드 스타일을 유지한다.
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
