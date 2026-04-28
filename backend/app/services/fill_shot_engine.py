"""
fill_shot_engine.py

Two-stage pipeline for AI-assisted fill shot generation:
  Stage 1 — Planning (gemini-2.5-flash + Film Theory Library cache)
             Analyzes context and proposes shot candidates with theory-grounded rationale.
  Stage 2 — Rendering (gpt-image-1.5 via image_generator.reframe_sketch)
             Renders each candidate as a storyboard sketch, using the left shot as visual reference.
"""

import asyncio
import base64
import json
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from google.genai import types

from app.models.schemas import (
    FillShotCandidate, GapFillRequest, GapFillResponse,
    AutoFillRangeRequest, AutoFillRangeResponse, AutoFillVersion,
    CIR, SequenceShot,
)
from app.services.strategy_engine import get_client, warmup_theory_cache
from app.services.image_generator import reframe_sketch

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

with open(PROMPTS_DIR / "gap_fill.txt", "r") as f:
    GAP_FILL_PROMPT_TEMPLATE = f.read()

with open(PROMPTS_DIR / "auto_fill_range.txt", "r") as f:
    AUTO_FILL_PROMPT_TEMPLATE = f.read()


# ── Helpers ────────────────────────────────────────────────────────────────

def _shot_summary(shot: SequenceShot) -> str:
    """Compact text description of a shot for the planning prompt."""
    cir_str = ""
    if shot.cir:
        cir_str = (
            f"  CIR: {shot.cir.shotSize} / {shot.cir.horizontalAngle} / "
            f"{shot.cir.verticalLevel} / {shot.cir.viewpointFraming} / "
            f"motion={shot.cir.motionHint}"
        )
    return f"[Shot: {shot.label}]\n{cir_str}"


def _parse_cir(raw: dict) -> CIR:
    return CIR(
        shotSize=raw.get("shotSize", "Medium"),
        horizontalAngle=raw.get("horizontalAngle", "Frontal"),
        verticalLevel=raw.get("verticalLevel", "Eye"),
        viewpointFraming=raw.get("viewpointFraming", "Objective"),
        occlusion=raw.get("occlusion", "None"),
        depth=raw.get("depth"),
        motionHint=raw.get("motionHint", "Static"),
    )


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


async def _call_gemini_with_cache(contents: list) -> str:
    """Call gemini-2.5-flash with the Film Theory Library context cache. Returns response text."""
    cache_name = warmup_theory_cache()
    client = get_client()

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    cached_content=cache_name
                ) if cache_name else None,
            )
            return response.text
        except Exception as e:
            err = str(e)
            if "503" in err or "UNAVAILABLE" in err or "overloaded" in err.lower():
                wait = (attempt + 1) * 4
                logger.warning(f"[FillShot] Gemini 503, retry {attempt+1}/3 in {wait}s")
                await asyncio.sleep(wait)
            else:
                raise

    raise RuntimeError("Gemini unavailable after 3 retries")


def _image_part(shot: SequenceShot) -> Optional[types.Part]:
    """Convert a SequenceShot's image field into a Gemini Part, or None."""
    if not shot.image:
        return None
    b64 = shot.image
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64)
        return types.Part.from_bytes(data=data, mime_type="image/png")
    except Exception:
        return None


async def _render_candidate(
    candidate_plan: dict,
    reference_shot: SequenceShot,
    script_context: str,
    intent: str,
) -> FillShotCandidate:
    """
    Stage 2: render a planned candidate as a storyboard sketch.
    Uses reframe_sketch with gpt-image-1.5, referencing the left shot image.
    If no reference image exists, falls back to a placeholder base64.
    """
    cir = _parse_cir(candidate_plan.get("cir", {}))
    label = candidate_plan.get("label", "Fill Shot")
    rationale = candidate_plan.get("rationale", "")
    theory_source = candidate_plan.get("theory_source", "")
    flow_connection = candidate_plan.get("flow_connection", "")
    category = candidate_plan.get("category", "insert")
    cid = candidate_plan.get("id") or f"fill-{uuid.uuid4().hex[:8]}"

    # Build a clear image-generation intent from the candidate metadata
    render_intent = (
        f"{label}. {rationale} {flow_connection}"
    ).strip()
    strategy_context = f"[Fill shot — {category}] {theory_source}"

    ref_image = reference_shot.image if reference_shot else None

    if ref_image:
        try:
            original_cir = reference_shot.cir.model_dump() if reference_shot.cir else None
            if original_cir and cir.model_dump() == original_cir:
                original_cir = None

            result = await reframe_sketch(
                image_base64=ref_image,
                cir=cir.model_dump(),
                script_context=script_context,
                original_cir=original_cir,
                include_description=False,
                model="gpt-image-1.5",
                intent=render_intent,
                strategy_context=strategy_context,
            )
            rendered_image = result["reframed_image"]
        except Exception as e:
            logger.warning(f"[FillShot] Render failed for '{label}': {e}. Using placeholder.")
            rendered_image = _placeholder_base64()
    else:
        # No reference image — generate from scratch via Gemini image model
        rendered_image = await _generate_sketch_from_cir(cir, label, script_context, intent)

    return FillShotCandidate(
        id=cid,
        label=label,
        category=category,
        cir=cir,
        image=rendered_image,
        rationale=rationale,
        theory_source=theory_source,
        flow_connection=flow_connection,
    )


