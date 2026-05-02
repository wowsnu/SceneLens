"""Local debug for the click-based segmentation pipeline.

Usage (from backend/ with venv active):
    python -m app.tools.test_segment <image_path> --point X,Y [--point X,Y ...] [--svg] [--out <dir>]

For each --point, runs SAM with that click and writes:
    <out>/click_<i>_<x>_<y>.png  — original image with the chosen mask overlaid
    <out>/mask_<i>_<x>_<y>.png   — the mask itself (1-bit PNG)
    <out>/summary.txt            — bbox / area / score per click

Example:
    python -m app.tools.test_segment test_image.png --point 200,400 --point 1100,500
"""

import argparse
import base64
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from app.services.segmenter import Segmenter, bbox_xywh


def parse_point(s: str) -> tuple[int, int]:
    x, y = s.split(",")
    return int(x), int(y)


def overlay_mask(image: np.ndarray, mask: np.ndarray, color=(255, 60, 60), alpha=0.5,
                 click_xy: tuple[int, int] | None = None) -> np.ndarray:
    out = image.copy().astype(np.float32)
    out[mask] = (1 - alpha) * out[mask] + alpha * np.array(color)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if click_xy is not None:
        # draw a small crosshair at the click point
        x, y = click_xy
        h, w = out.shape[:2]
        for dx in range(-6, 7):
            xi = max(0, min(w - 1, x + dx))
            out[max(0, y - 1):min(h, y + 2), xi] = (0, 255, 0)
        for dy in range(-6, 7):
            yi = max(0, min(h - 1, y + dy))
            out[yi, max(0, x - 1):min(w, x + 2)] = (0, 255, 0)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=str)
    parser.add_argument("--svg", action="store_true", help="Treat input as SVG")
    parser.add_argument("--point", action="append", required=True,
                        help='Click point "x,y" (repeatable)')
    parser.add_argument("--out", type=str, default="segment_debug")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = Path(args.image).read_bytes()
    image_b64 = base64.b64encode(raw).decode("ascii")

    seg = Segmenter.get()
    image = Segmenter.load_image(image_b64, image_type="svg" if args.svg else "png")
    print(f"[test] loaded image shape={image.shape}")

    sid, (w, h) = seg.prepare(image)
    print(f"[test] session={sid[:8]} size={w}x{h}")

    lines = [f"image: {w}x{h}", f"session: {sid}", ""]
    for i, pt_str in enumerate(args.point):
        x, y = parse_point(pt_str)
        if not (0 <= x < w and 0 <= y < h):
            print(f"[test] point ({x},{y}) out of bounds, skipping")
            continue

        t0 = time.time()
        result = seg.point_segment(sid, x, y)
        elapsed = time.time() - t0
        cands = result["candidates"]
        scores_str = ",".join(f"{c['score']:.3f}" for c in cands)
        print(f"[test] click {i} ({x},{y}) → n={len(cands)} scores=[{scores_str}] elapsed={elapsed:.2f}s")

        for j, c in enumerate(cands):
            mask = c["segmentation"]
            bbox = bbox_xywh(mask)
            area = c["area"]
            score = c["score"]
            Image.fromarray(overlay_mask(image, mask, click_xy=(x, y))).save(
                out_dir / f"click_{i:02d}_{x}_{y}_cand{j}.png"
            )
            Image.fromarray((mask.astype(np.uint8) * 255), mode="L").save(
                out_dir / f"mask_{i:02d}_{x}_{y}_cand{j}.png"
            )
            lines.append(f"click_{i} cand{j} ({x},{y})  bbox={bbox}  area={area}  score={score:.3f}")
        lines.append("")

    (out_dir / "summary.txt").write_text("\n".join(lines))
    print(f"[test] wrote results to {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
