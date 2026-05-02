import time

from fastapi import APIRouter, HTTPException

from app.models.schemas import SegmentMask, SegmentRequest, SegmentResponse
from app.services.segmenter import Segmenter, bbox_xywh, encode_mask_png_b64

router = APIRouter()


@router.post("/segment", response_model=SegmentResponse)
async def segment_endpoint(request: SegmentRequest):
    t0 = time.time()
    try:
        segmenter = Segmenter.get()
        image = Segmenter.load_image(
            request.image,
            image_type=request.type,
            target_width=request.target_width or 1024,
        )
        h, w = image.shape[:2]

        raw_masks = segmenter.auto_segment(
            image,
            min_area=request.min_area or 0,
            max_count=request.max_count,
        )

        masks_out: list[SegmentMask] = []
        for i, m in enumerate(raw_masks):
            seg = m["segmentation"]
            masks_out.append(SegmentMask(
                id=f"obj_{i}",
                bbox=bbox_xywh(seg),
                area=int(m.get("area", int(seg.sum()))),
                score=float(m["predicted_iou"]) if "predicted_iou" in m else None,
                mask_png=encode_mask_png_b64(seg),
            ))

        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment] type={request.type} size={w}x{h} masks={len(masks_out)} elapsed={elapsed_ms}ms")
        return SegmentResponse(image_size=[w, h], masks=masks_out, elapsed_ms=elapsed_ms)
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[segment] ERROR elapsed={elapsed_ms}ms error={e}")
        raise HTTPException(status_code=500, detail=str(e))
