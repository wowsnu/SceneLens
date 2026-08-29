"""Persist experiment exports in Supabase; the browser never receives the secret key."""
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class StudyExport(BaseModel):
    tool: str
    participant_id: str | None = None
    condition: str | None = None
    story_id: str | None = None
    payload: dict

@router.post('/study/export')
async def save_study_export(body: StudyExport):
    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_SECRET_KEY', '')
    if not url or not key:
        raise HTTPException(503, 'Study export storage is not configured')
    row = body.model_dump()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f'{url}/rest/v1/study_sessions', json=row,
            headers={'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
        )
    if response.status_code >= 300:
        raise HTTPException(502, f'Study export storage failed: {response.text[:300]}')
    return {'saved': True}
