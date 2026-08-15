"""진단이 짚은 것을 지금 컷 프롬프트에 반영한다.

선택지를 제안해 놓고 반영은 감독이 직접 쓰게 두면 제안이 읽을거리로 끝난다.
고친 문장까지 와야 감독에게 판정할 것이 생긴다 — 받아들이거나, 고치거나,
버리거나.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import PromptRewriteRequest, PromptRewriteResponse

MODEL = os.getenv("PROMPT_REWRITE_MODEL", "gpt-5.4-mini")

RESPONSE_SCHEMA = {
    "name": "prompt_rewrite",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["prompt", "changed"],
        "properties": {
            "prompt": {"type": "string"},
            "changed": {"type": "string"},
        },
    },
}

PROMPT = """당신은 스토리보드 패널의 생성 프롬프트를 고칩니다.

지금 프롬프트가 있고, 감독이 고른 수정 방향이 있습니다. 그 방향을 문장에
반영해 돌려주세요.

지켜야 할 것:
- **지금 문장을 최대한 그대로 둡니다.** 고른 방향에 해당하는 부분만 고치세요.
  전체를 다시 쓰면 감독이 앞서 정한 것들이 소리 없이 사라집니다.
- 인물 이름, 공간 기준, 소품, 사건은 건드리지 마세요. 그것은 다른 공정이
  정한 것입니다.
- 문체를 지키세요. 지금 문장과 같은 말투의 한국어 서술문입니다.
- 없는 것을 지어내지 마세요. 고른 방향이 말하지 않은 조명·표정·소품을
  더하지 마세요.
- 길이는 지금과 비슷하게 두세요. 방향 하나를 반영하는 것이지 문장을
  풍부하게 만드는 일이 아닙니다.

changed에는 무엇을 바꿨는지 한 문장으로 쓰세요. 감독이 두 문장을 나란히
비교하지 않고도 알 수 있어야 합니다. 한국어로 씁니다.
예: "카메라를 인물 아래에 두는 문장으로 바꿨습니다."
"""


async def rewrite_prompt(
    request: PromptRewriteRequest,
    client: AsyncOpenAI | None = None,
) -> PromptRewriteResponse:
    if client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        client = AsyncOpenAI(api_key=api_key)

    user_content = "\n\n".join(
        [
            f"[지금 프롬프트]\n{request.prompt}",
            f"[진단]\n{request.diagnosis}",
            f"[조치]\n{request.suggested_action or '입력되지 않음'}",
            (
                "[감독이 고른 방향]\n"
                f"{request.alternative_label}"
                + (f" — {request.alternative_effect}" if request.alternative_effect else "")
            ),
        ]
    )

    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
    )

    data = json.loads(response.choices[0].message.content)
    return PromptRewriteResponse(prompt=data["prompt"], changed=data["changed"])
