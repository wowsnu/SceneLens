"""읽힌 것과 컷의 목적을 맞춰 본다.

관객은 의도를 모른 채 읽는다 — 그 원칙은 `viewer_initial_reading`이
지킨다. 여기서는 그 읽기가 **끝난 뒤에** 감독이 컷 플랜에서 이미 정해 둔
목적과 대조만 한다. 감독에게 새로 묻는 것은 없다.

이 대조가 없으면 감독은 관객이 무엇을 읽었는지만 받아 들고, 그것이 잘된
것인지 아닌지를 컷마다 혼자 판정해야 한다. 컷이 열다섯이면 그 판정을
끝까지 하지 못하고, 화면은 읽을거리로 남는다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import IntentCheckRequest, IntentCheckResponse


PROMPT = """당신은 스토리보드의 **의도와 읽힘을 대조**합니다.

감독이 각 컷에 정해 둔 목적과, 의도를 모르는 관객이 그 컷에서 실제로 읽은
것을 나란히 받습니다. 둘이 맞았는지만 판정하세요.

**새 연출을 제안하지 마세요.** 여기서 하는 일은 판정뿐입니다. 무엇을 고칠지는
감독이 정하고, 그 도구는 다른 화면에 있습니다.

판정 값:
- `reached` — 목적이 관객에게 닿았다. 말이 달라도 같은 것을 읽었으면 닿은 것이다.
  관객은 감독의 용어를 모르므로 표현이 같기를 기대하지 마세요.
- `partial` — 닿긴 했으나 다른 것이 먼저 읽혔다. 목적이 화면에서 두 번째가 된 경우.
- `missed` — 목적과 다르게 읽혔다. 또는 목적이 아예 읽히지 않았다.
- `unknown` — 목적이 비어 있어 견줄 대상이 없다. 이때는 추측하지 말고 이 값을 쓰세요.

reason은 **한 문장**입니다. 관객이 쓴 말과 목적을 이어서, 왜 그렇게 보았는지
쓰세요. `목적과 다릅니다` 같은 판정의 반복은 쓰지 마세요.
  ✓ `목적은 체념인데 관객은 결심으로 읽었습니다.`
  ✗ `목적이 달성되지 않았습니다.`

screen_cause는 `partial`과 `missed`일 때만 채웁니다. **화면의 무엇이** 그렇게
읽히게 했는지 한 문장으로 쓰세요 — 관객이 근거로 든 것 안에서만 찾습니다.
  ✓ `눈을 크게 뜬 얼굴이 앞서 보여 지친 기색이 묻힙니다.`
  ✗ `클로즈업을 풀어 보세요.` (해결책은 여기서 내지 않습니다)
`reached`와 `unknown`에는 빈 문자열을 두세요.

summary는 회차 전체를 한 문장으로 말합니다. 컷 하나씩만 보면 흐름이 보이지
않으므로, 어디서부터 어긋나기 시작하는지처럼 **묶어서** 읽히는 것을 쓰세요.
어긋난 컷이 없으면 그 사실을 그대로 쓰면 됩니다.

모든 컷에 판정을 하나씩 내세요. 받은 컷을 빠뜨리지 마세요."""


SCHEMA = {
    "name": "intent_check",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["verdicts", "summary"],
        "properties": {
            "summary": {"type": "string"},
            "verdicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["panel_order", "status", "reason", "screen_cause"],
                    "properties": {
                        "panel_order": {"type": "integer"},
                        "status": {
                            "type": "string",
                            "enum": ["reached", "partial", "missed", "unknown"],
                        },
                        "reason": {"type": "string"},
                        "screen_cause": {"type": "string"},
                    },
                },
            },
        },
    },
}


def _body(request: IntentCheckRequest) -> str:
    lines = []
    if request.scene_intention:
        lines.append(f"[장면 전체 의도] {request.scene_intention}\n")
    for cut in request.cuts:
        lines.append(f"S{cut.panel_order}")
        lines.append(f"  감독이 정한 목적: {cut.purpose or '(비어 있음)'}")
        if cut.content:
            lines.append(f"  이 컷의 내용: {cut.content}")
        if cut.readings:
            for reading in cut.readings:
                lines.append(f"  관객이 읽은 것: {reading}")
        else:
            lines.append("  관객이 읽은 것: (없음)")
        lines.append("")
    return "\n".join(lines)


async def check_intent(request: IntentCheckRequest) -> IntentCheckResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": _body(request)},
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=2000,
    )
    return IntentCheckResponse(
        **json.loads(response.choices[0].message.content.strip())
    )
