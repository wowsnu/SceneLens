from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    NarrativeCheckRequest,
    NarrativeCheckResponse,
    NarrativeSuggestionRequest,
    NarrativeSuggestionResponse,
)
from app.services.narrative_check import check_narrative
from app.services.narrative_suggestion import suggest_narrative

router = APIRouter()


@router.post("/narrative/suggest", response_model=NarrativeSuggestionResponse)
async def narrative_suggest_endpoint(request: NarrativeSuggestionRequest):
    if not request.narrative_request.strip():
        raise HTTPException(status_code=400, detail="narrative_request is required.")
    if not request.beat_lines:
        raise HTTPException(status_code=400, detail="beat_lines is required.")
    try:
        return await suggest_narrative(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


# 컷 플랜 점검. 요청을 받아 답하는 것이 아니라 서사가 먼저 짚는다.
@router.post("/narrative/check", response_model=NarrativeCheckResponse)
async def narrative_check_endpoint(request: NarrativeCheckRequest):
    try:
        return await check_narrative(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
