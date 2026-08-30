from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Literal

# CIR (Cinematic Intermediate Representation)
class CIR(BaseModel):
    shotSize: str           # Extreme Close-Up / Close-Up / Medium Close-Up / Medium Shot / Medium Long Shot / Long Shot / Extreme Wide Shot
    horizontalAngle: str    # Frontal / Three-Quarter / Profile / Rear
    verticalLevel: str      # High / Eye / Low / Top-Down / Ground
    viewpointFraming: str   # Objective / OTS / POV
    occlusion: Optional[str] = None   # None / Partial / Heavy
    depth: Optional[str] = None       # Shallow / Deep
    motionHint: Optional[str] = None  # Static / Pan / Tilt / Track / Zoom / Handheld

# Request: Analyze sketch
class AnalyzeSketchRequest(BaseModel):
    image: str  # base64-encoded image
    script_context: Optional[str] = ""

# Response: Analyze sketch
class AnalyzeSketchResponse(BaseModel):
    alignment: str  # Description of what AI sees in the sketch
    cir: CIR

# Request: Suggest strategies
class SuggestStrategiesRequest(BaseModel):
    image: str  # base64-encoded sketch image
    script: str  # Original scene script/dialogue
    intent: str  # Director's intention
    cir: Optional[CIR] = None  # Optional: Pre-analyzed CIR (if already analyzed)
    axes: List[str] = ["reframe"]  # ['reframe', 'mise', 'lighting', 'freeform']
    mise_options: Optional[List[str]] = None  # ['blocking', 'props', 'set_dressing']
    theory_preference: Optional[str] = None  # freeform에서만 사용: 특정 책/이론 선호

# Per-axis structured output blocks
class MiseEnScene(BaseModel):
    blocking: Optional[str] = None       # 인물 위치/동선
    props: Optional[List[str]] = None    # 소품
    set_dressing: Optional[str] = None   # 배경/세트

class Lighting(BaseModel):
    key: Optional[str] = None            # 주광 방향/강도
    fill: Optional[str] = None           # 보조광
    mood: Optional[str] = None           # high-key / low-key / chiaroscuro

# Individual shot in a strategy
class Shot(BaseModel):
    order: int
    cir: Optional[CIR] = None                # reframe 축 포함 시
    mise: Optional[MiseEnScene] = None       # mise 축 포함 시
    lighting: Optional[Lighting] = None      # lighting 축 포함 시
    freeform: Optional[str] = None           # freeform 축 포함 시(자유 텍스트)
    theory_rationale: str
    source: str  # Book reference
    recommendation_summary: str = ""
    theory_fit_summary: str = ""
    current_shot_connection: str = ""
    expected_effect_summary: str = ""

# Strategy (branching path)
class Strategy(BaseModel):
    name: str
    short_title: Optional[str] = None
    shots: List[Shot]
    intention_tags: List[str]

# Response: Suggest strategies
class SuggestStrategiesResponse(BaseModel):
    strategies: List[Strategy]

# Request: Theory answer
class TheoryAnswerRequest(BaseModel):
    cir: CIR
    intent: str
    script_context: Optional[str] = ""

# Response: Theory answer
class TheoryAnswerResponse(BaseModel):
    answer: str

# Request: Generate overlay guide
class GenerateOverlayRequest(BaseModel):
    image: str  # base64-encoded original sketch
    strategy_name: str
    cir: CIR
    theory_rationale: str
    intent: str

# Response: Generate overlay guide
class GenerateOverlayResponse(BaseModel):
    overlay_image: str  # base64-encoded overlay image

# Request: Enhance sketch
class EnhanceReference(BaseModel):
    """A character or location reference used only to recognize the current cut."""
    name: str
    kind: Literal["character", "location", "layout"]
    image: str

class EnhanceSketchRequest(BaseModel):
    image: str  # base64-encoded rough sketch
    script_context: str
    intent: Optional[str] = ""
    # Same cut context used by panel generation. It informs what an existing
    # ambiguous mark refers to; it never authorizes a redraw.
    prompt: Optional[str] = ""
    shared: Optional[str] = ""
    previous: Optional[str] = ""
    references: List[EnhanceReference] = []
    style: Optional[str] = ""
    style_preset: Literal["rough", "detailed", "photoreal"] = "rough"
    layout: Optional[str] = ""
    # 기본은 스케치를 보드의 그림체로 맞추는 것이다. add는 이전 클라이언트
    # 호환을 위해서만 허용한다.
    mode: Optional[str] = "restyle"

# Response: Enhance sketch
class EnhanceSketchResponse(BaseModel):
    enhanced_image: str  # base64-encoded enhanced sketch

# Request: Generate sketch
class GenerateSketchRequest(BaseModel):
    script_context: str
    scene_script: Optional[str] = ""
    intent: Optional[str] = ""
    cir: Optional[CIR] = None
    output_format: Optional[str] = "png"  # "png" or "svg"
    detail_level: Optional[int] = 50  # 0=simple/minimal, 100=detailed/rich

# Response: Generate sketch
class GenerateSketchResponse(BaseModel):
    generated_image: str  # base64-encoded PNG or raw SVG string
    output_format: str = "png"  # "png" or "svg"

# Request: Generate sketch layers (batch)
class GenerateLayersRequest(BaseModel):
    script_context: str
    intent: Optional[str] = ""
    layers: Optional[List[str]] = ["background", "foreground"]

# Response: Generate sketch layers (batch)
class GenerateLayersResponse(BaseModel):
    layers: Dict[str, str]  # { layer_name: base64_png }

# Request: Reframe sketch with new CIR
class ReframeSketchRequest(BaseModel):
    image: str  # base64-encoded original sketch
    cir: CIR    # target CIR values
    original_cir: Optional[CIR] = None  # original CIR before reframe
    script_context: Optional[str] = ""
    intent: Optional[str] = ""  # director's intent — highest priority instruction
    strategy_context: Optional[str] = ""  # theory-grounded recommendation context
    include_description: Optional[bool] = True
    model: Optional[str] = "gpt-image-2"  # gpt-image-2 / gpt-image-1.5 / gemini-2.5-flash-image / gemini-3.1-flash-image-preview

# Response: Reframe sketch
class ReframeSketchResponse(BaseModel):
    reframed_image: str  # base64-encoded reframed sketch
    description: str = ""  # brief description of what changed

# Request: Generate single layer
class GenerateSingleLayerRequest(BaseModel):
    script_context: str
    intent: Optional[str] = ""
    layer: str  # "background", "midground", or "foreground"

# Response: Generate single layer
class GenerateSingleLayerResponse(BaseModel):
    layer: str
    image: str  # base64_png

# Request: Generate SVG layers (object-level separation)
class GenerateSvgLayersRequest(BaseModel):
    script_context: str
    intent: Optional[str] = ""
    cir: Optional[CIR] = None
    layers: Optional[List[str]] = ["background", "character"]
    detail_level: Optional[int] = 50

# Response: Generate SVG layers
class GenerateSvgLayersResponse(BaseModel):
    layers: Dict[str, Optional[str]]  # { layer_name: svg_string or null if failed }

# Request: Vectorize image to SVG
class VectorizeRequest(BaseModel):
    image: str  # base64-encoded PNG

# Response: Vectorize
class VectorizeResponse(BaseModel):
    svg: str  # SVG string


# ── Viewer Reflection: Initial Reading only ──────────────────

class ViewerPanelInput(BaseModel):
    """Audience-visible material only; no labels, CIR, or creator context."""
    image: str

ViewerReadingCondition = Literal["first_viewer", "film_literate", "context_close"]

class ViewerCustomReadingCondition(BaseModel):
    """A user-authored attention condition, never creator intent or story context."""
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=60)
    instruction: str = Field(min_length=1, max_length=360)

class ViewerInitialReadingRequest(BaseModel):
    panels: List[ViewerPanelInput]
    reading_conditions: List[ViewerReadingCondition] = ["first_viewer"]
    custom_conditions: List[ViewerCustomReadingCondition] = []

