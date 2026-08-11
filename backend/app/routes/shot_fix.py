from fastapi import APIRouter, HTTPException

from app.models.schemas import ShotFixRequest, ShotFixResponse
from app.services.shot_fix import fix_shots

router = APIRouter()


@router.post("/shot-fix", response_model=ShotFixResponse)
async def shot_fix_endpoint(request: ShotFixRequest):
    if not request.cuts:
        raise HTTPException(status_code=400, detail="cuts is required.")
    try:
        return await fix_shots(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
