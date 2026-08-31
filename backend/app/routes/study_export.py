"""Persist experiment exports in Supabase; the browser never receives the secret key."""
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


def _auth_headers(key: str) -> dict[str, str]:
    """Supabase 인증 헤더.

    키 형식이 두 가지다. 구형 `service_role`은 JWT(`eyJ...`)이고 PostgREST가
    `Authorization: Bearer`에서 역할을 읽는다. 신형 Secret API key
    (`sb_secret_...`)는 JWT가 아니므로 Bearer로 보내면 파싱에 실패해 401이
    난다 — 이쪽은 `apikey`만으로 권한이 붙는다.

    그래서 형식을 보고 붙인다. 둘 다 되게 해 두면 키를 바꿔 끼워도
    코드를 다시 고칠 일이 없다.
    """
    headers = {'apikey': key}
    if key.startswith('eyJ'):
        headers['Authorization'] = f'Bearer {key}'
    return headers

class StudyExport(BaseModel):
    tool: str
    participant_id: str | None = None
    condition: str | None = None
    story_id: str | None = None
    payload: dict


@router.get('/study/export/health')
async def study_export_health():
    """저장이 될 상태인가.

    실험을 시작하기 전에 확인할 수 있어야 한다. 세션이 끝난 뒤에야
    설정이 빠진 것을 알면 그 참가자의 기록은 파일 하나에만 남는다.
    """
    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_SECRET_KEY', '')
    if not url or not key:
        missing = [
            name for name, value in
            (('SUPABASE_URL', url), ('SUPABASE_SECRET_KEY', key))
            if not value
        ]
        return {'ready': False, 'reason': f'missing env: {", ".join(missing)}'}
    # 테이블에 실제로 닿는지까지 본다. 환경변수만 있고 테이블 이름이
    # 다르면 저장할 때가 되어서야 터진다.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f'{url}/rest/v1/study_sessions',
                params={'select': 'id', 'limit': '1'},
                headers=_auth_headers(key),
            )
    except httpx.HTTPError as error:
        return {'ready': False, 'reason': f'cannot reach Supabase: {error}'}
    if response.status_code >= 300:
        return {'ready': False, 'reason': f'{response.status_code} {response.text[:200]}'}
    return {'ready': True}


@router.post('/study/export')
async def save_study_export(body: StudyExport):
    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_SECRET_KEY', '')
    if not url or not key:
        # 무엇이 빠졌는지 말한다. `설정되지 않음`만으로는 URL이 문제인지
        # 키가 문제인지 알 수 없어 Render 대시보드를 헤매게 된다.
        missing = [
            name for name, value in
            (('SUPABASE_URL', url), ('SUPABASE_SECRET_KEY', key))
            if not value
        ]
        raise HTTPException(503, f'Study export storage is not configured (missing {", ".join(missing)})')
    row = body.model_dump()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f'{url}/rest/v1/study_sessions', json=row,
            headers={
                **_auth_headers(key),
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
        )
    if response.status_code >= 300:
        raise HTTPException(502, f'Study export storage failed: {response.text[:300]}')
    return {'saved': True}