class ViewerReadingStep(BaseModel):
    panel_order: int
    noticed_cues: List[str]
    immediate_reading: str
    feeling: str
    relation_to_previous: Literal[
        "start",
        "reinforced",
        "shifted",
        "unsettled",
        "new_question",
    ]
    current_hypothesis: str
    open_question: str
    # Temporary view compatibility. The model does not generate these fields;
    # the service derives them from the cumulative reading above.
    visible_cues: List[str] = []
    possible_interpretations: List[str] = []
    inferred_assumptions: List[str] = []

class ViewerInterpretiveBranch(BaseModel):
    starts_at_panel: int
    main_reading: str
    alternative_reading: str
    status: Literal[
        "main_strengthened",
        "alternative_strengthened",
        "unresolved",
    ]
    visible_basis: List[str]

class ViewerReviewPoint(BaseModel):
    panel_orders: List[int]
    issue: str
    audience_effect: str
    recommended_change: str = ""
    issue_kind: Literal[
        "element_visibility",
        "spatial_relation",
        "framing_readability",
        "cut_connection",
        "information_order",
    ]
    suspected_cause: Literal["mise", "camera", "editing"]
    # The viewer supplies a symptom and suspected cause. The backend resolves
    # the final route and range so a model cannot send an unsupported route.
    routes: List[Literal["mise", "camera", "editing"]] = []
    scope: Literal["single", "range"] = "single"
    route_reason: str = ""

class ViewerInitialReading(BaseModel):
    id: str = "initial-reading"
    title: str = "처음 읽힌 흐름"
    summary: str
    final_hypothesis: str
    emotional_arc: str
    turning_point_panel_order: int
    turning_point_reason: str
    steps: List[ViewerReadingStep]
    interpretive_branches: List[ViewerInterpretiveBranch] = []
    unresolved_questions: List[str] = []
    review_points: List[ViewerReviewPoint] = []
    # Temporary view compatibility; remove after the Viewer UI consumes the
    # cumulative fields and review_points directly.
    visible_cues: List[str] = []
    inferred_assumptions: List[str] = []
    routes: List[str] = []

class ViewerConditionReading(BaseModel):
    condition_id: str
    reading: ViewerInitialReading

class ViewerPerspectiveReading(BaseModel):
    condition_id: str
    reading: str

class ViewerPerspectiveDivergence(BaseModel):
    panel_orders: List[int]
    shared_cues: List[str]
    readings: List[ViewerPerspectiveReading]
    why_it_matters: str
    issue_kind: Literal[
        "element_visibility",
        "spatial_relation",
        "framing_readability",
        "cut_connection",
        "information_order",
    ]
    suspected_cause: Literal["mise", "camera", "editing"]
    routes: List[Literal["mise", "camera", "editing"]] = []
    scope: Literal["single", "range"] = "single"
    route_reason: str = ""

class ViewerPerspectiveComparison(BaseModel):
    common_reading: str
    divergences: List[ViewerPerspectiveDivergence] = []

# ── Viewer Intent Check: 읽힌 것 ↔ 컷의 목적 ──────────────────
# 관객은 의도를 모른 채 읽는다(그 원칙은 위 흐름이 지킨다). 대조는 그
# 뒤에 따로 한다 — 읽기가 끝난 결과와, 감독이 컷 플랜에서 이미 정해 둔
# 목적을 맞춰 본다. 감독에게 새로 물어보는 것은 없다.

class IntentCheckCut(BaseModel):
    """대조할 컷 하나. 값은 전부 컷 플랜에 이미 있는 것이다."""

    panel_order: int
    # 이 컷이 왜 있는가. 컷 플랜의 `중요한 것`이다.
    purpose: str = ""
    # 화면에 무엇이 보이는가. 목적이 비었을 때 판정의 근거가 된다.
    content: str = ""
    # 관객이 이 자리에서 실제로 읽은 것. 조건이 여럿이면 줄로 모은다.
    readings: List[str] = Field(default_factory=list)


class IntentCheckRequest(BaseModel):
    cuts: List[IntentCheckCut] = Field(min_length=1)
    # 장면 전체 의도. 컷 목적이 비어도 이것과는 견줄 수 있다.
    scene_intention: str = ""


class IntentCheckVerdict(BaseModel):
    panel_order: int
    # reached  — 목적이 관객에게 닿았다.
    # partial  — 닿긴 했으나 다른 것이 앞선다.
    # missed   — 목적과 다르게 읽혔다.
    # unknown  — 목적이 비어 있어 판정할 수 없다.
    status: Literal["reached", "partial", "missed", "unknown"]
    # 어긋났을 때 **무엇과** 어긋났는지. 화면이 목적과 읽힘을 나란히
    # 놓으려면 둘 다 있어야 한다 — `다르게 읽혔다`만으로는 원래 무엇을
    # 의도했는지 감독이 컷 플랜을 다시 찾아봐야 한다.
    intended: str = Field(default="", max_length=120)
    read_as: str = Field(default="", max_length=120)
    # 어긋났을 때, 화면의 무엇이 그렇게 읽히게 했는가.
    screen_cause: str = Field(default="", max_length=200)


class IntentCheckResponse(BaseModel):
    verdicts: List[IntentCheckVerdict] = Field(default_factory=list)


class ViewerInitialReadingResponse(BaseModel):
    initial_reading: ViewerInitialReading
    readings: List[ViewerConditionReading] = []
    comparison: Optional[ViewerPerspectiveComparison] = None


# ── Segmentation (MobileSAM, click-based) ─────────────────────

class SegmentPrepareRequest(BaseModel):
    image: str                              # base64 (PNG bytes, or raw SVG bytes)
    type: Literal["png", "svg"] = "png"
    target_width: Optional[int] = 1024      # used only when type == "svg"

class SegmentPrepareResponse(BaseModel):
    session_id: str
    image_size: List[int]                   # [width, height]
    elapsed_ms: int

class SegmentPointRequest(BaseModel):
    session_id: str
    x: int
    y: int
    max_area_ratio: Optional[float] = 0.5   # drop masks larger than this fraction of the frame
    use_corner_negatives: Optional[bool] = True

class SegmentCandidate(BaseModel):
    bbox: List[int]                         # [x, y, w, h]
    area: int
    score: float
    mask_png: str                           # 1-bit PNG, same size as prepared image (base64)

class SegmentPointResponse(BaseModel):
    candidates: List[SegmentCandidate]      # ordered by score desc, up to 3
    elapsed_ms: int

class SegmentLassoRequest(BaseModel):
    session_id: str
    polygon: List[List[int]]                # [[x, y], [x, y], ...] in prepared-image px
    multimask: Optional[bool] = False       # True → up to 3 candidates, False → 1

class SegmentLassoResponse(BaseModel):
    candidates: List[SegmentCandidate]
    elapsed_ms: int


# ── Fill Shot (Gap Fill & Auto-fill Range) ────────────────────

class SequenceShot(BaseModel):
    """A shot in a sequence, used as input for fill-shot analysis."""
    id: str
    label: str
    cir: Optional[CIR] = None
    image: Optional[str] = None   # base64, may be None if not yet drawn
    scriptBeat: Optional[int] = 0

class FillShotCandidate(BaseModel):
    """One AI-suggested fill shot (image + CIR + explanation)."""
    id: str
    label: str                    # e.g. "Insert — coin detail"
    category: str                 # insert | reaction | detail | cutaway | pov | establishing
    cir: CIR
    image: str                    # base64 PNG generated by gpt-image-2
    rationale: str                # Korean — why this shot works in this gap
    theory_source: str            # Book title / principle cited
    flow_connection: str          # Korean — how it bridges left→right shot

# ── Gap Fill ─────────────────────────────────────────────────

class GapFillRequest(BaseModel):
    left_shot: SequenceShot       # shot before the gap
    right_shot: SequenceShot      # shot after the gap
    script_context: str           # full scene script
    intent: str                   # director's intent
    user_prompt: Optional[str] = ""   # optional extra instruction for this gap
    candidate_count: int = 3      # how many candidates (default 3)

