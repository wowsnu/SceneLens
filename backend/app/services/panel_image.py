"""패널 그림을 만든다.

앞 공정이 조립한 프롬프트를 실제로 소비하는 유일한 자리다. 씬 기준(미장센),
책임 선언(DG1 P3), 이음새(편집), 샷과 dominant(촬영)가 전부 한 문장으로
모여 여기로 온다 — 여기서 쓰지 않으면 그 공정들이 화면에 아무 흔적도
남기지 못한다.

스토리보드는 완성된 그림이 아니다. 러프 스케치여야 고칠 것이 보이고,
채색된 그림은 이미 정해진 것처럼 읽혀 판정을 막는다.
"""

import base64
import os

from openai import AsyncOpenAI

from app.models.schemas import PanelImageRequest, PanelImageResponse


# 모든 패널이 같은 그림체여야 스토리보드로 읽힌다. 내용은 프롬프트가,
# 그림체는 이 문장이 정한다.
# 그림체와 무관하게 지켜야 할 것. 테두리와 글자는 어떤 화풍에서도 방해가 된다.
NO_TEXT = (
    "Storyboard panel. Single frame that fills the entire image edge to edge. "
    "Do not draw a frame, border, outline, or margin around the drawing. "
    "No text, no lettering, no signage, no labels, no numbers, "
    "no speech bubbles, no captions, no watermark."
)

STYLE = (
    "Black and white storyboard panel, rough pencil sketch style, "
    "clean confident line art, minimal shading, cinematic framing. "
    "Single frame that fills the entire image edge to edge. "
    # 테두리를 그리면 패널 안에 패널이 생겨 화면에서 두 겹으로 보인다.
    "Do not draw a frame, border, outline, or margin around the drawing. "
    # 글자는 스토리보드가 담는 것이 아니고, 모델이 쓰면 읽히지도 않는다.
    "No text, no lettering, no signage, no labels, no numbers, "
    "no speech bubbles, no captions, no watermark."
)


def _decodable(value: str) -> bool:
    """base64로 읽히는가. 파일 경로가 섞여 들어오는 일이 있다."""
    try:
        # validate=True 없이는 '/img/x.png' 같은 경로도 통과한다 —
        # base64 문자만으로 이뤄져 길이만 맞으면 디코드되기 때문이다.
        return bool(value) and bool(base64.b64decode(value, validate=True))
    except (ValueError, TypeError):
        return False


def _describe(ref) -> str:
    """레퍼런스가 무엇인지 한 줄로. 도면은 그림이 아니라 배치도임을 밝힌다."""
    if ref.kind == "layout":
        return f"a top-down floor plan of {ref.name} (a diagram, not artwork)"
    if ref.kind == "location":
        return f"the location {ref.name}"
    return f"the character {ref.name}"


