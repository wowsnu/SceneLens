from pydantic import BaseModel
from typing import Optional, List, Dict

# CIR (Cinematic Intermediate Representation)
class CIR(BaseModel):
    shotSize: str           # Extreme Close-Up / Close-Up / Medium Close-Up / Medium Shot / Medium Long Shot / Long Shot / Extreme Wide Shot
    horizontalAngle: str    # Frontal / Three-Quarter / Profile / Rear
    verticalLevel: str      # High / Eye / Low / Top-Down / Ground
    viewpointFraming: str   # Objective / OTS / POV
    occlusion: str          # None / Partial / Heavy
    depth: Optional[str]    # Shallow / Deep (optional)
    motionHint: str         # Static / Pan / Tilt / Track / Zoom / Handheld (comma-separated if multiple)

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

# Individual shot in a strategy
class Shot(BaseModel):
    order: int
    cir: CIR
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
    model: Optional[str] = "gemini-2.5-flash-image"  # gemini-2.5-flash-image / gemini-3.1-flash-image-preview / gpt-image-1.5

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
    image: str                    # base64 PNG generated by gpt-image-1.5
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

class AutoFillVersion(BaseModel):
    """One complete version of the filled range."""
    version_label: str            # e.g. "Version A — 긴장 고조"
    rationale: str                # Korean — overall editing intent for this version
    theory_basis: str             # Key theory / book cited
    insertions: List[dict]        # [{ after_shot_id, candidate: FillShotCandidate }]

class AutoFillRangeRequest(BaseModel):
    shots: List[SequenceShot]     # range of shots (in order)
    script_context: str           # full scene script
    intent: str                   # director's intent
    user_prompt: Optional[str] = ""
    version_count: int = 3        # how many versions to generate

class AutoFillRangeResponse(BaseModel):
    versions: List[AutoFillVersion]
