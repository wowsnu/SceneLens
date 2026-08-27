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
# 인물 항목은 두 갈래다.
#
# 생김새(성별·나이 / 외형 기준)는 사람이 바뀌지 않는 한 씬 안에서
# 변하지 않는다. `상태`만 컷을 가로지르며 변한다 — 젖은 채 들어와 굳어가고,
# 노트를 들었다 내려놓는다.
#
# 전에는 다섯 항목이 각자 `+ 변화` 버튼을 갖고 있어 화면이 복잡했다. 변화가
# 실제로 필요한 곳은 한 곳이므로 거기만 남긴다. 프롬프트에는 원래 라벨 없이
# 값만 이어붙으므로(settledFacts) 합쳐도 생성 결과는 달라지지 않는다.
CHARACTER_FIXED_LABELS = ["성별·나이", "외형 기준"]
CHARACTER_STATE_LABEL = "상태"
CHARACTER_LABELS = [*CHARACTER_FIXED_LABELS, CHARACTER_STATE_LABEL]
LOCATION_LABELS = ["장소 정체", "고정 소품"]
# 화풍은 여기 없다. 감독이 `표현 스타일`에서 그림으로 고르고, 그 선택이
# 앵커 이미지로 생성에 물린다 — 글로 적은 값은 이미지보다 약해서 어긋나면
# 무시되는 쪽이었다.
ENVIRONMENT_LABELS = ["시간"]


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
손·손등·얼굴·눈처럼 **사람의 일부**, 자세·표정, 빛·그림자·반사 같은
화면 효과도 별도 인물이 아닙니다. "빛나는 손등"은 인물이 아니라 그 손의
주인에게 속한 컷 묘사입니다. **한 사람 전체를 가리키는 이름이나 역할만**
characters에 넣으세요. 숨 쉬고 움직이는 사람만 characters에 넣습니다.

**대본에 나온 사람은 한 명도 빠뜨리지 마세요.** 이름 없이 "손님", "소년"처럼
불리는 사람도 인물입니다. 여기서 빠지면 그 사람이 나오는 컷은 기준 없이
그려져 매번 다른 얼굴이 됩니다. 뒤늦게 등장하는 인물도 넣으세요.

**[앞 씬에서 확정된 인물]이 주어지면 같은 이름은 같은 사람입니다.**
그 값을 **그대로 복사**하세요. 씬이 바뀌었다고 사람의 성별·나이·외형·
옷차림이 바뀌지 않습니다. 이 씬의 대본에 외형 묘사가 없는 것은 정보가
없다는 뜻이지 달라졌다는 뜻이 아닙니다 — 대본은 보통 인물을 처음 나올
때만 묘사합니다. 근거 없이 새 값을 지어내면 같은 사람이 씬마다 다른
사람으로 그려집니다.

바꿀 수 있는 것은 **이 씬의 대본이 실제로 달라졌다고 말한 것뿐**입니다.
  ✓ 앞 씬에서 "젖은 검은 코트" → 이 씬 대본에 "코트를 벗는다" → 바꾼다
  ✗ 앞 씬에서 "여성, 20대 중반" → 이 씬 대본에 나이 언급 없음 → **그대로 둔다**
  ✗ 앞 씬에서 "마른 체형, 큰 키" → 근거 없이 "보통 체형"으로 → 안 된다
"성별·나이"와 "외형 기준"은 사람이 바뀌지 않는 한 절대 달라지지 않습니다.
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
- facts: **아래 세 항목만.** 각 value는 **20자 이내**.
  · "성별·나이" — (예: "여성, 20대 후반")
    **대본에 성별이 안 나오면 비우고 open을 true로 하세요.**
    비워 두면 그림에서 성별이 매번 달라지므로, 사용자가 채우게 됩니다.
  · "외형 기준" — 옷차림·머리·실루엣처럼 레퍼런스에서 계속 유지할 외형.
    씬 내내 같은 것을 씁니다.
    ✓ "젖은 검은 코트"  ✓ "묶은 머리, 마른 체형"  ✓ "큰 키, 먼지 낀 앞치마"
    ✗ "계단 입구 서서 봉투 든 모습"   ← 행동이다
    ✗ "장갑 착용 전후"               ← 컷마다 달라지는 것이다
  · "상태" — **몸의 모양과 계속 들고 있는 것.** 씬 안에서 달라질 수 있는
    유일한 항목이라 한 줄로 묶어 씁니다.
    ✓ "구부정한 자세, 노트를 든 채"   ✓ "어깨를 세우고 출입카드를 쥔"
    ✓ "축 처진 어깨"                 ✓ "몸을 웅크린"
    **무엇을 하고 있는지는 쓰지 마세요.** 행동은 컷이 담습니다.
    ✗ "혼자 앉아 노트·연필 사용 중"  ← 하는 일이다. "구부정한 자세"로 쓴다
    ✗ "화면을 보는 중"               ← 행동이다
    ✗ "조용히 철문을 닫음"           ← 행동이다
    ✗ "수술대 앞에 서서 고개 전방"   ← 어디에 있는지는 컷이 정한다
    ✗ "계단 입구에서 시선 고정"      ← 위치 + 행동이다
    `-하는 중`, `-사용 중`, `-보며` 같은 말이 들어가면 틀린 것입니다.
    표정도 쓰지 않습니다 — 표정은 컷마다 달라집니다.
    **가구·장소 이름을 쓰지 마세요.** 그 인물의 몸과 소지품만 씁니다.
    대본이 자세도 소지품도 말하지 않으면 비우고 open을 true로 하세요.