async def generate_panel(request: PanelImageRequest) -> PanelImageResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.prompt.strip():
        raise ValueError("prompt is empty")

    # 그림체는 미장센이 정할 수 있다. 정하지 않았으면 기본 스케치체를 쓴다.
    # 글자·테두리 금지는 어떤 그림체에서도 유지되어야 한다.
    look = request.style.strip() if request.style else ""
    parts = [f"{look}. {NO_TEXT}" if look else STYLE]
    if request.shared:
        parts.append(f"Consistent across every panel in this scene: {request.shared}")
    if request.layout:
        # 배치는 감독이 구조도로 정한 것이다. 컷마다 다시 정해지면 안 된다.
        parts.append(
            "Fixed layout of this space (same in every panel): "
            f"{request.layout}. "
            "Respect these positions when choosing the camera angle."
        )
    if request.previous:
        # 앞 컷은 이어짐을 위한 참고일 뿐이다. 여기 나온 인물이 이번 컷에
        # 배경으로 남는 일이 있어 명시적으로 막는다.
        parts.append(
            "For continuity only, the previous panel showed: "
            f"{request.previous} "
            "Match its place, lighting and drawing style. "
            "Do NOT draw the previous panel's action, and do NOT include anyone "
            "who appeared in it unless this panel names them."
        )
    parts.append(f"Draw this panel: {request.prompt}")
    # 금지를 맨 앞에만 두면 뒤따르는 지시에 묻힌다. 특히 간판·안내문이
    # 나오는 장면에서 모델이 글자를 써 넣는다 ("CLOSED"). 마지막에 한 번 더.
    parts.append(
        "Final rule: this drawing contains NO written characters of any kind. "
        "Signs, notices, posters, book spines and labels must be blank or show "
        "only meaningless scribbles — never real letters or words. "
        "Do not draw a border around the image."
    )

    client = AsyncOpenAI(api_key=api_key)

    if request.references and any(
        _decodable(ref.image) for ref in request.references
    ):
        # 레퍼런스가 있으면 그것을 물려 그린다. 글로만 기준을 주면 컷마다
        # 다른 얼굴이 나온다 — 같은 인물로 이어지려면 그림이 기준이어야 한다.
        who = ", ".join(
            f"image {i + 1} is {_describe(ref)}"
            for i, ref in enumerate(request.references)
        )
        note = [
            f"Reference images are provided: {who}.",
            "Draw those exact characters and that exact place — keep each "
            "face, hair, build, clothing and the room identical to the reference.",
            # 레퍼런스는 서 있는 자세다. 그대로 두면 패널의 행동이 사라진다.
            "The character references show neutral standing poses; do not copy "
            "those poses. Pose and frame them as this panel describes.",
        ]
        if any(ref.kind == "layout" for ref in request.references):
            # 도면은 배치를 알려주는 것이지 그려야 할 그림이 아니다.
            note.append(
                "The floor plan is a top-down diagram of where things stand — "
                "it is NOT something to draw. Use it only to place furniture and "
                "people correctly in the scene, then draw the room from a normal "
                "camera view at eye level. Never draw a top-down or map-like image, "
                "and never copy the diagram's boxes, circles or labels. "
                # 빈 사각형이 창문으로 읽혔다. 라벨이 곧 그 물건이다.
                "Each labelled box is the object named by its label — draw that "
                "object, not a window or an empty panel."
            )
        cast = [ref.name for ref in request.references if ref.kind == "character"]
        if cast:
            # 화면에 있어야 할 사람을 못박는다. 배경에 사람을 채워 넣으면
            # 컷이 담기로 한 것과 그림이 어긋난다.
            note.append(
                f"The only people in this panel are: {', '.join(cast)}. "
                "Draw no other people — no bystanders, no figures in the "
                "background, no silhouettes."
            )
        parts.insert(1, " ".join(note))
        files = []
        for i, ref in enumerate(request.references):
            try:
                files.append((
                    f"{ref.kind}-{i}.png",
                    base64.b64decode(ref.image, validate=True),
                    "image/png",
                ))
            except (ValueError, TypeError):
                # 레퍼런스 하나가 깨졌다고 패널을 못 그리면 안 된다.
                # 그림은 나오되 그 인물만 기준 없이 그려진다.
                print(f"[panel-image] skipping unreadable reference: {ref.name}")
        result = await client.images.edit(
            model="gpt-image-1",
            image=files,
            prompt="\n\n".join(parts),
            size="1536x1024",
            quality="low",
            n=1,
        )
    else:
        result = await client.images.generate(
            model="gpt-image-1",
            prompt="\n\n".join(parts),
            # 스토리보드는 가로 프레임이다.
            size="1536x1024",
            # 러프해야 고칠 것이 보인다. 완성도가 높으면 정해진 것처럼 읽힌다.
            quality="low",
            n=1,
        )

    data = result.data[0]
    # 응답 형식이 모델·설정에 따라 갈린다. 둘 다 받는다.
    if getattr(data, "b64_json", None):
        return PanelImageResponse(image=data.b64_json, format="png")

    if getattr(data, "url", None):
        import httpx

        async with httpx.AsyncClient(timeout=60) as http:
            response = await http.get(data.url)
            response.raise_for_status()
            return PanelImageResponse(
                image=base64.b64encode(response.content).decode(),
                format="png",
            )

    raise ValueError("image response contained neither b64_json nor url")