class GapFillResponse(BaseModel):
    candidates: List[FillShotCandidate]  # 3 candidates to pick from

# ── Auto-fill Range ──────────────────────────────────────────

class EditorialTechnique(BaseModel):
    """A relational editing technique that emerges between two adjacent shots."""
    type: Literal[
        'match_cut',         # 형태/동작/색상 매치
        'j_cut',             # 뒷 샷 음성이 영상보다 먼저 시작
        'l_cut',             # 앞 샷 음성이 뒷 샷 영상 위로 연장
        'eyeline',           # 시선 매치 / 시선 연결
        'rhythm',            # 컷 길이 패턴으로 만들어지는 리듬
        'temporal_ellipsis', # 컷을 통한 시간 생략
        'line_crossing',     # 180도 법칙의 의도적 위반
    ]
    shot_pair: List[str]     # e.g. ["S3", "S4"] — which two shots this technique connects
    mechanism: str           # Korean — concrete description of how it works in this specific pair
    theory_source: str       # Book / principle cited from the theory library

class AutoFillVersion(BaseModel):
    """One complete version of the filled range."""
    version_label: str            # e.g. "Version A — 긴장 고조"
    rationale: str                # Korean — overall editing intent for this version
    theory_basis: str             # Key theory / book cited
    editorial_techniques: List[EditorialTechnique] = []  # Optional — relational editing techniques used
    insertions: List[dict]        # [{ after_shot_id, candidate: FillShotCandidate }]

class AutoFillRangeRequest(BaseModel):
    shots: List[SequenceShot]     # range of shots (in order)
    script_context: str           # full scene script
    intent: str                   # director's intent
    user_prompt: Optional[str] = ""
    version_count: int = 3        # how many versions to generate

class AutoFillRangeResponse(BaseModel):
    versions: List[AutoFillVersion]


# --- Story structure: 이야기 → 씬·비트 ------------------------------------
# 컷을 나누려면 씬(시공간 연속)과 비트(국면)가 있어야 한다. 사용자가 쓴
# 한 덩어리 이야기에는 그 구조가 없으므로 여기서 세운다. 내용은 더하지 않는다.

class StoryStructureRequest(BaseModel):
    story: str                              # 사용자가 쓴 짧은 이야기
    scene_intention: Optional[str] = ""     # 참고용. 내용으로 옮기지 않는다.

class StoryLine(BaseModel):
    text: str                               # 화면에서 볼 수 있는 사건 하나
    filled: bool = False                    # AI가 채운 줄인가. 사용자는 알아야 한다.
    # 이 화면 행동의 근거가 된 원문 조각. 원문의 소품·문구·선택·결말이
    # 구조화 과정에서 빠지지 않았는지 사용자가 대조할 수 있게 남긴다.
    source_evidence: List[str] = []
    characters: List[str] = []              # 이 화면 행동에 등장하는 인물/역할
    shot_size: str = "Medium Shot"          # baseline 카드의 기본 샷 크기
    perspective: str = "Eye Level"          # baseline 카드의 기본 시점/앵글

class StoryBeat(BaseModel):
    lines: List[StoryLine]

class StoryScene(BaseModel):
    heading: str                            # "관제실, 밤"
    beats: List[StoryBeat]

class StoryCharacter(BaseModel):
    name: str
    gender_age: str = ""
    appearance: str = ""
    description: str = ""

class StoryStructureResponse(BaseModel):
    scenes: List[StoryScene]
    characters: List[StoryCharacter] = []


# --- Directing review: 패널 → 다관점 피드백 -------------------------------
# 미장센·촬영·편집 에이전트의 개별 판단과 합의/충돌, 감독의 선택 지점을
# 하나의 응답으로 전달한다. 관객 검토는 의도 비공개 흐름이므로 별도 API를 쓴다.

DirectingLens = Literal["mise", "camera", "editing", "narrative"]
# "relate"는 이미 나온 렌즈 판단들 사이의 관계만 본다. 렌즈 분석과 나누는
# 이유는 시간이다 — 셋을 돌리는 데만 50초가 걸려, 관계까지 한 번에 하면
# 결과를 보기까지 70초를 기다린다.
DirectingReviewMode = Literal["multi", "relate", "mise", "camera", "editing"]
DirectingDiagnosticLevel = Literal[
    "attribute",
    "shot_structure",
    "shot_relation",
    "scene_structure",
]
DirectingLevelStatus = Literal["keep", "check", "change"]


class DirectingReviewPanel(BaseModel):
    id: str
    # 서사는 대본과 컷 내용을 보고 판단하므로 그림이 없어도 성립한다.
    # 나머지 세 렌즈는 화면 근거가 있어야 하므로 analyze_lens에서 막는다.
    image: Optional[str] = None
    context: Optional[str] = None
    directing_notes: Optional[str] = None
    scene_id: Optional[str] = None


class DirectingIssueFocus(BaseModel):
    """다른 렌즈가 이미 선택된 Issue 하나만 다시 볼 때의 입력.

    전체 범위를 새로 훑게 하면 새 concern을 들고 돌아와, "이 Issue에 이
    렌즈를 더한다"는 동작이 무너진다. 위치와 기준을 명시해 독립적으로
    판단하되, 다른 문제를 새로 만들지 않게 한다.
    """

    id: str
    anchor: str
    anchor_kind: Literal["shot", "seam", "scene", ""] = ""
    title: str
    criterion: str = ""
    panel_ids: List[str] = Field(min_length=1)
    # 먼저 발견한 렌즈의 실제 판단. 다른 렌즈가 제목만 보고 새 진단을
    # 병렬로 만들지 않고, 이 판단을 자기 언어로 이어 읽게 한다.
    origin_lens: DirectingLens = "mise"
    origin_reading: str = ""
    # 이 자리를 처음 짚은 것이 렌즈가 아니라 관객일 수 있다. 관객 읽기가
    # 갈린 자리를 렌즈로 확인할 때다 — 그때 `처음 발견한 렌즈`라고 부르면
    # 출처를 잘못 말하게 되고, 그 렌즈가 자기 판단을 이어 읽는 시늉을 한다.
    origin_kind: Literal["lens", "viewer"] = "lens"


class DirectingSettledRelation(BaseModel):
    """감독이 이미 판정한 관계.

    한 번 정리한 것을 AI가 또 짚으면 판정한 의미가 없다. 다음 검토에
    함께 보내 같은 지적을 반복하지 않게 한다.
    """

    diagnosis_ids: List[str] = Field(default_factory=list)
    summary: str = ""
    # 감독이 고른 답. "의도한 거야", "촬영을 고칠게" 등.
    verdict: str = ""


class DirectingCheckAnswer(BaseModel):
    """`check` 층위의 질문에 감독이 답한 것.

    `check`는 "화면만 보고는 알 수 없고 감독만 답할 수 있다"는 판정이다.
    답을 받아 다시 보내지 않으면 그 층위는 영원히 갈리지 않고, 다시 분석할
    때마다 같은 질문이 나온다 (design_goal.md — 발견과 처분의 분리).
    """

    level: str = ""
    question: str = ""
    answer: str = ""


class DirectingReviewRequest(BaseModel):
    mode: DirectingReviewMode = "multi"
    panels: List[DirectingReviewPanel] = Field(min_length=1)
    intent: Optional[str] = ""
    settled: List[DirectingSettledRelation] = Field(default_factory=list, max_length=8)
    # 감독이 답한 `check` 질문. 의도와 함께 보내 그 층위를 다시 판정하게 한다.
    answers: List[DirectingCheckAnswer] = Field(default_factory=list, max_length=8)
    # mode="relate"일 때만 쓴다. 이미 받은 렌즈 결과를 그대로 돌려보낸다 —
    # 이미지를 다시 올리지 않으므로 관계 찾기는 훨씬 빠르다.
    lens_results: Optional[Dict[DirectingLens, "DirectingLensResult"]] = None
    # Inspector에서 아직 보지 않은 렌즈를 더할 때만 쓴다.
    focus: Optional[DirectingIssueFocus] = None


