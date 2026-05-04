import time
import logging
from fastapi import APIRouter, HTTPException
from app.models.schemas import GapFillRequest, GapFillResponse, AutoFillRangeRequest, AutoFillRangeResponse
from app.services.fill_shot_engine import gap_fill, auto_fill_range

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/gap-fill", response_model=GapFillResponse)
async def gap_fill_endpoint(request: GapFillRequest):
    """
    Given two adjacent shots and the full scene script, return 3 candidate fill shots
    that could go between them. Each candidate is theory-grounded and rendered as a
    storyboard sketch by gpt-image-2.
    """
    t0 = time.time()
    logger.info(f"[gap-fill] START left='{request.left_shot.label}' right='{request.right_shot.label}' count={request.candidate_count}")
    try:
        result = await gap_fill(request)
        elapsed = time.time() - t0
        logger.info(f"[gap-fill] DONE {len(result.candidates)} candidates in {elapsed:.1f}s")
        return result
    except Exception as e:
        elapsed = time.time() - t0
        logger.error(f"[gap-fill] ERROR in {elapsed:.1f}s: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-fill-range", response_model=AutoFillRangeResponse)
async def auto_fill_range_endpoint(request: AutoFillRangeRequest):
    """
    Given a range of shots and the full scene script, return 3 complete editorial versions
    of how to fill the gaps within that range. Each version is theory-grounded with a
    distinct pacing/narrative strategy.
    """
    t0 = time.time()
    logger.info(f"[auto-fill-range] START shots={len(request.shots)} versions={request.version_count}")
    try:
        result = await auto_fill_range(request)
        elapsed = time.time() - t0
        logger.info(f"[auto-fill-range] DONE {len(result.versions)} versions in {elapsed:.1f}s")
        return result
    except Exception as e:
        elapsed = time.time() - t0
        logger.error(f"[auto-fill-range] ERROR in {elapsed:.1f}s: {e}")
        raise HTTPException(status_code=500, detail=str(e))
