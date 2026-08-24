"""편집: 한 컷에 겹친 두 사건을 두 컷으로 나눈 안을 제안한다.

감독이 직접 나눌 때는 제안하지 않는다. 어디서 끊을지는 연출 판단이고,
AI가 정하면 그 결정을 대신 내리는 것이 된다 (design_goal.md DG1 P2).

편집 렌즈가 "이 컷에 두 사건이 겹쳐 있다"고 진단한 경우는 다르다. 그
진단은 이미 **무엇과 무엇이 겹쳤는지** 알고 있다 — 그것을 알아야 겹쳤다고
말할 수 있기 때문이다. 그런데 지금은 그 판단을 화면에 적어 주지 않아,
감독이 진단을 읽고 같은 것을 처음부터 다시 찾아야 한다.

삽입(seam_insert)이 후보를 내는 것과 같은 이유다. 빈 칸을 두고 "직접
쓰세요"라고 하면 대개 비어 있는 채로 남는다.

나누어 주는 것이 아니라 **제안**이다. 두 칸 모두 감독이 고칠 수 있다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SeamSplitRequest, SeamSplitResponse


RESPONSE_SCHEMA = {
    "name": "seam_split",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["first", "second", "reason"],
        "properties": {
            "first": {
                "type": "object",
                "additionalProperties": False,
                "required": ["content", "purpose", "characters"],
                "properties": {
                    "content": {"type": "string"},
                    "purpose": {"type": "string"},
                    "characters": {"type": "string"},
                },
            },
            "second": {
                "type": "object",
                "additionalProperties": False,
                "required": ["content", "purpose", "characters"],
                "properties": {
                    "content": {"type": "string"},
                    "purpose": {"type": "string"},
                    "characters": {"type": "string"},
                },
            },
            # 왜 이 자리에서 끊었는가. 감독이 판정할 근거다.
            "reason": {"type": "string"},
        },
    },
}


PROMPT = """당신은 편집 담당입니다. 한 컷에 겹쳐 있는 것을 두 컷으로 나누세요.

이 컷은 한 화면에 담기에 너무 많은 것을 담고 있다고 판단되었습니다. 무엇과
무엇이 겹쳤는지는 **주어진 컷 내용에 이미 드러나 있습니다** — 그것을 갈라
각각 한 컷으로 세우는 것이 당신의 일입니다.

어디서 끊는가:

1. **행동이 끝나고 다음 행동이 시작되는 지점.**
   ✓ "연필을 내려놓고 의자에 등을 기댄다"
     → 앞: 연필을 내려놓는다 / 뒤: 의자에 등을 기댄다
2. **사건과 그에 대한 반응 사이.**
   ✓ "화면에 그래프가 뜨고 하린의 표정이 굳는다"
     → 앞: 화면에 그래프가 뜬다 / 뒤: 하린의 표정이 굳는다
3. **보는 것과 보이는 것 사이.**
   ✓ "하린이 노트를 들여다보고, 거기에 어긋난 숫자가 적혀 있다"
     → 앞: 하린이 노트를 들여다본다 / 뒤: 노트의 어긋난 숫자

각 컷에 세 가지를 정하세요:

- content: **이 화면 한 장에 보이는 것.** 짧은 한 문장.
  카메라를 한 번 눌러 담기는 것만 씁니다. 여기에 또 두 사건이 들어가면
  나눈 의미가 없습니다.
- purpose: 이 컷이 왜 있는가. **2~6자의 짧은 이름표.**
  ✓ "행동" / "반응" / "정보 노출" / "시선 연결"
  ✗ "관객이 인물의 감정을 이해하도록 돕는 컷"
- characters: 이 화면에 **보이는** 인물만. 없으면 빈 문자열.

지켜야 할 것:

- **원본에 있는 것만 씁니다.** 새 사건·새 인물·새 소품을 만들지 마세요.
  나누는 것이지 더하는 것이 아닙니다.
- **두 컷을 합치면 원본이 되어야 합니다.** 원본에 있던 것이 어느 쪽에도
  없으면 그것은 사라진 것입니다.
- **순서를 지킵니다.** 원본에서 먼저 일어난 것이 앞 컷입니다.
- 앞뒤 컷이 주어졌으면 그 사이에 자연스럽게 놓이도록 합니다. 앞 컷이 이미
  보여 준 것을 첫 번째 컷이 반복하지 않게 하세요.

