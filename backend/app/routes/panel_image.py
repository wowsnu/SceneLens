from fastapi import APIRouter, HTTPException

from app.models.schemas import PanelImageRequest, PanelImageResponse
from app.services.panel_image import generate_panel

router = APIRouter()


@router.post("/panel-image", response_model=PanelImageResponse)
async def panel_image_endpoint(request: PanelImageRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required.")
    try:
        return await generate_panel(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
