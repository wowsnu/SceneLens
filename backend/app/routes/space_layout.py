from fastapi import APIRouter, HTTPException

from app.models.schemas import SpaceLayoutRequest, SpaceLayoutResponse
from app.services.space_layout import build_space_layout

router = APIRouter()


@router.post("/space-layout", response_model=SpaceLayoutResponse)
async def space_layout_endpoint(request: SpaceLayoutRequest):
    if not request.script.strip():
        raise HTTPException(status_code=400, detail="script is required.")
    try:
        return await build_space_layout(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
