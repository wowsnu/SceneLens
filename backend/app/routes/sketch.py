import traceback
from fastapi import APIRouter, HTTPException, Request
from app.models.schemas import AnalyzeSketchRequest, AnalyzeSketchResponse
from app.services.sketch_analyzer import analyze_sketch

router = APIRouter()

_call_counter = 0

@router.post("/analyze-sketch", response_model=AnalyzeSketchResponse)
async def analyze_sketch_endpoint(request: AnalyzeSketchRequest, raw_request: Request):
    """
    Analyze a storyboard sketch image using Gemini Vision.
    Returns CIR (8 cinematic attributes) + alignment description.
    """
    global _call_counter
    _call_counter += 1
    call_id = _call_counter
    print(f"\n{'='*60}")
    print(f"[analyze-sketch] CALL #{call_id}")
    print(f"[analyze-sketch] Method: {raw_request.method}")
    print(f"[analyze-sketch] Client: {raw_request.client.host}:{raw_request.client.port}")
    print(f"[analyze-sketch] Image size: {len(request.image)} chars")
    print(f"[analyze-sketch] Script context: {request.script_context[:80] if request.script_context else '(empty)'}...")
    print(f"[analyze-sketch] Traceback:")
    traceback.print_stack()
    print(f"{'='*60}\n")
    try:
        result = await analyze_sketch(request.image, request.script_context)
        print(f"[analyze-sketch] CALL #{call_id} completed successfully")
        return result
    except Exception as e:
        print(f"[analyze-sketch] CALL #{call_id} FAILED: {e}")
        raise HTTPException(status_code=500, detail=str(e))
