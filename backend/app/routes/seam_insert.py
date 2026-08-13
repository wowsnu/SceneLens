from fastapi import APIRouter, HTTPException

from app.models.schemas import SeamInsertRequest, SeamInsertResponse
from app.services.seam_insert import suggest_seam_insert

router = APIRouter()


@router.post("/seam-insert", response_model=SeamInsertResponse)
async def seam_insert_endpoint(request: SeamInsertRequest):
    try:
        return await suggest_seam_insert(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
