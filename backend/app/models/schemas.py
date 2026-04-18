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
