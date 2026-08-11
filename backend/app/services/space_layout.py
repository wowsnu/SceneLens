"""미장센: 대본에서 공간의 배치를 세운다.

방의 구조는 씬 내내 같아야 한다. 컷 1에서 왼쪽에 있던 콘솔이 컷 12에서
오른쪽으로 가면 관객은 다른 방으로 읽는다. 글로 "모니터 벽, 콘솔"이라고만
두면 컷마다 배치가 다시 정해진다.

여기서 하는 일은 그림을 그리는 것이 아니라 **좌표를 정하는 것**이다.
그리는 것은 SpatialMap이 한다 — 모델은 무엇이 어디에 있는지만 답한다.

인물은 **시작 위치만** 둔다. 컷마다의 위치는 감독이 끌어서 정한다 —
컷 20개 × 인물 3명이면 좌표가 60개고, 그것을 모델이 정확히 답할 수도
사용자가 검증할 수도 없다. 대본이 말해 주는 것은 시작 위치뿐이다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SpaceLayoutRequest, SpaceLayoutResponse


# SpatialMap의 좌표계. 화면이 쓰는 값과 같아야 그대로 얹을 수 있다.
CANVAS = 1000

RESPONSE_SCHEMA = {
    "name": "space_layout",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["elements", "people", "note"],
        "properties": {
            "elements": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["label", "x", "y", "w", "h"],
                    "properties": {
                        # 무엇인가. 도면에 그대로 적히고 그림 생성에도 쓰인다.
                        "label": {"type": "string"},
                        # 왼쪽 위 모서리. 0~1000.
                        "x": {"type": "integer"},
                        "y": {"type": "integer"},
                        "w": {"type": "integer"},
                        "h": {"type": "integer"},
                    },
                },
            },
            # 인물의 시작 위치. 컷마다의 위치는 사용자가 끌어서 정한다.
            "people": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "x", "y"],
                    "properties": {
                        "name": {"type": "string"},
                        "x": {"type": "integer"},
                        "y": {"type": "integer"},
                    },
                },
            },
            # 왜 이렇게 놓았는지 한 줄. 사용자가 판정하려면 근거가 있어야 한다.
            "note": {"type": "string"},
        },
    },
}


PROMPT = f"""당신은 미장센 담당입니다. 대본을 읽고 이 공간의 평면도를 세우세요.

**위에서 내려다본 배치**를 좌표로 답합니다. 그림을 그리는 것이 아니라
무엇이 어디에 있는지 숫자로 정하는 일입니다.

좌표계:
- 화면은 {CANVAS} × {CANVAS}입니다. x는 왼쪽에서 오른쪽, y는 **안쪽에서 앞쪽**입니다.
- y가 작으면 방의 안쪽(먼 벽), 크면 앞쪽(카메라 쪽)입니다.
- x, y는 그 물건의 **왼쪽 위 모서리**, w와 h는 크기입니다.

무엇을 놓는가 — **씬 내내 움직이지 않는 것만**:
- 벽에 붙은 것 (모니터 벽, 창문, 선반)
- 가구 (콘솔, 책상, 의자, 캐비닛)
- 출입구 (문, 계단)

**사람은 elements에 넣지 마세요.** 인물은 people에 따로 답합니다.

크기의 감:
- 벽면을 채우는 것(모니터 벽, 선반)은 길고 얇게. 예: w=700, h=50
- 책상·콘솔은 w=300~500, h=100~150
- 캐비닛·문은 작게. 예: w=80, h=180
- 벽에 붙는 것은 가장자리에 둡니다. 방 한가운데 띄우지 마세요.
- **문은 반드시 벽에 있습니다.** 방 가운데 두면 안 됩니다 — 네 가장자리
  중 하나에 붙이세요. 앞쪽 벽이면 y가 800 이상, 왼쪽 벽이면 x가 0에 가깝게.
- label은 **8자 이내**로 짧게. 도면 상자 안에 들어가야 읽힙니다.
  ✓ "철제 캐비닛"  ✗ "잠긴 철제 캐비닛"

**대본에 나온 것만 놓으세요.** "모니터 벽"과 "콘솔"만 나왔으면 둘만 놓습니다.
있을 법한 가구를 채워 넣지 마세요 — 그리면 그림에 그대로 나옵니다.

**같은 것을 두 번 놓지 마세요.** 이름이 겹치면("책장"이 둘) 도면에서 어느
쪽인지 알 수 없습니다. 같은 종류가 정말 여럿이면 이름으로 구분하세요
("왼쪽 책장", "오른쪽 책장"). "문"과 "문(유리)"처럼 같은 것을 달리 부르며
겹쳐 놓지도 마세요 — 하나만 놓습니다.

**대본이 위치를 말했으면 따르세요.**
  "관제실 반대편 끝에 B가 콘솔 앞에 앉아 있다"
  → 콘솔은 A가 들어온 문에서 먼 쪽입니다.
  "벽면 가득한 모니터" → 벽 하나를 채웁니다.

대본이 위치를 안 말한 것은 그 공간에서 자연스러운 자리에 두세요.

3~6개면 충분합니다. label은 한국어로 8자 이내입니다 ("모니터 벽", "콘솔").

