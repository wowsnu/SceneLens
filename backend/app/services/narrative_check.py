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
                            "finding", "suggested_action", "operation",
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
                            "operation": {"type": "string", "enum": ["keep", "split", "merge", "insert", "delete"]},
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

여기서 보는 것은 셋입니다. **이 컷이 있어야 하는가**(빠졌거나, 겹치거나,
한 컷에 너무 눌러 담겼는가), **공개 순서가 맞는가**, 그리고 **정해진 샷
크기가 그 컷이 보여주려는 것을 담는가**입니다.

샷 크기는 각 컷에 `샷:`으로 적혀 있습니다. 크기를 판단할 때는 그 컷이
무엇을 보여주려는 컷인지 먼저 읽으세요. 손에 든 것이나 표정이 핵심인데
넓게 잡혀 있거나, 공간과 인물의 위치 관계가 핵심인데 좁게 잡혀 있으면
짚습니다. **단어가 아니라 그 컷이 하려는 일로 판단하세요** — "화면"이나
"거리" 같은 말이 들어 있다고 문제인 것이 아닙니다.
`미정`인 컷은 아직 촬영이 정하지 않은 것이니 크기를 짚지 마세요.

camera-information-selection의 후보·제외 조건은 그림이 있을 때를 전제로
쓰여 있습니다. 여기서는 **숏 크기 하나만** 봅니다. 초점·심도·카메라 위치는
아직 정해지지 않았으니 그 조건은 무시하세요. 크기가 그 컷의 핵심을 담지
못하면 후보 조건에 해당합니다.

크기 판단의 예:
- 손·표정·작은 소품이 그 컷의 핵심인데 Wide/Full → 핵심이 화면에서 작아진다
- 여러 인물의 위치 관계나 공간이 핵심인데 Close-Up/ECU → 어디인지, 누가
  어디 있는지가 안 담긴다
- 씬을 여는 컷인데 좁게 잡혀 있다 → 관객이 장소를 모른 채 시작한다

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

컷 플랜 점검에서 finding을 낸다면 operation은 반드시 `split`, `merge`,
`insert`, `delete` 중 하나를 고르세요. `split`은 한 컷을 나눌 때,
`merge`는 인접한 두 컷을 합칠 때, `insert`는 빠진 화면이 필요할 때,
`delete`는 독립된 기능이 없는 컷을 뺄 때만 씁니다. 어느 조작을 권할지
정할 수 없으면 finding 자체를 내지 마세요. `keep`은 findings가 비어 있을
때만 쓰는 값입니다. suggested_action에는 고른 조작과 그 이유를 한 문장으로
구체적으로 쓰세요. 대본 점검에서는 항상 `keep`입니다.

**split과 insert를 엄격히 구분하세요.**
- 현재 한 컷 안에 앞뒤로 보여야 할 두 변화가 함께 들어 있다면 `split`입니다.
  이미 적힌 사건을 두 컷으로 나누는 것이므로 새 사건이나 새 정보를 만들지 않습니다.
- 현재 어느 컷도 맡지 않은 반응·결과·원인·공간 정보처럼, 관객이 이해하는 데
  필요한 **화면 기능 자체가 비어 있을 때만** `insert`입니다. 단지 컷 수를
  늘리거나 더 멋진 연출을 제안하려고 insert를 쓰지 마세요.
- 기존 컷의 내용이나 역할을 바꾸거나 나누는 것으로 해결되면 insert가 아니라
  split·merge·delete 중 하나를 고르세요.

쉬운 말로 쓰세요. 감독이 읽는 것이지 이론서가 아닙니다.
  ✓ "2번과 3번 컷이 같은 상태를 반복해요"
  ✗ "연속된 컷에서 서사적 국면 전환이 부재하여 정체가 발생합니다"
  ✓ "'불안해한다'는 그릴 수가 없어요"
  ✗ "인물의 내면 상태가 시각적 근거 없이 서술되어 있습니다"

**문장 안에 번호를 쓰지 마세요.** 어느 줄인지는 화면이 표시합니다.
번호를 쓰면 화면의 표시와 어긋나 오히려 헷갈립니다.
  ✗ "4번과 5번의 움직임이 앞선 반응과 이어지지 않아요"
  ✓ "여자가 고개를 돌린 뒤의 움직임이 앞선 반응과 이어지지 않아요"
무엇이 문제인지는 **내용으로** 가리키세요. id도 쓰지 마세요.

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
            # 크기가 내용과 맞는지 보려면 지금 값이 있어야 한다.
            parts.append(f"샷: {cut.shot_size or '미정'}")
            body.append("  " + " | ".join(parts))
    else:
        body.append("[대본]")
        for index, line in enumerate(request.lines):
            body.append(f"  [{index}] {line}")

    # 컷 플랜에서는 그림 없이 판단할 수 있는 규칙만 쓴다. 시선·리듬
    # (cut-continuity, visual-rhythm)과 카메라 위치·축은 화면이 있어야
    # 하므로 Decision Board로 미룬다.
    #
    # 촬영에서 information-selection 하나를 함께 본다. "이 크기가 필요한
    # 정보를 담는가"는 컷 내용과 샷 크기만으로 판단할 수 있고, 그림을
    # 그린 뒤에 알면 다시 그려야 하므로 여기서 짚는 것이 싸다.
    if checking_cuts:
        rules = [
            rule for rule in LENS_RULES[request.lens or "editing"]
            if rule.id in (
                {"camera-information-selection"}
                if request.lens == "camera"
                else {"editing-shot-function", "editing-information-order"}
            )
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

    # Cut Plan의 카드는 질문만 남기지 않는다. 처분을 고르지 못한 지적은
    # 감독이 할 수 있는 일이 없으므로 여기서는 내지 않는다.
    if checking_cuts:
        result.findings = [
            finding for finding in result.findings
            if finding.operation != "keep"
        ]

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
