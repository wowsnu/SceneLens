from fastapi import APIRouter, HTTPException
from app.models.schemas import GenerateOverlayRequest, GenerateOverlayResponse
from app.services.overlay_generator import generate_overlay

router = APIRouter()

@router.post("/generate-overlay", response_model=GenerateOverlayResponse)
async def generate_overlay_endpoint(request: GenerateOverlayRequest):
    """
    Generate a red overlay guide image on top of the original sketch.
    Uses Gemini's image generation to draw composition guides
    (framing boxes, arrows, silhouettes, labels) in red.
    """
    try:
        overlay_base64 = await generate_overlay(
            image_base64=request.image,
            strategy_name=request.strategy_name,
            cir=request.cir.model_dump(),
            theory_rationale=request.theory_rationale,
            intent=request.intent,
        )
        return GenerateOverlayResponse(overlay_image=overlay_base64)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
