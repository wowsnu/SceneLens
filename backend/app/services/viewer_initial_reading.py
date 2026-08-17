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
                                "issue_kind",
                                "suspected_cause",
                            ],
                            "properties": {
                                "panel_orders": {"type": "array", "items": {"type": "integer"}},
                                "issue": {"type": "string"},
                                "audience_effect": {"type": "string"},
                                "issue_kind": {
                                    "type": "string",
                                    "enum": [
                                        "story_context",
                                        "element_visibility",
                                        "spatial_relation",
                                        "framing_readability",
                                        "cut_connection",
                                        "information_order",
                                    ],
                                },
                                "suspected_cause": {
                                    "type": "string",
                                    "enum": ["narrative", "mise", "camera", "editing"],
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
        "label": "처음 보는 관객",
        "instruction": (
            "You have no prior information and little assumed film-literacy. "
            "Prioritize whether you can follow who is present, what is changing, "
            "and what may happen next from visible evidence."
        ),
    },
    "film_literate": {
        "label": "영화에 익숙한 관객",
        "instruction": (
            "You are familiar with cinematic framing, repetition, omission, and "
            "visual rhythm. Treat ambiguity as potentially meaningful, but only when "
            "the panel sequence supplies visible support for it."
        ),
    },
    "context_close": {
        "label": "상황을 꼼꼼히 보는 관객",
        "instruction": (
            "Attend to whether the depicted place and the characters' situation feel "
            "legible from the panels themselves. Do not invent real-world facts or expertise; "
            "flag only what the visible situation does or does not establish."
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
                        "maxItems": 3,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "panel_orders", "shared_cues", "readings", "why_it_matters",
                                "issue_kind", "suspected_cause",
                            ],
                            "properties": {
                                "panel_orders": {"type": "array", "items": {"type": "integer"}},
                                "shared_cues": {"type": "array", "items": {"type": "string"}},
                                "readings": {
                                    "type": "array",
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
                                        "story_context", "element_visibility", "spatial_relation",
                                        "framing_readability", "cut_connection", "information_order",
                                    ],
                                },
                                "suspected_cause": {
                                    "type": "string",
                                    "enum": ["narrative", "mise", "camera", "editing"],
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

Return exactly one cumulative Initial Reading. It is one plausible reading, never a claim about real audience groups.

Follow the viewer's changing thought in strict panel order instead of writing independent panel descriptions. Never describe an earlier panel as if it happened after a later one. For every panel:
- noticed_cues: only one to three details that would actually attract attention. You do not need to catch every visible detail.
- immediate_reading: the meaning or expectation prompted at that moment, not a literal description of the image.
- feeling: a brief immediate response such as tension, doubt, curiosity, relief, or confusion, with a simple reason when useful.
- relation_to_previous: start for the first panel, then reinforced, shifted, unsettled, or new_question.
- current_hypothesis: the viewer's best current guess about what is happening after seeing this panel. Carry it forward and genuinely update it; do not reset or repeat the same sentence mechanically.
- open_question: one question that may pull the viewer into the next panel. Use an empty string if no meaningful question remains.

After the steps, summarize the final hypothesis and emotional arc. Pick the one panel that most changed the reading as the turning point. The turning_point_reason must explain how that panel changed what had been understood from earlier panels; it must not cite a later panel or reverse chronology.
Add an interpretive branch only when the visible sequence supports a genuinely different reading. Do not force one for every panel; zero to two branches is enough. State where it began, what both readings are, which became stronger or whether it remains unresolved, and the visible basis.
Unresolved questions must contain only matters the supplied pixels leave open.
Add a review_point only when comprehension or emotional flow may actually suffer. A missed minor detail is not automatically a problem. Each review point names the affected panel numbers, the possible audience effect, an issue_kind, and one suspected_cause. Zero review points is valid.
Use issue_kind exactly as follows: story_context for identity, relationship, goal, or causal meaning that the visible sequence cannot establish; element_visibility for a needed person, object, or action that is hard to identify; spatial_relation for blocking, position, gesture, prop placement, or spatial relation; framing_readability for scale, crop, viewpoint, focus, or visual emphasis; cut_connection for an unclear relation across two or more panels; information_order for information revealed too early, too late, or in a confusing order.
Use suspected_cause for the most direct source: narrative, mise, camera, or editing. It is only a hypothesis and will be checked by a routing rule; do not choose more than one.

Look at each panel before writing about it. Work through it in this order: who or what is in frame and where they stand relative to each other; which way each face and body is turned and where the eyes look; what the hands are doing and what they hold or touch; how much of the subject the frame includes and from what height; what the space and light tell you. Ground every cue you cite in one of these. If something is drawn too roughly to identify, say it is unclear rather than guessing a specific object or expression — a rough storyboard leaves much undrawn, and treating a blank face as an emotion is the most common mistake.

Adjacent panels do not by themselves prove cause and effect. When a location, composition, or subject changes, keep the connection as a possibility or an open question unless a visible action establishes it.
One still panel establishes appearance and position more reliably than motion. Do not say that a person, train, or object is moving, attacking, or causing an event unless pose, motion blur, or the ordered sequence visibly supports that action.
Do not invent off-screen facts, screenplay events, creator goals, correctness scores, demographics, or audience percentages. Avoid academic language and repeated hedging. Write emotional_arc as one natural sentence, not a numbered chart. Keep every field compact: summary at most two short sentences, each step field one short sentence, and lists short enough that all panels fit."""

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


def _normalize_reading(initial: dict, panel_count: int) -> None:

    # Keep the current Viewer UI useful until it is migrated to the cumulative
    # fields. This adapter does not send any creator context to the model.
    for step in initial["steps"]:
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

Return one short common_reading only if the records actually share a flow. Then return zero to three divergences only where the conditions reach meaningfully different interpretations at a panel or adjacent panel range. Each readings item must use the matching condition_id and its differing reading in plain language. shared_cues must quote only short visible-cue phrases already present in the records. why_it_matters explains what decision the creator may need to consider, not what they should choose.

Use issue_kind and suspected_cause only to classify where to inspect the difference: story_context for identity/goal/causal meaning; element_visibility for hard-to-identify visible elements; spatial_relation for blocking/props/position; framing_readability for framing or emphasis; cut_connection for an unclear relation across panels; information_order for confusing reveal order. Do not create a divergence when the records merely use different wording.

Here are the independent records:\n""" + json.dumps(records, ensure_ascii=False)
    response = await client.chat.completions.create(
        # 이쪽은 이미 쓰인 기록을 비교하는 텍스트 작업이라 그림을 보지 않는다.
        # 다만 지적을 뭉뚱그리지 않고 컷별로 갈라내야 해서 nano로는 얕았다.
        model=os.getenv("VIEWER_COMPARISON_MODEL", "gpt-5.4-mini"),
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
