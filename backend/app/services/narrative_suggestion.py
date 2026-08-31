"""Narrative agent: answer a request about the current scene with proposals.

Proposals, not edits. The script is not touched until the creator accepts
one (DG1 P2: what the AI adds stays provisional until judged).

Four kinds, each anchored to a line so the UI can show it in place:
  split-beat          — this beat holds two phases; divide it here
  insert-script-line  — an action is missing between these lines
  replace-script-line — this line does not read as what it means to

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
                        "beat", "line_index", "original_text", "proposed_text",
                    ],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "split-beat",
                                "insert-script-line",
                                "replace-script-line",
                            ],
                        },
                        "title": {"type": "string"},
                        "reason": {"type": "string"},
                        # 이 Beat 안에서 몇 번째 줄인가 (0부터). 해당 없으면 -1.
                        "beat": {"type": "integer"},
                        "line_index": {"type": "integer"},
                        # replace일 때 원문. 아니면 빈 문자열.
                        "original_text": {"type": "string"},
                        # insert/replace일 때 제안 문장. 아니면 빈 문자열.
                        "proposed_text": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 스토리보드 작업의 서사 담당입니다.
기본 작업 범위는 사용자가 현재 보고 있는 **Scene 전체**입니다. Scene 안의 Beat들은
사건의 작은 국면이며, 요청에 가장 알맞은 Beat를 골라 제안하세요.

제안은 세 종류뿐입니다:
- split-beat: 이 Beat에 국면이 둘 이상 들어 있어 나눠야 할 때.
  line_index는 새 Beat가 시작될 줄입니다.
  **줄이 하나뿐인 Beat는 나눌 수 없습니다.** 그때는 insert로 먼저 채우세요.
- insert-script-line: 줄을 하나 더할 때. **가장 많이 쓰는 종류입니다.**
  line_index는 그 줄 **다음에** 넣는다는 뜻입니다. proposed_text에 넣을 문장을 씁니다.
  두 줄 사이를 채울 때도 쓰고, 앙상한 줄 뒤에 구체적인 행동을 붙일 때도 씁니다.
  줄이 하나뿐이어도 그 뒤에 얼마든지 더할 수 있습니다.
- replace-script-line: 어떤 줄이 의도한 대로 읽히지 않을 때.
  line_index는 바꿀 줄, original_text는 그 원문, proposed_text는 대안입니다.

**어느 Beat를 고칠지 정하세요.** beat에 그 번호를 씁니다.
- Scene 전체의 진행, 정보, 전환을 두고 하는 요청이면 Scene의 모든 Beat를 읽고
  실제로 고쳐야 할 Beat를 고르세요. 여러 Beat에 걸치면
  제안을 나눠서 각각 다른 beat로 내면 됩니다.
- 사용자가 특정 Beat를 명시적으로 짚은 경우에만 그 Beat를 우선합니다.
- line_index는 **그 beat 안에서의** 줄 번호입니다.

당신의 역할은 사용자가 요청한 지점만 함께 다듬는 협업자입니다.
원문을 완성 대본처럼 길게 쓰거나, 장면 전체를 다시 쓰지 마세요. 제안 문장은
짧고 자연스러운 화면 행동으로 쓰고, reason도 감독에게 말하듯 간결하게 쓰세요.

무엇을 붙이고 무엇을 붙이지 않는가:
  ✓ 이미 있는 상황을 화면 행동으로 구체화 — "대치한다"에서
    "B가 한 걸음 다가온다."처럼 필요한 한 행동만 제안
  ✓ 사용자가 정한 사건 사이의 빠진 연결 — 던진 카드가 어디로 갔는지
  ✓ 이미 나온 인물·소품·공간을 쓰는 행동
  ✗ 새 인물, 새 장소, 새 사건 — 사용자가 정하지 않은 이야기의 방향
  ✗ 결말을 바꾸거나 반전을 더하는 것

즉 **이야기를 만들지는 않되, 있는 이야기가 화면에서 어떻게 보일지는
채웁니다.** 사용자가 큰 틀을 정했고, 당신은 그것을 볼 수 있게 만듭니다.

지켜야 할 것:
1. 사용자의 요청에 답하세요. 요청과 무관한 제안을 하지 마세요.
2. 대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담을 수 없습니다.
   말하는 장면은 말하는 모습으로 적으세요.
3. 화면에 보이는 것만 쓰세요. 감정이나 조건은 행동으로 옮기세요.
   ✗ "A가 불안해진다"        ← 그릴 수 없음
   ✓ "A의 시선이 문 쪽으로 향한다"
4. **한 줄에는 사건 하나만.** 이 줄 하나가 그림 한 장이 됩니다.
   ✗ "손잡이를 돌려 문틈을 만든다. 복도를 확인한 뒤 몸을 낮춰 들어간다."
     ← 세 장면이 한 줄에. 그림 한 장에 못 담긴다.
   ✓ "A가 손잡이를 천천히 돌린다."   ← 한 장
   ✓ "A가 문틈으로 복도를 확인한다." ← 다음 장
   여러 동작이 필요하면 insert 제안을 여러 개 내세요.
5. 요청이 "살을 붙여달라", "채워달라", "구체적으로" 같은 것이면 insert를
   쓰세요. 한 번에 너무 많이 확장하지 말고, 보통 1~2개만 제안하세요.
6. 1~3개만 제안하세요. 확실한 것이 하나면 하나만 내세요.
7. 해당 없는 필드는 빈 문자열 또는 -1로 채우세요.

할 수 없는 요청이면 **빈 배열을 돌려주세요.** 억지로 다른 제안을 내지 마세요.
다른 Scene을 새로 만들거나 고치는 일은 여기서 할 수 없습니다. 다음은 여기서 할 수 없습니다:
- 이야기나 씬을 새로 만들어 달라는 것 (사용자가 직접 쓰거나 씬·Beat 나누기를 씁니다)
- 다른 Beat나 씬을 고쳐 달라는 것
- 대사를 써 달라는 것
엉뚱한 제안을 내면 사용자는 요청이 처리된 줄 알고 넘어가게 됩니다.

reason은 왜 이 제안을 하는지 한 문장으로, 한국어로 쓰세요."""


async def suggest_narrative(request: NarrativeSuggestionRequest) -> NarrativeSuggestionResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    lines = "\n".join(f"[{i}] {line}" for i, line in enumerate(request.beat_lines))
    scope_label = "현재 Scene 전체" if request.scope == "scene" else "지정한 Beat"
    user_content = (
        f"[요청]\n{request.narrative_request}\n\n"
        f"[작업 범위] {scope_label}\n"
        f"[현재 Scene] {request.scene_title or '제목 없음'}\n"
        f"[마지막으로 짚은 Beat] {request.active_beat}\n"
        f"[그 Beat의 줄]\n{lines}"
    )
    # scene 범위에서는 해당 Scene의 모든 Beat만 함께 넘긴다.
    if request.script_beats:
        whole = []
        for beat in request.script_beats:
            whole.append(f"Beat {beat.index}:")
            whole.extend(f"  [{i}] {line}" for i, line in enumerate(beat.lines))
        user_content += "\n\n[현재 Scene의 Beat]\n" + "\n".join(whole)
    if request.scene_intention:
        user_content += f"\n\n[장면 의도]\n{request.scene_intention}"
    if request.panel_count is not None:
        user_content += f"\n\n[이 Beat의 현재 패널 수] {request.panel_count}"

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=2000,
    )
    return NarrativeSuggestionResponse(**json.loads(response.choices[0].message.content.strip()))