class DirectingAlternativePatch(BaseModel):
    """선택지가 바꾸는 컷 표의 값. 바꾸지 않는 항목은 None."""

    shot_size: Optional[str] = None
    angle: Optional[str] = None
    move: Optional[str] = None


class DirectingAlternative(BaseModel):
    """한 갈래의 연출 선택.

    기준(criterion)에 어떻게 답하느냐에 따라 갈린다. 서로 배타적이어야
    선택이 된다 — 함께 할 수 있는 것을 나열하면 그건 조언 목록이다.
    """

    # 'keep'은 지금 상태를 유지하는 길. 언제나 하나 있어야 한다.
    kind: Literal["keep", "change"]
    # 버튼에 붙는 짧은 말. "그대로 두기", "더 넓게 잡기"
    label: str = Field(min_length=1, max_length=24)
    # 이 길을 고르면 무엇이 달라지는가. 한 문장.
    effect: str = Field(min_length=1, max_length=160)
    # 이 선택지가 컷 표의 어느 값을 바꾸는가. 화면이 그 자리에서 적용한다.
    # 전부 null이면 샷 값으로 풀리지 않는 것이고, 프롬프트를 고쳐야 한다.
    patch: Optional[DirectingAlternativePatch] = None


class DirectingEvidenceRegion(BaseModel):
    """그림에서 가리킬 자리. 화면은 이 값으로 상자를 그린다.

    좌표는 **정규화**한다(0~1, 좌상단 원점). 패널 그림의 실제 픽셀 크기는
    화면마다 다르고 스트립·Workbench에서 서로 다른 크기로 보이므로,
    픽셀로 받으면 어디에도 맞지 않는다.
    """

    panel: str = Field(min_length=1)
    # 무엇을 가리키는가. "인물", "창문", "노트북 화면".
    label: str = Field(min_length=1, max_length=24)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    # 이 대상이 향한 쪽. 화살표는 여기서 나온다 — 박스는 "어디에 있나"만
    # 말하므로, screen direction·eyeline·camera angle은 이것 없이 그릴 수
    # 없다 (`LENS_TRACKS_UI.md` 4장).
    facing: Literal[
        "left", "right", "up", "down", "toward-camera", "away", ""
    ] = ""
    # 그림에서 확실히 보이는가. 낮으면 화살표를 그리지 않는다 —
    # 틀린 화살표는 없는 것보다 나쁘다. 문장(reading)은 그대로 남는다.
    confidence: Literal["high", "medium", "low", ""] = ""

    @model_validator(mode="after")
    def drop_low_confidence_facing(self):
        # 짐작으로 그린 화살표는 감독을 잘못된 자리로 데려간다. 방향만
        # 지우고 상자는 남긴다 — 위치는 여전히 쓸모 있다.
        if self.facing and self.confidence == "low":
            self.facing = ""
        return self

    @model_validator(mode="after")
    def clamp_to_frame(self):
        # 상자가 화면을 넘어가면 잘라 둔다. 모델이 가장자리 대상을 짚을 때
        # 종종 1을 넘긴다 — 버리는 것보다 맞춰 두는 편이 낫다.
        self.w = min(self.w, 1 - self.x)
        self.h = min(self.h, 1 - self.y)
        return self


class DirectingEvidence(BaseModel):
    """근거 하나. 화면이 이것으로 표시를 그린다 (`LENS_TRACKS_UI.md` 4장).

    지금까지 evidence는 문장이었다. 문장만으로는 "이 그림의 어디"를 가리킬
    수 없어, 감독이 근거를 화면에서 직접 확인하지 못한다. 무엇이 어디에
    있는지를 데이터로 받아 그림 위에 그린다.
    """

    # attribute: 값의 변화(샷 크기 Wide → Close-up).
    # region: 그림의 한 자리를 상자로 가리킨다.
    # relation: 두 컷 사이의 관계. 두 자리를 잇는다.
    kind: Literal["attribute", "region", "relation"] = "region"
    # 사람이 읽는 한 문장. 구조화 이전의 evidence[i]가 하던 일이다.
    reading: str = Field(min_length=1)
    regions: List[DirectingEvidenceRegion] = Field(default_factory=list, max_length=2)
    # kind="attribute"일 때. 무엇이 무엇에서 무엇으로 바뀌었는가.
    attribute: str = ""
    before: str = ""
    after: str = ""

    @model_validator(mode="after")
    def require_shape_for_kind(self):
        # region/relation인데 자리가 없으면 그릴 것이 없다. 문장은 살아
        # 있으므로 kind만 낮춰 attribute로 둔다 — 근거를 버리지 않는다.
        if self.kind in ("region", "relation") and not self.regions:
            self.kind = "attribute"
        # relation은 두 자리를 잇는 것이다. 하나뿐이면 region이다.
        if self.kind == "relation" and len(self.regions) < 2:
            self.kind = "region"
        return self


class DirectingDiagnosis(BaseModel):
    id: str
    rule_id: str
    level: DirectingDiagnosticLevel
    targets: List[str] = Field(min_length=1)
    # 이 진단 하나를 부르는 이름. 트랙 위의 마커는 이것으로 구별된다 —
    # 규칙 이름을 쓰면 같은 규칙에 걸린 진단이 전부 같은 이름이 되어
    # 마커를 아무리 늘어놓아도 어느 것이 무엇인지 알 수 없다.
    # 비어 있으면 서버가 규칙 이름으로 채운다(`_title_from_rule`).
    title: str = ""
    diagnosis: str
    # 이 판단이 무엇을 보고 내려졌는가. 모델이 아니라 서버가 rule_id로
    # 채운다 — 기준이 매번 달라지면 같은 문제에 다른 잣대가 적용된다.
    criterion: str = ""
    evidence: List[str] = Field(min_length=1, max_length=2)
    # 그림 위에 그릴 수 있는 형태의 근거. 위 evidence 문장을 대체하지
    # 않는다 — 모델이 좌표를 못 주거나 검증에 걸려도 근거가 사라지면
    # 감독은 무엇을 보고 판정할지 알 수 없다 (`LENS_TRACKS_UI.md` 6장).
    visual_evidence: List["DirectingEvidence"] = Field(
        default_factory=list, max_length=2
    )
    theory_basis: Optional[str] = None
    theory_source: Optional[str] = None
    suggested_action: str
    # 갈 수 있는 다른 길. 첫 번째는 언제나 '그대로 두기'다 — 유지도 연출
    # 결정이고, 선택지에 없으면 진단이 곧 지시가 된다 (design_goal.md DG1 P2).
    alternatives: List["DirectingAlternative"] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def ensure_keep_alternative(self):
        """'그대로 두기'가 없으면 만들어 맨 앞에 둔다.

        프롬프트로 일러도 모델이 빠뜨릴 때가 있다. 유지가 선택지에서 빠지면
        진단이 곧 지시가 되어, 감독이 그 판단을 물릴 방법이 없어진다.
        """
        if not self.alternatives:
            return self
        if not any(item.kind == "keep" for item in self.alternatives):
            self.alternatives.insert(0, DirectingAlternative(
                kind="keep",
                label="그대로 두기",
                effect="지금 판단을 유지합니다. 위 진단은 감수하는 것이 됩니다.",
            ))
            del self.alternatives[3:]
        # 유지가 첫 번째로 온다 — 무엇을 안 해도 되는지가 먼저 보여야 한다.
        self.alternatives.sort(key=lambda item: item.kind != "keep")
        return self

    @model_validator(mode="after")
    def validate_multi_panel_levels(self):
        panel_ids = {target.split(".", 1)[0] for target in self.targets}
        if self.level in {"shot_relation", "scene_structure"} and len(panel_ids) < 2:
            raise ValueError(f"{self.level} diagnosis must target at least two panels")
        if bool(self.theory_basis) != bool(self.theory_source):
            raise ValueError("theory_basis and theory_source must both be present or both be null")
        return self