**people — 인물의 시작 위치.**
씬이 시작할 때 각 인물이 서 있는 자리를 x, y 한 점으로 답합니다.
크기는 없습니다. 대본에 이름이 나온 사람만 넣으세요.

  "B가 콘솔 앞에 앉아 있다"    → 콘솔 바로 앞의 한 점
  "A가 들어와 철문을 닫는다"   → 철문 옆의 한 점

**사물 위에 겹치지 마세요.** 사람은 가구 안이 아니라 그 **앞이나 옆**에
섭니다. 콘솔이 x=520~900, y=780~910이면 그 앞은 y가 910보다 큰 자리입니다.
가구와 60 이상 떨어뜨리세요.

**씬이 시작하는 순간만** 봅니다. 그 뒤에 어디로 움직이는지는 감독이
컷마다 끌어서 정하므로 여기서 정하지 않습니다.

**대본에 이름이 나온 사람은 모두 넣으세요.** 들어오는 인물도 포함합니다 —
"A가 들어와 철문을 닫는다"면 A의 시작 위치는 철문 옆입니다.
자리를 아예 짐작할 수 없는 인물만 뺍니다.

note는 왜 이렇게 놓았는지 한 문장으로 씁니다."""


def _push_clear(person, elements, gap: int = 24) -> None:
    """사물 위에 놓인 인물을 밖으로 밀어낸다.

    도면에서 마커는 점이라 좌표가 상자 안이면 그 위에 겹쳐 그려진다.
    사람은 가구 안이 아니라 앞이나 옆에 서므로, 가장 가까운 모서리 밖으로
    빼낸다. 프롬프트로도 막지만 지켜지지 않을 때가 있다.
    """
    def hit(x, y):
        for element in elements:
            if (element.x <= x <= element.x + element.w
                    and element.y <= y <= element.y + element.h):
                return element
        return None

    # 하나를 피하면 다른 것에 걸릴 수 있다 — 계단에서 밀려나 탁자 위에 앉는다.
    # 겹치지 않을 때까지 되풀이하되, 서로 밀어내며 도는 것을 막으려 횟수를 둔다.
    for _ in range(len(elements) + 2):
        element = hit(person.x, person.y)
        if element is None:
            return
        left, right = element.x, element.x + element.w
        top, bottom = element.y, element.y + element.h
        # 가까운 모서리부터 시도한다. 캔버스 밖이거나 다른 사물 위인 곳은
        # 건너뛴다 — 그 자리로 가면 겹침이 그대로 남는다.
        moves = sorted((
            (person.x - left, "x", left - gap),
            (right - person.x, "x", right + gap),
            (person.y - top, "y", top - gap),
            (bottom - person.y, "y", bottom + gap),
        ))
        for _distance, axis, value in moves:
            if not 0 <= value <= CANVAS:
                continue
            x = value if axis == "x" else person.x
            y = value if axis == "y" else person.y
            if hit(x, y) is None:
                person.x, person.y = x, y
                return
        # 어느 모서리로도 빠져나갈 수 없으면 가장 가까운 쪽으로라도 옮긴다.
        for _distance, axis, value in moves:
            if 0 <= value <= CANVAS:
                setattr(person, axis, value)
                break
        else:
            return


async def build_space_layout(request: SpaceLayoutRequest) -> SpaceLayoutResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.script.strip():
        raise ValueError("script is empty")

    user_content = f"[씬] {request.heading}\n\n[대본]\n{request.script}"
    if request.location_facts:
        # 미장센이 이미 세운 공간 기준. 도면이 그것과 어긋나면 안 된다.
        user_content += f"\n\n[공간 기준] {request.location_facts}"

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
    result = SpaceLayoutResponse(**json.loads(response.choices[0].message.content.strip()))

    # 화면 밖으로 나간 것은 도면에서 보이지 않는다. 좌표를 캔버스 안에 가둔다.
    kept = []
    for element in result.elements:
        if not element.label.strip():
            continue
        # 이름이 길면 도면 상자를 넘쳐 옆 상자를 덮는다. 프롬프트로 8자를
        # 일러도 가끔 넘는다.
        element.label = element.label.strip()
        if len(element.label) > 9:
            # 수식어를 떼면 대개 물건 이름이 남는다 ("창가 플라스틱 의자" → "의자").
            element.label = element.label.split()[-1][:9]
        element.w = max(20, min(element.w, CANVAS))
        element.h = max(20, min(element.h, CANVAS))
        element.x = max(0, min(element.x, CANVAS - element.w))
        element.y = max(0, min(element.y, CANVAS - element.h))
        kept.append(element)
    # 같은 이름이거나 거의 같은 자리에 놓인 것은 하나만 남긴다 —
    # 도면에서 겹쳐 그려지면 어느 쪽을 말하는지 알 수 없다.
    unique = []
    for element in kept:
        clash = any(
            element.label == other.label
            or (abs(element.x - other.x) < 60 and abs(element.y - other.y) < 60)
            for other in unique
        )
        if not clash:
            unique.append(element)
    result.elements = unique

    # 인물도 화면 밖으로 나가면 도면에서 보이지 않는다.
    for person in result.people:
        person.x = max(0, min(person.x, CANVAS))
        person.y = max(0, min(person.y, CANVAS))
        _push_clear(person, result.elements)
    result.people = [person for person in result.people if person.name.strip()]
    return result
