"""미장센: 대본에서 씬의 기준을 세운다.

여러 컷에 같은 인물과 공간이 나온다. 컷마다 프롬프트를 따로 조립하면
컷 1의 '관제실'과 컷 5의 '관제실'이 각자 해석되어 다른 방이 된다.
그래서 씬 단위의 기준이 필요하고, 그것을 세우는 것이 미장센의 일이다.

대본에 없는 것은 채우지 않는다. 다만 **정해지지 않았다는 사실**은 남긴다 —
스토리보드가 무엇을 아직 안 정했는지 드러나야 창작자가 판정할 수 있다
(DG1 P2). open: true가 그 표시다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import SceneFact, SceneStateRequest, SceneStateResponse


# 항목 이름을 스키마로 닫는다. 프롬프트로 "이것만 쓰라"고 해도 모델이
# 새 항목을 만들어 냈다. 항목이 매번 달라지면 사용자가 그 항목에 걸어 둔
# 컷별 변화(changes는 label로 붙는다)가 사라진다.
CHARACTER_LABELS = ["성별·나이", "외형 기준", "체형", "기본 태도", "소지품"]
LOCATION_LABELS = ["장소 정체", "고정 소품"]
ENVIRONMENT_LABELS = ["시간", "조명 기준", "그림체"]


def _fact(labels):
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["label", "value", "open", "changes"],
        "properties": {
            "label": {"type": "string", "enum": labels},
            # 대본에서 읽히는 값. 정해지지 않았으면 빈 문자열.
            "value": {"type": "string"},
            # 대본이 정하지 않은 항목인가. 비워 둔 것과 누락은 다르다.
            "open": {"type": "boolean"},
            "changes": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["at_cut", "value"], "properties": {"at_cut": {"type": "integer", "minimum": 1}, "value": {"type": "string"}}}},
        },
    }

RESPONSE_SCHEMA = {
    "name": "scene_state",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["characters", "location", "environment"],
        "properties": {
            "characters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "summary", "facts"],
                    "properties": {
                        "name": {"type": "string"},
                        # 나이대·역할 등 한 줄. 대본에 없으면 빈 문자열.
                        "summary": {"type": "string"},
                        "facts": {"type": "array", "items": _fact(CHARACTER_LABELS)},
                    },
                },
            },
            "location": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "facts"],
                "properties": {
                    "name": {"type": "string"},
                    "facts": {"type": "array", "items": _fact(LOCATION_LABELS)},
                },
            },
            "environment": {
                "type": "object",
                "additionalProperties": False,
                "required": ["facts"],
                "properties": {
                    "facts": {"type": "array", "items": _fact(ENVIRONMENT_LABELS)},
                },
            },
        },
    },
}


PROMPT = """당신은 미장센 담당입니다. 대본을 읽고 이 씬의 기준을 세우세요.

기준이란 **여러 컷에 걸쳐 같아야 하는 것**입니다. 컷마다 따로 해석되면
같은 인물이 다른 사람으로, 같은 방이 다른 방으로 그려집니다.

**기준은 이야기가 아니라 생김새입니다.** 무슨 일이 일어나는지는 컷이
담습니다. 여기에는 **그림을 그릴 때 매번 똑같이 지켜야 할 것**만 씁니다.

**항목(label)은 아래에 정해진 것만 쓰세요. 새로 만들지 마세요.**
항목이 매번 달라지면 사용자가 걸어 둔 설정이 사라집니다.

**characters** — **주어진 대본에 실제로 나온 사람만.**
대본에 없는 이름을 만들어 넣지 마세요. 이 지시문의 예시에 나오는 이름도
넣지 마세요 — 답에 들어갈 인물은 오직 사용자가 준 대본에서 옵니다.

**사람이 아닌 것을 넣지 마세요.** 조명·기계·가구·소품은 인물이 아닙니다
("무영등", "모니터", "세탁기"). 그런 것은 location의 "고정 소품"으로 갑니다.
숨 쉬고 움직이는 사람만 characters에 넣습니다.

