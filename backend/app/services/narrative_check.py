"""서사: 컷 플랜이 사건의 단계로 서 있는지 본다.

컷 플랜 단계에서 돈다. 그림이 아직 없고, 그래서 여기가 고치기 가장 싼
자리다 — 패널을 다 그린 뒤에 "이 컷은 필요 없다"는 말을 들으면 그린 것을
버려야 한다.

서사는 세 렌즈와 나란한 네 번째 렌즈가 아니라 그 위에 있다. 미장센·촬영·
편집은 그려진 화면을 보고 판단하지만, 서사는 무엇을 그릴지가 정해지기
전에 판단한다. 그래서 Decision Board가 아니라 컷 플랜에 붙는다.

규칙은 directing_rules.py의 narrative 4개를 그대로 쓴다. 진단에서 쓰는
기준과 여기서 쓰는 기준이 다르면 같은 문제에 다른 잣대가 적용된다.

이야기를 만들지 않는다. 새 인물·새 장소·새 사건을 제안하지 않는다.
무엇을 쓸지는 감독이 정하고, 서사가 보는 것은 쓰인 것이 단계로 읽히는가다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import NarrativeCheckRequest, NarrativeCheckResponse
from app.services.directing_rules import LENS_RULES, rule_prompt


RESPONSE_SCHEMA = {
    "name": "narrative_check",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "findings"],
        "properties": {
            "summary": {"type": "string"},
            "findings": {
                "type": "array",
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "rule_id", "cut_ids", "finding", "suggested_action",
                    ],
                    "properties": {
                        "rule_id": {
                            "type": "string",
                            "enum": [rule.id for rule in LENS_RULES["narrative"]],
                        },
                        "cut_ids": {
                            "type": "array",
                            "minItems": 1,
                            "items": {"type": "string"},
                        },
                        "finding": {"type": "string"},
                        "suggested_action": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 SceneLens의 서사 담당입니다. 컷 플랜이 사건의 단계로 서 있는지
검토하세요.

아직 그림은 없습니다. 컷의 내용만 보고 판단합니다.

아래 규칙으로만 지적하세요. 규칙에 없는 것은 지적하지 마세요:

{rules}

**규칙 하나당 최대 하나씩, 전체 4개를 넘기지 마세요.** 실제로 걸리는 것만
쓰고, 없으면 findings를 비우세요. 문제를 만들어 내지 마세요.

cut_ids에는 그 지적이 걸린 컷의 id를 씁니다. 인과나 정보 순서 문제는 둘
이상의 컷에 걸릴 수 있습니다.

**이야기를 만들지 마세요.** 새 인물·새 장소·새 사건·반전을 제안하지
마세요. 감독이 쓴 사건을 다른 사건으로 바꾸자고 하지 마세요. 당신이 보는
것은 **쓰인 것이 사건의 단계로 읽히는가**입니다.

**그림 이야기를 하지 마세요.** 구도·샷 크기·조명·인물 배치는 다른 담당의
일입니다. 컷의 내용이 무엇을 요구하는지만 봅니다.

suggested_action은 무엇을 하면 되는지 한 문장으로 씁니다. 대본의 줄을
고치는 일인지, 컷을 하나 더하는 일인지가 드러나게 쓰세요.

대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담기지 않습니다.
한국어로 답하세요."""


async def check_narrative(request: NarrativeCheckRequest) -> NarrativeCheckResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    lines = []
    if request.scene_intention:
        lines.append(f"[감독의 의도] {request.scene_intention}\n")
    if request.script:
        lines.append(f"[대본]\n{request.script}\n")

    lines.append("[컷 플랜]")
    for cut in sorted(request.cuts, key=lambda item: item.order):
        parts = [f"{cut.id}. {cut.content or '(비어 있음)'}"]
        if cut.purpose:
            parts.append(f"역할: {cut.purpose}")
        if cut.characters:
            parts.append(f"인물: {cut.characters}")
        lines.append("  " + " | ".join(parts))

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": PROMPT.format(rules=rule_prompt("narrative"))},
            {"role": "user", "content": "\n".join(lines)},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=2000,
    )
    result = NarrativeCheckResponse(
        **json.loads(response.choices[0].message.content.strip())
    )

    # 없는 컷을 가리키는 지적은 감독이 확인할 수 없다.
    known = {cut.id for cut in request.cuts}
    result.findings = [
        finding for finding in result.findings
        if all(cut_id in known for cut_id in finding.cut_ids)
    ]

    # 규칙 하나당 하나만 남긴다. 같은 규칙으로 여러 번 짚으면 같은 말이
    # 반복되고, 감독이 무엇부터 볼지 정하기 어려워진다.
    seen = set()
    unique = []
    for finding in result.findings:
        if finding.rule_id in seen:
            continue
        seen.add(finding.rule_id)
        unique.append(finding)
    result.findings = unique
    return result