async def _generate_sketch_from_cir(cir: CIR, label: str, script_context: str, intent: str) -> str:
    """Fallback: generate a sketch purely from CIR + label when no reference image is available."""
    from google import genai as _genai
    from app.services.image_generator import get_client as get_img_client

    prompt = (
        f"Draw a black-and-white storyboard sketch (rough, hand-drawn style, 16:9).\n"
        f"Shot: {label}\n"
        f"Scene context: {script_context}\n"
        f"Director intent: {intent}\n"
        f"CIR — Shot size: {cir.shotSize}, Angle: {cir.horizontalAngle}, "
        f"Level: {cir.verticalLevel}, Framing: {cir.viewpointFraming}, "
        f"Motion: {cir.motionHint}.\n"
        f"Keep it loose, sketchy, no color, no text. Storyboard artist style."
    )
    client = get_img_client()

    def _gen():
        gen_config = types.GenerateContentConfig(response_modalities=["IMAGE"])
        res = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt],
            config=gen_config,
        )
        for part in res.candidates[0].content.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode()
        return _placeholder_base64()

    return await asyncio.to_thread(_gen)


def _placeholder_base64() -> str:
    """1×1 transparent PNG as fallback."""
    return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


# ── Gap Fill ───────────────────────────────────────────────────────────────

async def gap_fill(req: GapFillRequest) -> GapFillResponse:
    """
    Suggest {candidate_count} fill shot candidates for the gap between left_shot and right_shot.
    Stage 1: Gemini plans candidates (theory-grounded).
    Stage 2: gpt-image-1.5 renders each candidate in parallel.
    """
    prompt = GAP_FILL_PROMPT_TEMPLATE.replace("{candidate_count}", str(req.candidate_count))

    left_summary = _shot_summary(req.left_shot)
    right_summary = _shot_summary(req.right_shot)
    user_note = f"\n[Additional instruction for this gap]\n{req.user_prompt}" if req.user_prompt else ""

    full_prompt = (
        f"{prompt}\n\n"
        f"[LEFT SHOT — before the gap]\n{left_summary}\n\n"
        f"[RIGHT SHOT — after the gap]\n{right_summary}\n\n"
        f"[FULL SCENE SCRIPT]\n{req.script_context}\n\n"
        f"[DIRECTOR'S INTENT]\n{req.intent}"
        f"{user_note}"
    )

    contents: list = [full_prompt]

    # Attach images if available so Gemini can visually analyze the adjacent shots
    left_part = _image_part(req.left_shot)
    right_part = _image_part(req.right_shot)
    if left_part:
        contents.append("\n[Left shot image:]")
        contents.append(left_part)
    if right_part:
        contents.append("\n[Right shot image:]")
        contents.append(right_part)

    logger.info(f"[GapFill] Planning {req.candidate_count} candidates (images: L={left_part is not None}, R={right_part is not None})")

    raw = await _call_gemini_with_cache(contents)

    try:
        data = json.loads(_clean_json(raw))
        plans = data.get("candidates", [])
    except json.JSONDecodeError:
        logger.error(f"[GapFill] Failed to parse Gemini JSON:\n{raw}")
        raise RuntimeError("Gemini returned invalid JSON for gap fill planning")

    # Stage 2: render all candidates in parallel
    tasks = [
        _render_candidate(plan, req.left_shot, req.script_context, req.intent)
        for plan in plans
    ]
    candidates = await asyncio.gather(*tasks, return_exceptions=True)

    valid: List[FillShotCandidate] = []
    for i, c in enumerate(candidates):
        if isinstance(c, Exception):
            logger.warning(f"[GapFill] Candidate {i} render failed: {c}")
        else:
            valid.append(c)

    logger.info(f"[GapFill] Done — {len(valid)}/{len(plans)} candidates rendered")
    return GapFillResponse(candidates=valid)


