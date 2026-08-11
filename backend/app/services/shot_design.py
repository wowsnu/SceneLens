"""촬영: 컷마다 어떻게 찍을지 정한다.

줄콘티가 컷을 나누고 무엇을 담을지 정했다. 여기서는 그것을 화면으로
어떻게 옮길지 — 샷 크기, 앵글, 카메라 움직임을 정한다.
감독이 컷을 나누고 촬영감독과 샷을 정하는 순서를 따른다.

컷 하나만 보고 정할 수 없다. 같은 크기가 이어지면 컷이 바뀐 것이 읽히지
않고, 공간을 세우는 컷이 없으면 관객은 어디인지 모른다. 그래서 씬의
컷 전체를 함께 본다.

프롬프트의 원칙은 지어낸 것이 아니라 촬영 이론서에서 뽑았다 —
The Filmmaker's Eye, Grammar of the Film Language, The Five C's of
Cinematography (backend/app/db/theory_texts.json). 스토리보드에 해당하지
않는 실사 촬영·편집 기법(오버래핑 액션, 컷 온 액션 등)은 제외했다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import ShotDesignRequest, ShotDesignResponse


# 원칙과 어휘는 촬영이 하는 일 전체가 공유한다. 진단을 받아 고칠 때도
# 같은 근거를 써야 원래 설계와 어긋나지 않는다.
from app.services.shot_principles import ANGLES, MOVES, PRINCIPLES, SHOT_SIZES

RESPONSE_SCHEMA = {
    "name": "shot_design",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["coverage", "shots"],
        "properties": {
            # 개별 샷보다 먼저 씬 전체의 카메라 흐름을 세운다.
            # 컷마다 최선을 고르면 각각은 그럴듯해도 이어지지 않는다.
            "coverage": {
                "type": "object",
                "additionalProperties": False,
                "required": ["arc", "anchor_cuts", "peak_cut", "approach"],
                "properties": {
                    # 이 씬의 카메라가 어디서 시작해 어디로 가는가. 한두 문장.
                    "arc": {"type": "string"},
                    # 공간을 세우거나 다시 세우는 컷. 넓은 샷이 놓이는 자리.
                    "anchor_cuts": {"type": "array", "items": {"type": "integer"}},
                    # 가장 가까운 샷이 놓일 컷. 접근의 끝.
                    "peak_cut": {"type": "integer"},
                    # peak로 가는 접근 구간. 순서대로 좁아지는 컷들.
                    "approach": {"type": "array", "items": {"type": "integer"}},
                },
            },
            "shots": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["cut_index", "shot_size", "angle", "camera_move", "dominant", "reason"],
                    "properties": {
                        # 요청에 준 컷의 순번 (0부터).
                        "cut_index": {"type": "integer"},
                        "shot_size": {"type": "string", "enum": SHOT_SIZES},
                        "angle": {"type": "string", "enum": ANGLES},
                        "camera_move": {"type": "string", "enum": MOVES},
                        # 화면에서 관객의 시선이 먼저 가야 할 것. 짧은 명사구.
                        "dominant": {"type": "string"},
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

## 순서가 중요합니다

**컷마다 따로 정하지 마세요.** 컷 하나씩 최선을 고르면 각각은 그럴듯해도
이어 보면 카메라가 튀거나 밋밋해집니다. 씬 전체의 흐름을 먼저 세우고,
그 흐름 위에 컷을 배분하세요.

**1단계 — coverage에 씬의 카메라 흐름을 세웁니다.**

- arc: 이 씬의 카메라가 어디서 시작해 어디로 가는가. **한두 문장으로.**
  넓게 열어 좁혀 들어가는가, 붙어 있다가 물러나는가, 중간에 뒤집히는가.
- peak_cut: 가장 가까운 샷이 놓일 컷 **하나**. 씬이 결정되는 순간입니다.
  정보가 노출되는 컷이 아니라 **인물이 무언가를 하기로 하는 컷**인 경우가
  많습니다.
- approach: peak_cut 바로 앞의 **연속된 3~5개 컷**. peak를 향해 좁혀 들어가는
  구간입니다. 띄엄띄엄 고르지 마세요 — 이어져 있어야 접근이 됩니다.
  예: peak가 17이면 approach는 [13,14,15,16] 같은 식입니다.
- anchor_cuts: 공간을 세우는 컷. **1~2개면 충분합니다.** 씬 시작과, 인물
  위치가 크게 바뀌어 관객이 다시 방향을 잡아야 할 때뿐입니다.
  많이 고르면 씬이 계속 넓어져 긴장이 쌓이지 않습니다.

**2단계 — 그 흐름대로 각 컷의 샷을 정합니다.**

각 컷에 dominant도 정하세요. **화면에서 관객의 시선이 먼저 가야 할 것**입니다.
프레이밍의 지배 요소(dominant)가 곧 이 컷이 전달하려는 것이어야 합니다.
- 짧은 명사구로 씁니다. "B의 숨긴 오른손", "A가 쥔 출입카드",
  "모니터 속 노란 우비 아이"
- 인물 전체가 아니라 **화면 안의 무엇**인지 짚으세요. "A" 대신
  "A의 굳은 표정"처럼.
- 샷 크기와 맞아야 합니다. dominant가 손이면 Wide로는 보이지 않습니다.

**세운 흐름을 반드시 지키세요.** 설계해 놓고 다르게 정하면 세운 의미가
없습니다. 샷을 다 정한 뒤 아래를 확인하고, 어긋나면 고치세요.

- approach의 컷들은 **순서대로 좁아지거나 최소한 유지**되어야 합니다.
  Wide→Medium→Bust→Close-Up처럼. 중간에 넓어지면 접근이 끊깁니다.
- anchor_cuts는 **Wide 또는 Full**입니다. 다른 크기를 쓰면 공간이 안 세워집니다.
- peak_cut이 씬에서 **가장 가까운 샷**입니다. 다른 컷이 더 가까우면 안 됩니다.
- approach와 peak 밖에서는 Close-Up·ECU를 쓰지 마세요. 접근의 끝에 와야
  할 샷을 미리 쓰면 정작 가장 중요한 순간에 쓸 것이 없습니다.
- 나머지 컷은 앞뒤와 이어지게 정합니다. 앞 컷과 크기·앵글이 모두 같으면
  화면이 바뀐 것이 읽히지 않습니다.

{PRINCIPLES}

이 원칙들이 답하지 않는 것은 씬의 흐름을 보고 판단하세요. 다만 숫자를
지어내지는 마세요 — "몇 컷 이상은 안 된다" 같은 규칙은 위에 없으면
없는 것입니다.

**가장 가까운 샷은 접근의 끝에 옵니다.** 위 Grammar of the Film Language의
원칙대로, 피크를 향해 medium → close → close-up으로 좁혀 들어가고 피크가
지나면 물러납니다. 그러므로 ECU가 씬 여기저기에 흩어져 있으면 그 접근이
성립하지 않습니다 — 가장 가까운 샷이 어디에 놓여야 그 접근의 끝이 되는지
먼저 정하세요.

**스토리보드에만 해당하는 제약:**
- 카메라 움직임은 정지 이미지로 표현할 수 없어 화살표로만 남습니다.
  꼭 필요할 때만 쓰세요. Fixed가 기본입니다.
- Pan/Tilt를 쓸 때는 방향까지 정하세요 (Pan left / Tilt up).
  방향 없는 움직임은 화살표로 그릴 수 없습니다.

reason은 왜 이 샷인지 한 문장으로, 한국어로 쓰세요.
**씬의 흐름에서 이 컷이 어디에 있는지를 근거로 쓰세요** — "표정이 중요해서"
같은 일반론이 아니라 "여기서 주도권이 넘어가므로" 처럼 씁니다.

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
    # 컷 목록만으로는 씬이 무엇에 관한 이야기인지 알 수 없다. 대본을 함께
    # 준다 — 흐름을 모르면 어느 컷이 가장 중요한지 판단할 수 없다.
    if request.script:
        user_content = (
            f"[씬] {request.heading}\n\n[대본]\n{request.script}\n\n[컷]\n{body}"
        )
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
    result = ShotDesignResponse(**json.loads(response.choices[0].message.content.strip()))

    # 설계와 어긋나도 값을 고치지 않는다. 모델이 "여기서 잠깐 물러났다
    # 붙자"고 판단했을 수 있고, 그것을 코드가 덮어쓰면 AI의 선택이 아니라
    # 우리가 정한 것이 된다. 어긋남은 촬영 진단이 짚고, 고칠지는 창작자가
    # 정한다 (design_goal.md: 발견과 처분의 분리).
    #
    # 다만 없는 컷을 가리키는 설계는 실행도 검증도 할 수 없으므로 걸러 낸다.
    if result.coverage:
        valid = {shot.cut_index for shot in result.shots}
        result.coverage.anchor_cuts = [i for i in result.coverage.anchor_cuts if i in valid]
        result.coverage.approach = [i for i in result.coverage.approach if i in valid]
        if result.coverage.peak_cut not in valid:
            result.coverage.peak_cut = -1

    return result