**대본에 나온 사람은 한 명도 빠뜨리지 마세요.** 이름 없이 "손님", "소년"처럼
불리는 사람도 인물입니다. 여기서 빠지면 그 사람이 나오는 컷은 기준 없이
그려져 매번 다른 얼굴이 됩니다. 뒤늦게 등장하는 인물도 넣으세요.
- name: 이름
- summary: **이 인물을 부르는 이름. 한 낱말에서 두 낱말. 10자 이내.**
  "이 사람은 누구인가"에 답하는 말이지, "지금 무엇을 하는가"가 아닙니다.
  **대본이 그 사람을 부르는 말을 그대로 쓰는 것이 가장 안전합니다.**
    대본에 "역무 총괄 B"  → "역무 총괄"
    대본에 "등대지기 노인" → "등대지기"
    대본에 "간호사"       → "간호사"
    대본에 "소년"         → "소년"
  대본이 이름만 말했으면(예: "수아") summary를 **빈 문자열로 두세요.**
  직업이나 역할을 지어내지 마세요.

  나이는 "성별·나이"가 맡으므로 여기 쓰지 않습니다.
  **동사를 쓰지 마세요.** -하는, -보는, -앉은 같은 말이 들어가면 틀린 것입니다.
  ✗ "메스 전달 인물"    ← 하는 일이다. "간호사"라고 쓰면 된다
  ✗ "계기판 확인 인물"  ← 하는 일이다. "마취과 의사"라고 쓰면 된다
  ✗ "바다 바라보는 노인" ← 행동이다. "등대지기"라고 쓰면 된다
  ✗ "혼자 앉아 관찰"    ← 행동이다
  ✗ "20대 후반, 침입자" ← 나이가 중복이다
  ✗ "비를 흠뻑 맞고 들어와 철문을 닫는다"  ← 행동이다. 이것은 컷이 담는다.
- facts: **아래 다섯 항목만.** 각 value는 **20자 이내**.
  · "성별·나이" — (예: "여성, 20대 후반")
    **대본에 성별이 안 나오면 비우고 open을 true로 하세요.**
    비워 두면 그림에서 성별이 매번 달라지므로, 사용자가 채우게 됩니다.
  · "외형 기준" — **옷차림과 몸 상태만.** 무엇을 하고 있는지, 무엇을 들고
    있는지는 쓰지 않습니다(그것은 "소지품"입니다).
    ✓ "젖은 검은 코트"  ✓ "수술 가운, 마스크"  ✓ "먼지 낀 앞치마"
    ✗ "계단 입구 서서 봉투 든 모습"   ← 행동이다
    ✗ "두툼한 책을 든 상태"          ← 소지품이다
    ✗ "장갑 착용 전후"               ← 컷마다 달라지는 것이다
  · "체형" — 실루엣으로 구분되는 것 (예: "마른 체형, 큰 키")
  · "기본 태도" — 씬 내내 유지되는 **몸의 모양**. 장소 이름이 들어가면
    틀린 것입니다.
    ✓ "구부정한 자세"  ✓ "어깨를 세운"  ✓ "축 처진 어깨"  ✓ "몸을 웅크린"
    ✗ "수술대 앞에 서서 고개 전방"   ← 어디에 있는지는 컷이 정한다
    ✗ "계단 입구에서 시선 고정"      ← 위치 + 행동이다
    ✗ "혼자 콘솔 앞에 앉음"          ← 위치다
    ✗ "조용히 철문을 닫음"           ← 행동이다
    표정도 아닙니다 — 표정은 컷마다 달라집니다.
    **가구·장소 이름을 쓰지 마세요.** 그 인물의 몸만 묘사합니다.
    한두 낱말이면 충분하고, 대본이 자세를 말하지 않으면 비웁니다.
  · "소지품" — 계속 들고 있는 것 (예: "출입카드")

