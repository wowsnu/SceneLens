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

**대조의 기준은 하나입니다: 감독이 이 컷에서 노린 읽힘이 관객의 주된 읽힘인가.**
단순한 전달 성공만 세지 말고, 같은 화면이 예상과 다른 긴장·관계·정보의
방향으로 읽히는지도 드러내세요. 이는 곧바로 오류나 재생성 지시가 아니라,
감독이 의도한 갈림인지 확인할 수 있게 하는 판정입니다.

- 관객의 말이 목적보다 **더 구체적일 뿐**이면 `reached`입니다. 관객은 화면을
  보고 말하므로 목적보다 자세한 것이 정상이고, 그건 닿았다는 증거이지
  어긋난 것이 아닙니다.
  ✓ 목적 `행동 강조` / 읽힘 `바로 메모하며 정리하기 시작` → reached
    (메모하며 정리하는 것이 곧 그 행동이다. 같은 것을 자세히 말했을 뿐)
  ✓ 목적 `불안` / 읽힘 `누군가 올까 봐 문을 자꾸 본다` → reached
- 목적이 관객의 말 **안에 들어 있고 그 목적이 먼저 읽히면** `reached`입니다.
  관객이 그 밖의 것을 더 말했다는 이유만으로 낮추지 마세요.
- 상위어/하위어, 요약과 그 사례, 원인과 결과는 어긋남이 아닙니다.

어긋남은 **관객이 읽은 것이 목적과 다른 쪽으로 화면의 중심을 옮길 때** 성립합니다.
  ✓ 목적 `체념` / 읽힘 `결심` → missed (반대 방향으로 읽혔다)
  ✓ 목적 `행동 강조` / 읽힘 `방이 얼마나 어질러졌는지` → missed
    (행동이 아니라 공간을 읽었다)
  ✓ 목적 `행동 강조` / 읽힘 `지친 얼굴, 그다음에야 손이 움직이는 것` → partial
    (행동이 읽히긴 했으나 표정이 먼저 왔다)
  ✓ 목적 `둘의 협력` / 읽힘 `서로를 의심하는 거리감` → partial
    (같은 행동이 다른 관계로 읽혔다)
  ✓ 목적 `단서의 발견` / 읽힘 `무언가 이미 늦었다는 불길함` → partial
    (정보는 보이지만 정서적 중심이 다른 데로 옮겨갔다)

관객의 읽힘에 목적과 경쟁하는 해석이 실제로 있으면 `partial`로 두세요.
그 경쟁이 단순한 디테일인지, 이야기의 긴장·관계·정보 공개를 바꾸는 해석인지
구분하지 못할 때만 `reached`로 두세요.

`partial`과 `missed`에는 **무엇과 어긋났는지**를 두 짧은 구로 나눠 씁니다.
화면이 이 둘을 나란히 놓으므로, 둘 다 없으면 감독은 원래 무엇을 의도했는지
컷 플랜을 다시 찾아봐야 합니다.
- intended — 감독이 노린 것. 목적을 그대로 옮기지 말고 이 컷에서 무엇이
  읽혀야 했는지 짧은 구로 쓰세요. `체념`, `되돌릴 수 없다는 감각`
- read_as — 관객이 대신 읽은 것. 관객의 말에서 가져옵니다. `결심`, `잠시 쉬는 것`
둘 다 **구**입니다. 문장으로 쓰지 마세요.
  ✓ intended: `체념` / read_as: `결심`
  ✗ intended: `목적은 체념이었습니다` / read_as: `관객은 결심으로 읽었습니다`

screen_cause는 `partial`과 `missed`일 때만 채웁니다. **화면의 무엇이** 그렇게
읽히게 했는지 한 문장으로 쓰세요 — 관객이 근거로 든 것 안에서만 찾습니다.
  ✓ `눈을 크게 뜬 얼굴이 앞서 보여 지친 기색이 묻힙니다.`
  ✗ `클로즈업을 풀어 보세요.` (해결책은 여기서 내지 않습니다)

`reached`와 `unknown`에는 이 세 칸을 모두 빈 문자열로 두세요. 통한 컷은 화면이
개수만 세므로 설명이 필요 없습니다.

모든 컷에 판정을 하나씩 내세요. 받은 컷을 빠뜨리지 마세요."""


SCHEMA = {
    "name": "intent_check",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["verdicts"],
        "properties": {
            "verdicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["panel_order", "status", "intended", "read_as", "screen_cause"],
                    "properties": {
                        "panel_order": {"type": "integer"},
                        "status": {
                            "type": "string",
                            "enum": ["reached", "partial", "missed", "unknown"],
                        },
                        "intended": {"type": "string"},
                        "read_as": {"type": "string"},
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
