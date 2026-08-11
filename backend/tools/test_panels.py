"""패널 생성을 화면 없이 시험한다.

무엇을 보려는 것인가: 여러 컷을 이어 그렸을 때 **같은 인물로 보이는가**.
한 장만 봐서는 알 수 없고, 클릭으로 확인하려면 매번 대본부터 다시 태워야 한다.

쓰는 법:
    python backend/tools/test_panels.py                 # 레퍼런스 있음
    python backend/tools/test_panels.py --no-reference  # 없이 (비교용)
    python backend/tools/test_panels.py --style "굵은 마커 드로잉"

결과는 backend/tools/out/ 에 쌓이고, contact.html 을 열면 한 줄로 늘어놓고
볼 수 있다 — 이어지는지는 나란히 놔야 보인다.
"""

import argparse
import asyncio
import base64
import json
import pathlib
import subprocess
import sys
import time

import httpx

BASE = "http://localhost:8000/api"
OUT = pathlib.Path(__file__).parent / "out"

# 한 씬을 통째로 태운다. 컷 하나만으로는 이어짐을 볼 수 없다.
SHARED = (
    "공간 기준: 좁고 낡은 지하 관제실, 모니터 벽 · 콘솔 · 잠긴 철제 캐비닛 · "
    "재인: 비에 젖은 검은 코트, 경계하는 자세, 훔친 출입카드 / "
    "민호: 지친 눈빛 · 환경: 밤, 비, 형광등 간헐적 깜빡임"
)

CHARACTERS = {
    "재인": "재인. 20대 후반, 침입자. 여성, 20대 후반. 비에 젖은 검은 코트. 마른 체형. 경계하는 자세. 훔친 출입카드",
    "민호": "민호. 40대 초반, 역무 총괄. 남성, 40대 초반. 낡은 근무복. 다부진 체형. 지친 눈빛",
}

LOCATION = "지하 관제실. 좁고 낡은 지하 관제실. 모니터 벽, 콘솔, 잠긴 철제 캐비닛, 철문"

# 2D 구조도. 좌표를 말로 옮기는 것보다 도면 한 장이 배치를 정확히 전한다.
LAYOUT_ELEMENTS = [
    {"type": "rect", "x": 300, "y": 200, "w": 700, "h": 50, "label": "MONITOR WALL"},
    {"type": "rect", "x": 400, "y": 350, "w": 450, "h": 120, "label": "CONSOLE"},
    {"type": "rect", "x": 950, "y": 400, "w": 80, "h": 200, "label": "CABINET"},
    {"type": "rect", "x": 150, "y": 560, "w": 40, "h": 140, "label": "STEEL DOOR"},
]

CUTS = [
    ("재인", "관제실 밤. 와이드 샷, 공간 전체가 보인다. 낡은 지하 관제실, 모니터 벽이 빛난다. 재인이 철문 앞에 서 있다."),
    ("재인", "관제실 밤. 바스트 샷. 재인이 철문을 조용히 닫는다. 재인의 젖은 어깨에 시선이 먼저 가도록 잡는다."),
    ("민호", "관제실 밤. 미디엄 샷. 민호가 콘솔 앞에 앉아 뒤돌아보지 않은 채 입을 연다. 민호의 등에 시선이 먼저 가도록 잡는다."),
    ("재인", "관제실 밤. 클로즈업. 재인이 젖은 앞머리를 쓸어 넘긴다. 재인의 굳은 표정에 시선이 먼저 가도록 잡는다."),
    ("민호", "관제실 밤. 미디엄 샷. 민호가 천천히 의자를 돌린다. 오른손은 책상 아래에 있다."),
]


def _layout_png() -> str:
    """구조도를 도면 PNG로. 화면의 layoutToImage와 같은 규칙이어야 시험이 의미 있다."""
    size, pad = 768, 60
    xs = [e["x"] for e in LAYOUT_ELEMENTS] + [e["x"] + e["w"] for e in LAYOUT_ELEMENTS]
    ys = [e["y"] for e in LAYOUT_ELEMENTS] + [e["y"] + e["h"] for e in LAYOUT_ELEMENTS]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    scale = min((size - pad * 2) / max(max_x - min_x, 1), (size - pad * 2) / max(max_y - min_y, 1))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
        f'<rect width="{size}" height="{size}" fill="#fff"/>',
    ]
    for el in LAYOUT_ELEMENTS:
        x = pad + (el["x"] - min_x) * scale
        y = pad + (el["y"] - min_y) * scale
        w, h = max(el["w"] * scale, 8), max(el["h"] * scale, 8)
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#000" stroke-width="3"/>')
        parts.append(
            f'<text x="{x + w / 2}" y="{y + h / 2 + 6}" text-anchor="middle" '
            f'font-family="sans-serif" font-size="18" fill="#000">{el["label"]}</text>'
        )
    parts.append("</svg>")

    svg = "".join(parts).encode()
    svg_path = OUT / "layout.svg"
    svg_path.write_bytes(svg)
    subprocess.run(["qlmanage", "-t", "-s", "768", "-o", str(OUT), str(svg_path)], capture_output=True)
    png = OUT / "layout.svg.png"
    if not png.exists():
        raise RuntimeError("도면 PNG 변환 실패 (qlmanage)")
    (OUT / "ref-layout.png").write_bytes(png.read_bytes())
    return base64.b64encode(png.read_bytes()).decode()


