"""편집: 컷과 컷 사이를 정한다.

이음새는 두 컷 사이에 있는 것이다 — 무엇을 건너뛰었는가(생략), 어떻게
이어지는가(연결 방식), 얼마나 흘렀는가(경과). design_goal.md DG2 P1.

컷 하나만 보고는 정할 수 없다. 앞뒤 컷이 무엇을 담았는지, 그 사이에
대본이 무엇을 건너뛰었는지를 함께 봐야 한다.

대부분의 이음새는 '컷 · 연속'이다. 그것이 기본이고, 그 밖의 것만 정한다 —
모든 이음새에 무언가를 표시하면 정작 감독이 정한 것이 묻힌다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SeamDesignRequest, SeamDesignResponse


JOINS = ["cut", "match", "dissolve", "fade"]
ELAPSED = ["continuous", "moments", "later"]

RESPONSE_SCHEMA = {
    "name": "seam_design",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["seams"],
        "properties": {
            "seams": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["after_cut", "join", "elapsed", "elision", "reason"],
                    "properties": {
                        # 이 이음새 앞에 있는 컷의 순번 (0부터).
                        "after_cut": {"type": "integer"},
                        "join": {"type": "string", "enum": JOINS},
                        "elapsed": {"type": "string", "enum": ELAPSED},
                        # 두 컷 사이에서 건너뛴 것. 없으면 빈 문자열.
                        "elision": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 편집 담당입니다. 컷과 컷 사이를 정하세요.

이음새는 두 컷 사이에 있는 것입니다:
- join: 어떻게 이어지는가
  · cut — 바로 이어진다 (기본)
  · match — 형태나 동작이 이어진다
  · dissolve — 겹치며 넘어간다. 시간 경과를 뜻한다
  · fade — 끊고 다시 연다. 단락이 바뀐다
- elapsed: 얼마나 흘렀는가
  · continuous — 앞 컷에서 바로 이어진다 (기본)
  · moments — 몇 초에서 몇 분
  · later — 뚜렷한 시간이 흘렀다
- elision: 두 컷 사이에서 **건너뛴 것**. 대본에는 있는데 컷으로 나뉘지
  않은 행동이나, 관객이 없이도 이해할 수 있어 생략한 과정입니다.
  없으면 빈 문자열로 두세요.

**대부분의 이음새는 cut · continuous입니다.** 그것이 기본이고, 표시할
필요가 없습니다. **기본과 다른 이음새만 답하세요.**
모든 이음새에 무언가를 붙이면 정작 감독이 정한 것이 묻힙니다.
컷이 20개라도 답이 2~4개면 충분합니다.

무엇을 찾아야 하는가:

1. **시간이 흐른 지점.** 대본에서 "잠시 후", "그리고", 장면이 건너뛰는
   대목입니다. 앞 컷의 상태가 뒤 컷에서 달라져 있으면 시간이 흐른 것입니다.
   → elapsed를 moments나 later로, join을 dissolve로.

2. **생략된 과정.** 앞 컷과 뒤 컷 사이에 당연히 있었을 행동이 컷으로
   없는 경우입니다. 인물이 방 이쪽에 있다가 저쪽에 있으면 이동을 생략한
   것입니다.
   → elision에 무엇을 건너뛰었는지 씁니다.

3. **형태나 동작이 이어지는 지점.** 앞 컷의 움직임이 뒤 컷에서 계속되거나,
   비슷한 형태가 자리를 물려받는 경우입니다.
   → join을 match로.

4. **단락이 끝나는 지점.** 씬 안에서 한 국면이 완전히 닫히고 다른 국면이
   시작되는 경우입니다. 드물게 씁니다.
   → join을 fade로.

지어내지 마세요. 대본과 컷에 근거가 있을 때만 답하세요.
reason은 왜 그렇게 보는지 한 문장으로, 한국어로 씁니다."""


async def design_seams(request: SeamDesignRequest) -> SeamDesignResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if len(request.cuts) < 2:
        # 컷이 하나면 이음새가 없다.
        return SeamDesignResponse(seams=[])

    body = "\n".join(
        f"[{i}] Beat {cut.beat} · {cut.purpose or '—'} · {cut.content}"
        for i, cut in enumerate(request.cuts)
    )
    user_content = f"[씬] {request.heading}\n\n[컷]\n{body}"
    # 대본을 함께 준다. 컷으로 나뉘지 않고 건너뛴 것은 대본에만 있다.
    if request.script:
        user_content = (
            f"[씬] {request.heading}\n\n[대본]\n{request.script}\n\n[컷]\n{body}"
        )

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=3000,
    )
    result = SeamDesignResponse(**json.loads(response.choices[0].message.content.strip()))

    # 기본값만 담긴 이음새는 표시할 것이 없다. 모델이 그래도 답했으면 버린다 —
    # 화면에서 '정한 것'과 '기본값'이 구분되어야 한다.
    result.seams = [
        seam for seam in result.seams
        if 0 <= seam.after_cut < len(request.cuts) - 1
        and (seam.join != "cut" or seam.elapsed != "continuous" or seam.elision)
    ]
    return result
