"""MobileSAM-based segmentation service.

Loads the model once on GPU at startup and exposes auto / point segmentation.
Mask outputs are encoded as 1-bit PNGs (base64) for compact transport.
"""

import base64
import io
import os
import threading
import time
from typing import Literal, Optional

import numpy as np
from PIL import Image

_DEFAULT_CKPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "models",
    "mobile_sam.pt",
)


class Segmenter:
    _instance: Optional["Segmenter"] = None
    _lock = threading.Lock()

    def __init__(self, checkpoint: str = _DEFAULT_CKPT, device: str = "cuda"):
        import torch
        from mobile_sam import SamAutomaticMaskGenerator, SamPredictor, sam_model_registry

        if device == "cuda" and not torch.cuda.is_available():
            print("[Segmenter] CUDA not available, falling back to CPU (will be slow)")
            device = "cpu"

        print(f"[Segmenter] Loading MobileSAM from {checkpoint} on {device}...")
        t0 = time.time()
        sam = sam_model_registry["vit_t"](checkpoint=checkpoint)
        sam.to(device=device)
        sam.eval()

        self.device = device
        self.sam = sam
        self.predictor = SamPredictor(sam)
        self.auto_generator = SamAutomaticMaskGenerator(sam)
        print(f"[Segmenter] Ready in {time.time() - t0:.2f}s")

    @classmethod
    def get(cls) -> "Segmenter":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Image loading ────────────────────────────────────────────

    @staticmethod
    def load_image(image_b64: str, image_type: Literal["png", "svg"] = "png",
                   target_width: int = 1024) -> np.ndarray:
        """Decode base64 input (PNG or SVG) into an RGB numpy array."""
        raw = base64.b64decode(image_b64)
        if image_type == "svg":
            import cairosvg
            png_bytes = cairosvg.svg2png(bytestring=raw, output_width=target_width)
            img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        else:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
        return np.array(img)

    # ── Segmentation ─────────────────────────────────────────────

    def auto_segment(self, image: np.ndarray, min_area: int = 0,
                     max_count: Optional[int] = None) -> list[dict]:
        """Run automatic mask generation. Returns SAM-style mask dicts (segmentation + bbox + area)."""
        masks = self.auto_generator.generate(image)
        if min_area > 0:
            masks = [m for m in masks if m["area"] >= min_area]
        masks.sort(key=lambda m: m["area"], reverse=True)
        if max_count is not None:
            masks = masks[:max_count]
        return masks

    def point_segment(self, image: np.ndarray, x: int, y: int) -> dict:
        """Segment the object at (x, y). Returns the highest-scoring mask."""
        self.predictor.set_image(image)
        masks, scores, _ = self.predictor.predict(
            point_coords=np.array([[x, y]]),
            point_labels=np.array([1]),
            multimask_output=True,
        )
        best = int(np.argmax(scores))
        return {
            "segmentation": masks[best].astype(bool),
            "score": float(scores[best]),
        }


# ── Mask encoding ────────────────────────────────────────────────

def encode_mask_png_b64(mask: np.ndarray) -> str:
    """bool/uint8 mask → 1-bit PNG → base64 string (no data URI prefix)."""
    arr = (mask.astype(np.uint8) * 255)
    img = Image.fromarray(arr, mode="L").convert("1")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def bbox_xywh(mask: np.ndarray) -> list[int]:
    """Tight bbox of a bool mask as [x, y, w, h]."""
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return [0, 0, 0, 0]
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
