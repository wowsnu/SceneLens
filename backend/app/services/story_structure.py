"""Turn a loose story into the scene and beat structure storyboarding needs.

This is not screenwriting. Cut planning needs scenes (a continuous span of
time and place) and beats (a shift of phase within one), and a few sentences
of story have neither. The model surfaces those units.

It must not add content. Anything the writer did not say would enter the
script with no traceable origin, and the creator could not tell later which
parts were theirs.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import StoryStructureRequest, StoryStructureResponse


RESPONSE_SCHEMA = {
    "name": "story_structure",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["scenes"],
        "properties": {
            "scenes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["heading", "beats"],
                    "properties": {
                        # 장소, 시간. 시나리오 슬러그가 아니라 짧은 한 줄.
                        "heading": {"type": "string"},
                        "beats": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["lines"],
                                "properties": {
                                    "lines": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": ["text", "filled"],
                                            "properties": {
                                                "text": {"type": "string"},
                                                # 사용자가 쓴 것인가, 채운 것인가.
                                                "filled": {"type": "boolean"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 스토리보드 작업의 첫 단계를 돕습니다.
사용자가 쓴 짧은 이야기를 씬(Scene)과 비트(Beat)로 나누세요.

작업 순서:
1. 먼저 원문에서 **명시된** 장소와 시간 표현을 찾고, 그 표현만으로 씬 경계를 확정하세요.
2. 확정된 각 씬 안에서만 원문 사건을 비트와 화면 행동으로 풀어 쓰세요.

가장 중요한 제한 — 원문 충실성:
- heading의 장소·시간은 원문에 나온 표현만 사용하세요. 원문이 "작업실"이라고만
  했다면 heading은 "작업실, 저녁"처럼 쓰며, "작업실 앞", "작업실 안", "문 앞",
  "계단", "복도"처럼 원문에 없는 세부 공간을 만들지 마세요.
- 새 씬은 원문에 있는 장소·시간 변화 하나를 근거로 해야 합니다. 그 근거가 없다면
  새 씬이 아니라 같은 씬의 다음 Beat입니다.
- 원문에 없는 소품, 단서, 행동, 배경 정보를 만들지 마세요. 예를 들어 원문에 없는
  메모, 사진, 상자, 게시판, 종이, 발자국을 추가하지 마세요. 화면화에 꼭 필요한
  경우에도 이미 원문에 나온 인물·공간·사건만 사용하세요.
- 이야기의 관계나 배경 설명은 참고용입니다. 그것만으로 새 장면이나 화면 행동을
  만들지 마세요.

정의:
- 씬은 시간과 장소가 연속된 범위입니다. **원문에서 장소가 실제로 바뀌거나 시간이 크게
  건너뛐다고 명시될 때만** 새 씬입니다. 같은 방 안에서 일이 이어지면 사건이 아무리 많아도
  한 씬입니다. 이야기에 장소가 하나뿐이면 씬도 하나입니다.
  "대치 직후", "이어서" 같은 heading을 만들지 마세요 — 그것은 새 씬이
  아니라 같은 씬의 다음 Beat입니다. 원문에 없는 계단, 복도, 골목 같은 이동 경로를
  heading이나 새 씬으로 만들지 마세요.
- 비트는 한 씬 안에서 국면이 바뀌는 단위입니다. 여러 줄이 한 비트에 들어갑니다.
  줄 하나에 비트 하나씩 만들지 마세요 — 그러면 비트가 아무 의미가 없습니다.
  보통 한 씬에 비트 2~5개, 비트마다 줄 1~3개입니다. 사용자가 짧게
  적었더라도 실제 스토리보드로 전개할 수 있을 만큼 핵심 행동과 반응은
  드러내되, 분위기 묘사나 같은 의미의 미세 행동으로 줄 수를 늘리지 마세요.

당신의 역할은 확정된 뼈대를 화면 행동으로 정리하는 것입니다:
사용자는 이야기를 한 덩어리로 씁니다. 나누는 데 그치지 말고, 각 사건이
화면에서 어떻게 보이는지를 행동으로 풀어내세요.
Beat 하나가 그림 2~3장은 나올 만큼 채우면 됩니다. 사건의 시작, 핵심 행동,
인물의 반응 중 화면 전개에 필요한 것만 나누어 쓰세요.

예를 들어 "둘이 대치함" 한 줄이면, 누가 어떻게 움직여 대치가 되는지를
두세 줄로 풉니다. 이 예시 문장을 그대로 쓰지는 마세요 — 사용자의 이야기에
맞는 행동을 쓰세요.

무엇을 붙이고 무엇을 붙이지 않는가:
  ✓ 이미 있는 상황을 화면 행동으로 구체화
  ✓ 원문에 이미 있는 사건의 시작·핵심 행동·반응을 나누어 보이기
  ✓ 이미 나온 인물·소품·공간을 쓰는 행동
  ✗ 새 인물, 새 장소, 새 소품, 새 단서, 새 사건 — 이야기의 방향은 사용자가 정합니다
  ✗ 결말을 바꾸거나 반전을 더하는 것

즉 이야기를 만들지는 않되, 있는 이야기가 화면에서 어떻게 보일지는 채웁니다.

**filled를 정확히 표시하세요.** 사용자는 자기가 쓰지 않은 것이 무엇인지
알아야 하고, 이 표시가 틀리면 알 방법이 없습니다.
  filled=false — 사용자 문장에 그 사건이 있다. 말투만 바꾼 것.
  filled=true  — 당신이 채운 것. 사용자 문장에 없던 동작·소품·묘사가
                 조금이라도 들어갔으면 true입니다.
확실하지 않으면 true로 하세요. 대개 사용자 문장 하나에서 나온 줄 중
첫 줄만 false이고 나머지는 true입니다.

**분량을 지키세요.** 사용자 문장 하나당 보통 2~3줄입니다. 4~5문장이면
10~14줄 정도를 목표로 하세요. 원문 사건이 적으면 이보다 적어도 됩니다. 한 문장의 여러 동작을 억지로 반복하거나
새 사건을 만들어 줄 수를 채우지는 마세요.

나머지 규칙:
1. 대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담을 수 없습니다.
   말하는 장면은 말하는 모습으로 적으세요. ("B가 뒤돌아보지 않은 채 입을 연다")
2. 이야기 말투를 서술로 바꾸세요. "들어감" → "들어간다", "기다리고 있었음" → "기다리고 있었다".
3. 한 줄은 **하나의 사건**입니다. 이 줄 하나가 그림 한 장이 됩니다.
   ✗ "손잡이를 돌려 문틈을 만든다. 복도를 확인한 뒤 몸을 낮춰 들어간다."
   ✓ "A가 손잡이를 천천히 돌린다." / "A가 문틈으로 복도를 확인한다."
4. heading은 짧게 쓰세요. "관제실, 밤" 정도. INT./EXT. 같은 시나리오 형식은 쓰지 마세요.
5. 화면에 보이는 것만 쓰세요. 설명이나 조건은 서술이 아닙니다.
   ✗ "리모컨을 누르면 승강장 사람들이 위험해진다"   ← 그릴 수 없는 설명
   ✓ "B가 리모컨을 든 손을 들어 보인다"          ← 그릴 수 있는 행동
   원문의 설명이 화면 행동으로 옮겨지지 않으면 그 줄은 쓰지 마세요.

한국어로 답하세요."""


async def structure_story(request: StoryStructureRequest) -> StoryStructureResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    story = request.story.strip()
    if not story:
        raise ValueError("story is empty")

    user_content = f"[이야기]\n{story}"
    if request.scene_intention:
        # 의도는 참고만 한다. 여기서 내용으로 옮기면 사용자가 쓰지 않은 것이 들어간다.
        user_content += f"\n\n[장면 의도 — 참고용, 내용으로 옮기지 말 것]\n{request.scene_intention}"

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=2500,
    )
    return StoryStructureResponse(**json.loads(response.choices[0].message.content.strip()))
