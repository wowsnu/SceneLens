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

# 완성도는 **앵커 그림이 정한다.** 고른 밀도의 실제 예시가 참조로 물리므로
# (referencesForCut의 kind='style'), 글은 그 그림을 가리키고 같은 축의 값
# 하나씩만 말하면 된다.
#
# 글로 길게 통제하려 했더니 rough만 1300자가 되고 detailed·photoreal은
# 270자로 남아, 정작 세 단계의 차이는 정의되지 않았다. 이미지가 텍스트보다
# 강한데 텍스트를 늘린 셈이다.
#
# 세 preset이 같은 네 항목(선 / 얼굴 / 음영 / 배경)을 같은 길이로 답한다.
MATCH_ANCHOR = (
    "Match the finish level of the style reference image exactly — no more "
    "resolved than it is."
)

# 감독이 종이에 펜으로 20초 만에 긋는 그림. 얼굴은 **비운다** — 이목구비를
# 하나라도 요구하면 모델이 거기서부터 그리기 시작해 detailed로 올라간다.
ROUGHNESS = (
    f"{MATCH_ANCHOR} "
    "A crude pen thumbnail scribbled to block out the composition. "
    "Stick-figure level. "
    "Bodies: a few straight strokes for limbs, a simple shape for the torso. "
    "No anatomy, no clothing folds. "
    "HEADS ARE BLANK: an empty oval outline with NO face inside — no eyes, no "
    "nose, no mouth, no hair. Leave it empty, however close the shot. "
    "Objects: plain boxes and lines standing in for furniture and props. "
    "Shading: none, except a few quick parallel strokes where an area must read "
    "as dark. Most of the frame stays blank. "
    "Wobbly and obviously hand-drawn in haste — it should look almost too crude. "
    "Unfinished is correct: this panel exists to be judged and redrawn."
)

# 대본은 한국어이고 인물 이름도 한국 이름인데, 모델은 그냥 두면 서양
# 인물과 서양식 공간을 그린다. 감독이 매번 "한국인"이라고 적게 하는 대신
# 기본값으로 둔다.
#
# 컷 내용·씬 기준은 이 문장보다 뒤에 오므로, 대본이 다른 국적이나 장소를
# 말하면 그쪽이 이긴다 — 기본값이지 제약이 아니다.
# 글자는 NO_TEXT가 금지하므로 간판 문구가 아니라 사람과 건축으로만 말한다.
KOREAN_DEFAULT = (
    "Unless the description says otherwise, the people are Korean and the "
    "setting is in South Korea: Korean faces, hair and clothing, and Korean "
    "architecture, interior proportions and furniture."
)

# 화풍을 따로 정하지 않았을 때의 기본.
# `cinematic`과 `tonal indication`은 빼야 한다 — 완성도를 낮추라는 뒤 문장과
# 반대로 당겨서, 모델이 영화 스틸처럼 음영을 넣은 얼굴을 그린다.
BASE_LOOK = (
    "Black-and-white pen thumbnail scribble on paper, stick-figure level."
)

# 처음부터 생성할 때 쓰는 전체 문장.
STYLE = f"{BASE_LOOK} {NO_TEXT} {ROUGHNESS}"


def style_prelude(look: str = "", preset: str = "rough") -> str:
    """이 패널의 그림체 한 덩어리. preset은 앵커 카드의 표현 밀도다."""
    chosen = look.strip()
    if preset == "photoreal":
        return (
            "Photorealistic previsualization still. "
            f"{chosen} {NO_TEXT} {MATCH_ANCHOR} "
            "Lines: none — this is a photograph. "
            "Faces: real, with natural skin and hair. "
            "Shading: real light and materials, restrained neutral grade. "
            "Background: a real location with practical production-design detail. "
            "Not glossy concept art, not a beauty portrait. "
            f"{KOREAN_DEFAULT}"
        )
    if preset == "detailed":
        return (
            "Monochrome graphite storyboard sketch. "
            f"{chosen} {NO_TEXT} {MATCH_ANCHOR} "
            "Lines: controlled and cleaned up, still visibly hand-drawn. "
            "Faces: features readable — eyes, nose and mouth resolved, hair as "
            "shaped masses. No skin texture or individual hairs. "
            "Shading: moderate tone where it gives form. "
            "Background: the main elements of the space, periphery kept simple. "
            "A planning image, not a finished illustration. "
            f"{KOREAN_DEFAULT}"
        )
    return f"{chosen or BASE_LOOK} {NO_TEXT} {ROUGHNESS} {KOREAN_DEFAULT}"
