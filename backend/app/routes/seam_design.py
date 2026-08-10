from fastapi import APIRouter, HTTPException

from app.models.schemas import SeamDesignRequest, SeamDesignResponse
from app.services.seam_design import design_seams

router = APIRouter()


@router.post("/seam-design", response_model=SeamDesignResponse)
async def seam_design_endpoint(request: SeamDesignRequest):
    if not request.cuts:
        raise HTTPException(status_code=400, detail="cuts is required.")
    try:
        return await design_seams(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