reason은 **왜 이 자리에서 끊었는지** 한 문장으로 씁니다. 감독이 이 안을
받아들일지 판정할 근거이므로, "두 사건이라서"가 아니라 무엇과 무엇인지
적으세요.

그림이 첨부되어 있으면 문장이 아니라 **그림을 근거로** 나누세요. 화면에
실제로 보이는 자세·소품·거리가 문장에 다 적히지 않았을 수 있습니다.
앞뒤 컷 그림이 있으면 나눈 결과가 그 사이에서 어색하게 튀지 않는지,
같은 인물·공간이 이어지는지 확인하세요.

한국어로 답하세요."""


def _image_url(image: str) -> str:
    return image if image.startswith("data:") else f"data:image/png;base64,{image}"


def _usable_image(image: str | None) -> str | None:
    # shot.image는 세 가지 모양일 수 있다 — 실제 생성한 그림(data: URL),
    # 컷 재생성이 없는 예시 데이터의 로컬 정적 경로(`/img/...png` 또는
    # `http://localhost:5173/img/...`), 또는 이미 base64 문자열.
    #
    # 로컬 경로·로컬호스트 URL은 이 서버 프로세스에서도, OpenAI 쪽에서도
    # 파일을 열어 볼 수 없다 — 그대로 보내면 "존재하지 않는 이미지"를
    # 보내는 것과 같아 invalid_base64로 400이 난다(실제로 재현됨).
    # 실패로 전체 요청을 죽이지 않고 그 그림만 빼는 편이 낫다.
    if not image:
        return None
    if image.startswith("data:"):
        return image
    if image.startswith("http://") or image.startswith("https://"):
        host = image.split("//", 1)[1].split("/", 1)[0].split(":")[0]
        if host in ("localhost", "127.0.0.1", "0.0.0.0"):
            return None
        return image
    if image.startswith("/"):
        return None
    # 그 밖의 경우 순수 base64 문자열로 본다.
    return image


async def suggest_seam_split(request: SeamSplitRequest) -> SeamSplitResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.content.strip():
        raise ValueError("content is empty")

    lines = [f"[나눌 컷] {request.content}"]
    if request.purpose:
        lines.append(f"  역할: {request.purpose}")
    if request.characters:
        lines.append(f"  인물: {request.characters}")
    # 앞뒤 컷. 나눈 결과가 이 둘 사이에 놓이므로, 앞 컷이 이미 보여 준 것을
    # 첫 번째 컷이 반복하면 같은 화면이 두 장이 된다.
    if request.before_content:
        lines.append(f"\n[앞 컷] {request.before_content}")
    if request.after_content:
        lines.append(f"[뒤 컷] {request.after_content}")
    if request.script:
        lines.append(f"\n[씬 대본]\n{request.script}")
    if request.diagnosis:
        # 진단이 무엇과 무엇이 겹쳤다고 보았는지가 나누는 근거다.
        lines.append(f"\n[편집 진단] {request.diagnosis}")

    # 그려진 그림이 있으면 함께 보낸다. 문장에는 없는 자세·소품·거리가
    # 그림에는 있을 수 있고, 나눈 두 컷은 그 화면과 어긋나면 안 된다.
    cut_image = _usable_image(request.cut_image)
    before_image = _usable_image(request.before_image)
    after_image = _usable_image(request.after_image)
    images = []
    if cut_image:
        lines.append("\n나눌 컷의 실제 그림이 첨부되어 있습니다.")
        images.append(("나눌 컷", cut_image))
    if before_image:
        images.append(("앞 컷", before_image))
    if after_image:
        images.append(("뒤 컷", after_image))

    content = [{"type": "text", "text": "\n".join(lines)}]
    for label, image in images:
        content.append({"type": "text", "text": f"[{label} 그림]"})
        content.append({"type": "image_url", "image_url": {"url": _image_url(image)}})

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        # 그림이 있으면 그림을 읽어야 하는 일이라 mini로 올린다. 다른
        # 렌즈들도 화면 판단에는 nano를 안 쓴다(DEFAULT_LENS_MODELS).
        model="gpt-5.4-mini" if images else "gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=1200,
    )
    result = SeamSplitResponse(
        **json.loads(response.choices[0].message.content.strip())
    )

    # 한쪽이 비면 나눈 것이 아니다. 감독이 빈 칸을 받으면 결국 직접 써야 한다.
    if not result.first.content.strip() or not result.second.content.strip():
        raise ValueError("split produced an empty cut")
    return result
