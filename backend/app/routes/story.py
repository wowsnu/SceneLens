from fastapi import APIRouter, HTTPException

from app.models.schemas import StoryStructureRequest, StoryStructureResponse
from app.services.story_structure import structure_story

router = APIRouter()


@router.post("/story/structure", response_model=StoryStructureResponse)
async def story_structure_endpoint(request: StoryStructureRequest):
    if not request.story.strip():
        raise HTTPException(status_code=400, detail="story is required.")
    try:
        return await structure_story(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
