"""재점검이 이전 피드백을 모델 호출에 넘기는지 확인한다.

실제 API를 호출하지 않는다. OpenAI 클라이언트를 가짜로 바꿔, 요청 본문과
재지적 방지 지시가 만들어졌는지만 검증한다.
"""

import asyncio
import json
import os
from types import SimpleNamespace as NS

from app.models.schemas import NarrativeCheckRequest
import app.services.narrative_check as narrative_check


async def main():
    captured = {}

    class Completions:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return NS(choices=[NS(message=NS(content=json.dumps({
                "summary": "점검 완료",
                "findings": [],
            })))] )

    class Client:
        def __init__(self, *_args, **_kwargs):
            self.chat = NS(completions=Completions())

    original_client = narrative_check.AsyncOpenAI
    narrative_check.AsyncOpenAI = Client
    os.environ.setdefault("OPENAI_API_KEY", "test")
    try:
        await narrative_check.check_narrative(NarrativeCheckRequest(
            lines=["민지가 봉투를 열어 편지를 읽는다."],
            prior_feedback=[{
                "stage": "script",
                "rule_id": "narrative-information-reveal",
                "targets": ["line:0"],
                "finding": "봉투 속 정보가 바로 드러나지 않아요.",
                "suggested_action": "편지를 읽는 행동을 분명히 보이세요.",
                "material": "민지가 봉투를 든다.",
            }],
        ))
    finally:
        narrative_check.AsyncOpenAI = original_client

    user = captured["messages"][1]["content"]
    system = captured["messages"][0]["content"]
    assert "[이전 점검 이력" in user
    assert "민지가 봉투를 든다." in user
    assert "해결됐다면 findings에 넣지 마세요" in system
    print("PASS: prior feedback and no-repeat rule reach the model")


if __name__ == "__main__":
    asyncio.run(main())
