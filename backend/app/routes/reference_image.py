from fastapi import APIRouter, HTTPException

from app.models.schemas import ReferenceImageRequest, ReferenceImageResponse
from app.services.reference_image import generate_reference

router = APIRouter()


@router.post("/reference-image", response_model=ReferenceImageResponse)
async def reference_image_endpoint(request: ReferenceImageRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required.")
    try:
        return await generate_reference(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
