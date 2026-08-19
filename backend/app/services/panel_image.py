"""패널 그림을 만든다.

앞 공정이 조립한 프롬프트를 실제로 소비하는 유일한 자리다. 씬 기준(미장센),
책임 선언(DG1 P3), 이음새(편집), 샷과 dominant(촬영)가 전부 한 문장으로
모여 여기로 온다 — 여기서 쓰지 않으면 그 공정들이 화면에 아무 흔적도
남기지 못한다.

스토리보드는 완성된 그림이 아니다. 러프 스케치여야 고칠 것이 보이고,
채색된 그림은 이미 정해진 것처럼 읽혀 판정을 막는다.
"""

import base64
import asyncio
import os

import httpx
from openai import AsyncOpenAI

from app.models.schemas import PanelImageRequest, PanelImageResponse
from app.services.panel_style import style_prelude


# 그림체는 panel_style이 정한다. 스케치를 채워 완성하는 길(restyle)도 같은
# 것을 읽어야 두 방식으로 만든 패널이 한 보드로 보인다.


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
    if ref.kind == "style":
        return f"the rendering style reference {ref.name}"
    if ref.kind == "layout":
        return f"a top-down floor plan of {ref.name} (a diagram, not artwork)"
    if ref.kind == "location":
        return f"the location {ref.name}"
    # 이 패널의 지금 그림. 값 하나만 바꿔 다시 그릴 때 기준이 된다.
    if ref.kind == "current":
        return "the CURRENT version of this exact panel"
    # 앞뒤 패널. 삽입은 두 컷 사이에, 합치기는 두 컷을 하나로 접는다.
    if ref.kind == "neighbor-before":
        return f"the panel that comes BEFORE this one ({ref.name})"
    if ref.kind == "neighbor-after":
        return f"the panel that comes AFTER this one ({ref.name})"
    return f"the character {ref.name}"


async def _generate_panel_with_bfl(prompt: str, references: list) -> PanelImageResponse:
    """FLUX.2 Klein 패널 생성 경로.

    BFL은 요청을 비동기로 받고 polling URL을 돌려준다. 결과 URL은 짧게만
    유효하므로 여기서 바로 내려받아 기존 API와 같은 base64 PNG로 돌려준다.
    """
    api_key = os.getenv("BFL_API_KEY")
    if not api_key:
        raise ValueError("BFL_API_KEY not found in environment variables")

    headers = {"accept": "application/json", "x-key": api_key}
    endpoint = "flux-2-klein-9b-preview"
    # BFL은 base64도 input_image로 받는다. Klein은 최대 4장까지라서 인물 →
    # 공간 → 배치 순서의 기준을 우선한다.
    max_references = 4
    decodable = [ref for ref in references if _decodable(ref.image)]
    # 4장을 넘기면 뒤가 잘린다. 앞뒤 패널과 지금 그림은 "이 컷이 무엇과
    # 이어져야 하는가"를 정하므로, 인물·공간 기준보다 먼저 넣어야 한다 —
    # 뒤에 두면 그대로 잘려 나가 물린 의미가 없어진다.
    continuity_kinds = {"current", "neighbor-before", "neighbor-after"}
    usable_references = (
        [ref for ref in decodable if ref.kind == "style"]
        + [ref for ref in decodable if ref.kind in continuity_kinds]
        + [
            ref for ref in decodable
            if ref.kind != "style" and ref.kind not in continuity_kinds
        ]
    )[:max_references]
    if usable_references:
        inventory = "; ".join(
            f"input image {index + 1}: {_describe(ref)}"
            for index, ref in enumerate(usable_references)
        )
        prompt = "\n\n".join([
            prompt,
            f"Reference image inventory: {inventory}.",
            "Use the character and location images as exact visual references, not "
            "loose inspiration. Keep each referenced character's face, hair, build, "
            "clothing and distinctive features consistent. Keep the referenced "
            "location consistent. "
            "Use a character reference for identity, not its neutral pose; pose and "
            "frame the character as this panel describes. "
            # 앵커는 밀도만 정한다. 거기 그려진 인물·공간은 이 컷과 무관하다.
            "The style reference sets ONLY the rendering medium, detail level and "
            "lighting treatment. Ignore its people, their ethnicity and clothing, "
            "its room and its framing — never copy a person from it.",
        ])
    payload = {
        # 레퍼런스 inventory까지 붙인 최종 프롬프트여야 한다. 먼저 payload를
        # 만들면 아래에서 보강한 역할 설명이 Flux 요청에는 빠진다.
        "prompt": prompt,
        "aspect_ratio": "16:9",
        "output_format": "png",
    }
    for index, ref in enumerate(usable_references):
        field = "input_image" if index == 0 else f"input_image_{index + 1}"
        payload[field] = ref.image
    async with httpx.AsyncClient(timeout=90) as http:
        created = await http.post(
            f"https://api.bfl.ai/v1/{endpoint}",
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
        )
        created.raise_for_status()
        polling_url = created.json().get("polling_url")
        if not polling_url:
            raise ValueError("BFL image request did not include a polling URL")

        for _ in range(120):
            await asyncio.sleep(0.5)
            polled = await http.get(polling_url, headers=headers)
            polled.raise_for_status()
            status = polled.json()
            if status.get("status") == "Ready":
                sample_url = status.get("result", {}).get("sample")
                if not sample_url:
                    raise ValueError("BFL image result did not include a sample URL")
                image = await http.get(sample_url)
                image.raise_for_status()
                return PanelImageResponse(
                    image=base64.b64encode(image.content).decode(),
                    format="png",
                )
            if status.get("status") in {"Error", "Failed"}:
                raise ValueError(f"BFL image generation failed: {status}")

    raise TimeoutError("BFL image generation timed out after 60 seconds")


