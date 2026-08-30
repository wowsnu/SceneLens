"""Turn a loose story into the scene and beat structure storyboarding needs.

This is not screenwriting. Cut planning needs scenes (a continuous span of
time and place) and beats (a shift of phase within one), and a few sentences
of story have neither. The model surfaces those units while retaining the
writer's concrete facts and marking its connective additions.
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
        "required": ["scenes", "characters"],
        "properties": {
            "characters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "gender_age", "appearance", "description"],
                    "properties": {
                        "name": {"type": "string"},
                        "gender_age": {"type": "string"},
                        "appearance": {"type": "string"},
                        "description": {"type": "string"},
                    },
                },
            },
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
                                            "required": ["text", "filled", "source_evidence", "characters", "shot_size", "perspective"],
                                            "properties": {
                                                "text": {"type": "string"},
                                                # 사용자가 쓴 것인가, 채운 것인가.
                                                "filled": {"type": "boolean"},
                                                # 이 줄의 근거가 된 원문 속 정확한 짧은 조각.
                                                # AI가 보강한 줄도 어느 원문 사건을 잇는지 남긴다.
                                                "source_evidence": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                },
                                                # 이 줄의 화면에 보여야 할 characters 항목의 name.
                                                "characters": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                },
                                                "shot_size": {
                                                    "type": "string",
                                                    "enum": ["Extreme Wide Shot", "Wide Shot", "Full Shot", "Medium Shot", "Medium Close-Up", "Close-Up", "Extreme Close-Up"],
                                                },
                                                "perspective": {
                                                    "type": "string",
                                                    "enum": ["Eye Level", "High Angle", "Low Angle", "OTS (Over the Shoulder)", "POV (Point of View)", "Top-Down / Overhead", "Dutch Angle"],
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
    },
}


PROMPT = """당신은 스토리보드 작업의 첫 단계를 돕습니다.
사용자가 쓴 짧은 이야기를 인물(Character), 씬(Scene)과 비트(Beat)로 나누세요.

작업 순서:
1. 먼저 원문에 등장하는 인물을 추출하세요. 이름이 있으면 그 이름을 쓰세요.
   이름이 없는 인물에게는 짧고 서로 겹치지 않는 임시 고유 이름을 **반드시**
   하나 부여하세요. 이 이름은 스토리보드 안에서만 쓰는 식별자이며, 원문의
   역할(예: 앞사람, 경비원, 아이)은 description에 함께 남기세요.
   character에는 다음 값을 **각각** 채우세요. 대본에 근거가 있으면 빈값으로 두지 마세요.
   - gender_age: 성별과 나이/나이대 (예: "여성, 20대 중반")
   - appearance: 기본 복장·헤어스타일·체형처럼 계속 유지할 외형
   - description: 원문의 역할을 보존한 짧은 설명
   원문에 없는 성별·나이는 추정하지 말고 빈 문자열로 두세요.
2. 원문에서 **명시된** 장소와 시간 표현을 찾고, 그 표현만으로 씬 경계를 확정하세요.
3. 확정된 각 씬 안에서만 원문 사건을 비트와 화면 행동으로 풀어 쓰세요.
   이때 인물은 1에서 정한 **이름으로** 부르세요 — 원문이 역할로 적었어도
   화면 행동 문장에는 이름을 씁니다.
4. 모든 lines에 shot_size와 perspective를 반드시 고르세요. 장면을 과장하지
   않는 가장 자연스러운 값으로 판단하고, 근거가 약하면 `Medium Shot`과
   `Eye Level`을 쓰세요. 이 값은 사용자가 이후 수정할 수 있는 기본 촬영 설정입니다.

가장 중요한 제한 — 원문 충실성:
- 원문의 플롯과 인과관계를 **빠짐없이** 보존하되, 원문을 단순히 복사하지 말고
  스토리보드로 읽히는 장면으로 재구성하세요. 특히 소품, 화면·종이에 적힌 문구,
  숫자·시각, 경고·금지, 선택과 그 결과는 절대 생략하거나 약화하지 마세요.
  읽을 수 있는 문구는 소품이나 화면에 보이는 글자로 처리하고, 핵심 표현과 숫자는 원문 그대로 유지하세요.
- 원문의 한 문장은 여러 lines/비트로 펼칠 수 있고, 여러 문장은 하나의 line의
  맥락이 될 수 있습니다. 원문 문장 수를 lines 수나 패널 수로 맞추려 하지 마세요.
  필요한 화면 행동과 반응을 우선하되 같은 의미의 줄을 반복하지 마세요.
- 모든 line의 source_evidence에는 그 line의 근거가 된 원문 속 짧은 정확한 조각을
  하나 이상 넣으세요. 보강 line도 이어 주는 원문 사건을 넣습니다. source_evidence는
  설명이 아니라 사용자가 쓴 원문을 그대로 짧게 인용한 것입니다.
- 원문에 직접 있는 사건·소품·결과를 옮긴 line은 filled=false입니다. 원문 사건을
  화면에서 읽히게 하려고 추가한 연결 행동·즉각 반응만 filled=true로 표시하세요.
