"""편집: 진단을 받아 빠진 컷의 내용을 쓴다.

진단은 "Beat 3이 컷 없이 넘어갔습니다"까지만 말한다. 그 자리에 무엇을
담은 컷이 들어가야 하는지는 앞뒤 컷이 무엇을 보여줬고 대본이 무엇을
요구하는지 봐야 정해지고, 그것은 편집의 판단이다.

빈 컷을 넣어 두고 감독이 직접 채우게 할 수도 있다. 그러나 그러면 진단이
"여기 빠졌다"까지만 하고 멈추는 것과 같다 — 무엇이 빠졌는지 말할 수 있어야
감독이 받아들일지 판정할 수 있다 (DG1 P2).

샷 크기는 정하지 않는다. 그것은 촬영의 몫이고, 새 컷도 다른 컷과 같이
'샷 다시 정하기'를 거친다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import CutInsertRequest, CutInsertResponse


RESPONSE_SCHEMA = {
    "name": "cut_insert",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["content", "purpose", "characters", "reason"],
        "properties": {
            # 이 컷에서 무엇이 일어나는가. 컷 표의 '내용' 칸에 그대로 들어간다.
            "content": {"type": "string"},
            # 이 컷이 맡은 역할. 표의 '중요한 것' 칸.
            "purpose": {"type": "string"},
            # 화면에 있는 인물. 없으면 빈 문자열.
            "characters": {"type": "string"},
            # 왜 이 컷이 필요한지 한 줄. 감독이 판정할 근거다.
            "reason": {"type": "string"},
        },
    },
}


PROMPT = """당신은 편집자입니다. 컷이 빠진 자리에 들어갈 컷 하나를 쓰세요.

진단은 어디가 비었는지까지만 말합니다. 그 자리에 무엇이 들어가야 하는지는
앞뒤 컷과 대본을 보고 당신이 정합니다.

**대본에 있는 것만 쓰세요.** 없는 행동이나 인물을 지어내지 마세요. 빠진 것은
대본에 적혀 있는데 컷으로 옮겨지지 않은 부분입니다.

- content: 이 컷에서 무엇이 일어나는가. 대본의 서술을 한 컷 분량으로 옮깁니다.
  화면에 보이는 행동으로 씁니다. 마음속 생각이나 들리지 않는 소리는 쓰지 마세요.
- purpose: 이 컷이 맡은 역할을 짧게. 앞 컷에서 뒤 컷으로 넘어가는 데 이 컷이
  무엇을 하는지입니다. 예: "공간 설정", "행동 강조", "반응", "관계"
- characters: 화면에 실제로 보이는 인물 이름만 쉼표로. 아무도 없으면 빈 문자열.
- reason: 왜 이 컷이 있어야 하는지 한 문장. 감독이 이 제안을 받아들일지
  판정할 근거입니다. "빠졌으니까"가 아니라 이 컷이 없으면 무엇이 안 읽히는지
  말하세요.

**샷 크기는 정하지 마세요.** 촬영이 나중에 정합니다.

content와 purpose는 앞뒤 컷과 같은 말투로, 한국어 서술문으로 씁니다.
길게 쓰지 마세요 — 컷 하나가 담는 것은 한 동작입니다.
"""


async def insert_cut(request: CutInsertRequest) -> CutInsertResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    lines = [
        f"[씬] {request.heading}",
        "",
        "[대본]",
        request.script or "(없음)",
        "",
        "[지금 컷들]",
    ]
    for index, cut in enumerate(request.cuts):
        mark = "  ← 이 뒤가 비었습니다" if index == request.after_index else ""
        place = f"컷 {cut.beat + 1}-{cut.beat_order}"
        lines.append(f"{place}: {cut.content or '(비어 있음)'}{mark}")

    lines += [
        "",
        "[진단]",
        request.finding_title,
        request.finding_detail or "",
    ]
    if request.scene_intention:
        lines += ["", "[감독의 의도]", request.scene_intention]

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model=os.getenv("CUT_INSERT_MODEL", "gpt-5.4-nano"),
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(lines)},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
    )
    data = json.loads(response.choices[0].message.content)
    return CutInsertResponse(
        content=data["content"],
        purpose=data["purpose"],
        characters=data["characters"],
        reason=data["reason"],
    )
