"""줄콘티: Beat를 컷으로 나누고 각 컷이 담을 것을 정한다.

Beat와 Cut은 다르다. Beat는 이야기의 국면이고("B가 정체를 드러낸다"),
Cut은 한 화면이다. 한 국면이 와이드 하나로 될 수도, 클로즈업 셋으로 나뉠
수도 있다 — 그것이 연출 판단이고 줄콘티가 하는 일이다.

그래서 대본 줄 수가 컷 수를 정하지 않는다. 한 줄이 두 컷이 되기도 하고,
두 줄이 한 컷이 되기도 한다.

샷 크기·앵글·카메라는 여기서 정하지 않는다. 그것은 촬영의 몫이다 —
감독이 줄콘티로 컷을 나누고, 촬영감독과 샷을 정하는 순서를 따른다.
"""

import json
import os

from openai import AsyncOpenAI

from app.models.schemas import CutPlanRequest, CutPlanResponse


RESPONSE_SCHEMA = {
    "name": "cut_plan",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["cuts"],
        "properties": {
            "cuts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["beat", "time", "place", "content", "purpose", "characters"],
                    "properties": {
                        # 이 컷이 속한 Beat 번호 (0부터).
                        "beat": {"type": "integer"},
                        # 장면의 시각과 장소. 대본의 시각적 단서에서 판단한다.
                        "time": {"type": "string"},
                        "place": {"type": "string"},
                        # 이 컷 한 장에 담기는 것. 화면에서 볼 수 있는 사건.
                        "content": {"type": "string"},
                        # 이 컷이 왜 있는가. 무엇이 읽혀야 하는가.
                        "purpose": {"type": "string"},
                        # 이 컷 화면 안에 있는 인물. 쉼표로 구분.
                        # content에서 말하거나 행동하는 사람은 반드시 포함한다.
                        # 정말 인물이 없는 화면(빈 공간, 사물만)일 때만 빈 문자열.
                        "characters": {"type": "string"},
                    },
                },
            },
        },
    },
}


PROMPT = """당신은 줄콘티를 씁니다. 대본을 컷으로 나누는 일입니다.

Beat와 Cut은 다릅니다:
- Beat는 이야기의 국면입니다. "B가 정체를 드러낸다" 같은 것.
- Cut은 한 화면입니다. 그림 한 장에 담기는 것.

한 Beat가 컷 하나가 될 수도, 넷이 될 수도 있습니다. 그것을 정하는 것이
당신의 일입니다. **대본 줄 수를 그대로 컷 수로 만들지 마세요.**
- 한 줄에 사건이 여럿이면 나눕니다. ("문을 열고 들어와 주위를 살핀다" → 2컷)
- 이어지는 두 줄이 한 화면에 담기면 합칩니다.
- 중요한 순간은 컷을 더 씁니다. 지나가는 대목은 적게 씁니다.

각 컷에 다섯 가지를 정하세요:

- time: 이 화면의 시간대. **대본의 시각적 단서를 보고 판단하세요.**
  씬 헤딩이 없어도 "어두운 골목", "가로등 불빛", "새벽빛"처럼 화면으로
  알 수 있으면 각각 "밤", "밤", "새벽"으로 씁니다. 단서가 정말 없을
  때만 빈 문자열로 둡니다. 10자 이내의 짧은 말로 씁니다.

- place: 이 화면의 장소. 대본에서 읽히는 공간 이름을 짧게 씁니다.
  예: "카페", "골목", "지하 주차장". 근거가 없을 때만 빈 문자열입니다.

- content: **이 화면 한 장에 보이는 것.** 짧은 한 문장.
  카메라를 한 번 눌러 담기는 것만 씁니다.
  ✗ "B가 의자를 돌리지만 오른손은 숨긴 채이고, A는 카드를 들어 보인다"
    ← 두 사람의 두 행동. 한 장이 아니다.
  ✓ "B가 의자를 돌린다. 오른손은 책상 아래에 있다."
  두 사건이면 컷을 둘로 나누세요.

- purpose: 이 컷이 왜 있는가. **2~6자 정도의 짧은 말.**
  설명 문장이 아니라 이름표입니다. 표의 한 칸에 들어갑니다.
  ✗ "공간과 인물의 위치 관계, 긴장감 형성"
  ✓ "공간 설정" / "인물 소개" / "행동 강조" / "반응" / "관계" /
    "정보 노출" / "위협 노출" / "결단"

- characters: 이 화면 안에 있는 인물.
  **content에서 말하거나 행동하는 사람은 빠짐없이 넣으세요.**
  이 칸이 비면 그림에 사람이 안 그려집니다. content에 "B가 의자를
  돌린다"라고 썼으면 characters에 B가 반드시 있어야 합니다.
  또한 그 화면에 같이 있는 것이 분명한 사람(대화 상대, 같은 공간에
  선 사람)도 넣으세요. 대사를 주고받는 장면이면 두 사람 다입니다.
  빼는 것은 하나뿐입니다: 그 화면에 정말 없는 사람. 다른 방에 있거나
  아직 등장하지 않은 사람. 애매하면 넣으세요 — 빠뜨리는 쪽이 더 나쁩니다.
  정말 사람이 없는 화면(빈 공간, 사물 클로즈업)일 때만 빈 문자열입니다.

하지 않는 것:
- 샷 크기, 앵글, 카메라 움직임은 정하지 마세요. 촬영이 정합니다.
- 대본에 없는 사건을 만들지 마세요. 나누고 합치는 것이지 더하는 것이 아닙니다.
- 대사를 쓰지 마세요. 말하는 장면은 말하는 모습으로 적습니다.

한국어로 답하세요."""


