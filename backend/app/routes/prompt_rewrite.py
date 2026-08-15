from fastapi import APIRouter, HTTPException

from app.models.schemas import PromptRewriteRequest, PromptRewriteResponse
from app.services.prompt_rewrite import rewrite_prompt

router = APIRouter()


@router.post("/prompt-rewrite", response_model=PromptRewriteResponse)
async def prompt_rewrite_endpoint(request: PromptRewriteRequest):
    try:
        return await rewrite_prompt(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
