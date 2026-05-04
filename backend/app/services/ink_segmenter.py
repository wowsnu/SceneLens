"""Ink-based lasso segmentation for sketches.

The user's lasso polygon is treated as a *fuzzy hint*. We detect the actual
ink strokes near the polygon, group nearby strokes into connected components
(closing small gaps), then pick the components that overlap the lasso enough.
The output mask is the union of those components, slightly dilated so we
include the full ink width.

This works far better than SAM for line-art sketches because it operates
directly on the ink rather than on natural-image features.
"""

from __future__ import annotations

import numpy as np


def _ensure_cv2():
    import cv2  # local import to keep module-load fast
    return cv2


def extract_ink_mask(image: np.ndarray) -> np.ndarray:
    """Return a 0/1 uint8 mask of where the ink is.

    Sketches are dark strokes on near-white paper, so we threshold the
    inverted grayscale and use adaptive thresholding to be robust against
    grey washes / paper texture.
    """
    cv2 = _ensure_cv2()
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    else:
        gray = image

    # Adaptive threshold catches faint pencil lines while ignoring paper noise.
    adaptive = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
        blockSize=25, C=10,
    )
    # Plus a hard global cut so very-dark ink is always in.
    _, hard = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    ink = cv2.bitwise_or(adaptive, hard)
    # Drop tiny speckles before grouping.
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return (ink > 0).astype(np.uint8)


def segment_with_lasso(
    image: np.ndarray,
    polygon: list[tuple[int, int]],
    *,
    close_kernel: int = 5,
    close_iters: int = 1,
    min_component_area: int = 60,
    overlap_threshold: float = 0.4,
    final_dilate: int = 2,
) -> np.ndarray | None:
    """Pick the ink components that overlap the user's lasso, return a binary mask.

    Steps:
      1. Build ink mask from the image.
      2. Restrict ink to the lasso bbox (we don't care about ink elsewhere).
      3. Morphological closing on the ink to bridge small gaps so a body's
         strokes form a single connected component.
      4. Find connected components in the closed ink.
      5. Keep components whose intersection with the lasso polygon covers at
         least `overlap_threshold` of the component's own pixels.
      6. Final small dilation so the cutout includes the full stroke width.

    Returns a HxW bool mask or None if nothing matched.
    """
    cv2 = _ensure_cv2()
    H, W = image.shape[:2]
    if len(polygon) < 3:
        return None

    pts = np.array(
        [[max(0, min(W - 1, int(x))), max(0, min(H - 1, int(y)))] for x, y in polygon],
        dtype=np.int32,
    )

    # Lasso polygon as a binary mask
    lasso_mask = np.zeros((H, W), dtype=np.uint8)
    cv2.fillPoly(lasso_mask, [pts], 1)
    if lasso_mask.sum() == 0:
        return None

    # Bbox padded a bit so closing can reach strokes just outside the lasso
    pad = max(close_kernel * close_iters * 2, 8)
    x1 = max(0, int(pts[:, 0].min()) - pad)
    y1 = max(0, int(pts[:, 1].min()) - pad)
    x2 = min(W, int(pts[:, 0].max()) + pad)
    y2 = min(H, int(pts[:, 1].max()) + pad)

    ink = extract_ink_mask(image)
    roi_ink = ink[y1:y2, x1:x2].copy()
    if roi_ink.sum() == 0:
        return None

    # Bridge small gaps so a person's broken outline becomes one component.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_kernel, close_kernel))
    closed = cv2.morphologyEx(roi_ink, cv2.MORPH_CLOSE, kernel, iterations=close_iters)

    num, labels = cv2.connectedComponents(closed)
    if num <= 1:
        return None

    lasso_roi = lasso_mask[y1:y2, x1:x2]

    keep = np.zeros_like(closed, dtype=bool)
    for cid in range(1, num):
        comp = labels == cid
        comp_size = int(comp.sum())
        if comp_size < min_component_area:
            continue
        overlap = int(np.logical_and(comp, lasso_roi == 1).sum())
        if overlap == 0:
            continue
        ratio = overlap / comp_size
        if ratio >= overlap_threshold:
            keep |= comp

    if not keep.any():
        return None

    # Restrict to the actual ink (closing was for grouping only) — we still want
    # the ink-shaped mask, not the dilated blob. Then small dilation so the
    # full stroke width is covered.
    keep_ink = keep & (roi_ink > 0)
    if final_dilate > 0:
        d = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                      (final_dilate * 2 + 1, final_dilate * 2 + 1))
        keep_ink = cv2.dilate(keep_ink.astype(np.uint8), d, iterations=1).astype(bool)

    out = np.zeros((H, W), dtype=bool)
    out[y1:y2, x1:x2] = keep_ink
    return out
