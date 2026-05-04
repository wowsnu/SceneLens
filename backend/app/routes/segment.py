import time

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    SegmentCandidate,
    SegmentLassoRequest,
    SegmentLassoResponse,
    SegmentPointRequest,
    SegmentPointResponse,
    SegmentPrepareRequest,
    SegmentPrepareResponse,
)
from app.services.ink_segmenter import segment_with_lasso as ink_lasso_segment
from app.services.segmenter import Segmenter, bbox_xywh, encode_mask_png_b64

router = APIRouter()


@router.post("/segment/prepare", response_model=SegmentPrepareResponse)
async def segment_prepare(request: SegmentPrepareRequest):
    t0 = time.time()
    try:
        segmenter = Segmenter.get()
        image = Segmenter.load_image(
            request.image,
            image_type=request.type,
            target_width=request.target_width or 1024,
        )
        sid, (w, h) = segmenter.prepare(image)
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/prepare] sid={sid[:8]} type={request.type} size={w}x{h} elapsed={elapsed_ms}ms")
        return SegmentPrepareResponse(session_id=sid, image_size=[w, h], elapsed_ms=elapsed_ms)
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/prepare] ERROR elapsed={elapsed_ms}ms error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment/point", response_model=SegmentPointResponse)
async def segment_point(request: SegmentPointRequest):
    t0 = time.time()
    try:
        segmenter = Segmenter.get()
        result = segmenter.point_segment(
            request.session_id, request.x, request.y,
            max_area_ratio=request.max_area_ratio if request.max_area_ratio is not None else 0.5,
            use_corner_negatives=request.use_corner_negatives if request.use_corner_negatives is not None else True,
        )

        candidates_out = [
            SegmentCandidate(
                bbox=bbox_xywh(c["segmentation"]),
                area=c["area"],
                score=c["score"],
                mask_png=encode_mask_png_b64(c["segmentation"]),
            )
            for c in result["candidates"]
        ]

        elapsed_ms = int((time.time() - t0) * 1000)
        scores_str = ",".join(f"{c.score:.2f}" for c in candidates_out)
        print(f"[segment/point] sid={request.session_id[:8]} pt=({request.x},{request.y}) "
              f"n={len(candidates_out)} scores=[{scores_str}] elapsed={elapsed_ms}ms")
        return SegmentPointResponse(candidates=candidates_out, elapsed_ms=elapsed_ms)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/point] ERROR elapsed={elapsed_ms}ms error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment/lasso", response_model=SegmentLassoResponse)
async def segment_lasso(request: SegmentLassoRequest):
    """Sketch lasso: ink-based component grouping (no SAM)."""
    t0 = time.time()
    try:
        segmenter = Segmenter.get()
        sess = segmenter._touch(request.session_id)  # type: ignore[attr-defined]
        polygon = [(int(p[0]), int(p[1])) for p in request.polygon]

        mask = ink_lasso_segment(sess.image, polygon)
        if mask is None or not mask.any():
            elapsed_ms = int((time.time() - t0) * 1000)
            print(f"[segment/lasso] sid={request.session_id[:8]} pts={len(polygon)} "
                  f"no ink found elapsed={elapsed_ms}ms")
            return SegmentLassoResponse(candidates=[], elapsed_ms=elapsed_ms)

        candidate = SegmentCandidate(
            bbox=bbox_xywh(mask),
            area=int(mask.sum()),
            score=1.0,
            mask_png=encode_mask_png_b64(mask),
        )

        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/lasso] sid={request.session_id[:8]} pts={len(polygon)} "
              f"area={candidate.area} bbox={candidate.bbox} elapsed={elapsed_ms}ms")
        return SegmentLassoResponse(candidates=[candidate], elapsed_ms=elapsed_ms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/lasso] ERROR elapsed={elapsed_ms}ms error={e}")
        raise HTTPException(status_code=500, detail=str(e))
