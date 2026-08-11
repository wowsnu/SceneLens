"""촬영: 진단을 받아 샷을 고친다.

진단은 무엇이 잘못됐는지까지만 말한다 — "이 두 컷이 크기도 앵글도 같아
점프컷이 난다". 어느 크기로 바꿔야 하는지는 그 컷이 무엇을 보여주려는지
봐야 정할 수 있고, 그것은 촬영의 판단이다.

"한 칸 더 벌린다" 같은 규칙을 코드에 두지 않는 이유가 그것이다. 크기를
벌리는 방향은 진단에서 나오지만 얼마나·어디로는 내용에서 나온다.

컷 플랜에서 고칠 수 있는 것은 **샷 크기뿐이다.** 표에 앵글 칸이 없다.
진단은 앵글을 근거로 삼지만 처방은 크기로만 낸다.

원칙은 shot_principles.py를 공유한다 — 처음 샷을 정할 때와 고칠 때가
다른 기준을 쓰면 고친 결과가 원래 설계와 어긋난다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import ShotFixRequest, ShotFixResponse
from app.services.shot_principles import PRINCIPLES, SHOT_SIZES


RESPONSE_SCHEMA = {
    "name": "shot_fix",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["edits", "summary"],
        "properties": {
            "edits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["cut_index", "shot_size", "reason"],
                    "properties": {
                        # 요청에 준 컷의 순번. 씬 전체 기준이다.
                        "cut_index": {"type": "integer"},
                        "shot_size": {"type": "string", "enum": SHOT_SIZES},
                        "reason": {"type": "string"},
                    },
                },
            },
            # 이 처방이 무엇을 하는지 한 줄. 버튼에 붙는다.
            "summary": {"type": "string"},
        },
    },
}


PROMPT = f"""당신은 촬영감독입니다. 편집이 낸 진단을 받아 샷 크기를 고치세요.

진단은 무엇이 잘못됐는지까지만 말합니다. 어느 크기로 바꿔야 하는지는
그 컷이 무엇을 보여주려는지 보고 당신이 정합니다.

**고칠 수 있는 것은 샷 크기뿐입니다.** 앵글과 카메라 움직임은 이 단계에서
건드리지 않습니다. 크기만으로 진단을 해소하세요.

- shot_size: {" / ".join(SHOT_SIZES)}

**진단에 걸린 컷(`← 진단에 걸린 컷` 표시)만 고치세요.** 나머지 컷은 앞뒤
맥락을 판단하라고 준 것이지 고치라고 준 것이 아닙니다. 걸린 컷 중에서도
한둘만 바꾸면 풀리는 경우가 대부분입니다.

걸리지 않은 컷을 고치는 경우는 하나뿐입니다 — 걸린 컷을 고치면 **다른 컷이
진단에 걸리게 될 때**입니다. 예를 들어 걸린 컷을 좁혔더니 그것이 씬에서
가장 가까운 샷이 되어 원래 가장 중요했던 컷을 덮어버리는 경우입니다.
그때는 reason에 **왜 그 컷까지 건드려야 하는지** 밝히세요.
그런 경우가 아니면 걸린 컷 밖으로 나가지 마세요.

씬 전체를 다시 짜지 마세요 — 이미 세워진 크기 흐름이 있고, 여러 컷을
한꺼번에 바꾸면 그 흐름이 통째로 흔들립니다.

진단별로 무엇을 하는가:

- **점프컷 위험** — 앞뒤 컷의 크기가 거의 같습니다. **뒤 컷 하나만** 바꿔
  차이를 냅니다. 그 컷이 무엇을 보여주려는지 보고 크기를 정하세요.
  반응이나 표정이 핵심이면 좁히고, 인물과 공간의 관계가 핵심이면 넓힙니다.
  크기 차이는 한눈에 읽힐 만큼 나야 합니다 — 한 칸 차이는 다시 점프컷입니다.

- **크기 N컷 연속** — 같은 크기가 이어져 컷이 넘어간 것이 안 읽힙니다.
  **가운데쯤 한 컷만** 바꿔 연속을 끊습니다. 그 자리에서 내용이 바뀌는
  컷이 있으면 그 컷을 고르세요.