class DirectingLevelAssessment(BaseModel):
    """A compact status for every diagnostic level, including levels with no defect."""

    level: DirectingDiagnosticLevel
    status: DirectingLevelStatus
    summary: str = Field(min_length=1, max_length=240)
    # `check`는 화면만으로 판단할 수 없다는 뜻이다. 그것을 요약 문장으로만
    # 두면 감독이 무엇을 답해야 하는지 알 수 없다 — 보이지 않는 공백은
    # 질문으로 되돌린다 (design_goal.md DG1 P2).
    open_question: str = ""

    @model_validator(mode="after")
    def validate_open_question(self):
        # 판단이 내려진 층위에 질문이 붙으면 무엇을 답해야 하는지 흐려진다.
        if self.status != "check":
            self.open_question = ""
        return self


class DirectingLensResult(BaseModel):
    # Lens가 이 범위(또는 focus Issue)에 대해 내린 기본 방향. 관계보다 먼저
    # 보여 주는 값이라, 다른 Lens의 결론을 흉내 내지 않고 자기 기준으로 답한다.
    stance: Literal["change", "keep", "different"] = "change"
    summary: str
    level_assessments: List[DirectingLevelAssessment] = Field(min_length=4, max_length=4)
    diagnoses: List[DirectingDiagnosis] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def validate_unique_diagnosis_ids(self):
        diagnosis_ids = [diagnosis.id for diagnosis in self.diagnoses]
        if len(diagnosis_ids) != len(set(diagnosis_ids)):
            raise ValueError("diagnosis ids must be unique within a lens result")
        assessment_levels = [assessment.level for assessment in self.level_assessments]
        expected_levels = {
            "attribute", "shot_structure", "shot_relation", "scene_structure",
        }
        if set(assessment_levels) != expected_levels or len(assessment_levels) != len(expected_levels):
            raise ValueError("level_assessments must contain each diagnostic level exactly once")
        diagnosis_levels = [diagnosis.level for diagnosis in self.diagnoses]
        if len(diagnosis_levels) != len(set(diagnosis_levels)):
            raise ValueError("only one diagnosis is allowed per diagnostic level")
        status_by_level = {assessment.level: assessment.status for assessment in self.level_assessments}
        if any(status_by_level[diagnosis.level] != "change" for diagnosis in self.diagnoses):
            raise ValueError("a diagnosis must belong to a change-level assessment")
        changed_levels = {
            assessment.level
            for assessment in self.level_assessments
            if assessment.status == "change"
        }
        if changed_levels != set(diagnosis_levels):
            raise ValueError("every change-level assessment must include one diagnosis")
        return self


class DirectingCommonFinding(BaseModel):
    """렌즈 사이의 관계.

    'agreement | conflict'만으로는 결과만 말하고 관계를 말하지 못한다.
    한 렌즈의 결정이 다른 렌즈의 판단을 어떻게 바꾸는지가 드러나야
    네 렌즈가 독립적 평가자가 아니라 연결된 시선이 된다.
    """

    type: Literal["agreement", "conflict", "consequence"]
    # 이 묶음의 이름. 화면에서 Issue 제목이 된다 (`LENS_TRACKS_UI.md` 4장 B).
    # summary가 "어떻게 맞물리는가"라면 title은 "무엇에 관한 것인가"다 —
    # 같은 자리에 관계가 둘 이상일 때 감독은 이 이름으로 구별해 고른다.
    title: str = ""
    summary: str
    # 관계의 축은 렌즈 판정 쌍이다. 두 렌즈가 있으면 관계가 성립한다 —
    # 한쪽이 keep이라 진단이 없어도, 그 판정과 다른 렌즈의 판정 사이의
    # 관계(특히 conflict)는 감독이 봐야 한다.
    lenses: List[DirectingLens] = Field(min_length=2)
    # 수정 라우팅에 쓴다. 진단을 낸 렌즈의 것만 담기며, keep 렌즈만
    # 얽힌 관계에서는 하나이거나 비어 있을 수 있다.
    diagnosis_ids: List[str] = Field(default_factory=list)
    # --- 아래 셋은 서버가 채운다. 모델에게 묻지 않는다 ---------------
    # 이 Issue가 걸리는 자리. 진단들의 targets에서 계산한다.
    # 트랙에서 마커가 놓이는 가로 위치이자, Inspector의 `Where`다.
    anchor: str = ""
    # shot(컷 위) / seam(컷 사이) / scene(범위 전체).
    # 마커를 컷 중앙에 둘지 사이에 둘지가 여기서 갈린다.
    anchor_kind: Literal["shot", "seam", "scene", ""] = ""
    # 이 현상을 처음 짚은 렌즈. Inspector에서 `●`(origin)로 표시된다.
    # consequence면 원인 쪽, 아니면 진단 id 순서상 첫 렌즈다.
    origin_lens: Optional[DirectingLens] = None
    # consequence일 때: 어느 렌즈의 결정이 원인이고 어느 쪽이 그 영향을 받는가.
    # 방향이 있어야 어디를 고쳐야 하는지가 정해진다.
    source_lens: Optional[DirectingLens] = None
    affected_lens: Optional[DirectingLens] = None

    @model_validator(mode="after")
    def validate_consequence_direction(self):
        if self.type == "consequence" and not (self.source_lens and self.affected_lens):
            raise ValueError("consequence finding must name source_lens and affected_lens")
        if self.type == "consequence" and self.source_lens == self.affected_lens:
            raise ValueError("consequence must relate two different lenses")
        return self


class DirectingComparisonDifference(BaseModel):
    lens: DirectingLens
    text: str = Field(min_length=1, max_length=180)


class DirectingLensComparison(BaseModel):
    """같은 현상을 렌즈마다 어떻게 확인하는지의 짧은 비교.

    관계와 달리 Issue를 합치거나 수정 순서를 정하지 않는다. 서로 다른
    intervention target이어도, 감독이 같은 현상을 비교해 볼 수 있다.
    """
    diagnosis_ids: List[str] = Field(min_length=2)
    common: str = Field(min_length=1, max_length=180)
    differences: List[DirectingComparisonDifference] = Field(min_length=2, max_length=3)


class DirectingHold(BaseModel):
    """이 자리를 보고 **바꿀 필요가 없다**고 판단한 렌즈와 그 근거.

    진단이 아니므로 Issue의 `lenses`에는 들어가지 않는다. 그래도 화면에는
    남아야 한다 — 한 렌즈가 고치자고 할 때 다른 렌즈가 그대로 두자고 한
    사실이 사라지면, 감독은 바꾸자는 쪽 말만 듣고 판정하게 된다.
    """

    lens: DirectingLens
    # 왜 지금도 충분한가. 그 렌즈의 summary를 그대로 옮긴다.
    reason: str = ""


class DirectingIssue(BaseModel):
    """한 자리에서 하나의 현상. 트랙의 마커 하나이자 Inspector 카드 하나.

    관계(`common_findings`)는 **진단 쌍**으로 나온다 — 진단이 셋이면 쌍이
    셋이라, 같은 현상을 세 번 잘라 보고한다. 그대로 화면에 올리면 렌즈당
    마커가 여러 개 찍힌다(진단은 렌즈당 하나뿐인데). 그래서 진단을 공유하는
    관계들을 하나로 묶은 것이 Issue다.

    합쳐도 되는 근거: 한 렌즈는 같은 층위에서 진단을 하나만 낸다
    (`DirectingLensResult`의 검증). 그러므로 두 관계가 진단을 공유하면
    그 진단이 가리키는 현상도 같다 — 정말 다른 현상이라면 진단이 달랐다.

    관계 자체는 지우지 않는다. 종류(agreement/conflict/consequence)와 방향은
    Issue 안에서 여전히 감독이 읽어야 할 정보다.
    """

    id: str
    # 트랙에서 마커가 놓이는 가로 위치이자 Inspector의 `Where`.
    anchor: str
    anchor_kind: Literal["shot", "seam", "scene", ""] = ""
    # 목록에서 이 Issue를 고르게 하는 이름. 합칠 때 후보가 여럿이면
    # origin 렌즈가 낸 관계의 title을 쓴다 — 가장 근본에 가까운 쪽이다.
    title: str
    # 이 Issue를 이루는 진단들. 렌즈당 최대 하나.
    diagnosis_ids: List[str] = Field(min_length=1)
    # 이 현상에 걸린 렌즈들. Inspector에서 `●`로 표시되는 것들.
    lenses: List[DirectingLens] = Field(min_length=1)
    # 처음 짚은 렌즈. consequence면 원인 쪽.
    origin_lens: Optional[DirectingLens] = None
    # 이 범위를 보고 **바꿀 필요가 없다**고 판단한 렌즈. 진단이 없으므로
    # `lenses`에 넣을 수 없지만(그 목록은 문제를 짚은 렌즈다), 감독은 이
    # 판단도 봐야 한다 — 한 렌즈가 고치자고 할 때 다른 렌즈가 그대로 두자고
    # 한 사실이 화면에서 사라지면, 바꾸자는 쪽 말만 남는다.
    holding_lenses: List["DirectingHold"] = Field(default_factory=list)
    # 이 Issue를 이루는 관계들. 종류와 방향이 여기 남는다.
    relation_types: List[Literal["agreement", "conflict", "consequence"]] = Field(
        default_factory=list
    )


