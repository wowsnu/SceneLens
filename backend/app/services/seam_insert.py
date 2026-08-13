"""편집: 두 컷 사이에 넣을 컷을 제안한다.

빈 컷을 만들어 두고 "직접 쓰세요"라고 하면 대개 비어 있는 채로 남는다.
그런데 무엇을 넣어야 하는지는 이미 앞뒤 컷에 드러나 있다 — 두 컷 사이에
건너뛴 것이 있으니 넣으려는 것이기 때문이다.

이음새에 적어 둔 '생략된 것'이 있으면 그것이 가장 곧은 근거다. 없으면
앞뒤 컷의 내용 차이에서 무엇이 빠졌는지 읽는다.

새 컷을 만들어 주는 것이 아니라 **제안**이다. 감독이 고르고 고친다
(design_goal.md DG1 P2).
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SeamInsertRequest, SeamInsertResponse


RESPONSE_SCHEMA = {
    "name": "seam_insert",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["candidates"],
        "properties": {
            "candidates": {
                "type": "array",
                "minItems": 2,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["content", "purpose", "characters", "reason"],
                    "properties": {
                        # 이 컷 한 장에 담기는 것. 한 문장.
                        "content": {"type": "string"},
                        # 이 컷이 왜 있는가. 2~6자.
                        "purpose": {"type": "string"},
                        # 화면에 보이는 인물. 없으면 빈 문자열.
                        "characters": {"type": "string"},
                        # 왜 이것을 넣는가. 앞뒤 컷에 근거해서.
                        "reason": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 편집 담당입니다. 두 컷 사이에 넣을 컷을 제안하세요.

감독이 이 자리에 컷을 하나 넣으려 합니다. **무엇이 들어가야 하는지는 앞뒤
컷에 이미 드러나 있습니다** — 두 컷 사이에 건너뛴 것이 있으니 넣으려는
것이기 때문입니다.

무엇을 보고 정하는가:

1. **이음새에 적힌 '생략된 것'** — 있으면 이것이 가장 곧은 근거입니다.
   감독이 직접 "여기서 이걸 건너뛰었다"고 적어 둔 것입니다.
2. **앞뒤 컷의 차이** — 인물의 위치·자세·상태가 달라져 있으면 그 사이에
   무슨 일이 있었던 것입니다.
3. **읽히지 않는 연결** — 앞 컷에서 뒤 컷으로 넘어갈 때 관객이 채워야 하는
   것이 너무 크면, 그 단계를 보여 주는 컷이 필요합니다.

각 후보에 세 가지를 정하세요:

- content: **이 화면 한 장에 보이는 것.** 짧은 한 문장.
  카메라를 한 번 눌러 담기는 것만 씁니다. 두 사건이면 그건 두 컷입니다.
- purpose: 이 컷이 왜 있는가. **2~6자의 짧은 이름표.**
  ✓ "반응" / "이동" / "정보 노출" / "시선 연결"
  ✗ "관객이 인물의 감정을 이해하도록 돕는 컷"
- characters: 이 화면에 **보이는** 인물만. 없으면 빈 문자열.

**서로 다른 방향으로 2~3개를 내세요.** 같은 것을 다르게 쓴 것이 아니라,
이 자리를 채우는 서로 다른 방법이어야 합니다.
  ✓ "재인이 문 쪽으로 움직인다" / "민호의 손이 리모컨을 쥔다"
    ← 하나는 이동을 보이고, 하나는 위협을 보인다
  ✗ "재인이 걷는다" / "재인이 이동한다"   ← 같은 것이다

지어내지 마세요. 앞뒤 컷과 대본에 근거가 있는 것만 씁니다. 새 인물이나
새 사건을 만들지 마세요 — 건너뛴 것을 드러내는 것이지 이야기를 더하는
것이 아닙니다.

reason은 왜 이것을 넣는지 한 문장으로, **앞뒤 컷에 근거해서** 씁니다.
한국어로 답하세요."""


async def suggest_seam_insert(request: SeamInsertRequest) -> SeamInsertResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    lines = [f"[앞 컷] {request.before_content or '(비어 있음)'}"]
    if request.before_purpose:
        lines.append(f"  역할: {request.before_purpose}")
    lines.append(f"[뒤 컷] {request.after_content or '(비어 있음)'}")
    if request.after_purpose:
        lines.append(f"  역할: {request.after_purpose}")
    if request.elision:
        # 감독이 직접 적어 둔 것. 가장 강한 근거다.
        lines.append(f"\n[이 사이에서 건너뛴 것] {request.elision}")
    if request.script:
        lines.append(f"\n[씬 대본]\n{request.script}")
    if request.diagnosis:
        # 진단에서 넘어온 경우. 왜 이 자리에 컷이 필요한지가 적혀 있다.
        lines.append(f"\n[편집 진단] {request.diagnosis}")

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(lines)},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=1500,
    )
    result = SeamInsertResponse(
        **json.loads(response.choices[0].message.content.strip())
    )

    # 내용이 없는 후보는 고를 것이 없다.
    result.candidates = [
        candidate for candidate in result.candidates if candidate.content.strip()
    ]
    return result
