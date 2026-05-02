import time

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    SegmentPointRequest,
    SegmentPointResponse,
    SegmentPrepareRequest,
    SegmentPrepareResponse,
)
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
        result = segmenter.point_segment(request.session_id, request.x, request.y)
        seg = result["segmentation"]
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/point] sid={request.session_id[:8]} pt=({request.x},{request.y}) "
              f"score={result['score']:.3f} elapsed={elapsed_ms}ms")
        return SegmentPointResponse(
            bbox=bbox_xywh(seg),
            area=int(seg.sum()),
            score=result["score"],
            mask_png=encode_mask_png_b64(seg),
            elapsed_ms=elapsed_ms,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment/point] ERROR elapsed={elapsed_ms}ms error={e}")
        raise HTTPException(status_code=500, detail=str(e))
