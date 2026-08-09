"""Narrative agent: answer a request about the current beat with proposals.

Proposals, not edits. The script is not touched until the creator accepts
one (DG1 P2: what the AI adds stays provisional until judged).

Four kinds, each anchored to a line so the UI can show it in place:
  split-beat          — this beat holds two phases; divide it here
  insert-script-line  — an action is missing between these lines
  replace-script-line — this line does not read as what it means to
  panel-count         — this beat needs more panels than it has

The model does not write dialogue and does not invent events the creator
did not write. It works with what the beat already contains.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import NarrativeSuggestionRequest, NarrativeSuggestionResponse


RESPONSE_SCHEMA = {
    "name": "narrative_suggestions",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["suggestions"],
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "type", "title", "reason",
                        "line_index", "original_text", "proposed_text", "target_count",
                    ],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "split-beat",
                                "insert-script-line",
                                "replace-script-line",
                                "panel-count",
                            ],
                        },
                        "title": {"type": "string"},
                        "reason": {"type": "string"},
                        # 이 Beat 안에서 몇 번째 줄인가 (0부터). 해당 없으면 -1.
                        "line_index": {"type": "integer"},
                        # replace일 때 원문. 아니면 빈 문자열.
                        "original_text": {"type": "string"},
                        # insert/replace일 때 제안 문장. 아니면 빈 문자열.
                        "proposed_text": {"type": "string"},
                        # panel-count일 때 목표 패널 수. 아니면 -1.
                        "target_count": {"type": "integer"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 스토리보드 작업의 서사 담당입니다.
사용자가 지금 보고 있는 Beat에 대해 요청을 했습니다. 그 요청에 답하는 제안을 만드세요.

제안은 네 종류뿐입니다:
- split-beat: 이 Beat에 국면이 둘 이상 들어 있어 나눠야 할 때.
  line_index는 새 Beat가 시작될 줄입니다.
- insert-script-line: 두 줄 사이에 빠진 행동이 있을 때.
  line_index는 그 줄 다음에 넣는다는 뜻입니다. proposed_text에 넣을 문장을 씁니다.
- replace-script-line: 어떤 줄이 의도한 대로 읽히지 않을 때.
  line_index는 바꿀 줄, original_text는 그 원문, proposed_text는 대안입니다.
- panel-count: 이 Beat의 사건 수에 비해 패널이 모자랄 때.
  target_count에 필요한 패널 수를 씁니다.

지켜야 할 것:
1. 사용자의 요청에 답하세요. 요청과 무관한 제안을 하지 마세요.
2. 대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담을 수 없습니다.
   말하는 장면은 말하는 모습으로 적으세요.
3. 없는 사건을 지어내지 마세요. insert는 이미 있는 두 행동 사이에서 빠진
   연결을 채우는 것이지, 새 사건을 더하는 것이 아닙니다.
4. 화면에 보이는 것만 쓰세요. 감정이나 조건은 행동으로 옮기세요.
   ✗ "재인이 불안해진다"        ← 그릴 수 없음
   ✓ "재인의 시선이 문 쪽으로 향한다"
5. 1~3개만 제안하세요. 확실한 것이 하나면 하나만 내세요.
6. 해당 없는 필드는 빈 문자열 또는 -1로 채우세요.

reason은 왜 이 제안을 하는지 한 문장으로, 한국어로 쓰세요."""


async def suggest_narrative(request: NarrativeSuggestionRequest) -> NarrativeSuggestionResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    lines = "\n".join(f"[{i}] {line}" for i, line in enumerate(request.beat_lines))
    user_content = f"[요청]\n{request.narrative_request}\n\n[지금 Beat의 줄]\n{lines}"
    if request.scene_intention:
        user_content += f"\n\n[장면 의도]\n{request.scene_intention}"
    if request.panel_count is not None:
        user_content += f"\n\n[이 Beat의 현재 패널 수] {request.panel_count}"

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
    return NarrativeSuggestionResponse(**json.loads(response.choices[0].message.content.strip()))