async def post(client, path, body, timeout=300):
    response = await client.post(f"{BASE}/{path}", json=body, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"{path} → {response.status_code}: {response.text[:200]}")
    return response.json()


async def main(use_reference: bool, style: str):
    OUT.mkdir(exist_ok=True)
    tag = "ref" if use_reference else "noref"
    started = time.time()

    async with httpx.AsyncClient() as client:
        refs = {}
        if use_reference:
            # 인물 레퍼런스를 먼저 만든다. 이것이 이어짐의 기준이 된다.
            for name, prompt in CHARACTERS.items():
                data = await post(client, "reference-image", {"kind": "character", "prompt": prompt})
                refs[name] = data["image"]
                (OUT / f"{tag}-ref-{name}.png").write_bytes(base64.b64decode(data["image"]))
                print(f"  레퍼런스 {name} ✓")
            data = await post(client, "reference-image", {"kind": "location", "prompt": LOCATION})
            refs["__location__"] = data["image"]
            (OUT / f"{tag}-ref-location.png").write_bytes(base64.b64decode(data["image"]))
            print("  레퍼런스 공간 ✓")
            refs["__layout__"] = _layout_png()
            print("  구조도 도면 ✓")

        previous = ""
        for i, (who, prompt) in enumerate(CUTS):
            body = {"prompt": prompt, "shared": SHARED, "previous": previous, "style": style,
                    "layout": "MONITOR WALL은 안쪽, CONSOLE은 가운데, CABINET은 오른쪽, STEEL DOOR는 앞쪽 왼쪽"}
            if use_reference:
                body["references"] = [
                    {"name": who, "kind": "character", "image": refs[who]},
                    {"name": "지하 관제실", "kind": "location", "image": refs["__location__"]},
                    {"name": "지하 관제실", "kind": "layout", "image": refs["__layout__"]},
                ]
            data = await post(client, "panel-image", body)
            (OUT / f"{tag}-cut{i + 1}.png").write_bytes(base64.b64decode(data["image"]))
            print(f"  컷 {i + 1} ({who}) ✓")
            # 앞 컷의 문장을 넘긴다. 화면 쪽과 같은 방식이어야 시험이 의미 있다.
            previous = prompt

    _write_contact_sheet(tag, style)
    print(f"\n{time.time() - started:.0f}초 · {OUT}/contact.html 을 열어 보세요")


def _write_contact_sheet(tag, style):
    """한 줄로 늘어놓는다. 이어지는지는 나란히 놔야 보인다."""
    rows = []
    for path in sorted(OUT.glob("*-ref-*.png")):
        rows.append(f'<figure><img src="{path.name}"><figcaption>{path.stem}</figcaption></figure>')
    panels = []
    for path in sorted(OUT.glob("*-cut*.png")):
        panels.append(f'<figure><img src="{path.name}"><figcaption>{path.stem}</figcaption></figure>')
    (OUT / "contact.html").write_text(
        "<meta charset='utf-8'><style>"
        "body{background:#111;color:#eee;font-family:system-ui;padding:20px}"
        "section{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px}"
        "figure{margin:0;flex:0 0 auto}img{height:240px;display:block}"
        "figcaption{font-size:11px;color:#888;padding-top:4px}"
        "</style>"
        f"<h3>레퍼런스</h3><section>{''.join(rows) or '없음'}</section>"
        f"<h3>패널 · style={style or '기본'}</h3><section>{''.join(panels)}</section>",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-reference", action="store_true", help="레퍼런스 없이 (비교용)")
    parser.add_argument("--style", default="", help="그림체. 비우면 기본 스케치체")
    args = parser.parse_args()
    try:
        asyncio.run(main(not args.no_reference, args.style))
    except Exception as error:
        print(f"실패: {error}", file=sys.stderr)
        sys.exit(1)
