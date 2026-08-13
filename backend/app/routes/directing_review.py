from fastapi import APIRouter, HTTPException

from app.models.schemas import DirectingReviewRequest, DirectingReviewResponse
from app.services.directing_review import UnsupportedReviewModeError, review_directing


router = APIRouter()


@router.post(
    "/directing-review",
    response_model=DirectingReviewResponse,
    responses={501: {"description": "Directing review analysis is not connected yet."}},
)
async def directing_review_endpoint(request: DirectingReviewRequest):
    """Analyze the selected panels with the connected directing lens agents."""
    try:
        return await review_directing(request)
    except UnsupportedReviewModeError as error:
        raise HTTPException(status_code=501, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
