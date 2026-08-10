from fastapi import APIRouter, HTTPException

from app.models.schemas import SceneStateRequest, SceneStateResponse
from app.services.scene_state import build_scene_state

router = APIRouter()


@router.post("/scene-state", response_model=SceneStateResponse)
async def scene_state_endpoint(request: SceneStateRequest):
    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required.")
    try:
        return await build_scene_state(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
