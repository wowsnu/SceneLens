from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    IntentCheckRequest,
    IntentCheckResponse,
    ViewerInitialReadingRequest,
    ViewerInitialReadingResponse,
)
from app.services.viewer_initial_reading import read_initially
from app.services.viewer_intent_check import check_intent

router = APIRouter()


@router.post("/viewer/reflection", response_model=ViewerInitialReadingResponse)
async def viewer_initial_reading_endpoint(request: ViewerInitialReadingRequest):
    if not request.panels:
        raise HTTPException(status_code=400, detail="At least one panel is required.")
    try:
        return await read_initially(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.post("/viewer/intent-check", response_model=IntentCheckResponse)
async def viewer_intent_check_endpoint(request: IntentCheckRequest):
    """읽기가 끝난 뒤, 그 읽힘을 컷의 목적과 대조한다.

    읽기 자체와 나누어 둔다 — 관객은 의도를 모른 채 읽어야 하고, 대조는
    그 다음 일이다.
    """
    if not request.cuts:
        raise HTTPException(status_code=400, detail="At least one cut is required.")
    try:
        return await check_intent(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
