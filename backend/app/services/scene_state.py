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

from app.models.schemas import SceneStateRequest, SceneStateResponse


FACT = {
    "type": "object",
    "additionalProperties": False,
    "required": ["label", "value", "open"],
    "properties": {
        "label": {"type": "string"},
        # 대본에서 읽히는 값. 정해지지 않았으면 빈 문자열.
        "value": {"type": "string"},
        # 대본이 정하지 않은 항목인가. 비워 둔 것과 누락은 다르다.
        "open": {"type": "boolean"},
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
                        "facts": {"type": "array", "items": FACT},
                    },
                },
            },
            "location": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "facts"],
                "properties": {
                    "name": {"type": "string"},
                    "facts": {"type": "array", "items": FACT},
                },
            },
            "environment": {
                "type": "object",
                "additionalProperties": False,
                "required": ["facts"],
                "properties": {
                    "facts": {"type": "array", "items": FACT},
                },
            },
        },
    },
}


PROMPT = """당신은 미장센 담당입니다. 대본을 읽고 이 씬의 기준을 세우세요.

기준이란 **여러 컷에 걸쳐 같아야 하는 것**입니다. 컷마다 따로 해석되면
같은 인물이 다른 사람으로, 같은 방이 다른 방으로 그려집니다.

세 가지를 세웁니다:

**characters** — 이 씬에 나오는 인물. 대본에 이름이 나온 사람만.
- name: 이름
- summary: 나이대·역할 한 줄. 대본에 없으면 빈 문자열.
- facts: 컷마다 같아야 할 외형. 보통 이런 항목들입니다.
  · "외형 기준" — 옷차림, 상태 (예: "비에 흠뻑 젖은 상태")
  · "헤어" — 머리 모양
  · "표정 기준" — 이 씬 내내 유지되는 인상

**location** — 이 씬의 공간.
- name: 장소 이름
- facts: "장소 정체"(어떤 공간인가), "고정 소품"(화면에 늘 있는 것)

**environment** — 씬 전체에 걸리는 것.
- facts: "시간", "날씨", "조명 기준", "그림체·렌더 톤"

**가장 중요한 규칙 — 대본에 없는 것을 지어내지 마세요.**
대본이 정하지 않은 항목은 value를 비우고 open을 true로 하세요.
사용자가 나중에 채우거나, 비워 둔 채로 후속 공정에 넘길 수 있습니다.

  대본: "재인, 20대 후반. 비를 흠뻑 맞은 채 들어온다."
  ✓ { label: "외형 기준", value: "비에 흠뻑 젖은 상태", open: false }
  ✓ { label: "헤어", value: "", open: true }        ← 대본에 없다
  ✗ { label: "헤어", value: "단발", open: false }   ← 지어냈다

인물마다 facts 2~3개, location 2개, environment 3~4개면 충분합니다.
한국어로 답하세요."""


async def build_scene_state(request: SceneStateRequest) -> SceneStateResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.script.strip():
        raise ValueError("script is empty")

    user_content = f"[씬] {request.heading}\n\n[대본]\n{request.script}"
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
        max_completion_tokens=3000,
    )
    return SceneStateResponse(**json.loads(response.choices[0].message.content.strip()))
