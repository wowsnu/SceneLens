import traceback
from fastapi import APIRouter, HTTPException
from app.models.schemas import SuggestStrategiesRequest, SuggestStrategiesResponse
from app.services.strategy_engine import suggest_strategies
from app.services.sketch_analyzer import analyze_sketch

router = APIRouter()

@router.post("/suggest-strategies", response_model=SuggestStrategiesResponse)
async def suggest_strategies_endpoint(request: SuggestStrategiesRequest):
    """
    Generate 2-3 branching cinematic strategies based on:
    - Sketch image + script (will analyze to get CIR if not provided)
    - Director's intention
    - Theory DB
    """
    try:
        # If CIR not provided, analyze the sketch first
        if request.cir is None:
            analysis = await analyze_sketch(
                image_base64=request.image,
                script_context=request.script
            )
            cir = analysis.cir
        else:
            cir = request.cir

        # Generate strategies
        result = await suggest_strategies(
            cir=cir,
            intent=request.intent,
            script_context=request.script
        )
        return result
    except Exception as e:
        print(f"[suggest-strategies] ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