async def generate_panel(request: PanelImageRequest) -> PanelImageResponse:
    if not request.prompt.strip():
        raise ValueError("prompt is empty")

    # 그림체는 미장센이 정할 수 있다. 정하지 않았으면 기본 스케치체를 쓴다.
    # 글자·테두리 금지는 어떤 그림체에서도 유지되어야 한다.
    parts = [style_prelude(request.style or "", request.style_preset)]
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

    # 생성 바에서 고른 모델이 우선이다. FLUX는 BFL API로, GPT Image는
    # OpenAI Images API로 보내며, 프롬프트 조립 규칙은 세 모델이 공유한다.
    if request.model == "flux-2-klein":
        return await _generate_panel_with_bfl(
            "\n\n".join(parts), request.references
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

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
            # '이 그림들 전부'라고 말하면 화풍 앵커의 인물까지 따라 그린다.
            # 어떤 그림이 무엇을 정하는지 종류별로 나눠 말해야 한다.
            "The character and location references are identity references, not "
            "loose inspiration. Draw those exact characters and that exact place — "
            "keep each face, hair, build, clothing, distinctive features and the "
            "room identical to the reference in every panel.",
            # POV 컷은 보는 사람이 화면에 없다. 레퍼런스가 있으면 "그 인물을
            # 정확히 그려라"가 이겨서 POV가 사라졌다 — 패널 지시가 누구를
            # 넣지 말라고 하면 그것이 우선이다.
            "A reference only tells you what someone looks like if they are in "
            "this panel at all. If the panel description says a character is not "
            "visible — a POV shot seen through their eyes, for instance — then do "
            "not draw them, even though their reference is attached.",
            # 레퍼런스는 서 있는 자세다. 그대로 두면 패널의 행동이 사라진다.
            "The character references show neutral standing poses; do not copy "
            "those poses. Pose and frame them as this panel describes.",
        ]
        if any(ref.kind == "style" for ref in request.references):
            # 앵커는 밀도만 보여 준다. 거기 누가 그려져 있는지, 어떤 방인지는
            # 이 컷과 무관하다 — 그것까지 따라 그리면 감독이 세운 인물 기준이
            # 앵커의 인물로 덮인다.
            note.append(
                "The rendering style reference shows ONLY how finished the drawing "
                "should look — line weight, shading density, level of detail. "
                # 완성도를 글로 통제하기 어려우니 이 그림을 기준으로 삼게 한다.
                # 앵커가 실제로 그 밀도의 그림이므로 가장 곧은 지시다.
                "Match it: your panel must look drawn by the same hand at the same "
                "stage of work, no more finished than this image. "
                "Ignore everything else in it: its people, their faces and "
                "ethnicity, their clothing, its room, its props and its framing "
                "are not part of this panel. Never copy a person from it. "
                # 러프 앵커의 얼굴은 완전히 비어 있다. 그것까지 화풍으로 읽으면
                # 눈이 사라지고, 시선을 보는 연출 규칙 셋이 판단할 근거를
                # 잃는다 — 눈은 앵커가 아니라 위 지시가 정한다.
                "One exception: if that reference leaves faces completely blank, "
                "do not copy that. Follow the face instruction above and give each "
                "head its two eye marks so the direction of the gaze is readable."
            )
        # 값 하나를 바꿔 다시 그리는 경우. 지금 그림을 물리고 "이것만
        # 바꿔라"라고 말해야 한다. 최종 값만 주면 모델은 무엇이 달라졌는지
        # 모른 채 처음부터 새로 그려, 감독이 고른 한 가지가 화면에서 무엇을
        # 바꾸는지 비교할 수 없다.
        if any(ref.kind == "current" for ref in request.references):
            changed = "; ".join(request.changes) if request.changes else ""
            note.append(
                "One of the images is the CURRENT version of this exact panel. "
                "You are not drawing a new panel — you are redrawing this same "
                "moment with one thing changed. "
                + (
                    f"The ONLY thing that changes is: {changed}. "
                    if changed else
                    "Only the stated revision changes. "
                )
                + "Everything else must stay as it already is: the same characters "
                "in the same poses and expressions, the same clothing, the same "
                "props in the same places, the same background elements, the same "
                "composition. Do not reinvent the shot, do not rearrange the room, "
                "and do not change what the people are doing. "
                "If the change is a camera change, keep the scene identical and "
                "only move the camera."
            )
        # 앞뒤 패널. 삽입은 두 컷 **사이**에 들어가고 합치기는 두 컷을 하나로
        # 접는다. 글로 "이어지게 그려라"라고만 하면 같은 방인지도 알 수 없다.
        # 다만 따라 그리게 두면 앞 컷을 복제하므로, 무엇을 잇고 무엇을 새로
        # 그릴지 갈라 말해야 한다.
        if any(
            ref.kind in {"neighbor-before", "neighbor-after"}
            for ref in request.references
        ):
            note.append(
                "Some of the images are the panels next to this one in the "
                "sequence. They are continuity references, NOT things to copy. "
                "Take from them the same place, the same people with the same "
                "faces and clothing, the same lighting and the same drawing "
                "style, so this panel reads as the same scene moments away. "
                "But this panel is a DIFFERENT moment: do not repeat their "
                "framing, their poses or the action they already show. Draw "
                "what this panel describes, staged so it follows them without "
                "a jump."
            )
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
            model=request.model,
            image=files,
            prompt="\n\n".join(parts),
            size="1536x1024",
            quality="low",
            n=1,
        )
    else:
        result = await client.images.generate(
            model=request.model,
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