- characters에는 원문에 실제로 등장하거나 행동 주체로 명시된 인물만 넣으세요.
  새 인물을 추가하지는 마세요. 다만 원문에 실명이 없는 기존 인물은 이미지와
  `@이름` 지시에서 안정적으로 가리킬 수 있도록 임시 고유 이름을 새로 붙이세요.
  예를 들어 달리는 주체와 앞사람이라면 `민준`과 `도윤`처럼 서로 다른 이름을
  정하고, description에 각각 `주인공 러너`, `앞 러너` 역할을 남기세요.
  `인물`, `사람`, `누군가`, `러너 A` 같은 일반명·기호는 character name으로 쓰지
  마세요. 한번 정한 이름은 모든 scenes와 lines의 characters에서 정확히 동일하게
  사용하세요.
- **lines의 text에서도 인물을 그 이름으로 부르세요.** 원문이 `주인공`, `앞사람`
  처럼 역할로 적었더라도, 이름을 정했으면 화면 행동 문장에는 이름을 씁니다.
  ✓ `민준이 속도를 올려 도윤을 제친다.`
  ✗ `주인공이 속도를 올려 앞사람을 제친다.`
  역할 자체는 character의 description에 남으므로 여기서 잃지 않습니다.
  이 문장이 그대로 그림 프롬프트가 되는데, 역할어로 두면 함께 보내는 인물
  목록과 같은 사람을 가리키는지 알 수 없어 레퍼런스가 물리지 않습니다.
- 각 lines 항목의 characters에는 그 화면에 실제로 보여야 하는 characters의 name만
  적으세요. 화면에 없는 인물은 넣지 마세요. 이 목록은 이미지 생성에서 다른 사람이
  섞이지 않게 하는 기준이므로 비워 두지 마세요.

정의:
- 씬은 시간과 장소가 연속된 범위입니다. **원문에서 장소가 실제로 바뀌거나 시간이 크게
  건너뛐다고 명시될 때만** 새 씬입니다. 같은 방 안에서 일이 이어지면 사건이 아무리 많아도
  한 씬입니다. 이야기에 장소가 하나뿐이면 씬도 하나입니다.
- 비트는 한 씬 안에서 국면이 바뀌는 단위입니다. 여러 줄이 한 비트에 들어갑니다.
  줄 하나에 비트 하나씩 만들지 마세요 — 그러면 비트가 아무 의미가 없습니다.
  보통 한 씬에 비트 2~5개, 비트마다 줄 1~3개입니다. 사용자가 짧게
  적었더라도 실제 스토리보드로 전개할 수 있을 만큼 핵심 행동과 반응은
  드러내되, 분위기 묘사나 같은 의미의 미세 행동으로 줄 수를 늘리지 마세요.

당신의 역할은 확정된 뼈대에 장면의 살을 붙이는 것입니다.
사용자는 이야기를 압축해서 씁니다. 원문에 있는 사건의 순서·목표·관계·결과를
유지하면서, 그 사이에 무엇이 보이고 어떻게 긴장이 진행되는지 자연스러운
서술로 풀어 쓰세요. 장면은 단순한 목록이 아니라 시작–진행–변화가 느껴져야
합니다. 단, 그 변화는 원문에 이미 들어 있는 사건에서 나와야 합니다.
예를 들어 '속도를 올려 앞사람을 제친다'는 문장은 뒤에서 따라붙고, 간격을
좁히고, 나란히 지나치는 연결 동작으로 구체화할 수 있습니다. 이것은 새 사건이
아니라 추월을 화면에서 이해하게 하는 보강입니다.

예를 들어 원문에 "A가 손잡이를 돌려 문을 연다"고 쓰여 있으면, 손잡이를
돌리는 동작과 문이 열리는 결과를 순서대로 나누고, 문이 열리며 A의 시선이
안쪽으로 향하는 정도까지는 보강할 수 있습니다. 그러나 문 안에 누가 있거나
무엇이 기다리는지는 원문에 없으면 만들지 마세요.

무엇을 붙이고 무엇을 붙이지 않는가:
  ✓ 이미 있는 상황을 화면 행동으로 구체화
  ✓ 원문에 이미 들어 있는 여러 동작의 순서·관계·방향을 나누어 보이기
  ✓ 한 문장에 포함된 행동을 화면에서 읽히는 단위로 풀어 쓰기
  ✓ 기존 사건에 필연적으로 딸린 연결 행동과 즉각적인 반응을 보강하기
  ✓ 이미 나온 인물·소품·공간을 쓰는 행동
  ✗ 새 인물, 새 장소, 새 소품, 새 단서, 새 목표, 새 사건 — 이야기의 방향은 사용자가 정합니다
  ✗ 결말을 바꾸거나 반전을 더하는 것

즉 이야기를 만들지는 않되, 있는 이야기가 화면에서 어떻게 보일지는 채웁니다.


나머지 규칙:
1. 대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담을 수 없습니다.
   말하는 장면은 말하는 모습으로 적으세요. ("B가 뒤돌아보지 않은 채 입을 연다")
2. 이야기 말투를 서술로 바꾸세요. "들어감" → "들어간다", "기다리고 있었음" → "기다리고 있었다".
3. 한 줄은 **하나의 화면 행동 또는 정보 단위**입니다. 이후 컷 플랜은 이 줄을
   나누거나 합칠 수 있으므로, 한 줄을 반드시 그림 한 장이나 원문 한 문장에 맞출
   필요가 없습니다.
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
