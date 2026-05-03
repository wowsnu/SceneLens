"""MobileSAM-based click segmentation service.

Loads the model once on GPU at startup and exposes a session-based click API:
  - prepare(image)         → embeds the image, returns session_id
  - point_segment(sid,x,y) → runs the predictor with the cached embedding

Session cache: LRU + TTL (max 5 entries, 30 min idle expiry).
Mask outputs are encoded as 1-bit PNGs (base64) for compact transport.
"""

import base64
import io
import os
import threading
import time
import uuid
from collections import OrderedDict
from typing import Literal, Optional

import numpy as np
from PIL import Image

_DEFAULT_CKPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "models",
    "mobile_sam.pt",
)

_MAX_SESSIONS = 5
_SESSION_TTL_SEC = 30 * 60


class _Session:
    __slots__ = ("image", "size", "last_used")

    def __init__(self, image: np.ndarray):
        self.image = image
        self.size = (image.shape[1], image.shape[0])  # (w, h)
        self.last_used = time.time()


class Segmenter:
    _instance: Optional["Segmenter"] = None
    _lock = threading.Lock()

    def __init__(self, checkpoint: str = _DEFAULT_CKPT, device: str = "cuda"):
        import torch
        from mobile_sam import SamPredictor, sam_model_registry

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
        self._sessions: "OrderedDict[str, _Session]" = OrderedDict()
        self._sessions_lock = threading.Lock()
        self._current_sid: Optional[str] = None  # which session's embedding lives in predictor
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

    # ── Sessions ─────────────────────────────────────────────────

    def _gc_expired(self) -> None:
        now = time.time()
        expired = [sid for sid, s in self._sessions.items()
                   if now - s.last_used > _SESSION_TTL_SEC]
        for sid in expired:
            self._sessions.pop(sid, None)
            if self._current_sid == sid:
                self._current_sid = None

    def prepare(self, image: np.ndarray) -> tuple[str, tuple[int, int]]:
        """Register an image and return (session_id, (width, height)).

        The actual embedding (predictor.set_image) is deferred to the first
        point_segment call so that a prepare without follow-up doesn't waste GPU.
        """
        sid = uuid.uuid4().hex
        with self._sessions_lock:
            self._gc_expired()
            self._sessions[sid] = _Session(image)
            self._sessions.move_to_end(sid)
            while len(self._sessions) > _MAX_SESSIONS:
                evicted_sid, _ = self._sessions.popitem(last=False)
                if self._current_sid == evicted_sid:
                    self._current_sid = None
        return sid, (image.shape[1], image.shape[0])

    def _touch(self, sid: str) -> _Session:
        with self._sessions_lock:
            self._gc_expired()
            sess = self._sessions.get(sid)
            if sess is None:
                raise KeyError(f"unknown or expired session_id: {sid}")
            sess.last_used = time.time()
            self._sessions.move_to_end(sid)
            return sess

    # ── Click segmentation ───────────────────────────────────────

    def point_segment(self, session_id: str, x: int, y: int,
                      max_area_ratio: float = 0.5,
                      use_corner_negatives: bool = True) -> dict:
        """Segment the object at (x, y) for a previously-prepared session.

        Returns up to 3 candidate masks (largest-score-first) after filtering out
        "background-like" masks that cover more than max_area_ratio of the frame.

        - use_corner_negatives: feed image corners as negative points so SAM is
          discouraged from returning the whole-frame background mask.
        """
        sess = self._touch(session_id)

        if self._current_sid != session_id:
            self.predictor.set_image(sess.image)
            self._current_sid = session_id

        H, W = sess.image.shape[:2]
        total = H * W

        coords = [[x, y]]
        labels = [1]
        if use_corner_negatives:
            inset = 8
            coords += [[inset, inset], [W - inset - 1, inset],
                       [inset, H - inset - 1], [W - inset - 1, H - inset - 1]]
            labels += [0, 0, 0, 0]

        masks, scores, _ = self.predictor.predict(
            point_coords=np.array(coords),
            point_labels=np.array(labels),
            multimask_output=True,
        )

        candidates = []
        for m, s in zip(masks, scores):
            seg = m.astype(bool)
            area = int(seg.sum())
            if area == 0:
                continue
            if area / total > max_area_ratio:
                continue
            candidates.append({"segmentation": seg, "score": float(s), "area": area})

        # Fallback: if filtering removed everything, return the smallest of the raw 3.
        if not candidates:
            best_i = int(np.argmin([m.sum() for m in masks]))
            seg = masks[best_i].astype(bool)
            candidates = [{"segmentation": seg, "score": float(scores[best_i]),
                           "area": int(seg.sum())}]

        candidates.sort(key=lambda c: c["score"], reverse=True)
        return {"candidates": candidates}

    def box_segment(self, session_id: str, x1: int, y1: int, x2: int, y2: int,
                    multimask: bool = False) -> dict:
        """Segment using a bounding box prompt. Returns up to 3 candidates if multimask else 1."""
        sess = self._touch(session_id)

        if self._current_sid != session_id:
            self.predictor.set_image(sess.image)
            self._current_sid = session_id

        H, W = sess.image.shape[:2]
        x1c, x2c = sorted((max(0, min(W - 1, x1)), max(0, min(W - 1, x2))))
        y1c, y2c = sorted((max(0, min(H - 1, y1)), max(0, min(H - 1, y2))))

        masks, scores, _ = self.predictor.predict(
            box=np.array([x1c, y1c, x2c, y2c]),
            multimask_output=multimask,
        )

        candidates = []
        for m, s in zip(masks, scores):
            seg = m.astype(bool)
            area = int(seg.sum())
            if area == 0:
                continue
            candidates.append({"segmentation": seg, "score": float(s), "area": area})

        if not candidates:
            seg = masks[0].astype(bool)
            candidates = [{"segmentation": seg, "score": float(scores[0]), "area": int(seg.sum())}]

        candidates.sort(key=lambda c: c["score"], reverse=True)
        return {"candidates": candidates}


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
