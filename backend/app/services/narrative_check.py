"""그리기 전에 짚는 점검. 대본은 서사가, 컷 플랜은 편집이 본다.

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
from app.services.directing_rules import LENS_RULES


def _rules_block(rules) -> str:
    """rule_prompt는 렌즈 전체를 낸다. 여기서는 고른 것만 쓴다."""
    return "\n".join(
        "\n".join([
            f"- {rule.id} | {rule.label}",
            f"  판단 기준: {rule.criterion}",
            f"  후보 조건: {rule.trigger}",
            f"  제외 조건: {rule.reject_when}",
        ])
        for rule in rules
    )


def _schema(rule_ids: list[str]) -> dict:
    """단계마다 쓸 수 있는 규칙이 다르므로 enum도 달라진다."""
    return {
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
                            "rule_id", "cut_ids", "line_indexes",
                            "finding", "suggested_action",
                        ],
                        "properties": {
                            "rule_id": {"type": "string", "enum": rule_ids},
                            "cut_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "line_indexes": {
                                "type": "array",
                                "items": {"type": "integer"},
                            },
                            "finding": {"type": "string"},
                            "suggested_action": {"type": "string"},
                        },
                    },
                },
            },
        },
    }


CUT_INTRO = """당신은 SceneLens의 편집 담당입니다. 컷 플랜이 컷의 배열로
성립하는지 검토하세요.

아직 그림은 없습니다. 컷의 내용만 보고 판단합니다. 구도·시선·화면 방향·
숏 크기는 그림이 있어야 알 수 있으므로 여기서 다루지 마세요 — 그것은
패널이 생긴 뒤에 봅니다.

여기서 보는 것은 둘입니다. **이 컷이 있어야 하는가**(빠졌거나, 겹치거나,
한 컷에 너무 눌러 담겼는가), 그리고 **공개 순서가 맞는가**입니다.

cut_ids에는 지적이 걸린 컷의 id를 씁니다. line_indexes는 비워 두세요."""


SCRIPT_INTRO = """당신은 SceneLens의 서사 담당입니다. 대본이 사건의 단계로 서 있는지
검토하세요.

아직 컷으로 나누기 전입니다. 대본의 줄만 보고 판단합니다. 컷 이야기를
하지 마세요 — 몇 개의 컷으로 나눌지는 다음 단계에서 정합니다.

line_indexes에는 지적이 걸린 줄 번호(0부터)를 씁니다. cut_ids는 비워 두세요."""


PROMPT = """{intro}

아래 규칙으로만 지적하세요. 규칙에 없는 것은 지적하지 마세요:

{rules}

**규칙 하나당 최대 하나씩, 전체 4개를 넘기지 마세요.** 실제로 걸리는 것만
쓰고, 없으면 findings를 비우세요. 문제를 만들어 내지 마세요.

인과나 정보 순서 문제는 둘 이상에 걸릴 수 있습니다.

**이야기를 만들지 마세요.** 새 인물·새 장소·새 사건·반전을 제안하지
마세요. 감독이 쓴 사건을 다른 사건으로 바꾸자고 하지 마세요. 당신이 보는
것은 **쓰인 것이 사건의 단계로 읽히는가**입니다.

**그림 이야기를 하지 마세요.** 구도·샷 크기·조명·인물 배치는 다른 담당의
일입니다. 내용이 무엇을 요구하는지만 봅니다.

**짧게 쓰세요. 길면 읽히지 않습니다.**
- finding: **한 문장, 60자 안쪽.** 무엇이 문제인지만 씁니다.
- suggested_action: **한 문장, 50자 안쪽.** 무엇을 하면 되는지만 씁니다.
- summary: **한 문장, 60자 안쪽.**

**뼈대만 쓰인 대본을 그냥 넘기지 마세요.** 사건이 순서대로 있어도 각 줄이
요약된 말이면 그릴 수가 없습니다. 그런 줄은 짚어야 합니다.
  ✗ 그냥 넘김: "둘이 대치한다" — 사건은 이어지지만 무엇을 그릴지 없습니다
  ✓ 짚음: "'대치한다'는 무엇을 그릴지 정해지지 않았어요"

쉬운 말로 쓰세요. 감독이 읽는 것이지 이론서가 아닙니다.
  ✓ "2번과 3번 컷이 같은 상태를 반복해요"
  ✗ "연속된 컷에서 서사적 국면 전환이 부재하여 정체가 발생합니다"
  ✓ "'불안해한다'는 그릴 수가 없어요"
  ✗ "인물의 내면 상태가 시각적 근거 없이 서술되어 있습니다"

가리킬 때는 번호로 씁니다 — "2번 컷", "3번째 줄". id를 문장에 쓰지 마세요.

대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담기지 않습니다.
한국어로 답하세요."""


async def check_narrative(request: NarrativeCheckRequest) -> NarrativeCheckResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    # 컷이 있으면 컷 플랜 점검(편집), 없으면 대본 점검(서사)이다.
    # 대본 단계에는 컷이 없고, 컷 단위 판단은 편집의 일이다.
    checking_cuts = bool(request.cuts)

    body = []
    if request.scene_intention:
        body.append(f"[감독의 의도] {request.scene_intention}\n")

    if checking_cuts:
        if request.script:
            body.append(f"[대본]\n{request.script}\n")
        body.append("[컷 플랜]")
        for cut in sorted(request.cuts, key=lambda item: item.order):
            parts = [f"{cut.id}. {cut.content or '(비어 있음)'}"]
            if cut.purpose:
                parts.append(f"역할: {cut.purpose}")
            if cut.characters:
                parts.append(f"인물: {cut.characters}")
            body.append("  " + " | ".join(parts))
    else:
        body.append("[대본]")
        for index, line in enumerate(request.lines):
            body.append(f"  [{index}] {line}")

    # 컷 플랜에서는 편집 규칙 중 그림 없이 판단할 수 있는 둘만 쓴다.
    # 시선·리듬(cut-continuity, visual-rhythm)은 화면이 있어야 하므로
    # Decision Board로 미룬다.
    if checking_cuts:
        rules = [
            rule for rule in LENS_RULES["editing"]
            if rule.id in {"editing-shot-function", "editing-information-order"}
        ]
    else:
        rules = list(LENS_RULES["narrative"])

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {
                "role": "system",
                "content": PROMPT.format(
                    intro=CUT_INTRO if checking_cuts else SCRIPT_INTRO,
                    rules=_rules_block(rules),
                ),
            },
            {"role": "user", "content": "\n".join(body)},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": _schema([rule.id for rule in rules]),
        },
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=2000,
    )
    result = NarrativeCheckResponse(
        **json.loads(response.choices[0].message.content.strip())
    )

    # 없는 것을 가리키는 지적은 감독이 확인할 수 없다.
    if checking_cuts:
        known = {cut.id for cut in request.cuts}
        result.findings = [
            finding for finding in result.findings
            if finding.cut_ids and all(cut_id in known for cut_id in finding.cut_ids)
        ]
    else:
        count = len(request.lines)
        for finding in result.findings:
            finding.line_indexes = [
                index for index in finding.line_indexes if 0 <= index < count
            ]
        result.findings = [f for f in result.findings if f.line_indexes]

    # 프롬프트로 길이를 부탁해도 지켜지지 않는다. 레일은 좁아서 긴
    # 문장이 오면 읽히지 않는다.
    def clip(text: str, limit: int) -> str:
        text = " ".join(text.split())
        return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"

    result.summary = clip(result.summary, 70)
    for finding in result.findings:
        finding.finding = clip(finding.finding, 75)
        finding.suggested_action = clip(finding.suggested_action, 60)

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
