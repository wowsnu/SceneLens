from fastapi import APIRouter, HTTPException

from app.models.schemas import ShotDesignRequest, ShotDesignResponse
from app.services.shot_design import design_shots

router = APIRouter()


@router.post("/shot-design", response_model=ShotDesignResponse)
async def shot_design_endpoint(request: ShotDesignRequest):
    if not request.cuts:
        raise HTTPException(status_code=400, detail="cuts is required.")
    try:
        return await design_shots(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
