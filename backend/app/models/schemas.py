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
class EnhanceSketchRequest(BaseModel):
    image: str  # base64-encoded rough sketch
    script_context: str
    intent: Optional[str] = ""

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

class ViewerInitialReadingRequest(BaseModel):
    panels: List[ViewerPanelInput]

class ViewerReadingStep(BaseModel):
    panel_order: int
    visible_cues: List[str]
    possible_interpretations: List[str]
    inferred_assumptions: List[str]

class ViewerInitialReading(BaseModel):
    id: str = "initial-reading"
    title: str = "처음 읽힌 흐름"
    summary: str
    steps: List[ViewerReadingStep]
    visible_cues: List[str] = []
    inferred_assumptions: List[str] = []
    routes: List[str] = []

class ViewerInitialReadingResponse(BaseModel):
    initial_reading: ViewerInitialReading


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

class StoryBeat(BaseModel):
    lines: List[StoryLine]

class StoryScene(BaseModel):
    heading: str                            # "관제실, 밤"
    beats: List[StoryBeat]

class StoryStructureResponse(BaseModel):
    scenes: List[StoryScene]


# --- Directing review: 패널 → 다관점 피드백 -------------------------------
# 미장센·촬영·편집 에이전트의 개별 판단과 합의/충돌, 감독의 선택 지점을
# 하나의 응답으로 전달한다. 관객 검토는 의도 비공개 흐름이므로 별도 API를 쓴다.

DirectingLens = Literal["mise", "camera", "editing"]
DirectingReviewMode = Literal["multi", "mise", "camera", "editing"]
DirectingDiagnosticLevel = Literal[
    "attribute",
    "shot_structure",
    "shot_relation",
    "scene_structure",
]


class DirectingReviewPanel(BaseModel):
    id: str
    image: str
    context: Optional[str] = None
    scene_id: Optional[str] = None


class DirectingReviewRequest(BaseModel):
    mode: DirectingReviewMode = "multi"
    panels: List[DirectingReviewPanel] = Field(min_length=1)
    intent: Optional[str] = ""


class DirectingDiagnosis(BaseModel):
    id: str
    level: DirectingDiagnosticLevel
    targets: List[str] = Field(min_length=1)
    diagnosis: str
    evidence: List[str] = Field(min_length=1, max_length=2)
    theory_basis: Optional[str] = None
    theory_source: Optional[str] = None
    suggested_action: str

    @model_validator(mode="after")
    def validate_multi_panel_levels(self):
        panel_ids = {target.split(".", 1)[0] for target in self.targets}
        if self.level in {"shot_relation", "scene_structure"} and len(panel_ids) < 2:
            raise ValueError(f"{self.level} diagnosis must target at least two panels")
        if bool(self.theory_basis) != bool(self.theory_source):
            raise ValueError("theory_basis and theory_source must both be present or both be null")
        return self


class DirectingLensResult(BaseModel):
    summary: str
    diagnoses: List[DirectingDiagnosis] = Field(default_factory=list, max_length=1)

    @model_validator(mode="after")
    def validate_unique_diagnosis_ids(self):
        diagnosis_ids = [diagnosis.id for diagnosis in self.diagnoses]
        if len(diagnosis_ids) != len(set(diagnosis_ids)):
            raise ValueError("diagnosis ids must be unique within a lens result")
        return self


class DirectingCommonFinding(BaseModel):
    type: Literal["agreement", "conflict"]
    summary: str
    lenses: List[DirectingLens] = Field(min_length=2)
    diagnosis_ids: List[str] = Field(min_length=2)


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
    common_findings: List[DirectingCommonFinding] = Field(default_factory=list)
    directing_choices: List[DirectingChoice] = Field(default_factory=list)
    questions: List[DirectingQuestion] = Field(default_factory=list)


# --- Narrative suggestion: 지금 Beat에 대한 제안 ---------------------------
# 제안이지 수정이 아니다. 사용자가 수락해야 대본이 바뀐다 (DG1 P2).

class NarrativeSuggestionRequest(BaseModel):
    narrative_request: str                  # 사용자의 요청
    beat_lines: List[str]                   # 지금 Beat의 줄들
    scene_intention: Optional[str] = ""
    panel_count: Optional[int] = None       # 이 Beat의 현재 패널 수

class NarrativeSuggestionItem(BaseModel):
    type: Literal["split-beat", "insert-script-line", "replace-script-line"]
    title: str
    reason: str
    line_index: int = -1                    # Beat 안에서의 줄 번호. 없으면 -1
    original_text: str = ""
    proposed_text: str = ""

class NarrativeSuggestionResponse(BaseModel):
    suggestions: List[NarrativeSuggestionItem]


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
    # 씬의 대본. 컷 목록만으로는 어디가 고비인지 알 수 없다.
    script: Optional[str] = ""
    scene_intention: Optional[str] = ""

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

class SceneFact(BaseModel):
    label: str
    value: str = ""
    open: bool = False                      # 대본이 정하지 않은 항목

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
