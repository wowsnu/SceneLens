from fastapi import APIRouter, HTTPException

from app.models.schemas import CutInsertRequest, CutInsertResponse
from app.services.cut_insert import insert_cut

router = APIRouter()


@router.post("/cut-insert", response_model=CutInsertResponse)
async def cut_insert_endpoint(request: CutInsertRequest):
    if not request.cuts:
        raise HTTPException(status_code=400, detail="cuts is required.")
    try:
        return await insert_cut(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
