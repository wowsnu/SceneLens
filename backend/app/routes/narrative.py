from fastapi import APIRouter, HTTPException

from app.models.schemas import NarrativeSuggestionRequest, NarrativeSuggestionResponse
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
