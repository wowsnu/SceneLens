"""촬영: 컷마다 어떻게 찍을지 정한다.

줄콘티가 컷을 나누고 무엇을 담을지 정했다. 여기서는 그것을 화면으로
어떻게 옮길지 — 샷 크기, 앵글, 카메라 움직임을 정한다.
감독이 컷을 나누고 촬영감독과 샷을 정하는 순서를 따른다.

컷 하나만 보고 정할 수 없다. 같은 크기가 이어지면 컷이 바뀐 것이 읽히지
않고, 공간을 세우는 컷이 없으면 관객은 어디인지 모른다. 그래서 씬의
컷 전체를 함께 본다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import ShotDesignRequest, ShotDesignResponse


SHOT_SIZES = ["Wide", "Full", "Medium", "Bust", "Close-Up", "ECU"]
ANGLES = ["Eye level", "High angle", "Low angle", "Over the shoulder", "POV", "Bird eye"]
MOVES = [
    "Fixed", "Pan left", "Pan right", "Tilt up", "Tilt down",
    "Dolly in", "Dolly out", "Handheld",
]

RESPONSE_SCHEMA = {
    "name": "shot_design",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["shots"],
        "properties": {
            "shots": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["cut_index", "shot_size", "angle", "camera_move", "reason"],
                    "properties": {
                        # 요청에 준 컷의 순번 (0부터).
                        "cut_index": {"type": "integer"},
                        "shot_size": {"type": "string", "enum": SHOT_SIZES},
                        "angle": {"type": "string", "enum": ANGLES},
                        "camera_move": {"type": "string", "enum": MOVES},
                        # 왜 이 샷인가. 한 문장.
                        "reason": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = f"""당신은 촬영감독입니다. 줄콘티가 나눈 컷을 어떻게 찍을지 정하세요.

컷마다 세 가지를 정합니다:
- shot_size: {" / ".join(SHOT_SIZES)}
- angle: {" / ".join(ANGLES)}
- camera_move: {" / ".join(MOVES)}

정하는 기준:

**샷 크기는 무엇을 보여줘야 하는가로 정합니다.**
- 공간과 인물의 위치 관계가 필요하면 Wide / Full
- 인물의 행동과 자세가 필요하면 Medium / Bust
- 표정이나 손에 든 것이 결정적이면 Close-Up / ECU
- purpose가 "공간 설정"이면 대개 Wide, "반응"이면 Bust 이하입니다.

**앞뒤 컷을 함께 보고 정합니다.** 컷 하나만 보면 안 됩니다.
- 같은 크기가 셋 이상 이어지지 않게 하세요. 컷이 바뀐 것이 화면에서
  읽히지 않습니다.
- 인접한 두 컷이 한 단계 차이(Medium→Bust)면서 앵글도 같으면 점프컷이
  됩니다. 두 단계 이상 벌리거나 앵글을 바꾸세요.
- 씬에 공간을 세우는 컷(Wide 또는 Full)이 최소 하나는 있어야 합니다.

**앵글은 관계를 만듭니다.**
- Eye level이 기본입니다. 이유 없이 바꾸지 마세요.
- 한쪽이 우위에 있으면 High/Low angle로 그 관계를 보입니다.
- 두 인물이 마주 볼 때 Over the shoulder를 씁니다.
- 인물이 무엇을 보는지가 핵심이면 POV를 씁니다.

**카메라 움직임은 아껴 씁니다.**
- Fixed가 기본입니다. 스토리보드는 정지 이미지라 움직임은 화살표로만
  표현되고, 남발하면 그 표시가 의미를 잃습니다.
- 공간을 훑거나 인물을 따라갈 때만 씁니다.
- Pan/Tilt는 방향까지 정하세요 (Pan left / Tilt up).

reason은 왜 이 샷인지 한 문장으로, 한국어로 쓰세요.
모든 컷에 답하세요 — cut_index를 빠뜨리지 마세요."""


async def design_shots(request: ShotDesignRequest) -> ShotDesignResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.cuts:
        raise ValueError("cuts is empty")

    # 씬의 컷을 순서대로 모두 준다. 커버리지는 이어 봐야 판단할 수 있다.
    body = "\n".join(
        f"[{i}] Beat {cut.beat} · {cut.purpose or '—'} · "
        f"{cut.characters or '인물 없음'} · {cut.content}"
        for i, cut in enumerate(request.cuts)
    )
    user_content = f"[씬] {request.heading}\n\n[컷]\n{body}"
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
    return ShotDesignResponse(**json.loads(response.choices[0].message.content.strip()))
