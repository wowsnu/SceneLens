"""표현 스타일 앵커 세 장을 만든다.

앵커는 감독이 밀도를 고르는 카드이자, 패널 생성에 참조로 물리는 그림이다
(referencesForCut의 kind='style'). 그래서 **패널이 실제로 그 밀도로 나오는
프롬프트**로 만들어야 한다 — 앵커만 다른 손으로 그려져 있으면, 패널이
따라야 할 기준과 감독이 고른 카드가 어긋난다.

panel_style.style_prelude를 그대로 쓴다. 앵커를 따로 손으로 쓴 문장으로
만들면 프롬프트를 고칠 때마다 둘이 갈린다.

실행:
    cd v3/backend
    ../.venv/bin/python -m app.tools.generate_style_anchors
    ../.venv/bin/python -m app.tools.generate_style_anchors --preset rough
"""

import argparse
import asyncio
import base64
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from openai import AsyncOpenAI

from app.services.panel_style import style_prelude

load_dotenv()

OUT_DIR = Path(__file__).parent.parent.parent.parent / "public" / "img" / "style-anchors"

FILENAMES = {
    "rough": "lab-rough-storyboard.png",
    "detailed": "lab-detailed-storyboard.png",
    "photoreal": "lab-photoreal-previz.png",
}

# 앵커가 담을 장면. 밀도를 보여 주는 것이 목적이므로 인물과 공간이 함께
# 있어야 한다 — 얼굴이 어디까지 그려지는지가 밀도 판단의 핵심이다.
#
# 뒷모습으로 둔다. 앵커의 인물이 정면으로 또렷하면 그 얼굴이 패널의 인물
# 기준을 덮는다(panel_image가 "never copy a person from it"으로 막지만,
# 애초에 특정하기 어려운 그림이 안전하다).
SCENE = (
    "Night. Interior of a small university physics lab. A student in a hoodie "
    "sits at a long bench seen from behind and slightly to the side, looking at "
    "a laptop screen. An oscilloscope and cables on the bench, a rain-streaked "
    "window to the right, one fluorescent tube overhead."
)


async def _generate(client: AsyncOpenAI, preset: str, model: str) -> bytes:
    prompt = f"{style_prelude('', preset)}\n\nDraw this panel: {SCENE}"
    result = await client.images.generate(
        model=model,
        prompt=prompt,
        # 패널과 같은 가로 프레임. 앵커가 세로면 밀도 말고 구도까지 옮는다.
        size="1536x1024",
        # 앵커는 한 번 만들어 계속 쓰는 그림이라 여기서만 품질을 올린다.
        quality="high",
        n=1,
    )
    data = result.data[0]
    if getattr(data, "b64_json", None):
        return base64.b64decode(data.b64_json)
    async with httpx.AsyncClient(timeout=120) as http:
        response = await http.get(data.url)
        response.raise_for_status()
        return response.content


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preset", choices=sorted(FILENAMES), help="하나만 다시 만든다")
    parser.add_argument("--model", default="gpt-image-2")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY not set")

    presets = [args.preset] if args.preset else list(FILENAMES)
    client = AsyncOpenAI(api_key=api_key)

    for preset in presets:
        target = OUT_DIR / FILENAMES[preset]
        print(f"[{preset}] generating -> {target.name}")
        image = await _generate(client, preset, args.model)
        target.write_bytes(image)
        print(f"[{preset}] wrote {len(image) / 1024:.0f}KB")


if __name__ == "__main__":
    asyncio.run(main())
