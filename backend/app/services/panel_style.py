"""보드 전체의 그림체. 한 곳에서만 정한다.

패널을 만드는 길이 둘이다 — 처음부터 생성하는 것(panel_image)과 감독의
스케치를 채워 완성하는 것(image_generator의 restyle). 두 길이 각자 그림체를
정하면 같은 보드 안에서 그림이 갈리고, 한쪽을 고쳐도 다른 쪽이 따라오지
않는다. 섞인 보드를 하나로 보이게 하는 것이 restyle의 목적이므로 특히 그렇다.
"""

# 그림체와 무관하게 지켜야 할 것. 테두리와 글자는 어떤 화풍에서도 방해가 된다.
NO_TEXT = (
    "Storyboard panel. Single frame that fills the entire image edge to edge. "
    "Do not draw a frame, border, outline, or margin around the drawing. "
    "No text, no lettering, no signage, no labels, no numbers, "
    "no speech bubbles, no captions, no watermark."
)

# 스토리보드는 완성된 그림이 아니다. 완성돼 보이면 이미 정해진 것으로 읽혀
# 아무도 고치자고 하지 않는다 — 판정을 받으려면 러프해야 한다.
ROUGHNESS = (
    "Keep this a rough working storyboard panel, not an illustration. "
    "Draw in open, visible pencil lines; let strokes stay separate and a little uneven "
    "rather than blending into smooth surfaces. "
    "Shade only where it tells the viewer something — which way the light falls, which "
    "shape is in front. A few hatched passes, never continuous tone. Leave most of the "
    "paper white. "
    "Faces carry identity and expression only: the features the reference establishes and "
    "where the eyes look. No skin texture, no rendered lips, no individual strands of hair. "
    "Backgrounds get the shapes that matter to this cut and nothing more — no wallpaper "
    "pattern, no decorative props, no detail nobody asked about. "
    "Never render this as a photograph, a painting, or a polished portrait."
)

# 미장센이 그림체를 정하지 않았을 때의 기본.
BASE_LOOK = (
    "Black and white storyboard panel, rough pencil sketch style, "
    "clean confident line art, minimal shading, cinematic framing."
)

# 처음부터 생성할 때 쓰는 전체 문장.
STYLE = f"{BASE_LOOK} {NO_TEXT} {ROUGHNESS}"


def style_prelude(look: str = "") -> str:
    """이 패널의 그림체 한 덩어리. look이 있으면 그것을 기본 대신 쓴다."""
    chosen = look.strip() if look else BASE_LOOK
    return f"{chosen} {NO_TEXT} {ROUGHNESS}"