# ── Auto-fill Range ────────────────────────────────────────────────────────

async def auto_fill_range(req: AutoFillRangeRequest) -> AutoFillRangeResponse:
    """
    Propose {version_count} complete editorial versions of how to fill gaps in the shot range.
    Stage 1: Gemini plans all versions + insertions (theory-grounded).
    Stage 2: Render all inserted shots in parallel across all versions.
    """
    prompt = AUTO_FILL_PROMPT_TEMPLATE.replace("{version_count}", str(req.version_count))

    shots_summary = "\n\n".join(
        f"Shot ID: {s.id}\n{_shot_summary(s)}" for s in req.shots
    )
    user_note = f"\n[Additional guidance]\n{req.user_prompt}" if req.user_prompt else ""

    full_prompt = (
        f"{prompt}\n\n"
        f"[RANGE SHOTS — analyze these and decide where/what to insert]\n{shots_summary}\n\n"
        f"[FULL SCENE SCRIPT]\n{req.script_context}\n\n"
        f"[DIRECTOR'S INTENT]\n{req.intent}"
        f"{user_note}"
    )

    # Attach all range shot images for visual analysis
    contents: list = [full_prompt]
    for shot in req.shots:
        part = _image_part(shot)
        if part:
            contents.append(f"\n[Image for shot: {shot.label}]")
            contents.append(part)

    logger.info(f"[AutoFill] Planning {req.version_count} versions for {len(req.shots)} shots")

    raw = await _call_gemini_with_cache(contents)

    try:
        data = json.loads(_clean_json(raw))
        version_plans = data.get("versions", [])
    except json.JSONDecodeError:
        logger.error(f"[AutoFill] Failed to parse Gemini JSON:\n{raw}")
        raise RuntimeError("Gemini returned invalid JSON for auto-fill planning")

    # Build a lookup: shot_id → SequenceShot (for reference images)
    shot_by_id = {s.id: s for s in req.shots}

    # Stage 2: gather all (version_idx, insertion_idx, plan, ref_shot) render tasks
    render_jobs: list[tuple[int, int, dict, SequenceShot]] = []
    for v_idx, vplan in enumerate(version_plans):
        for i_idx, ins in enumerate(vplan.get("insertions", [])):
            ref_id = ins.get("after_shot_id")
            ref_shot = shot_by_id.get(ref_id) or req.shots[0]
            render_jobs.append((v_idx, i_idx, ins.get("candidate", {}), ref_shot))

    logger.info(f"[AutoFill] Rendering {len(render_jobs)} shots across {len(version_plans)} versions")

    render_tasks = [
        _render_candidate(plan, ref_shot, req.script_context, req.intent)
        for _, _, plan, ref_shot in render_jobs
    ]
    rendered = await asyncio.gather(*render_tasks, return_exceptions=True)

    # Reassemble versions
    rendered_map: dict[tuple[int, int], FillShotCandidate] = {}
    for job_idx, result in enumerate(rendered):
        v_idx, i_idx, _, _ = render_jobs[job_idx]
        if isinstance(result, Exception):
            logger.warning(f"[AutoFill] Render failed v={v_idx} i={i_idx}: {result}")
        else:
            rendered_map[(v_idx, i_idx)] = result

    versions: List[AutoFillVersion] = []
    for v_idx, vplan in enumerate(version_plans):
        insertions_out = []
        for i_idx, ins in enumerate(vplan.get("insertions", [])):
            candidate = rendered_map.get((v_idx, i_idx))
            if candidate:
                insertions_out.append({
                    "after_shot_id": ins.get("after_shot_id"),
                    "candidate": candidate.model_dump(),
                })
        # Validate editorial_techniques (Pydantic will drop invalid entries via Literal)
        raw_techniques = vplan.get("editorial_techniques", []) or []
        valid_techniques = []
        for t in raw_techniques:
            try:
                from app.models.schemas import EditorialTechnique
                valid_techniques.append(EditorialTechnique(**t))
            except Exception as e:
                logger.debug(f"[AutoFill] Skipping invalid technique: {e}")

        versions.append(AutoFillVersion(
            version_label=vplan.get("version_label", f"Version {chr(65+v_idx)}"),
            rationale=vplan.get("rationale", ""),
            theory_basis=vplan.get("theory_basis", ""),
            editorial_techniques=valid_techniques,
            insertions=insertions_out,
        ))

    logger.info(f"[AutoFill] Done — {len(versions)} versions assembled")
    return AutoFillRangeResponse(versions=versions)
