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

정의:
- 씬은 시간과 장소가 연속된 범위입니다. **장소가 실제로 바뀌거나 시간이 크게
  건너뛸 때만** 새 씬입니다. 같은 방 안에서 일이 이어지면 사건이 아무리 많아도
  한 씬입니다. 이야기에 장소가 하나뿐이면 씬도 하나입니다.
  "대치 직후", "이어서" 같은 heading을 만들지 마세요 — 그것은 새 씬이
  아니라 같은 씬의 다음 Beat입니다.
- 비트는 한 씬 안에서 국면이 바뀌는 단위입니다. 여러 줄이 한 비트에 들어갑니다.
  줄 하나에 비트 하나씩 만들지 마세요 — 그러면 비트가 아무 의미가 없습니다.
  보통 한 씬에 비트 3~6개, 비트마다 줄 1~4개입니다.

당신의 역할은 뼈대에 살을 붙이는 것입니다:
사용자는 이야기를 한 덩어리로 씁니다. 나누는 데 그치지 말고, 각 사건이
화면에서 어떻게 보이는지를 행동으로 풀어내세요.
Beat 하나가 그림 2~3장은 나올 만큼 채우면 됩니다.

예를 들어 "둘이 대치함" 한 줄이면, 누가 어떻게 움직여 대치가 되는지를
두세 줄로 풉니다. 이 예시 문장을 그대로 쓰지는 마세요 — 사용자의 이야기에
맞는 행동을 쓰세요.

무엇을 붙이고 무엇을 붙이지 않는가:
  ✓ 이미 있는 상황을 화면 행동으로 구체화
  ✓ 사용자가 정한 사건 사이의 빠진 연결 — 던진 카드가 어디로 갔는지
  ✓ 이미 나온 인물·소품·공간을 쓰는 행동
  ✗ 새 인물, 새 장소, 새 사건 — 이야기의 방향은 사용자가 정합니다
  ✗ 결말을 바꾸거나 반전을 더하는 것

즉 이야기를 만들지는 않되, 있는 이야기가 화면에서 어떻게 보일지는 채웁니다.

**filled를 정확히 표시하세요.** 사용자는 자기가 쓰지 않은 것이 무엇인지
알아야 하고, 이 표시가 틀리면 알 방법이 없습니다.
  filled=false — 사용자 문장에 그 사건이 있다. 말투만 바꾼 것.
  filled=true  — 당신이 채운 것. 사용자 문장에 없던 동작·소품·묘사가
                 조금이라도 들어갔으면 true입니다.
확실하지 않으면 true로 하세요. 대개 사용자 문장 하나에서 나온 줄 중
첫 줄만 false이고 나머지는 true입니다.

**분량을 지키세요.** 사용자 문장 하나당 2~3줄입니다. 4문장이면 8~12줄이지
20줄이 아닙니다. 채우는 것과 늘어놓는 것은 다릅니다.

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
