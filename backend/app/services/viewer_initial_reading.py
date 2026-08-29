"""One intention-blind sequential reading of storyboard panels."""

import asyncio
import json
import os

from openai import AsyncOpenAI

from app.models.schemas import ViewerInitialReadingRequest, ViewerInitialReadingResponse
from app.services.viewer_routing_rules import (
    normalize_viewer_panel_orders,
    resolve_viewer_route,
)


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
                    "review_points",
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
                    "review_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "panel_orders",
                                "issue",
                                "audience_effect",
                                "recommended_change",
                                "issue_kind",
                                "suspected_cause",
                            ],
                            "properties": {
                                "panel_orders": {"type": "array", "items": {"type": "integer"}},
                                "issue": {"type": "string"},
                                "audience_effect": {"type": "string"},
                                "recommended_change": {"type": "string"},
                                "issue_kind": {
                                    "type": "string",
                                    "enum": [
                                        "element_visibility",
                                        "spatial_relation",
                                        "framing_readability",
                                        "cut_connection",
                                        "information_order",
                                    ],
                                },
                                "suspected_cause": {
                                    "type": "string",
                                    "enum": ["mise", "camera", "editing"],
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}


READING_CONDITIONS = {
    "first_viewer": {
        "label": "화면만으로 읽기",
        "instruction": (
            "Make a basic viewing trace. Prioritize whether visible evidence establishes who is "
            "present, what is happening, what changes, and what may happen next. In each field, "
            "lead with that plain understanding. Do not foreground framing, repetition, or shot "
            "rhythm unless it prevents this basic understanding."
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


COMPARISON_SCHEMA = {
    "name": "viewer_perspective_comparison",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["comparison"],
        "properties": {
            "comparison": {
                "type": "object",
                "additionalProperties": False,
                "required": ["common_reading", "divergences"],
                "properties": {
                    "common_reading": {"type": "string"},
                    "divergences": {
                        "type": "array",
                        # 갈림은 예외적인 검토 지점이다. 세 개를 허용하면
                        # 비교 모델이 조건별 표현 차이까지 문제처럼 늘어놓는
                        # 경향이 있어, 정말 중요한 두 지점까지만 받는다.
                        "maxItems": 2,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "panel_orders", "shared_cues", "readings", "why_it_matters",
                                "issue_kind", "suspected_cause",
                            ],
                            "properties": {
                                "panel_orders": {"type": "array", "items": {"type": "integer"}},
                                "shared_cues": {
                                    "type": "array", "minItems": 1, "maxItems": 2,
                                    "items": {"type": "string"},
                                },
                                "readings": {
                                    "type": "array",
                                    "minItems": 2,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "required": ["condition_id", "reading"],
                                        "properties": {
                                            "condition_id": {"type": "string"},
                                            "reading": {"type": "string"},
                                        },
                                    },
                                },
                                "why_it_matters": {"type": "string"},
                                "issue_kind": {
                                    "type": "string",
                                    "enum": [
                                        "element_visibility", "spatial_relation",
                                        "framing_readability", "cut_connection", "information_order",
                                    ],
                                },
                                "suspected_cause": {
                                    "type": "string",
                                    "enum": ["mise", "camera", "editing"],
                                },
                            },
                        },
                    },
                },
            },
        },
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

Your reading condition is: {condition['label']}.
{condition['instruction']}
This condition is not a real demographic claim or a real person's voice. It only sets what you attend to while reading.
The conditions may attend to different aspects of the same panels: basic on-screen understanding, screen construction, or cut connection. That difference in attention is expected; do not manufacture a different story meaning, emotion, or conclusion just to make the traces distinct.

Return exactly one cumulative Initial Reading. It is one plausible reading, never a claim about real audience groups.

Follow the viewer's changing thought in strict panel order instead of writing independent panel descriptions. Never describe an earlier panel as if it happened after a later one. For every panel:
- noticed_cues: only one to three details that would actually attract attention. You do not need to catch every visible detail.
- immediate_reading: the meaning or expectation prompted at that moment, not a literal description of the image. HARD LIMIT: one sentence, at most 45 Korean characters. It is shown in a narrow fixed-size cell beside the other panels, so a longer line is cut off mid-word and the reading is lost. Cut qualifiers and second clauses rather than running over; say the one thing that matters most at this panel.
- feeling: a brief immediate response such as tension, doubt, curiosity, relief, or confusion. HARD LIMIT: at most 20 Korean characters, and it must not repeat what immediate_reading already said. A bare feeling word with a two- or three-word reason is enough.
- relation_to_previous: start for the first panel, then reinforced, shifted, unsettled, or new_question.
- current_hypothesis: the viewer's best current guess about what is happening after seeing this panel. Carry it forward and genuinely update it; do not reset or repeat the same sentence mechanically.
- open_question: one question that may pull the viewer into the next panel. Use an empty string if no meaningful question remains.

After the steps, summarize the final hypothesis and emotional arc. Pick the one panel that most changed the reading as the turning point. The turning_point_reason must explain how that panel changed what had been understood from earlier panels; it must not cite a later panel or reverse chronology.
Add an interpretive branch only when the visible sequence supports a genuinely different reading. Do not force one for every panel; zero to two branches is enough. State where it began, what both readings are, which became stronger or whether it remains unresolved, and the visible basis.
Unresolved questions must contain only matters the supplied pixels leave open.
Add a review_point only when comprehension or emotional flow may actually suffer and it can be inspected through mise, camera, or editing. A missed minor detail is not automatically a problem. If identity, relationship, goal, or causal meaning is unavailable from the panels, leave it as an open_question instead of making it a review point. Each review point names the affected panel numbers, the possible effect, one recommended_change, an issue_kind, and one suspected_cause. recommended_change must be one short, concrete Korean instruction that tells the creator what to change in the named panels. For editing, say what should be shown earlier, moved earlier, or made continuous; never give abstract labels such as "improve pacing." Zero review points is valid.
Use issue_kind exactly as follows: element_visibility for a needed person, object, or action that is hard to identify; spatial_relation for blocking, position, gesture, prop placement, or spatial relation; framing_readability for scale, crop, viewpoint, focus, or visual emphasis; cut_connection for an unclear relation across two or more panels; information_order for information revealed too early, too late, or in a confusing order.
Use suspected_cause for the most direct source: mise, camera, or editing. It is only a hypothesis and will be checked by a routing rule; do not choose more than one.

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
    for point in initial["review_points"]:
        point["panel_orders"] = normalize_viewer_panel_orders(
            point["panel_orders"],
            point["issue_kind"],
            panel_count,
        )
        routes, scope, route_reason = resolve_viewer_route(
            point["issue_kind"],
            point["suspected_cause"],
            point["panel_orders"],
        )
        point["routes"] = routes
        point["scope"] = scope
        point["route_reason"] = route_reason

    initial["routes"] = list(dict.fromkeys(
        route
        for point in initial["review_points"]
        for route in point["routes"]
    ))[:2]


async def _compare_readings(
    client: AsyncOpenAI,
    readings: list[dict],
    condition_definitions: dict[str, dict],
) -> dict:
    records = [
        {
            "condition_id": item["condition_id"],
            "condition": condition_definitions[item["condition_id"]]["label"],
            "summary": item["reading"]["summary"],
            "steps": [
                {
                    "panel_order": step["panel_order"],
                    "noticed_cues": step["noticed_cues"],
                    "immediate_reading": step["immediate_reading"],
                    "current_hypothesis": step["current_hypothesis"],
                }
                for step in item["reading"]["steps"]
            ],
        }
        for item in readings
    ]
    prompt = """Compare independent, intention-blind storyboard reading records written by different reading conditions. Write Korean in short, everyday sentences for a creator. Do not use academic, critic-like, or demographic language. Say what was seen and how it led to a different reading, rather than naming an abstract analytical concept.
Do not invent a real audience consensus, demographic fact, screenplay fact, or creator intention. Do not declare a difference a flaw just because the readings differ.

Return one short common_reading only if the records actually share a flow. **The default result is no divergences.** Return at most two divergences, and only after every rule below is satisfied. Divergence ranges must not overlap: one panel or cut connection gets at most one divergence. Order them from the most consequential difference to the least. Each readings item must use the matching condition_id and its differing reading in plain language, at most 60 Korean characters — it is shown in a narrow side panel, so a longer line is cut off. shared_cues must quote one or two short visible-cue phrases already present in the records. why_it_matters explains the concrete decision fork the creator may need to consider, not what they should choose.

A divergence is **not** a difference in interpretation, emphasis, emotion, prediction, or attention. Those differences are expected because the records were deliberately written under different conditions. The default result is therefore an empty divergences list.

Create a divergence only for a concrete, visually checkable contradiction that could make the storyboard communicate two incompatible *facts*: who or what is shown, where it is positioned or facing, what action is visibly happening, whether two adjacent cuts visibly establish a connection, or whether a specific piece of information has appeared. Both records must make opposing, committed claims about the same fact and quote the same visible cue or cut connection. A condition merely omitting a cue, using weaker language, leaving a possibility open, or discussing a different aspect is never a contradiction.

Before creating one, apply this counterfactual: if the condition labels were removed, would a creator still see an explicit factual conflict that must be resolved in the panels? If not, return no divergence. In particular, do NOT create one for different wording, detail level, emotional vocabulary, confidence, tone, one condition mentioning framing while another describes plot, or even competing story interpretations such as “discovery” versus “alarm.” Those are plausible readings, not a failure to flag. Do NOT create one because identity, goal, or causal meaning is unavailable from the panels; leave that uncertainty in the reading records. Only after this threshold is met, use issue_kind and suspected_cause to classify the directly inspectable source: element_visibility for hard-to-identify visible elements; spatial_relation for blocking/props/position; framing_readability for framing or emphasis; cut_connection for an unclear relation across panels; information_order for information visibly revealed too early, too late, or inconsistently.

Here are the independent records:\n""" + json.dumps(records, ensure_ascii=False)
    response = await client.chat.completions.create(
        # 이쪽은 이미 쓰인 기록을 비교하는 텍스트 작업이라 그림을 보지 않는다.
        # 다만 작은 모델은 조건별 **초점 차이**를 해석 갈림으로 과잉 분류했다.
        # 독립된 읽기가 정말 양립 불가능한지 가리는 판단이므로 읽기와 같은
        # 기본 모델을 쓴다. 비용을 우선하는 실험에서는 환경 변수로 내릴 수 있다.
        model=os.getenv("VIEWER_COMPARISON_MODEL", "gpt-5.4"),
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_schema", "json_schema": COMPARISON_SCHEMA},
        max_completion_tokens=2200,
    )
    return json.loads(response.choices[0].message.content.strip())["comparison"]


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

    comparison = None
    if len(readings) > 1:
        comparison = await _compare_readings(client, readings, condition_definitions)
        for divergence in comparison["divergences"]:
            divergence["panel_orders"] = normalize_viewer_panel_orders(
                divergence["panel_orders"],
                divergence["issue_kind"],
                len(request.panels),
            )
            routes, scope, route_reason = resolve_viewer_route(
                divergence["issue_kind"],
                divergence["suspected_cause"],
                divergence["panel_orders"],
            )
            divergence["routes"] = routes
            divergence["scope"] = scope
            divergence["route_reason"] = route_reason

    return ViewerInitialReadingResponse(
        initial_reading=readings[0]["reading"],
        readings=readings,
        comparison=comparison,
    )