**location** — 이 씬의 공간.
- name: 장소 이름. **10자 이내** (예: "지하 관제실")
- facts: **아래 두 항목만.** 각 **20자 이내**.
  · "장소 정체" — 어떤 공간인가 (예: "좁고 낡은 지하실")
  · "고정 소품" — 화면에 늘 있는 것 (예: "모니터 벽, 콘솔")

**environment** — 씬 전체에 걸리는 것.
- facts: **아래 세 항목만.** 각 **15자 이내**.
  · "시간" (예: "밤")
  · "조명 기준" (예: "형광등, 간헐적 깜빡임")
  · "그림체" (예: "거친 연필 스케치")

**길게 쓰지 마세요.** 이 값들은 모든 컷의 프롬프트에 그대로 붙습니다.
길면 정작 그 컷이 무엇을 보여주는지가 묻힙니다.
문장이 아니라 **명사구**로 씁니다. 마침표를 찍지 마세요.

**컷 플랜이 함께 주어지면 장면 공통의 `시간`만 변화 초안으로 잡으세요.**
시간 외 모든 fact의 changes는 반드시 []로 두세요. 시간 changes에는 처음 값과 실제로
달라지는 것만 넣습니다. at_cut은 변화가 시작되는 컷 번호(1부터), value는 그때의
짧은 새 값입니다. 변화가 없거나 컷 플랜에 근거가 없으면 []로 두세요. 처음 컷의
값을 changes에 다시 넣지 마세요. 예를 들어 컷 1이 `밤`, 컷 4가 `새벽`이면 시간의
기본값은 `밤`, changes는 [{ at_cut: 4, value: `새벽` }]입니다.

**대본에 없는 것을 지어내지 마세요.**
대본이 정하지 않은 항목은 value를 비우고 open을 true로 하세요.
**항목 자체는 빼지 말고 빈 채로 두세요** — 무엇이 아직 안 정해졌는지
보여야 사용자가 채울지 말지 정할 수 있습니다.

예시 (아래 이름과 값은 설명을 위한 것입니다. **대본에 없는 이름을
답에 넣지 마세요** — 등장인물은 오직 주어진 대본에서만 가져옵니다):

  대본에 "○○, 20대 후반. 비를 흠뻑 맞은 채 들어온다."가 있다면
  ✓ { label: "외형 기준", value: "비에 젖은 상태", open: false }
  ✓ { label: "체형", value: "", open: true }        ← 대본에 없다
  ✗ { label: "체형", value: "마른 편", open: false } ← 지어냈다
  ✗ { label: "손 소품 기준", ... }                  ← 없는 항목을 만들었다