**location** — 이 씬 전체를 담는 실제 공간. 씬 제목의 장소를 우선하세요.
손·얼굴 같은 신체 일부, 소품, 빛·그림자·반사, 인물의 위치나 행동은 장소가
아닙니다. 컷마다 보이는 세부가 아니라 "실험실", "복도", "관제실"처럼
인물이 들어가 있는 공간 하나만 고르세요.
- name: 장소 이름. **10자 이내** (예: "지하 관제실")
- facts: **아래 두 항목만.** 각 **20자 이내**.
  · "장소 정체" — 어떤 공간인가 (예: "좁고 낡은 지하실")
  · "고정 소품" — 화면에 늘 있는 것 (예: "모니터 벽, 콘솔")

**시간** — 이 씬 전체가 놓인 시간.
- facts: **아래 한 항목만.** **15자 이내**.
  · "시간" (예: "밤")
  화풍·그림체는 감독이 따로 고르므로 여기에 적지 마세요.

**길게 쓰지 마세요.** 이 값들은 모든 컷의 프롬프트에 그대로 붙습니다.
길면 정작 그 컷이 무엇을 보여주는지가 묻힙니다.
문장이 아니라 **명사구**로 씁니다. 마침표를 찍지 마세요.

**컷 플랜이 함께 주어지면 `시간`만 변화 초안으로 잡으세요.**
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
  ✓ { label: "외형 기준", value: "비에 젖은 외투", open: false }
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


# 사람이 아닌 것이 인물로 들어올 때 나오는 이름. 신체 일부·화면 효과·
# 조명·기계·가구·소품이다.
HARD_NON_PERSON_MARKERS = (
    "손", "손등", "손가락", "손목", "팔", "팔꿈치", "다리", "무릎", "발",
    "얼굴", "눈", "눈동자", "입", "입술", "코", "귀", "머리", "어깨", "상체",
    "빛", "불빛", "광원", "그림자", "반사", "연기", "안개", "실루엣",
)
OBJECT_MARKERS = (
    "등", "램프", "조명", "모니터", "화면", "기계", "장치", "탁자", "의자",
    "세탁기", "문", "창", "벽", "계단", "카메라", "스피커", "소품",
)


def _looks_like_non_person(character, known_names=()) -> bool:
    """이름이 완전한 사람이 아닌 신체 일부·효과·사물을 가리키는가.

    "빛나는 손등"이나 "무영등"이 인물로 들어오면 레퍼런스 그림까지
    만들어진다. 앞 씬에서 확정한 이름은 보존하고, 그 외에는 사람이라는
    근거가 없으면서 비인물 명사로 끝나는 후보를 제거한다. 외형 값이 있는
    "김등대" 같은 실제 이름을 잘못 지우지 않기 위한 보수적인 필터다.
    """
    name = character.name.strip()
    if name in known_names:
        return False
    # 신체 일부나 화면 효과는 모델이 외형 값을 함께 지어냈더라도 사람이 아니다.
    if name.endswith(HARD_NON_PERSON_MARKERS):
        return True
    if not name.endswith(OBJECT_MARKERS):
        return False
    human_signal = any(
        fact.value for fact in character.facts
        if fact.label in ("성별·나이", "외형 기준")
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
            # 상태 칸에 위치가 들어오면 그 컷에서만 맞는 값이 씬 내내 붙는다.
            if fact.label == CHARACTER_STATE_LABEL and fact.value:
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
    if request.known_characters:
        # 앞 씬에서 이미 정한 사람. 같은 이름이면 그 값을 그대로 가져와야
        # 한 인물이 씬마다 다른 사람으로 갈리지 않는다.
        lines = []
        for character in request.known_characters:
            values = " · ".join(
                f"{fact.label}: {fact.value}"
                for fact in character.facts
                if fact.value and not fact.open
            )
            lines.append(f"- {character.name}: {values or '(정해진 값 없음)'}")
        user_content += (
            "\n\n[앞 씬에서 확정된 인물]\n"
            + "\n".join(lines)
            + "\n이 인물이 이 씬에도 나오면 위 값을 **그대로** 복사하세요."
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
    result = SceneStateResponse(**json.loads(response.choices[0].message.content.strip()))

    # 길이는 프롬프트로 지켜지지 않았다. 이 값들은 모든 컷의 프롬프트에
    # 그대로 붙으므로, 길면 정작 그 컷이 무엇을 보여주는지가 묻힌다.
    # 사람이 아닌 것이 인물로 들어오면 레퍼런스 그림까지 만들어진다.
    # 그 인물의 행동을 아무도 하지 않으므로 컷에서도 붕 뜬다.
    known_names = {
        character.name.strip()
        for character in request.known_characters
        if character.name.strip()
    }
    result.characters = [
        character for character in result.characters
        if character.name.strip() and not _looks_like_non_person(character, known_names)
    ]
    for character in result.characters:
        character.summary = _clip(character.summary, 12)
        character.facts = _normalize(character.facts, CHARACTER_LABELS)
    result.location.name = _clip(result.location.name, 14)
    result.location.facts = _normalize(result.location.facts, LOCATION_LABELS)
    result.environment.facts = _normalize(result.environment.facts, ENVIRONMENT_LABELS)
    return result
