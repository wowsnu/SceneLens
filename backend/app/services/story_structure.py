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
                                        "items": {"type": "string"},
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

정의:
- 씬은 시간과 장소가 연속된 범위입니다. **장소가 실제로 바뀌거나 시간이 크게
  건너뛸 때만** 새 씬입니다. 같은 방 안에서 일이 이어지면 사건이 아무리 많아도
  한 씬입니다. 이야기에 장소가 하나뿐이면 씬도 하나입니다.
- 비트는 한 씬 안에서 국면이 바뀌는 단위입니다. 여러 줄이 한 비트에 들어갑니다.
  줄 하나에 비트 하나씩 만들지 마세요 — 그러면 비트가 아무 의미가 없습니다.
  보통 한 씬에 비트 3~6개, 비트마다 줄 1~4개입니다.

가장 중요한 규칙 — 내용을 더하지 마세요:
사용자가 쓴 사건만 옮기세요. 새로운 동작, 소품, 표정, 자세, 시선, 소리를
만들어내면 안 됩니다. 원문에 없는 것을 넣으면 사용자는 자기가 쓰지 않은
이야기를 받게 되고, 나중에 어디까지가 자기 것인지 알 수 없게 됩니다.

금지되는 예 (원문: "재인이 카드를 바닥에 던져서 시선을 돌린 다음 달려듦"):
  ✗ "재인이 균형을 잃지 않으려는 듯 몸을 낮춘다"   ← 없는 자세
  ✗ "카드가 떨어지는 소리가 울린다"                ← 없는 소리
  ✗ "민호가 재인의 이동을 따라 시선을 고정한다"     ← 없는 반응
  ✓ "재인이 카드를 바닥에 던진다"
  ✓ "민호의 시선이 카드 쪽으로 돌아간다"           ← 원문의 '시선을 돌린'

줄 수를 늘리려 하지 마세요. 원문의 사건이 6개면 6줄이면 됩니다.
비트 하나에 줄이 하나뿐이어도 괜찮습니다.

나머지 규칙:
1. 대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담을 수 없습니다.
   말하는 장면은 말하는 모습으로 적으세요. ("민호가 뒤돌아보지 않은 채 입을 연다")
2. 이야기 말투를 서술로 바꾸세요. "들어감" → "들어간다", "기다리고 있었음" → "기다리고 있었다".
3. 한 문장에 사건이 여럿이면 나누세요. 다만 나누는 것과 더하는 것은 다릅니다.
4. heading은 짧게 쓰세요. "관제실, 밤" 정도. INT./EXT. 같은 시나리오 형식은 쓰지 마세요.
5. 화면에 보이는 것만 쓰세요. 설명이나 조건은 서술이 아닙니다.
   ✗ "리모컨을 누르면 승강장 사람들이 위험해진다"   ← 그릴 수 없는 설명
   ✓ "민호가 리모컨을 든 손을 들어 보인다"          ← 그릴 수 있는 행동
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