한국어로 답하세요."""


def _clip(text: str, limit: int) -> str:
    """길면 자른다. 문장으로 늘어놓은 값은 첫 구절만 남긴다."""
    text = (text or "").strip().rstrip(".")
    if not text:
        return ""
    if len(text) <= limit:
        return text
    # 쉼표나 마침표가 있으면 첫 구절이 대개 핵심이다.
    for mark in (".", ",", "·"):
        head = text.split(mark)[0].strip()
        if head and len(head) <= limit:
            return head
    return text[:limit].rstrip()


# 자세가 아니라 위치를 적을 때 나오는 말. "창가 쪽으로 상체 고정"처럼
# 장소가 들어가면 그 컷에서만 맞는 값이 씬 내내 붙는다.
PLACE_MARKERS = ("창가", "앞에", "옆에", "안에", "위에", "쪽에", "쪽으로", "머리맡")


def _strip_place(value: str) -> str:
    """위치가 섞인 자세 값은 통째로 버린다.

    "창가 쪽으로 상체 고정"에서 앞부분만 떼면 "쪽으로 상체 고정" 같은
    말이 남는다. 어중간하게 자른 한국어를 씬 내내 모든 컷에 붙이느니
    비워 두는 편이 낫다 — 비면 화면에 '(미정)'으로 보이고 사용자가 채운다.
    """
    if any(marker in value for marker in PLACE_MARKERS):
        return ""
    # 자세를 여러 개 늘어놓으면("몸을 낮춘 채 앉아 전방 시선 고정") 모든 컷에
    # 그 전부가 붙는다. 첫 구절만 남긴다 — 몸의 모양 하나면 충분하다.
    for splitter in (" 채 ", ", "):
        if splitter in value:
            return value.split(splitter, 1)[0].strip()
    return value


# 사람이 아닌 것이 인물로 들어올 때 나오는 이름. 조명·기계·가구다.
OBJECT_MARKERS = (
    "등", "램프", "조명", "모니터", "화면", "기계", "장치", "탁자", "의자",
    "세탁기", "문", "창", "벽", "계단", "카메라", "스피커",
)


def _looks_like_object(character) -> bool:
    """이름이 사물을 가리키는가.

    "무영등"처럼 사물이 인물로 들어오면 레퍼런스 그림까지 만들어진다.
    사람이라는 근거(성별·나이, 체형)가 하나도 없고 이름이 사물로 끝나면
    사물로 본다 — "김등대" 같은 이름을 잘못 지우지 않기 위해서다.
    """
    name = character.name.strip()
    if not name.endswith(OBJECT_MARKERS):
        return False
    human_signal = any(
        fact.value for fact in character.facts
        if fact.label in ("성별·나이", "체형")
    )
    return not human_signal


def _normalize(facts, labels):
    """정해진 항목만, 정해진 순서로, 빠짐없이 돌려준다.

    빠진 항목을 채우는 이유는 그것이 '아직 안 정했다'는 정보이기 때문이다.
    항목이 아예 없으면 사용자는 무엇을 채울 수 있는지조차 알 수 없다.
    """
    found = {}
    for fact in facts:
        if fact.label in labels and fact.label not in found:
            fact.value = _clip(fact.value, 24)
            # 자세 칸에 위치가 들어오면 그 컷에서만 맞는 값이 씬 내내 붙는다.
            if fact.label == "기본 태도" and fact.value:
                fact.value = _strip_place(fact.value)
            # 값이 비었으면 정해지지 않은 것이다. 모델이 open을 잘못 달기도 한다.
            fact.open = not fact.value
            found[fact.label] = fact
    return [
        found.get(label) or SceneFact(label=label, value="", open=True)
        for label in labels
    ]


async def build_scene_state(request: SceneStateRequest) -> SceneStateResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.script.strip():
        raise ValueError("script is empty")

    user_content = f"[씬] {request.heading}\n\n[대본]\n{request.script}"
    if request.scene_intention:
        user_content += f"\n\n[장면 의도] {request.scene_intention}"
    if request.cut_plan:
        user_content += f"\n\n[컷 플랜]\n{request.cut_plan}"

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
    result = SceneStateResponse(**json.loads(response.choices[0].message.content.strip()))

    # 길이는 프롬프트로 지켜지지 않았다. 이 값들은 모든 컷의 프롬프트에
    # 그대로 붙으므로, 길면 정작 그 컷이 무엇을 보여주는지가 묻힌다.
    # 사람이 아닌 것이 인물로 들어오면 레퍼런스 그림까지 만들어진다.
    # 그 인물의 행동을 아무도 하지 않으므로 컷에서도 붕 뜬다.
    result.characters = [
        character for character in result.characters
        if character.name.strip() and not _looks_like_object(character)
    ]
    for character in result.characters:
        character.summary = _clip(character.summary, 12)
        character.facts = _normalize(character.facts, CHARACTER_LABELS)
    result.location.name = _clip(result.location.name, 14)
    result.location.facts = _normalize(result.location.facts, LOCATION_LABELS)
    result.environment.facts = _normalize(result.environment.facts, ENVIRONMENT_LABELS)
    return result
