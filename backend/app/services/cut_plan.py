"""줄콘티: Beat를 컷으로 나누고 각 컷이 담을 것을 정한다.

Beat와 Cut은 다르다. Beat는 이야기의 국면이고("민호가 정체를 드러낸다"),
Cut은 한 화면이다. 한 국면이 와이드 하나로 될 수도, 클로즈업 셋으로 나뉠
수도 있다 — 그것이 연출 판단이고 줄콘티가 하는 일이다.

그래서 대본 줄 수가 컷 수를 정하지 않는다. 한 줄이 두 컷이 되기도 하고,
두 줄이 한 컷이 되기도 한다.

샷 크기·앵글·카메라는 여기서 정하지 않는다. 그것은 촬영의 몫이다 —
감독이 줄콘티로 컷을 나누고, 촬영감독과 샷을 정하는 순서를 따른다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import CutPlanRequest, CutPlanResponse


RESPONSE_SCHEMA = {
    "name": "cut_plan",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["cuts"],
        "properties": {
            "cuts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["beat", "content", "purpose", "characters"],
                    "properties": {
                        # 이 컷이 속한 Beat 번호 (0부터).
                        "beat": {"type": "integer"},
                        # 이 컷 한 장에 담기는 것. 화면에서 볼 수 있는 사건.
                        "content": {"type": "string"},
                        # 이 컷이 왜 있는가. 무엇이 읽혀야 하는가.
                        "purpose": {"type": "string"},
                        # 이 컷 화면 안에 있는 인물. 쉼표로 구분. 없으면 빈 문자열.
                        "characters": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 줄콘티를 씁니다. 대본을 컷으로 나누는 일입니다.

Beat와 Cut은 다릅니다:
- Beat는 이야기의 국면입니다. "민호가 정체를 드러낸다" 같은 것.
- Cut은 한 화면입니다. 그림 한 장에 담기는 것.

한 Beat가 컷 하나가 될 수도, 넷이 될 수도 있습니다. 그것을 정하는 것이
당신의 일입니다. **대본 줄 수를 그대로 컷 수로 만들지 마세요.**
- 한 줄에 사건이 여럿이면 나눕니다. ("문을 열고 들어와 주위를 살핀다" → 2컷)
- 이어지는 두 줄이 한 화면에 담기면 합칩니다.
- 중요한 순간은 컷을 더 씁니다. 지나가는 대목은 적게 씁니다.

각 컷에 세 가지를 정하세요:

- content: **이 화면 한 장에 보이는 것.** 짧은 한 문장.
  카메라를 한 번 눌러 담기는 것만 씁니다.
  ✗ "민호가 의자를 돌리지만 오른손은 숨긴 채이고, 재인은 카드를 들어 보인다"
    ← 두 사람의 두 행동. 한 장이 아니다.
  ✓ "민호가 의자를 돌린다. 오른손은 책상 아래에 있다."
  두 사건이면 컷을 둘로 나누세요.

- purpose: 이 컷이 왜 있는가. **2~6자 정도의 짧은 말.**
  설명 문장이 아니라 이름표입니다. 표의 한 칸에 들어갑니다.
  ✗ "공간과 인물의 위치 관계, 긴장감 형성"
  ✓ "공간 설정" / "인물 소개" / "행동 강조" / "반응" / "관계" /
    "정보 노출" / "위협 노출" / "결단"

- characters: 이 화면 안에 있는 인물. **화면에 보이는 사람만** 씁니다.
  Beat에 나온다고 다 넣지 마세요 — 없는 사람을 그리게 됩니다.

하지 않는 것:
- 샷 크기, 앵글, 카메라 움직임은 정하지 마세요. 촬영이 정합니다.
- 대본에 없는 사건을 만들지 마세요. 나누고 합치는 것이지 더하는 것이 아닙니다.
- 대사를 쓰지 마세요. 말하는 장면은 말하는 모습으로 적습니다.

한국어로 답하세요."""


async def plan_cuts(request: CutPlanRequest) -> CutPlanResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.beats:
        raise ValueError("beats is empty")

    # Beat 번호를 명시해 모델이 컷을 어느 Beat에 넣을지 정확히 답하게 한다.
    body = "\n\n".join(
        f"[Beat {beat.beat}]\n" + "\n".join(f"- {line}" for line in beat.lines)
        for beat in request.beats
    )
    user_content = f"[씬] {request.heading}\n\n{body}"
    if request.cast:
        user_content += f"\n\n[이 씬의 인물] {', '.join(request.cast)}"
    if request.scene_intention:
        user_content += f"\n\n[장면 의도] {request.scene_intention}"

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=4000,
    )
    return CutPlanResponse(**json.loads(response.choices[0].message.content.strip()))
