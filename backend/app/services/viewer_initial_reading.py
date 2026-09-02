"""One intention-blind sequential reading of storyboard panels."""

import asyncio
import json
import os

from openai import AsyncOpenAI

from app.models.schemas import ViewerInitialReadingRequest, ViewerInitialReadingResponse


RESPONSE_SCHEMA = {
    "name": "viewer_initial_reading",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["initial_reading"],
        "properties": {
            "initial_reading": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "title",
                    "summary",
                    "final_hypothesis",
                    "emotional_arc",
                    "turning_point_panel_order",
                    "turning_point_reason",
                    "steps",
                    "interpretive_branches",
                    "unresolved_questions",
                    "engagement_signals",
                    "recall",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "final_hypothesis": {"type": "string"},
                    "emotional_arc": {"type": "string"},
                    "turning_point_panel_order": {"type": "integer"},
                    "turning_point_reason": {"type": "string"},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "panel_order",
                                "noticed_cues",
                                "immediate_reading",
                                "feeling",
                                "relation_to_previous",
                                "current_hypothesis",
                                "open_question",
                            ],
                            "properties": {
                                "panel_order": {"type": "integer"},
                                "noticed_cues": {"type": "array", "items": {"type": "string"}},
                                "immediate_reading": {"type": "string"},
                                "feeling": {"type": "string"},
                                "relation_to_previous": {
                                    "type": "string",
                                    "enum": ["start", "reinforced", "shifted", "unsettled", "new_question"],
                                },
                                "current_hypothesis": {"type": "string"},
                                "open_question": {"type": "string"},
                            },
                        },
                    },
                    "interpretive_branches": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["starts_at_panel", "main_reading", "alternative_reading", "status", "visible_basis"],
                            "properties": {
                                "starts_at_panel": {"type": "integer"},
                                "main_reading": {"type": "string"},
                                "alternative_reading": {"type": "string"},
                                "status": {
                                    "type": "string",
                                    "enum": ["main_strengthened", "alternative_strengthened", "unresolved"],
                                },
                                "visible_basis": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                    "unresolved_questions": {"type": "array", "items": {"type": "string"}},
                    "engagement_signals": {
                        "type": "array",
                        "maxItems": 4,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "panel_orders",
                                "action",
                                "reason",
                                "story_pull",
                            ],
                            "properties": {
                                "panel_orders": {"type": "array", "items": {"type": "integer"}},
                                "action": {
                                    "type": "string",
                                    "enum": [
                                        "continue",
                                        "pause",
                                        "recheck",
                                        "push_through",
                                        "exit_risk",
                                    ],
                                },
                                "reason": {"type": "string"},
                                "story_pull": {"type": "string"},
                            },
                        },
                    },
                    "recall": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "remembered_event",
                            "remembered_clues",
                            "remaining_question",
                        ],
                        "properties": {
                            "remembered_event": {"type": "string"},
                            "remembered_clues": {
                                "type": "array",
                                "maxItems": 3,
                                "items": {"type": "string"},
                            },
                            "remaining_question": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


READING_CONDITIONS = {
    "first_viewer": {
        "label": "처음 보는 시청자",
        "instruction": (
            "Follow the panels once from beginning to end as a first-time viewer. Prioritize who "
            "is present, what is happening, what changes, and what may happen next from visible "
            "evidence. Lead with that plain understanding; mention framing or shot rhythm only "
            "when it changes what you can understand."
        ),
    },
    "film_literate": {
        "label": "연출 방식에 주목",
        "instruction": (
            "Make a directing-focused viewing trace. Prioritize visible framing, scale, angle, "
            "blocking, repetition, omission, contrast, shot relations, and visual rhythm. In "
            "each immediate_reading and current_hypothesis, explain the expectation or emphasis "
            "created by the most relevant visible choice, rather than retelling the plot. "
            "Treat ambiguity as potentially meaningful, but only when the panel sequence "
            "supplies visible support for it."
        ),
    },
    # Keep the existing key so saved Viewer results remain selectable in the UI.
    "context_close": {
        "label": "컷 연결에 주목",
        "instruction": (
            "Make a cut-to-cut viewing trace. From panel two onward, prioritize what the next "
            "cut carries forward, changes, withholds, or newly reveals: position, gaze, object, "
            "action, time, place, and information. In each immediate_reading and "
            "current_hypothesis, lead with that connection to the previous panel instead of "
            "describing the panel alone. Adjacency alone is not evidence of causality; when an "
            "event or information bridge is missing, keep the connection open instead of inventing it."
        ),
    },
}


async def _read_condition(
    client: AsyncOpenAI,
    request: ViewerInitialReadingRequest,
    condition_id: str,
    condition: dict,
) -> dict:
    """Read only panel pixels in supplied order; creator intent is unavailable here."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    prompt = f"""You are seeing storyboard panels for the first time. Read them in the supplied order and write plain, conversational Korean.
You do not know the creator's intent, script, shot labels, CIR, or production notes. Do not infer them from metadata.

The response is shown directly to a creator. Use everyday Korean for an adult collaborator: clear but not childish. Start from what is visible, then say what it makes you think or feel. Avoid academic or critic-like expressions such as "narrative function," "visual hierarchy," "spatial dynamics," or "interpretive ambiguity." If a film term is truly useful, explain it in ordinary words instead. Keep each sentence focused on one thought.

Your viewing stance is: {condition['label']}.
{condition['instruction']}
This is not a real demographic claim or a real person's voice. It describes one plausible, intention-blind point of view.

Return exactly one cumulative Initial Reading. It is one plausible first viewing, never a claim about actual audience groups.

Follow the viewer's changing thought in strict panel order instead of writing independent panel descriptions. Never describe an earlier panel as if it happened after a later one. For every panel:
- noticed_cues: only one to three details that would actually attract attention. You do not need to catch every visible detail.
- immediate_reading: the meaning or expectation prompted at that moment, not a literal description of the image. HARD LIMIT: one sentence, at most 45 Korean characters. It is shown in a narrow fixed-size cell beside the other panels, so a longer line is cut off mid-word and the reading is lost. Cut qualifiers and second clauses rather than running over; say the one thing that matters most at this panel.
- feeling: a brief immediate response such as tension, doubt, curiosity, relief, or confusion. HARD LIMIT: at most 20 Korean characters, and it must not repeat what immediate_reading already said. A bare feeling word with a two- or three-word reason is enough.
- relation_to_previous: start for the first panel, then reinforced, shifted, unsettled, or new_question.
- current_hypothesis: the viewer's best current guess about what is happening after seeing this panel. Carry it forward and genuinely update it; do not reset or repeat the same sentence mechanically.
- open_question: one question that may pull the viewer into the next panel. Use an empty string if no meaningful question remains.
  Ask only what THIS reading still leaves open. Never re-ask something an earlier panel already answered — if panel 2 showed why the figure appeared, panel 5 must not ask "why did it appear?" A viewer who forgets what they already saw is not reading sequentially, and the creator reads such a question as the tool not having watched their own scene. Before writing it, check what the earlier panels established and ask about what comes NEXT instead. Repeating a settled question is worse than an empty string.

After the steps, summarize the final hypothesis and emotional arc. Pick the one panel that most changed the reading as the turning point. The turning_point_reason must explain how that panel changed what had been understood from earlier panels; it must not cite a later panel or reverse chronology.
Add an interpretive branch only when the visible sequence supports a genuinely different reading. Do not force one for every panel; zero to two branches is enough. State where it began, what both readings are, which became stronger or whether it remains unresolved, and the visible basis.
Unresolved questions must contain only matters the supplied pixels leave open.
After completing the sequence, add only the few moments where viewing behavior meaningfully changes as engagement_signals; zero to four is enough. This is a viewing trace, not criticism. Do not diagnose a directing problem, classify a production cause, or suggest an edit.
- continue: a new, specific question or expectation makes the viewer want the next panel immediately. Do not add this mechanically for every panel.
- pause: the viewer momentarily stops to absorb, feel, or reconsider something.
- recheck: new visible information makes an earlier panel worth checking again. Include the earlier and current panel numbers when both are identifiable.
- push_through: the connection is not understood, but an existing question or momentum still carries the viewer forward.
- exit_risk: no concrete question, expectation, or emotional concern remains to pull the viewer forward. This is not a claim that a real person would leave and never a percentage.
For each signal, reason states the immediate viewing experience in one short Korean sentence. story_pull states the concrete unresolved question, expectation, or concern that carries attention forward; use an empty string when none remains. Never use words such as mise-en-scene, camera, editing, framing, fix, improve, add, remove, move, or change in these fields.

Finally write recall as only what the sequential trace cannot show by itself: what remains after reaching the end, without creator intent. Do not turn recall into a complete recap and do not inspect every panel again as a checklist. remembered_event is the one main event that remains from the sequence as currently understood. remembered_clues contains only up to three concrete visible details still available after the sequence. remaining_question is the one question most likely to carry into what follows, or an empty string. Do not restate the character goal, final hypothesis, emotional arc, or turning point here; those already exist in the sequential reading. Recall must not judge correctness or recommend a change.

Look at each panel before writing about it. Work through it in this order: who or what is in frame and where they stand relative to each other; which way each face and body is turned and where the eyes look; what the hands are doing and what they hold or touch; how much of the subject the frame includes and from what height; what the space and light tell you. Ground every cue you cite in one of these. If something is drawn too roughly to identify, say it is unclear rather than guessing a specific object or expression — a rough storyboard leaves much undrawn, and treating a blank face as an emotion is the most common mistake.

Adjacent panels do not by themselves prove cause and effect. When a location, composition, or subject changes, keep the connection as a possibility or an open question unless a visible action establishes it.
One still panel establishes appearance and position more reliably than motion. Do not say that a person, train, or object is moving, attacking, or causing an event unless pose, motion blur, or the ordered sequence visibly supports that action.
Do not invent off-screen facts, screenplay events, creator goals, correctness scores, demographics, or audience percentages. Avoid academic language and repeated hedging. Write emotional_arc as one natural sentence, not a numbered chart. Keep every field compact: summary at most two short sentences, each step field one short sentence, and lists short enough that all panels fit.

LENGTH IS A HARD REQUIREMENT, NOT A PREFERENCE. The step fields are rendered side by side in fixed-width cells, one per panel, so text that runs long is visually truncated and the creator loses the reading. Before returning, check each step: immediate_reading at most 45 Korean characters, feeling at most 20, current_hypothesis at most 50, open_question at most 40. If a line is over, rewrite it shorter — do not simply trim the tail, which leaves a dangling clause. Prefer one concrete observation over a complete-sounding sentence."""

    content = [{"type": "text", "text": prompt}]
    for order, panel in enumerate(request.panels, start=1):
        image_url = panel.image if panel.image.startswith("data:") else f"data:image/png;base64,{panel.image}"
        content.extend([
            {"type": "text", "text": f"[Panel {order}]"},
            {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}},
        ])

    response = await client.chat.completions.create(
        # 관객 읽기는 그림에서 직접 읽어야 하는 일이다 — 대본도 샷 라벨도
        # 주지 않으므로 픽셀이 유일한 근거다. nano로는 자세·시선·소품을
        # 자주 놓쳐 "그림을 잘 못 본다"는 인상을 줬다.
        #
        # 연출 렌즈가 같은 이유로 mini → gpt-5.4로 올린 전례가 있다
        # (directing_review.DEFAULT_LENS_MODELS의 미장센 주석).
        model=os.getenv("VIEWER_READING_MODEL", "gpt-5.4"),
        messages=[{"role": "user", "content": content}],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        max_completion_tokens=5000,
    )
    return json.loads(response.choices[0].message.content.strip())["initial_reading"]


# 트랙의 칸은 폭이 고정이라, 길어진 문장은 화면에서 잘려 읽히지 않는다.
# 프롬프트에서 글자 수를 못 박았지만 그것은 요청이지 보장이 아니므로,
# 넘친 것은 여기서 자른다.
#
# 문장 부호에서 끊는다. 글자 수로만 자르면 말이 중간에 끊겨 무슨 뜻인지
# 알 수 없게 된다 — 잘린 티가 나는 편이 낫다.
STEP_FIELD_LIMITS = {
    "immediate_reading": 45,
    "feeling": 20,
    "current_hypothesis": 50,
    "open_question": 40,
}


def _shorten(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    # 한도 안의 마지막 문장 경계에서 끊는다.
    head = text[:limit]
    for mark in (". ", "다. ", "? ", "! ", ", "):
        cut = head.rfind(mark)
        if cut > limit * 0.5:
            return head[: cut + len(mark)].strip()
    # 문장 경계가 없으면 어절 경계에서.
    cut = head.rfind(" ")
    if cut > limit * 0.5:
        return head[:cut].rstrip() + "…"
    return head.rstrip() + "…"


def _normalize_reading(initial: dict, panel_count: int) -> None:

    # Keep the current Viewer UI useful until it is migrated to the cumulative
    # fields. This adapter does not send any creator context to the model.
    for step in initial["steps"]:
        for field, limit in STEP_FIELD_LIMITS.items():
            if field in step:
                step[field] = _shorten(step[field], limit)
        step["visible_cues"] = step["noticed_cues"]
        step["possible_interpretations"] = [
            step["immediate_reading"],
            step["current_hypothesis"],
        ]
        step["inferred_assumptions"] = [step["open_question"]] if step["open_question"] else []

    initial["visible_cues"] = [
        cue
        for step in initial["steps"]
        for cue in step["noticed_cues"][:1]
    ][:3]
    initial["inferred_assumptions"] = initial["unresolved_questions"]
    # Engagement signals refer only to viewed positions. They never expand a
    # range or route to a production lens: that diagnosis belongs downstream.
    valid_signals = []
    for signal in initial["engagement_signals"]:
        signal["panel_orders"] = sorted({
            order for order in signal["panel_orders"] if 1 <= order <= panel_count
        })
        if signal["panel_orders"]:
            valid_signals.append(signal)
    initial["engagement_signals"] = valid_signals

    # Temporary view compatibility. Engagement evidence itself is intentionally
    # not converted into a mise/camera/editing recommendation.
    initial["routes"] = []


async def read_initially(request: ViewerInitialReadingRequest) -> ViewerInitialReadingResponse:
    """Create independent condition readings, then compare their reading traces."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    condition_definitions = {**READING_CONDITIONS}
    for custom in request.custom_conditions:
        if custom.id in condition_definitions:
            raise ValueError("A custom reading condition cannot replace a built-in condition")
        condition_definitions[custom.id] = {
            "label": custom.label,
            "instruction": (
                "Attend to the following user-specified aspect of the visible evidence: "
                f"{custom.instruction}. This is an attention instruction only, not story context or creator intent."
            ),
        }
    condition_ids = list(dict.fromkeys([
        *request.reading_conditions,
        *(custom.id for custom in request.custom_conditions),
    ])) or ["first_viewer"]
    if len(condition_ids) > 3:
        raise ValueError("Viewer reflection supports at most three independent reading conditions")
    client = AsyncOpenAI(api_key=api_key)
    raw_readings = await asyncio.gather(
        *[
            _read_condition(client, request, condition_id, condition_definitions[condition_id])
            for condition_id in condition_ids
        ],
    )
    readings = []
    for condition_id, reading in zip(condition_ids, raw_readings):
        _normalize_reading(reading, len(request.panels))
        readings.append({"condition_id": condition_id, "reading": reading})

    # 관객끼리 읽기가 갈렸는지는 더 이상 보지 않는다. 갈림은 그 자체로
    # 고칠 것이 아니었고, 감독이 노린 것이 닿았는지는 `viewer_intent_check`가
    # 컷 목적과 대조해 판정한다. 대조 호출 하나가 통째로 줄었다.
    return ViewerInitialReadingResponse(
        initial_reading=readings[0]["reading"],
        readings=readings,
    )
