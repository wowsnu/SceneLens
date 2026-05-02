"""Local debug for the segmentation pipeline.

Usage (from backend/ with venv active):
    python -m app.tools.test_segment <image_path> [--svg] [--out <dir>]

Writes:
    <out>/overlay.png            — input with all masks blended in distinct colors
    <out>/mask_<i>_<area>.png    — each individual mask as a 1-bit PNG
    <out>/summary.txt            — bbox / area / score per mask
"""

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from app.services.segmenter import Segmenter, bbox_xywh


def random_palette(n: int, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(64, 256, size=(n, 3), dtype=np.uint8)


def overlay_masks(image: np.ndarray, masks: list[dict], alpha: float = 0.5) -> np.ndarray:
    out = image.copy().astype(np.float32)
    palette = random_palette(len(masks))
    for color, m in zip(palette, masks):
        seg = m["segmentation"]
        out[seg] = (1 - alpha) * out[seg] + alpha * color
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=str)
    parser.add_argument("--svg", action="store_true", help="Treat input as SVG")
    parser.add_argument("--out", type=str, default="segment_debug")
    parser.add_argument("--min-area", type=int, default=0)
    parser.add_argument("--max-count", type=int, default=None)
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = Path(args.image).read_bytes()
    import base64
    image_b64 = base64.b64encode(raw).decode("ascii")

    seg = Segmenter.get()
    image = Segmenter.load_image(image_b64, image_type="svg" if args.svg else "png")
    print(f"[test] loaded image shape={image.shape}")

    t0 = time.time()
    masks = seg.auto_segment(image, min_area=args.min_area, max_count=args.max_count)
    elapsed = time.time() - t0
    print(f"[test] {len(masks)} masks in {elapsed:.2f}s")

    Image.fromarray(overlay_masks(image, masks)).save(out_dir / "overlay.png")

    lines = [f"image: {image.shape[1]}x{image.shape[0]}",
             f"masks: {len(masks)}",
             f"elapsed: {elapsed:.2f}s",
             ""]
    for i, m in enumerate(masks):
        seg_arr = m["segmentation"]
        bbox = bbox_xywh(seg_arr)
        area = int(m.get("area", int(seg_arr.sum())))
        score = m.get("predicted_iou")
        Image.fromarray((seg_arr.astype(np.uint8) * 255), mode="L").save(
            out_dir / f"mask_{i:02d}_area{area}.png"
        )
        lines.append(f"obj_{i}  bbox={bbox}  area={area}  score={score}")
    (out_dir / "summary.txt").write_text("\n".join(lines))
    print(f"[test] wrote results to {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
