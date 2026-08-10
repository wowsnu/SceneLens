from fastapi import APIRouter, HTTPException

from app.models.schemas import CutPlanRequest, CutPlanResponse
from app.services.cut_plan import plan_cuts

router = APIRouter()


@router.post("/cut-plan", response_model=CutPlanResponse)
async def cut_plan_endpoint(request: CutPlanRequest):
    if not request.beats:
        raise HTTPException(status_code=400, detail="beats is required.")
    try:
        return await plan_cuts(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
