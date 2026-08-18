from fastapi import APIRouter, HTTPException

from app.models.schemas import SeamSplitRequest, SeamSplitResponse
from app.services.seam_split import suggest_seam_split

router = APIRouter()


@router.post("/seam-split", response_model=SeamSplitResponse)
async def seam_split_endpoint(request: SeamSplitRequest):
    try:
        return await suggest_seam_split(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
