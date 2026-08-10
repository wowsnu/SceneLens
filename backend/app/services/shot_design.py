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

**세운 흐름을 반드시 지키세요.** 설계해 놓고 다르게 정하면 세운 의미가
없습니다. 샷을 다 정한 뒤 아래를 확인하고, 어긋나면 고치세요.

- approach의 컷들은 **순서대로 좁아지거나 최소한 유지**되어야 합니다.
  Wide→Medium→Bust→Close-Up처럼. 중간에 넓어지면 접근이 끊깁니다.
- anchor_cuts는 **Wide 또는 Full**입니다. 다른 크기를 쓰면 공간이 안 세워집니다.
- peak_cut이 씬에서 **가장 가까운 샷**입니다. 다른 컷이 더 가까우면 안 됩니다.
- approach와 peak 밖에서는 Close-Up·ECU를 쓰지 마세요. 접근의 끝에 와야
  할 샷을 미리 쓰면 정작 고비에서 쓸 것이 없습니다.
- 나머지 컷은 앞뒤와 이어지게 정합니다. 앞 컷과 크기·앵글이 모두 같으면
  화면이 바뀐 것이 읽히지 않습니다.

다음은 촬영 이론서에서 뽑은 원칙입니다. 이것을 근거로 정하세요.

[샷 크기]
- 롱 샷은 (피사체의) 전신과 환경의 큰 일부를 함께 담아, 장면 맥락상 ‘주변에 존재하는 것들의 수/상황’이 의미를 갖게 할 때 사용하라.
  (The Filmmaker's Eye)
- 프레임 안에 남길 시각 정보는 내러티브가 정말로 요구하는 것만 선택하고, 필요 없는 정보(예: 포스터·게임기·빈 맥주캔처럼 ‘의미가 분리되는’ 요소)는 관객이 핵심 디테일을 놓치게 만들 수 있으니 배제하라.
  (The Filmmaker's Eye)
- 프레이밍(frame)의 ‘우선 지배 요소(dominant)’가 관객의 시선이 읽어야 할 핵심이어야 하며, 그 핵심을 드러내기 위해 샷 크기(shot size)를 구성의 통제 장치로 사용하라.
  (The Filmmaker's Eye)
- 캐릭터를 작게 보이게 하는 배치/크기 대비는 주변 요소가 ‘코너링(cornering)’하는 듯한 시각적 인상을 만들 수 있으니, 그 정서(예: 좌절/당해버림/궁지)를 전하려면 프레임에서의 상대적 크기와 위치를 의도적으로 설계하라.
  (The Filmmaker's Eye)
- 인물의 ‘피크(peak) 순간’이 필요할 때는 대화의 후반부로 갈수록 medium shot→close shot→close up처럼 점점 가까운 샷 크기로 접근했다가, 피크가 끝나면 다시 medium shot으로 물러나 대화의 호흡을 회복하라.
  (Grammar of the Film Language)
- 긴 대화는 ‘number contrast’를 활용해 한 샷은 인물 수가 많은 구도(예: 2 players to 2), 다음 샷은 더 적은 구도(예: 2 players to 1), 또 다음은 더 줄여(예: 1 player to 1) 시각적으로 접근/후퇴(approaching and receding) 패턴을 숨기듯 설계하라.
  (Grammar of the Film Language)

[앵글]
- 하이 앵글(high angle)은 그 인물을 패배감·취약함·괴로움처럼 심리적으로 읽히게 만들 때 사용하되, 그런 의미가 내러티브 컨텍스트로 지지되는지 확인하라.
  (The Filmmaker's Eye)
- 같은 샷 타입이라도 장면의 정서적 결론(예: 패배/통제/주도권)이 뒤집히면 하이 앵글의 의미도 달라질 수 있으니, 각 앵글의 관습적 의미를 맹신하지 말고 이야기와 맞춰 설계하라.
  (The Filmmaker's Eye)
- 컷을 할 때는 화면에서 인물의 ‘Look(시선)’을 맞춰, 두 사람이 마주 보는(glances exchanged) 경우라면 양쪽 샷에서 시선 방향이 항상 반대(opposed)로 유지되게 하라.
  (Grammar of the Film Language)
- 대화 장면은 두 인물의 머리(head)가 만드는 ‘line of interest’가 프레임 전반에서 흐르도록, 삼각 원리(triangle principle)로 카메라를 배치해 두 인물이 화면에서 같은 섹터(예: A는 좌, B는 우)에 유지되게 하라.
  (Grammar of the Film Language)

[움직임]
- 연속성이 필요한 컷에서는 피사체의 이동 방향(direction of movement)이 연속된 두 샷에서 같은 종류이면서 같은 방향으로 이어지게 맞추고, 갑자기 반전되면 관객이 혼란스러워지므로 피사체 방향 반전 컷은 조심하라.
  (Grammar of the Film Language)

[연속성]
- 샷의 의미는 단일 프레임의 구성만이 아니라, 앞뒤 샷들이 만드는 ‘리컨텍스트화(recontextualization)’로 누적되므로 같은 구성을 반복해도 내러티브 위치에 따라 기능이 달라짐을 전제하라.
  (The Filmmaker's Eye)
- 관객은 샷 안에 포함된 모든 시각 요소가 스토리 이해에 필요하다고 가정하므로, 연결(연속성/맥락)이 약한 요소는 넣는 즉시 ‘핵심 메시지의 가시성’을 분산시킨다는 점을 일관되게 관리하라.
  (The Filmmaker's Eye)
- 장면 매칭(scene matching)을 할 때는 최소 3가지를 동시에 맞춰라: 위치(position), 이동/방향(movement), 그리고 인물의 룩(look).
  (Grammar of the Film Language)
- 평행 편집(parallel film editing)에서는 ‘action과 reaction’을 하나로 묶어 Shot1(액션)→Shot2(반응)→Shot1→Shot2처럼 교대로 구성해, 이해가 outcome 중심으로 더 명확해지게 하라.
  (Grammar of the Film Language)
- 연속성을 위해 각 샷은 시퀀스(sequence)의 일부로 보고, 샷에서 샷으로 넘어갈 때 관객이 카메라 위치 변경이나 인물 행동 변화 이유를 ‘갑자기’ 알아차리지 않게 매끄러운 흐름이 보이도록 계획한다.
  (The Five C's of Cinematography)
- 롱샷(long shot)은 지리/위치(geography) 파악을 위해 시퀀스 시작과 필요할 때마다(인물 위치가 바뀌거나 새 도구가 들어오거나 관객 재오리엔트가 필요할 때) 다시 재확립하도록 한다.
  (The Five C's of Cinematography)

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
    # 준다 — 흐름을 모르면 어느 컷이 고비인지 판단할 수 없다.
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
    return _enforce_coverage(result)


# 프롬프트만으로는 설계가 지켜지지 않는다. 모델이 세운 흐름과 실제 샷이
# 어긋나면 여기서 맞춘다 — 설계를 응답에 남기게 한 이유가 이것이다.
_SIZE_ORDER = {size: i for i, size in enumerate(SHOT_SIZES)}


def _enforce_coverage(result: ShotDesignResponse) -> ShotDesignResponse:
    coverage = result.coverage
    if not coverage:
        return result

    by_index = {shot.cut_index: shot for shot in result.shots}

    # 모델이 없는 컷 번호를 가리키면 그 설계는 실행할 수 없다. 조용히
    # 넘기면 설계와 결과가 어긋난 채로 남으므로 미리 걸러 낸다.
    coverage.anchor_cuts = [i for i in coverage.anchor_cuts if i in by_index]
    coverage.approach = [i for i in coverage.approach if i in by_index]
    if coverage.peak_cut not in by_index:
        # 고비가 없으면 가장 가까운 샷이 놓인 컷을 고비로 본다.
        coverage.peak_cut = max(
            by_index,
            key=lambda i: _SIZE_ORDER.get(by_index[i].shot_size, 0),
            default=-1,
        )

    # 1. 공간을 세우는 컷은 넓어야 한다. 그러라고 고른 컷이다.
    for index in coverage.anchor_cuts:
        shot = by_index.get(index)
        if shot and _SIZE_ORDER.get(shot.shot_size, 0) > _SIZE_ORDER["Full"]:
            shot.shot_size = "Full"

    # 2. 접근 구간은 좁아지기만 한다. 중간에 넓어지면 접근이 끊긴다.
    #    앞 컷보다 넓어진 것을 앞 컷 크기로 끌어당긴다.
    previous = None
    for index in coverage.approach:
        shot = by_index.get(index)
        if not shot:
            continue
        current = _SIZE_ORDER.get(shot.shot_size, 0)
        if previous is not None and current < previous:
            shot.shot_size = SHOT_SIZES[previous]
            current = previous
        previous = current

    # 3. 고비가 씬에서 가장 가까운 샷이어야 한다. 다른 컷이 더 가까우면
    #    그 컷을 한 단계 물린다 — 접근의 끝이 무의미해지기 때문이다.
    peak = by_index.get(coverage.peak_cut)
    if peak:
        peak_size = _SIZE_ORDER.get(peak.shot_size, 0)
        for index, shot in by_index.items():
            if index == coverage.peak_cut:
                continue
            if _SIZE_ORDER.get(shot.shot_size, 0) >= peak_size and peak_size > 0:
                shot.shot_size = SHOT_SIZES[peak_size - 1]

    return result