CHARACTER_PASS_PROMPT = """당신은 줄콘티의 인물 칸을 점검합니다.

컷마다 characters 칸이 있습니다. 이 칸이 비면 그림에 그 사람이 안
그려집니다. 그래서 **그 화면에 있는 것이 분명한 사람은 빠짐없이** 들어가야
합니다.

대본과 컷 목록을 봅니다. 각 컷에 대해, 그 화면에 실제로 있을 사람을
모두 적으세요. 판단 기준:

- content에서 말하거나 행동하는 사람 → 반드시 포함.
- 그 컷이 대화 장면의 일부이면, 대본에 이름이 없어도 대화에 참여하는
  두 사람 다 포함. ("A가 손을 책상 아래로 내린다"만 적혀 있어도, 이
  씬이 A와 B의 대면이면 B도 그 화면에 있다.)
- 같은 공간에 계속 함께 있는 사람 → 포함. 한 사람이 방을 나가거나
  아직 등장하지 않았다는 단서가 대본에 있을 때만 뺍니다.
- 정말 사람이 없는 화면(빈 공간, 사물 클로즈업)이면 빈 문자열.

컷 번호(index)와 그 컷의 characters만 돌려주세요. 순서와 개수는
입력과 똑같이 유지합니다. 한국어 인물 이름을 씁니다."""


_CHARACTER_PASS_SCHEMA = {
    "name": "character_pass",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["cuts"],
        "properties": {
            "cuts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["index", "characters"],
                    "properties": {
                        "index": {"type": "integer"},
                        "characters": {"type": "string"},
                    },
                },
            },
        },
    },
}


async def _fill_characters(
    response: CutPlanResponse, request: CutPlanRequest, client: AsyncOpenAI
) -> CutPlanResponse:
    """줄콘티 모델이 '화면에 보이는 사람만'을 과하게 지켜 당연히 있어야 할
    인물을 빼는 일이 잦다. 대본을 다시 읽는 보정 패스로 인물 칸을 채운다.

    실패하면 원래 응답을 그대로 둔다 — 그림 단계에서 사용자가 고칠 수 있다."""
    if not response.cuts:
        return response

    body = "\n\n".join(
        f"[Beat {beat.beat}]\n" + "\n".join(f"- {line}" for line in beat.lines)
        for beat in request.beats
    )
    cut_lines = "\n".join(
        f"[{i}] (Beat {cut.beat}) {cut.content}"
        f"  — 현재 인물: {cut.characters or '(없음)'}"
        for i, cut in enumerate(response.cuts)
    )
    user_content = f"[씬] {request.heading}\n\n{body}\n\n[컷 목록]\n{cut_lines}"
    if request.cast:
        user_content += f"\n\n[이 씬의 인물] {', '.join(request.cast)}"
    if request.scene_intention:
        user_content += f"\n\n[장면 의도] {request.scene_intention}"

    try:
        pass_response = await client.chat.completions.create(
            # 인물 판단은 컷 나누기보다 추론이 필요해 한 단계 위 모델을 쓴다.
            model="gpt-5.4-mini",
            messages=[
                {"role": "system", "content": CHARACTER_PASS_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_schema", "json_schema": _CHARACTER_PASS_SCHEMA},
            max_completion_tokens=2000,
        )
        parsed = json.loads(pass_response.choices[0].message.content.strip())
    except Exception:
        return response

    for item in parsed.get("cuts", []):
        idx = item.get("index")
        if isinstance(idx, int) and 0 <= idx < len(response.cuts):
            chars = (item.get("characters") or "").strip()
            if chars:
                response.cuts[idx].characters = chars
    return response


async def plan_cuts(request: CutPlanRequest) -> CutPlanResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    if not request.beats:
        raise ValueError("beats is empty")

    # Beat 번호를 명시해 모델이 컷을 어느 Beat에 넣을지 정확히 답하게 한다.
    body = "\n\n".join(
        f"[Beat {beat.beat}]\n" + "\n".join(f"- {line}" for line in beat.lines)
        for beat in request.beats
    )
    user_content = f"[씬] {request.heading}\n\n{body}"
    if request.cast:
        user_content += f"\n\n[이 씬의 인물] {', '.join(request.cast)}"
    if request.scene_intention:
        user_content += f"\n\n[장면 의도] {request.scene_intention}"

    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": RESPONSE_SCHEMA},
        # gpt-5 계열은 max_tokens를 받지 않는다.
        max_completion_tokens=4000,
    )
    result = CutPlanResponse(**json.loads(response.choices[0].message.content.strip()))
    return await _fill_characters(result, request, client)
