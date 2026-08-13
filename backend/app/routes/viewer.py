from fastapi import APIRouter, HTTPException

from app.models.schemas import ViewerInitialReadingRequest, ViewerInitialReadingResponse
from app.services.viewer_initial_reading import read_initially

router = APIRouter()


@router.post("/viewer/reflection", response_model=ViewerInitialReadingResponse)
async def viewer_initial_reading_endpoint(request: ViewerInitialReadingRequest):
    if not request.panels:
        raise HTTPException(status_code=400, detail="At least one panel is required.")
    try:
        return await read_initially(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
