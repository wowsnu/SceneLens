from fastapi import APIRouter, HTTPException

from app.models.schemas import SeamMergeRequest, SeamMergeResponse
from app.services.seam_merge import suggest_seam_merge

router = APIRouter()


@router.post("/seam-merge", response_model=SeamMergeResponse)
async def seam_merge_endpoint(request: SeamMergeRequest):
    try:
        return await suggest_seam_merge(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