class DirectingOrder(BaseModel):
    """어느 렌즈부터 손댈 것인가.

    세 렌즈가 각자 문제를 짚으면 감독은 어디부터 열어야 할지 모른다.
    관계가 그 순서를 정한다 — 원인을 먼저 고쳐야 결과가 따라 달라진다.
    """

    first_lens: DirectingLens
    reason: str
    # 먼저 고친 뒤 다시 봐야 하는 렌즈. 원인이 바뀌면 결과도 바뀐다.
    then: List[DirectingLens] = Field(default_factory=list)


class DirectingChoiceOption(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    target_lens: Optional[DirectingLens] = None
    intent_draft: Optional[str] = None


class DirectingChoice(BaseModel):
    id: str
    prompt: str
    lenses: List[DirectingLens] = Field(default_factory=list)
    diagnosis_ids: List[str] = Field(default_factory=list)
    options: List[DirectingChoiceOption] = Field(min_length=2)


class DirectingQuestion(BaseModel):
    """감독이 확인한 뒤 다시 분석할 검토 방향.

    API 키는 기존 클라이언트 호환성을 위해 ``questions``로 유지한다.
    """
    id: str
    prompt: str
    lenses: List[DirectingLens] = Field(default_factory=list)
    level: Optional[DirectingDiagnosticLevel] = None
    targets: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_multi_panel_levels(self):
        panel_ids = {target.split(".", 1)[0] for target in self.targets}
        if self.level in {"shot_relation", "scene_structure"} and len(panel_ids) < 2:
            raise ValueError(f"{self.level} question must target at least two panels")
        return self


class DirectingReviewResponse(BaseModel):
    lens_results: Dict[DirectingLens, DirectingLensResult]
    # 다관점에서 답을 못 받은 렌즈. 조용히 빼면 감독이 그 관점을 '문제 없음'
    # 으로 읽는다 — 실제로는 검증에 걸려 결과가 없는 것이다.
    failed_lenses: List[DirectingLens] = Field(default_factory=list)
    common_findings: List[DirectingCommonFinding] = Field(default_factory=list)
    comparisons: List[DirectingLensComparison] = Field(default_factory=list)
    # 화면이 쓰는 단위. common_findings를 진단 기준으로 묶은 것이다 —
    # 관계는 진단 쌍으로 나와서 같은 현상이 여러 번 보고되기 때문이다
    # (`DirectingIssue` 참고). 관계 자체는 위에 그대로 남는다.
    issues: List[DirectingIssue] = Field(default_factory=list)
    # 모델이 관계를 냈으나 진단을 짚지 못해 버린 개수. 조용히 버리면
    # 화면에서 '관계 없음'과 구분되지 않아, 모델이 못 찾은 것인지 우리가
    # 버린 것인지 감독이 알 수 없다 — failed_lenses와 같은 이유다.
    dropped_relations: int = 0
    # 다관점에서만 나온다. 관계를 근거로 어느 렌즈부터 볼지 제안한다.
    order: Optional[DirectingOrder] = None
    directing_choices: List[DirectingChoice] = Field(default_factory=list)
    questions: List[DirectingQuestion] = Field(default_factory=list)


# --- Narrative suggestion: 지금 Beat에 대한 제안 ---------------------------
# 제안이지 수정이 아니다. 사용자가 수락해야 대본이 바뀐다 (DG1 P2).

class NarrativeSuggestionBeat(BaseModel):
    """대본 전체를 Beat 단위로 넘긴다.

    요청이 늘 지금 Beat에 대한 것은 아니다 — "뒷부분이 급하다"처럼 전체를
    두고 하는 말이면 다른 Beat를 고쳐야 한다.
    """
    index: int
    lines: List[str]


class NarrativeSuggestionRequest(BaseModel):
    narrative_request: str                  # 사용자의 요청
    beat_lines: List[str]                   # 사용자가 마지막으로 짚은 Beat의 줄들
    # scene 범위에서는 현재 Scene에 속한 Beat만 보낸다.
    script_beats: List[NarrativeSuggestionBeat] = []
    active_beat: int = 0
    scene_title: Optional[str] = ""
    scope: Literal["scene", "beat"] = "scene"
    scene_intention: Optional[str] = ""
    panel_count: Optional[int] = None       # 이 Beat의 현재 패널 수

class NarrativeSuggestionItem(BaseModel):
    type: Literal["split-beat", "insert-script-line", "replace-script-line"]
    title: str
    reason: str
    # 이 제안이 붙을 Beat. 지금 Beat가 아닐 수 있다.
    beat: int = -1
    line_index: int = -1                    # Beat 안에서의 줄 번호. 없으면 -1
    original_text: str = ""
    proposed_text: str = ""

class NarrativeSuggestionResponse(BaseModel):
    suggestions: List[NarrativeSuggestionItem]


class NarrativeCheckCut(BaseModel):
    """컷 플랜의 컷 하나. 그림은 없다 — 아직 그리기 전이다."""
    id: str
    order: int
    content: str
    purpose: Optional[str] = ""
    characters: Optional[str] = ""
    place: Optional[str] = ""
    time: Optional[str] = ""
    # 정해진 샷 크기. 내용과 크기가 맞는지는 이 값이 있어야 판단할 수 있다.
    # 비어 있으면 아직 촬영이 정하지 않은 컷이다.
    shot_size: Optional[str] = ""


class NarrativeCheckRequest(BaseModel):
    # 컷 플랜 점검이면 cuts, 대본 점검이면 lines. 둘 중 하나는 있어야 한다.
    cuts: List[NarrativeCheckCut] = []
    lines: List[str] = []
    scene_intention: Optional[str] = ""
    script: Optional[str] = ""
    lens: Optional[Literal["editing", "camera", "mise"]] = None

    @model_validator(mode="after")
    def require_material(self):
        if not self.cuts and not self.lines:
            raise ValueError("cuts or lines is required")
        return self


class NarrativeCheckFinding(BaseModel):
    rule_id: Literal[
        "narrative-beat-progression",
        "narrative-action-visibility",
        "narrative-information-reveal",
        "narrative-causal-link",
        # 컷 플랜 단계는 그림 없이 판단할 수 있는 규칙만 쓴다 — 시선·리듬과
        # 카메라 위치·축은 화면이 있어야 하므로 Decision Board로 미룬다.
        "editing-shot-function",
        "editing-information-order",
        # 크기가 그 컷의 핵심을 담는지는 내용과 샷 크기만으로 판단할 수 있고,
        # 그린 뒤에 알면 다시 그려야 하므로 여기서 짚는다.
        "camera-information-selection",
        # 컷 플랜의 미장센은 텍스트 근거로 확인 가능한 요소·관계·동선만
        # 점검한다. 실제 화면의 시선 유도는 Panels 이후에 본다.
        "mise-functional-elements",
        "mise-relational-blocking",
        "mise-spatial-continuity",
    ]
    # 이 지적이 걸린 컷. 인과·정보 순서는 둘 이상이 될 수 있다.
    # 대본 점검에서는 비고 line_indexes가 대신 찬다.
    cut_ids: List[str] = []
    # 대본 점검에서 이 지적이 걸린 줄 번호(0부터).
    line_indexes: List[int] = []
    finding: str
    # 편집 점검은 해결책을 지시하지 않는다. 문제를 읽을 때의 화면 근거다.
    suggested_action: str
    operation: Literal["keep"] = "keep"


class NarrativeCheckResponse(BaseModel):
    summary: str
    findings: List[NarrativeCheckFinding]


# --- Cut plan: Beat → 컷 --------------------------------------------------
# Beat는 이야기의 국면, Cut은 한 화면이다. 한 Beat가 몇 컷이 되는지가
# 연출 판단이고, 그것이 줄콘티가 하는 일이다.
# 샷 크기·앵글·카메라는 여기서 정하지 않는다 — 촬영의 몫이다.

class CutPlanBeat(BaseModel):
    beat: int                               # Beat 번호 (0부터)
    lines: List[str]                        # 그 Beat의 대본 줄

class CutPlanRequest(BaseModel):
    heading: str                            # "관제실, 밤"
    beats: List[CutPlanBeat]
    cast: List[str] = []                    # 이 씬의 인물
    scene_intention: Optional[str] = ""

class PlannedCut(BaseModel):
    beat: int
    time: str = ""                         # 장면의 시각. 근거가 없으면 빈 문자열
    place: str = ""                        # 화면의 장소
    content: str                            # 이 화면에 보이는 것
    purpose: str                            # 이 컷이 왜 있는가
    characters: str = ""                    # 화면에 보이는 인물만

class CutPlanResponse(BaseModel):
    cuts: List[PlannedCut]


# --- Shot design: 컷 → 샷 -------------------------------------------------
# 줄콘티가 나눈 컷을 어떻게 찍을지 정한다. 컷 하나만 보고는 정할 수 없어
# (같은 크기 연속, 점프컷, 공간 설정 부재) 씬의 컷 전체를 함께 본다.

class ShotDesignCut(BaseModel):
    beat: int
    content: str
    purpose: str = ""
    characters: str = ""

class ShotDesignRequest(BaseModel):
    heading: str
    cuts: List[ShotDesignCut]
    # 씬의 대본. 컷 목록만으로는 어디가 중요한 대목인지 알 수 없다.
    script: Optional[str] = ""
    scene_intention: Optional[str] = ""

class ReferenceImageRequest(BaseModel):
    # "character" | "location"
    kind: str
    # 항목 값에서 조립하거나 사용자가 직접 고친 문장.
    prompt: str
    # 패널과 레퍼런스가 다른 화풍으로 갈라지지 않도록 같은 씬의 그림체를 쓴다.
    style: Optional[str] = ""
    # 표현 밀도. 패널과 같은 값이어야 한다 — 기준 그림이 선화인데 패널이
    # 실사면, 참조로 물렸을 때 두 화풍이 서로 경쟁한다.
    style_preset: Literal["rough", "detailed", "photoreal"] = "rough"
    # 기준 그림을 만들 모델. 패널과 같은 것을 쓸 수 있어야 한다 — 여기서만
    # 다른 모델로 그리면 화풍이 그 지점에서 갈린다.
    model: Literal["gpt-image-1", "gpt-image-2"] = "gpt-image-2"

class ReferenceImageResponse(BaseModel):
    image: str      # base64 PNG

class SeamInsertRequest(BaseModel):
    """두 컷 사이에 넣을 컷을 제안받는다."""

    before_content: str = ""
    before_purpose: str = ""
    after_content: str = ""
    after_purpose: str = ""
    # 이음새에 적어 둔 '생략된 것'. 있으면 가장 곧은 근거다.
    elision: Optional[str] = ""
    script: Optional[str] = ""
    # 진단에서 넘어온 경우, 왜 이 자리에 컷이 필요한지.
    diagnosis: Optional[str] = ""
    # 앞뒤 컷의 실제 그림. 문장만으로는 화면의 거리·자세·소품이 안 보여,
    # 새로 넣을 컷이 그 사이 어딘가로 어색하게 튈 수 있다. 그려진 것이
    # 있는 컷만 보낸다.
    before_image: Optional[str] = None
    after_image: Optional[str] = None

class SeamInsertCandidate(BaseModel):
    content: str
    purpose: str = ""
    characters: str = ""
    reason: str = ""

class SeamInsertResponse(BaseModel):
    candidates: List[SeamInsertCandidate] = []

class SeamSplitRequest(BaseModel):
    """한 컷을 두 컷으로 나눈 안을 제안받는다.

    감독이 직접 나눌 때는 제안하지 않는다 — 어디서 끊을지는 감독의 판단이다.
    편집 렌즈가 "두 사건이 겹쳐 있다"고 진단한 경우에만, 그 진단이 이미
    무엇과 무엇이 겹쳤는지 알고 있으므로 나눈 안을 낸다.
    """

    # 나눌 컷.
    content: str = ""
    purpose: str = ""
    characters: str = ""
    # 앞뒤 컷. 나눈 결과가 이 둘 사이에 자연스럽게 놓여야 한다.
    before_content: Optional[str] = ""
    after_content: Optional[str] = ""
    script: Optional[str] = ""
    # 편집 진단. 무엇과 무엇이 겹쳤다고 보았는지가 나누는 근거다.
    diagnosis: Optional[str] = ""
    # 나눌 컷과 앞뒤 컷의 실제 그림. 화면에 이미 무엇이 보이는지 알아야
    # 나눈 두 컷이 그 그림과 어긋나지 않는다 — 문장에 없던 소품이나 자세가
    # 그림에는 있을 수 있다.
    cut_image: Optional[str] = None
    before_image: Optional[str] = None
    after_image: Optional[str] = None

class SeamSplitPart(BaseModel):
    content: str
    purpose: str = ""
    characters: str = ""

class SeamSplitResponse(BaseModel):
    # 앞 컷과 뒤 컷. 원본 컷의 내용이 둘로 나뉜다.
    first: SeamSplitPart
    second: SeamSplitPart
    # 왜 이 자리에서 끊었는가. 감독이 판정할 근거다.
    reason: str = ""

class SeamMergeRequest(BaseModel):
    """두 컷을 하나로 합친 안을 제안받는다.

    지금까지 프론트가 두 문장을 공백으로 이어붙이기만 했다 — 두 컷이
    같은 동작을 다르게 묘사한 경우 그대로 중복이 남는다. 합치는 것은
    이어붙이는 것이 아니라 겹치는 부분을 가리고 하나의 화면으로 다시
    쓰는 일이다.
    """

    first_content: str = ""
    first_purpose: str = ""
    second_content: str = ""
    second_purpose: str = ""
    elision: Optional[str] = ""
    script: Optional[str] = ""
    # 합칠 두 컷의 실제 그림. 두 그림이 이미 같은 인물·소품·구도를 보여
    # 주고 있다면 문장에서도 그 중복을 지워야 한다.
    first_image: Optional[str] = None
    second_image: Optional[str] = None

class SeamMergeResponse(BaseModel):
    content: str
    purpose: str = ""
    characters: str = ""
    # 무엇을 겹치는 것으로 보고 지웠는지. 감독이 판정할 근거다.
    reason: str = ""

class SpaceLayoutRequest(BaseModel):
    heading: str
    script: str
    # 미장센이 세운 공간 기준. 도면이 그것과 어긋나면 안 된다.
    location_facts: Optional[str] = ""

class SpaceLayoutElement(BaseModel):
    label: str
    x: int
    y: int
    w: int
    h: int

class SpaceLayoutPerson(BaseModel):
    name: str
    x: int
    y: int

class SpaceLayoutResponse(BaseModel):
    elements: List[SpaceLayoutElement] = []
    # 인물의 시작 위치. 컷마다의 위치는 사용자가 끌어서 정한다.
    people: List[SpaceLayoutPerson] = []
    note: str = ""

class PanelReference(BaseModel):
    # 화면에서 이 그림이 무엇인지. 프롬프트에서 인물 이름으로 가리킨다.
    name: str
    # "character" | "location" | "style" | "layout" | "current"
    kind: str
    image: str      # base64 PNG

class PanelImageRequest(BaseModel):
    # 이 컷 한 장의 내용. 샷 크기·행동·강조가 들어 있다.
    prompt: str
    # 모든 컷이 공유하는 씬 기준(미장센). 이것이 빠지면 컷마다 인물과
    # 공간이 따로 해석돼 같은 사람이 다른 사람으로 그려진다.
    shared: Optional[str] = ""
    # 바로 앞 컷의 문장. 이어지는 두 장이라는 것을 알아야 화면이 튀지 않는다.
    previous: Optional[str] = ""
    # 이 컷에 걸리는 레퍼런스 그림(base64 PNG). 글로만 기준을 주면 컷마다
    # 다른 얼굴이 나온다. 그림을 물려야 실제로 같은 인물이 된다.
    references: List[PanelReference] = []
    # 화풍에 덧붙일 자유 문장. 화면에는 이것을 받는 칸이 없다 — 화풍은
    # style_preset 하나가 정한다. 프리셋 문장 안에 끼워 넣는 자리로 남겨
    # 두었고, 비면 프리셋의 기본 화풍을 그대로 쓴다.
    style: Optional[str] = ""
    # 감독이 고른 표현 스타일. 이 값이 화풍을 정하고, 같은 값으로 만든
    # 앵커 이미지가 참조로 함께 물린다.
    style_preset: Literal["rough", "detailed", "photoreal"] = "rough"
    # 2D 구조도를 문장으로 옮긴 것. 무엇이 어디에 있는지 컷마다 같아야 한다.
    layout: Optional[str] = ""
    # 이번에 **무엇만 달라지는가**. 값 하나를 바꿔 다시 그릴 때 채운다
    # (예: "앵글: Eye level → POV"). 비어 있으면 처음 그리는 것이므로
    # 기존 그림을 유지하라는 지시를 붙이지 않는다.
    #
    # 이 값이 없으면 모델은 무엇이 바뀌었는지 모른 채 최종 값만 받아, 앵글
    # 하나를 고쳐도 자세·소품·구도까지 전부 새로 그린다. 그러면 감독은 방금
    # 고른 한 가지가 화면에서 무엇을 바꾸는지 볼 수 없다.
    changes: List[str] = []
    # 생성 전에 고른 모델. 제공자 자동 감지보다 사용자 선택을 우선한다.
    model: Literal["gpt-image-1", "gpt-image-2", "flux-2-klein"] = "gpt-image-2"


class PanelImageResponse(BaseModel):
    image: str      # base64 PNG
    format: str = "png"

class ShotFixCut(BaseModel):
    beat: int
    content: str
    purpose: Optional[str] = ""
    characters: Optional[str] = ""
    # 지금 정해져 있는 샷. 무엇을 바꾸는지 알려면 현재 값이 있어야 한다.
    shot_size: Optional[str] = ""
    dominant: Optional[str] = ""

class PromptRewriteRequest(BaseModel):
    """진단이 짚은 것을 지금 프롬프트에 반영한 문장을 받는다.

    선택지를 제안해 놓고 반영은 감독이 직접 쓰게 두면, 제안이 읽을거리로
    끝난다. 고친 문장까지 와야 판정할 것이 생긴다.
    """

    # 지금 이 컷의 프롬프트. 이것을 고쳐서 돌려준다.
    prompt: str = Field(min_length=1)
    # 무엇이 문제인지. 진단과 그 조치.
    diagnosis: str = Field(min_length=1)
    suggested_action: Optional[str] = ""
    # 감독이 고른 길. 이것이 반영의 방향을 정한다.
    alternative_label: str = Field(min_length=1)
    alternative_effect: Optional[str] = ""


class PromptRewriteResponse(BaseModel):
    prompt: str
    # 무엇을 바꿨는지 한 줄. 감독이 비교하지 않고도 알 수 있게 한다.
    changed: str


class ShotFixRequest(BaseModel):
    heading: str
    cuts: List[ShotFixCut]
    # 편집이 낸 진단. 무엇을 풀어야 하는지 알아야 고칠 수 있다.
    finding_title: str
    finding_detail: Optional[str] = ""
    # 진단에 걸린 컷의 순번. 어디를 고쳐야 하는지 짚어 준다.
    target_indexes: List[int] = []
    scene_intention: Optional[str] = ""

class ShotFixEdit(BaseModel):
    cut_index: int
    shot_size: str
    reason: str = ""

class ShotFixResponse(BaseModel):
    edits: List[ShotFixEdit] = []
    summary: str = ""

class DesignedShot(BaseModel):
    cut_index: int                          # 요청에 준 컷의 순번
    shot_size: str
    angle: str
    camera_move: str
    # 화면에서 시선이 먼저 가야 할 것. 프롬프트가 이것을 강조한다.
    dominant: str = ""
    reason: str = ""

class SceneCoverage(BaseModel):
    """씬 전체의 카메라 흐름. 개별 샷보다 먼저 정한다."""
    arc: str = ""                           # 어디서 시작해 어디로 가는가
    anchor_cuts: List[int] = []             # 공간을 세우는 컷
    peak_cut: int = -1                      # 가장 가까운 샷이 놓일 컷
    approach: List[int] = []                # peak로 가는 접근 구간

class ShotDesignResponse(BaseModel):
    coverage: Optional[SceneCoverage] = None
    shots: List[DesignedShot]


# --- Scene state: 대본 → 씬 기준 ------------------------------------------
# 여러 컷에 걸쳐 같아야 하는 것(인물 외형·공간·환경)을 대본에서 뽑는다.
# 대본이 정하지 않은 항목은 open으로 남긴다 — 비워 둔 것과 누락은 다르다.

class SceneStateRequest(BaseModel):
    heading: str
    script: str
    scene_intention: Optional[str] = ""
    cut_plan: Optional[str] = ""
    # 앞 씬들에서 이미 세운 인물 기준. 이름이 같으면 같은 사람으로 본다.
    #
    # 이것이 없으면 씬마다 같은 사람이 다른 외형으로 나온다 — 대본은 보통
    # 인물을 처음 나올 때만 묘사하므로, 뒤 씬의 대본만 보면 근거가 없어
    # 모델이 지어낸다. 사람은 씬이 바뀐다고 옷이 바뀌지 않는다.
    known_characters: List["SceneCharacter"] = []

class SceneFact(BaseModel):
    label: str
    value: str = ""
    open: bool = False                      # 대본이 정하지 않은 항목
    changes: List[dict] = []

class SceneCharacter(BaseModel):
    name: str
    summary: str = ""
    facts: List[SceneFact] = []

class SceneLocation(BaseModel):
    name: str
    facts: List[SceneFact] = []

class SceneEnvironment(BaseModel):
    facts: List[SceneFact] = []

class SceneStateResponse(BaseModel):
    characters: List[SceneCharacter]
    location: SceneLocation
    environment: SceneEnvironment


# SceneStateRequest.known_characters가 아래에서 정의된 SceneCharacter를
# 가리키므로 여기서 해석해 준다.
SceneStateRequest.model_rebuild()


# --- Seam design: 컷 사이 --------------------------------------------------
# 이음새는 두 컷 사이에 있는 것이다 — 생략된 것, 연결 방식, 흐른 시간.
# 대부분은 '컷 · 연속'이므로 기본과 다른 것만 답한다.

class SeamDesignCut(BaseModel):
    beat: int
    content: str
    purpose: str = ""

class SeamDesignRequest(BaseModel):
    heading: str
    cuts: List[SeamDesignCut]
    script: Optional[str] = ""

class DesignedSeam(BaseModel):
    after_cut: int                          # 이 이음새 앞 컷의 순번
    join: str = "cut"
    elapsed: str = "continuous"
    elision: str = ""
    reason: str = ""

class SeamDesignResponse(BaseModel):
    seams: List[DesignedSeam]
