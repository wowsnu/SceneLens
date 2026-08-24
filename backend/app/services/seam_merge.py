"""편집: 두 컷을 하나로 합친 안을 제안한다.

지금까지 프론트는 두 컷의 문장을 공백으로 이어붙이기만 했다. 두 컷이
같은 동작이나 상태를 다르게 묘사한 경우 이어붙이면 그 중복이 그대로
남는다 — "연필을 내려놓는다"와 "연필을 놓고 등을 기댄다"를 이으면
"연필을 놓는다"가 두 번 말해진다.

합치는 것은 이어붙이는 것이 아니라, 두 컷이 한 화면에서 함께 일어난다고
가정하고 그 화면을 다시 한 문장으로 쓰는 일이다. 겹치는 부분은 지우고
남는다.

새 문장을 만들어 주는 것이 아니라 **제안**이다. 감독이 고칠 수 있다
(design_goal.md DG1 P2).
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SeamMergeRequest, SeamMergeResponse


RESPONSE_SCHEMA = {
    "name": "seam_merge",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["content", "purpose", "characters", "reason"],
        "properties": {
            # 합친 한 컷. 한 문장.
            "content": {"type": "string"},
            # 이 컷이 왜 있는가. 2~6자.
            "purpose": {"type": "string"},
            # 화면에 보이는 인물. 없으면 빈 문자열.
            "characters": {"type": "string"},
            # 무엇을 겹치는 것으로 보고 지웠는지.
            "reason": {"type": "string"},
        },
    },
}


PROMPT = """당신은 편집 담당입니다. 두 컷을 하나로 합치세요.

감독이 이 두 컷을 한 컷으로 합치려 합니다. 이어붙이는 것이 아니라, 두
컷이 같은 화면 안에서 함께 일어난다고 보고 그 화면을 **하나의 문장으로
다시 씁니다.**

겹치는 것을 찾아 지우세요:

1. **같은 동작을 다르게 표현한 경우** — 한쪽만 남깁니다.
   ✓ "연필을 내려놓는다" + "연필을 놓고 등을 기댄다"
     → "연필을 내려놓고 의자에 등을 기댄다" (내려놓는다를 반복하지 않음)
2. **한쪽이 다른 쪽의 상태를 이미 포함하는 경우** — 포함하는 쪽만 남깁니다.
3. **정말 이어지는 두 동작인 경우** — 겹치지 않으면 순서대로 잇습니다.
   ✓ "문을 연다" + "안으로 들어간다" → "문을 열고 안으로 들어간다"

정할 것 세 가지:

- content: **이 화면 한 장에 보이는 것.** 짧은 한 문장.
  두 컷의 내용을 다 담되, 같은 말을 두 번 하지 않습니다.
- purpose: 이 컷이 왜 있는가. **2~6자의 짧은 이름표.**
- characters: 이 화면에 **보이는** 인물만. 없으면 빈 문자열.

지켜야 할 것:

- **두 컷에 있던 것만 씁니다.** 새 사건·새 인물·새 소품을 만들지 마세요.
- **아무것도 사라지면 안 됩니다.** 두 컷 각각에 있던 정보가 합친 문장에
  하나는 남아 있어야 합니다 — 겹치는 것만 지우는 것이지 내용을 줄이는
  것이 아닙니다.

reason은 **무엇을 겹치는 것으로 보고 지웠는지** 한 문장으로 씁니다.
감독이 이 합침을 판정할 근거입니다. 겹치는 것이 없었다면 "겹치는 부분
없이 순서대로 이었습니다"라고 씁니다.

그림이 첨부되어 있으면 문장보다 그림을 먼저 봅니다. 두 그림이 이미 같은
인물·소품·구도를 보여주고 있다면 문장에서도 그 중복을 지우세요.

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


async def suggest_seam_merge(request: SeamMergeRequest) -> SeamMergeResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.first_content.strip() and not request.second_content.strip():
        raise ValueError("both cuts are empty")

    lines = [f"[첫 번째 컷] {request.first_content or '(비어 있음)'}"]
    if request.first_purpose:
        lines.append(f"  역할: {request.first_purpose}")
    lines.append(f"[두 번째 컷] {request.second_content or '(비어 있음)'}")
    if request.second_purpose:
        lines.append(f"  역할: {request.second_purpose}")
    if request.elision:
        # 감독이 이 사이에 건너뛴 것으로 적어 둔 것. 합친 뒤에도 유효한
        # 정보이므로 함께 넘긴다.
        lines.append(f"\n[이 사이에서 건너뛴 것] {request.elision}")
    if request.script:
        lines.append(f"\n[씬 대본]\n{request.script}")

    first_image = _usable_image(request.first_image)
    second_image = _usable_image(request.second_image)
    images = []
    if first_image:
        images.append(("첫 번째 컷", first_image))
    if second_image:
        images.append(("두 번째 컷", second_image))

    content = [{"type": "text", "text": "\n".join(lines)}]
    for label, image in images:
        content.append({"type": "text", "text": f"[{label} 그림]"})
        content.append({"type": "image_url", "image_url": {"url": _image_url(image)}})

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        # 두 그림의 중복을 판정하는 일이라 그림이 있으면 mini로 올린다.
        model="gpt-5.4-mini" if images else "gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=1200,
    )
    result = SeamMergeResponse(
        **json.loads(response.choices[0].message.content.strip())
    )

    if not result.content.strip():
        raise ValueError("merge produced an empty cut")
    return result