- **작은 것을 보여주는데 화면이 넓다 / 공간을 보여주는데 화면이 좁다** —
  걸린 컷의 내용과 크기가 어긋납니다. **그 컷 하나만** 맞는 크기로
  바꾸세요. 무엇을 보여주려는 컷인지가 기준입니다.
  이 진단은 한 컷 안의 문제입니다. 다른 컷은 건드리지 마세요.

- **공간을 세우는 컷 없음** — 씬 전체가 좁습니다. 공간을 세우기 좋은
  컷 하나를 골라 Wide나 Full로 바꾸세요. 보통 씬의 첫 컷이지만, 인물과
  공간이 함께 담기는 컷이 따로 있으면 그것을 고르세요.

- **공간을 보여줄 컷인데 좁게 잡혔다** — 걸린 컷을 Wide나 Full로 넓힙니다.

- **좁혀 가다가 다시 넓어진다** — 가장 중요한 컷으로 좁혀 가는 구간에서
  중간이 넓어졌습니다. 걸린 컷을 앞뒤와 이어지게, 좁아지는 방향으로
  맞추세요. 다만 일부러 넓힌 것으로 보이면 고치지 말고 빈 배열을 내세요.

- **가장 중요한 컷보다 가까운 컷이 있다** — 가장 중요한 컷은 그대로 두고,
  **그보다 가까운 다른 컷들을** 한 단계씩 물리세요. 가장 중요한 컷을 더
  좁히는 방향은 쓰지 마세요 — 이미 가장 가까운 샷입니다.

지켜야 할 것:
- **씬에서 가장 가까운 샷은 가장 중요한 컷의 것입니다.** 고치다가 다른
  컷이 그보다 가까워지면 안 됩니다. 그 컷이 도드라지지 않게 됩니다.
- 공간을 세우는 컷(씬 첫 컷, 인물 위치가 크게 바뀌는 컷)은 Wide나 Full로
  두세요. 좁히면 관객이 어디인지 모르게 됩니다.
- dominant가 손이나 표정처럼 작은 것이면 Wide로는 보이지 않습니다.
  크기를 넓힐 때는 그 컷이 무엇을 보여주려 했는지 함께 보세요.

{PRINCIPLES}

reason은 왜 이 크기인지 한 문장으로, 한국어로 씁니다. **그 컷이 무엇을
보여주려는지를 근거로** 쓰세요 — "차이를 내려고"가 아니라 "여기서 A의
망설임이 읽혀야 하므로"처럼 씁니다.

summary는 이 처방이 무엇을 하는지 한 줄로, 한국어로 씁니다.
버튼에 붙는 짧은 말입니다. 예: "컷 3을 Close-Up으로 좁힘"

고칠 것이 없으면 edits를 빈 배열로 두세요."""


async def fix_shots(request: ShotFixRequest) -> ShotFixResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.cuts:
        raise ValueError("cuts is empty")

    # 씬의 컷을 모두 준다. 한 컷만 보고 고치면 앞뒤와 다시 어긋난다.
    body = "\n".join(
        f"[{i}]{' ← 진단에 걸린 컷' if i in request.target_indexes else ''} "
        f"Beat {cut.beat} · {cut.purpose or '—'} · {cut.shot_size or '미정'} · "
        f"{cut.characters or '인물 없음'} · {cut.content}"
        + (f" · dominant: {cut.dominant}" if cut.dominant else "")
        for i, cut in enumerate(request.cuts)
    )
    user_content = (
        f"[씬] {request.heading}\n\n"
        f"[진단] {request.finding_title}\n{request.finding_detail}\n\n"
        f"[컷]\n{body}"
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
        max_completion_tokens=2000,
    )
    result = ShotFixResponse(**json.loads(response.choices[0].message.content.strip()))

    # 범위 밖 컷과 바뀐 것이 없는 편집은 버린다. 화면에서 '고친 것'만
    # 보여야 사용자가 무엇이 달라지는지 판정할 수 있다.
    result.edits = [
        edit for edit in result.edits
        if 0 <= edit.cut_index < len(request.cuts)
        and edit.shot_size != request.cuts[edit.cut_index].shot_size
    ]
    return result
