"""Lens-specific storyboard diagnosis for the directing review."""

import asyncio
import json
import hashlib
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.services.shot_principles import ANGLES, MOVES, SHOT_SIZES

from app.models.schemas import (
    DirectingCommonFinding,
    DirectingHold,
    DirectingLensComparison,
    DirectingIssue,
    DirectingLens,
    DirectingLensResult,
    DirectingOrder,
    DirectingQuestion,
    DirectingReviewRequest,
    DirectingReviewResponse,
)
from app.services.directing_rules import (
    LENS_RULES,
    criterion_for_rule,
    level_focus_prompt,
    rule_prompt,
    validate_rule_choice,
    validate_rule_theory_choice,
)


MODEL_OVERRIDE = os.getenv("DIRECTING_REVIEW_MODEL")
DEFAULT_LENS_MODELS = {
    "camera": "gpt-5.4",
    # 미장센은 인물의 자세·시선·공간 배치를 그림에서 직접 읽는다. mini로는
    # 시선 방향을 사건 설명에서 가져와 답하는 일이 잦았다.
    "mise": "gpt-5.4",
    "editing": "gpt-5.4",
    "narrative": "gpt-5.4-mini",
}
THEORY_DB_PATH = Path(__file__).parent.parent / "db" / "theory_db.json"

DIAGNOSTIC_LEVELS = [
    "attribute",
    "shot_structure",
    "shot_relation",
    "scene_structure",
]

COMMON_LENS_PROMPT = """목표는 멋진 대안을 많이 내는 것이 아니라, 현재 패널이 감독의
의도를 어떻게 지지하거나 방해하는지 화면 근거로 진단하는 것입니다. 보이지 않는 사실을
만들지 마세요.

사용자에게 바로 보이는 답입니다. **옆에서 같이 그림을 보며 말해 주는 사람처럼
쓰세요.** 강평하거나 채점하는 말투가 아닙니다. 짧은 문장으로, 본 것을 그대로 말합니다.

이렇게 씁니다.
✓ `그래프가 화면 오른쪽 아래에 작게 놓여, 수치 변화보다 인물 얼굴이 먼저 보여요.`
✓ `S2에서 얼굴을 이미 봤는데, S3도 얼굴이 화면의 절반이에요.`
✓ `노트북을 조금만 더 카메라 쪽으로 돌리면 화면이 보일 것 같아요.`

이렇게 쓰지 마세요.
✗ `S3는 문제를 보여줘야 하는 자리인데 컷의 역할이 흐려집니다.`  ← 무슨 말인지 알 수 없다
✗ `시각적 위계가 충분히 확보되지 않았습니다.`                   ← 평론 말투
✗ `서사적 기능을 고려할 때 재검토가 필요합니다.`                ← 아무것도 말하지 않았다

`서사적 기능`, `시각적 위계`, `공간적 관계`, `리듬의 변주`, `정보의 위계`, `컷의 역할`,
`자리`, `읽힘`, `강조`, `흐려집니다`, `확보`, `재검토`처럼 뜻이 넓은 말을 답의 중심에
두지 마세요. 꼭 필요한 촬영
용어도 짧게 풀어 쓰세요. 예: `프레이밍` 대신 `화면에 담긴 범위`, `블로킹` 대신 `인물의
자리와 움직임`, `시점` 대신 `카메라가 보는 자리`.

**조건문으로 빠져나가지 마세요.** `~가 작고 약하면 ~가 흐려집니다`처럼 쓰면 그것이
실제로 그런지 판정하지 않은 것입니다. 화면을 보고 단정하세요 — `그래프가 화면의 작은
구석에 있어 정보보다 인물이 먼저 보입니다`처럼 본 것을 그대로 씁니다. 확인이 안 되면
`확인되지 않는다`고 쓰고, 애매한 조건문으로 만들지 마세요.

**패널은 연출 설계를 보는 스토리보드이지, 완성 렌더의 품질 검사 대상이 아닙니다.** 연필선의
거침, 낮은 해상도, 압축 노이즈, 흐린 미세 글자, 생성된 질감의 누락, 작은 도형의 세부가
불완전한 것은 그 자체로 Issue가 아닙니다. `선명하게 그린다`, `해상도를 높인다`,
`디테일을 보강한다`, `그래프 선을 또렷하게 렌더한다`처럼 그림의 완성도를 고치는 처방을
절대 제안하지 마세요. 그 때문에 무엇인지 판정할 수 없으면 결함으로 만들지 말고
`확인되지 않는다`고 두세요.

반대로, **프레이밍·화면 점유·배치·대비의 설계** 때문에 중요한 정보가 다른 요소에 묻히거나
현재 컷에서 역할을 못 하는 것은 진단할 수 있습니다. 이때도 "선이 흐리다"가 아니라
`그래프가 프레임의 작은 구석에 배치돼 정보로 읽힐 면적을 얻지 못한다`처럼, 렌더 품질과
무관하게 남는 연출 근거를 말하세요. 그림의 부족과 연출 선택이 분리되지 않으면 diagnoses를
비우세요.

**감독이 무엇을 하면 되는지가 없으면 답이 아닙니다.** 문제만 말하고 끝내지 말고,
suggested_action에는 손으로 할 수 있는 일을 쓰세요 — `그래프를 화면의 3분의 1까지
키운다`처럼 구체적으로. `강조한다`, `역할을 분명히 한다`처럼 다시 해석해야 하는 말은
행동이 아닙니다.

summary, level_assessments의 summary, diagnosis, evidence, suggested_action, alternatives의
effect와 questions는 모두 짧고 자연스러운 한국어로 씁니다. 말하듯이 `~예요`, `~어요`,
`~같아요`로 끝내고, `~됩니다`, `~하십시오` 같은 딱딱한 어미나 명사로 끝내는 문장
(`~의 부재`, `~에 대한 재검토`)은 쓰지 마세요. 한 문장에는 한 가지 판단만
넣고, 수식어를 겹치거나 어려운 이론 용어로 문제를 포장하지 마세요. 이론은 theory_basis
필드에서만 간단히 언급할 수 있습니다.

감독의 의도는 목표이지 화면에 보이는 사실이 아닙니다. 의도에 언급된 인물·소품·사건이
모든 패널에 실제로 존재한다고 가정하지 마세요. 각 패널의 사건 설명은 창작자가 제공한
사실 맥락이며, 이미지에서 보이는 근거와 구분해서 사용하세요. 사건 설명이 없으면 인물의
이름이나 관계를 추측하지 말고 `화면 왼쪽 인물`, `가까운 쪽 인물`, `문 앞 인물`처럼
화면에서 확인되는 위치·거리·행동으로만 지칭하세요. `전경 인물`, `배경 인물` 같은 고정
표현은 반복하지 마세요.
사건 설명에 행동 주체가 적혀 있다면 주체와 대상을 서로 바꾸지 말고 그대로 유지하세요.
사건 설명에 소품이나 행동이 적혀 있다는 이유만으로 이미지에서 그것을 보았다고 말하지
마세요. 먼저 형태·색·위치·자세 같은 독립적인 화면 근거를 찾고, 식별할 수 없으면 작게
보인다고 꾸미지 말고 보이지 않거나 식별되지 않는다고 판정하세요. 사건 설명에 적힌 고유한
색·형태·위치가 화면에서 확인되지 않으면, 비슷한 일반 물체를 그 소품이라고 이름 붙이지
마세요.

**시선·고개·몸의 방향은 사건 설명에서 가져오지 마세요.** 이것은 그림에서 직접 확인해야
하는 것이고, 스토리보드에서 가장 자주 틀리는 부분입니다. 사건 설명에 `시선을 든다`,
`올려다본다`, `돌아본다`가 적혀 있어도, 그림에서 눈·고개·상체가 실제로 어디를 향하는지
따로 보고 판정하세요. 그림이 설명과 다르면 **그림을 따르고, 다르다는 사실 자체를
짚으세요** — 의도한 것이 화면에 없다는 뜻이므로 그것이 진단입니다. 눈동자나 시선을
선 몇 개로만 그린 컷에서는 방향을 단정하지 말고 `시선 방향이 화면에서 확인되지 않는다`고
쓰세요. 확인되지 않는 것을 설명대로 읽으면 진단 전체가 틀린 전제 위에 서게 됩니다.

중요한 정보가 읽히지 않을 때에는 크기·프레이밍·방향·가림·대비처럼 **실제로 읽힘을 막는
서로 다른 기제**를 구분하세요. 한 기제가 주원인이고 다른 것이 보조 요인이라면 제목·근거·
수정 방향에는 주원인을 먼저 반영하세요. 여러 원인을 뭉뚱그려 `작다`, `약하다`처럼
축소하지 마세요.

전체 의도는 여러 컷의 역할이 합쳐져 달성될 수 있습니다. 각 패널이 의도의 모든 단계나
뒤 컷의 행동까지 한 화면 안에서 보여줘야 한다고 가정하지 마세요. 각 패널은 먼저 해당
패널의 사건 설명과 배열상 위치에 맞는 역할을 수행하는지 판단하세요. 앞뒤 컷에서 이미
담당하는 정보나 행동을 현재 컷에도 추가하라는 진단은 하지 마세요. 피사체의 크기뿐 아니라
색 대비, 고립, 위치, 선과 조명도 함께 보아 시각적 강조가 실제로 부족한지 판단하세요.

각 진단은 다음 네 층위 중 정확히 하나를 사용하세요.
- attribute: 존재하는 컷 안의 요소나 해당 렌즈 속성을 바꾸면 되는 문제
- shot_structure: 컷의 삽입·삭제·병합·분할을 검토해야 하는 문제
- shot_relation: 두 컷 이상의 시선·방향·동작·시간·공간 연결 문제
- scene_structure: 장면 전체의 연출 정보 배치나 시각적 전개 문제

미장센·촬영·편집 어느 관점이든 네 층위를 모두 사용할 수 있습니다. 관점은 문제를
발견하는 근거를 정하고, 층위는 발견한 문제를 어디에서 수정할지를 정합니다. 관점 때문에
층위를 제한하지 말고, 선택한 관점의 규칙으로 발견한 원인이 실제로 위치한 층위를 고르세요.

응답의 level_assessments에는 네 층위를 반드시 각각 한 번씩 넣으세요.
- keep: 현재 범위에서 이 층위의 구체적 충돌은 보이지 않는다.
- check: 결함으로 단정할 근거는 부족하지만, 의도에 따라 감독이 확인할 지점이 있다.
  이 상태에는 open_question을 반드시 채우세요. **화면만 보고는 알 수 없고 감독만
  답할 수 있는 것**을 한 문장으로 묻습니다. 답에 따라 이 층위가 유지될지 수정될지
  갈려야 합니다.
  ✓ "이 뒤에 손님이 들어오는 컷이 더 있나요?"
  ✓ "두 사람이 아는 사이라는 것이 이 장면에서 읽혀야 하나요?"
  ✗ "구도를 더 강조하면 어떨까요?"      ← 제안이지 질문이 아니다
  ✗ "이 컷의 의도가 무엇인가요?"        ← 너무 넓어 답해도 달라지는 것이 없다
  keep과 change에는 open_question을 빈 문자열로 두세요.
- change: 화면 근거가 있는 충돌·누락이 있어 이 층위에서 수정할 필요가 있다.
각 summary는 해당 층위의 판단을 한 문장으로 간결히 쓰세요. `change`인 층위마다
diagnoses에 정확히 하나의 상세 진단을 넣고, `keep`과 `check`에는 상세 진단을 만들지 마세요.

응답 최상단의 `stance`는 이 Lens가 내린 **기본 방향**입니다.
- `change`: 이 Lens의 기준에서도 지금 수정할 필요가 있습니다.
- `keep`: **이 Lens의 criterion으로 보면 지금 구성이 이미 충분하다**는 적극적 판단입니다.
  단순히 "잘 모르겠다"나 "이 Lens 소관이 아니다"가 아닙니다 — 다른 Lens가 바꾸자고
  해도, 이 Lens 기준에서는 현재 화면이 그 목적을 이미 달성하고 있어 **바꿀 필요가
  없다**고 말하는 것입니다. summary에 그렇게 보는 화면 근거를 한 문장으로 쓰세요.
  diagnoses는 비워 두세요.
- `different`: 이미 짚힌 Issue를 다른 Lens로 다시 확인하는 경우에만 씁니다. 그 Issue를
  그대로 지지하거나 유지하는 대신, 이 Lens에서만 생기는 별도의 concern을 봤다는 뜻입니다.
  그 concern이 실제 수정이라면 diagnoses에 넣으세요.
다른 Lens가 문제라고 했다는 사실은 stance의 근거가 아닙니다. 먼저 자기 Lens의 화면
criterion으로 `change / keep / different` 중 하나를 고르고, 그 다음에 summary와 진단을 쓰세요.

targets 규칙:
- targets에는 선택 범위에 제공된 컷 ID 또는 `S3.camera_angle` 같은 요소 경로만 적으세요.
  `S3-인물 정면`, `Panel 3`처럼 설명을 붙이거나 ID를 바꾸지 마세요.
- attribute는 해당 컷 ID 또는 요소 경로를 적으세요.
- shot_relation은 선택 범위에서 **서로 이웃한 정확히 두 컷**만 targets에 적으세요.
  반드시 이야기 순서대로 앞 컷, 뒤 컷 순서로 적으세요. 인접하지 않은 여러 컷의
  관계나 범위 전체의 문제는 scene_structure를 사용하세요.
- scene_structure도 반드시 서로 다른 컷 ID를 2개 이상 적고, 한 컷 내부의 시각적
  우선순위나 프레이밍 문제에는 절대 사용하지 마세요. 그런 문제는 attribute입니다.
- 각 diagnosis와 question의 id는 응답 안에서 고유해야 합니다. 컷 ID만 쓰지 말고
  `렌즈명-s3-framing`, `렌즈명-s3-s4-eyeline`처럼 내용을 구분하는 ID를 쓰세요.

이론 후보는 판단을 돕는 참고 자료입니다. 실제 패널과 관련된 경우에만 사용하고,
사용했다면 theory_source의 맨 앞에 후보의 참조 ID를 정확히 복사하세요. 후보에 없는
이론은 인용하지 마세요. 관련 이론이 없으면 theory_basis와 theory_source를 모두 null로
두세요. 선택한 rule_id 아래에 연결된 이론만 사용할 수 있습니다. 다른 규칙의
이론을 가져오지 말고, 진단 하나에는 가장 직접적인 이론 하나만 인용하세요. 이론만으로
문제를 만들어내지 마세요.

theory_basis에는 선택한 이론 후보의 `핵심`을 **충실한 한국어 한 문장으로 번역**해
적으세요. 현재 컷·인물·소품을 넣어 이론을 다시 해석하거나 적용 설명으로 바꾸지 마세요.
이론은 화면 판단의 출처이고, 이 컷에서 실제로 보인 근거는 evidence에 따로 씁니다.
선택한 이론의 핵심 명제가 진단의 중심 기제(예: 피사체 크기, 시선 방향, 정보 순서)를
직접 뒷받침하지 않으면 theory_basis와 theory_source를 모두 null로 두세요. 책 이름이
유명하거나 넓게 관련 있다는 이유만으로 붙이지 마세요.
후보가 수정안의 보조 요소만 뒷받침할 뿐 진단의 제목과 핵심 근거를 설명하지 못하면
인용하지 마세요. 이때는 근거를 억지로 넓혀 쓰는 것보다 null이 정확합니다.
  ✗ "b_8_walter_murch___:t_pg39_02 — Rule of Six"   ← ID와 제목만 옮겼다
  ✗ "편집자는 관객의 기대를 선도하는 안내자로 기능한다."  ← 번역투 일반론이다

수정 여부는 감독이 결정합니다. 의도적으로 유지할 수 있는 차이는 결함으로 단정하지 말고,
선택이 필요한 경우 questions에 **검토 방향**으로 남기세요. API 키만 questions일 뿐,
화면에서는 "이 방향으로 검토"로 보입니다. prompt에는 이 렌즈로 무엇을 확인하고 감독이
어떤 결정을 알려야 하는지 자연스럽게 적으세요. 단순한 막연한 질문 대신
`~인지 확인해 주세요. 어느 쪽을 의도했는지도 알려 주세요.`처럼 확인할 대상과 다음 판단을
함께 적습니다. targets에도 위와 동일한 규칙을 적용하세요.

감독의 의도나 사건 설명에 특정 컷, 대상, 자세, 동작, 시간 연결이 이미 명시됐다면 그것은
확정된 결정입니다. 화면이 그 결정과 충돌할 때 `정말 그렇게 할 것인지` 또는 다른 컷에
맡길 것인지 되묻지 말고 충돌을 진단하세요. 진단과 수정 방향이 이미 명확하면 questions는
비우고, 입력 어디에도 답이 없는 선택 때문에 수정 방향이 실제로 갈릴 때만 질문하세요.

출력 우선순위:
- summary는 가장 중요한 판단만 한 문장으로 쓰세요.
- diagnoses는 `change`로 판정한 층위에만 0~4개입니다. 같은 원인에서 나온 문제를 여러
  층위로 반복하지 말고, 직접 수정할 수 있는 가장 낮은 층위 하나를 선택하세요.
- 각 diagnosis의 **title은 이 진단 하나를 부르는 이름**입니다. 감독은 트랙 위에
  놓인 마커들을 이 이름으로 구별합니다.
  · **문장이 아니라 이름입니다.** 화면에 걸린 **현상**을 가리키세요.
  · **4~9자.** 길면 트랙에서 잘려 읽히지 않습니다.
  · **이름은 화면에서 본 것을 가리켜야 합니다.** 이 컷의 evidence에 적은 것을
    그대로 짧게 부르세요. evidence에 없는 말이 이름에 나오면 안 됩니다.
  · **규칙 이름을 그대로 쓰지 마세요.** 같은 규칙으로 여러 컷을 짚으면 이름이
    전부 같아져 어느 마커가 무엇인지 구별할 수 없습니다.
    ✗ `정보 선택`, `필요한 요소`, `컷의 역할` — 전부 규칙 이름입니다.
  · **추상적인 개념 이름도 안 됩니다.** 감독이 그 이름만 보고 화면의 어느
    부분인지 떠올릴 수 없으면 이름이 아닙니다.
    ✗ `문제 제시 지연`, `정보 밀도 부족`, `긴장 완화` — 화면에서 무엇을
      가리키는지 알 수 없습니다.
  · **문장도 아닙니다.** ✗ `프레이밍이 정보를 담지 못함`
  · 같은 렌즈가 여러 진단을 낼 때 **서로 다른 이름**이어야 합니다.
- 각 diagnosis의 evidence는 화면에서 확인되는 근거 1~2개, suggested_action은 한 문장입니다.
- 각 diagnosis의 **visual_evidence는 그 근거를 그림 위에서 가리키는 것**입니다.
  감독이 문장을 읽고 화면을 다시 찾을 필요 없이, 화면에서 바로 확인하게 합니다.
  · **kind**: `region`은 그림의 한 자리, `relation`은 두 컷의 두 자리를 잇는 것,
    `attribute`는 값의 변화(샷 크기·앵글 등 화면에 상자로 칠 수 없는 것)입니다.
  · **regions**: 가리킬 상자. panel은 위 목록의 패널 id 그대로.
    x·y는 상자의 **좌상단**, w·h는 크기, 전부 **0~1로 정규화**합니다
    (화면 왼쪽 끝 x=0, 오른쪽 끝 x=1, 위 y=0, 아래 y=1).
  · **상자는 가리키는 대상만 감쌉니다.** 화면의 절반을 넘기지 마세요 —
    대부분을 덮은 상자는 아무것도 가리키지 않는 것과 같습니다.
    인물 한 명이 화면을 꽉 채운 클로즈업이라면 얼굴처럼 **판단의 근거가 되는
    부분만** 짚습니다.
  · **"없어진 것"은 상자로 칠 수 없습니다.** 없는 것을 감쌀 수는 없습니다.
    앞 컷에서 **그것이 있던 자리**를 짚고, reading에 뒤 컷에서 사라졌다고
    쓰세요. 예: 배경 단서가 사라진 문제라면 앞 컷의 창문을 상자로 짚습니다.
  · **relation은 두 컷을 잇습니다.** regions에 앞 컷 자리와 뒤 컷 자리를 각각
    하나씩, 서로 대응되는 것으로 넣습니다(같은 인물, 같은 소품).
  · reading은 그 자리가 왜 근거인지 한 문장. attribute일 때는 attribute·before·
    after를 채우고 regions는 빈 배열로 둡니다. 나머지 경우 그 셋은 빈 문자열입니다.
  · **facing**은 그 대상이 화면에서 **어느 쪽을 향하는지**입니다. 시선 방향,
    화면 방향(screen direction), 카메라 축이 문제일 때 채웁니다 — 상자는
    "어디에 있는지"만 말하므로 방향은 이것으로만 그릴 수 있습니다.
    방향이 이 진단과 무관하면 빈 문자열로 둡니다.
  · **confidence**는 그 자리와 방향이 그림에서 확실히 보이는지입니다.
    짐작이면 `low`로 답하세요 — **틀린 화살표는 없는 것보다 나쁩니다.**
  · **그림에서 확실히 보이는 것만 짚으세요.** 어디인지 자신 없으면
    visual_evidence를 빈 배열로 두면 됩니다 — 위 evidence 문장은 그대로 남습니다.
- 각 diagnosis의 alternatives는 **갈 수 있는 길 2~3개**입니다. 판단 기준에 어떻게
  답하느냐에 따라 갈리는 것을 씁니다.
  · **첫 번째는 언제나 kind="keep"입니다.** 지금 상태를 유지하는 길이며, 유지도
    연출 결정입니다. label은 "그대로 두기", effect는 유지했을 때 무엇을 감수하는지
    한 문장으로 씁니다.
  · 나머지는 kind="change"이고 **서로 배타적인 방향**이어야 합니다. 함께 할 수
    있는 것을 나열하면 선택지가 아니라 조언 목록이 됩니다.
    ✓ "더 넓게 잡기" / "시점 바꾸기"     ← 둘 다 할 수 없다
    ✗ "크기를 조정" / "조명을 조정"      ← 함께 할 수 있다
  · label은 12자 이내의 짧은 말, effect는 그 길을 고르면 무엇이 달라지는지 한 문장.
  · **patch에는 그 선택지가 바꾸는 컷 표의 값을 적습니다.** 하나의 수정안은 하나의
    일관된 카메라 방향입니다. 따라서 그 방향에 필요하면 shot_size, angle, move를
    **둘 이상 함께** 바꿔도 됩니다. 감독이 화면을 옮기지 않고 그 수정안 하나를
    그대로 적용할 수 있어야 합니다. 바꾸지 않는 항목만 null입니다.
    허용된 값은 아래 [컷 표의 값] 목록에 있는 것뿐입니다.
    ✓ "카메라 낮추기" → patch: shot_size=null, angle="Low angle", move=null
    ✓ "더 넓게 잡기" → patch: shot_size="Wide", angle=null, move=null
    ✓ "낮은 와이드로 따라가기" → patch: shot_size="Wide", angle="Low angle", move="Tracking"
    · **그 선택지가 실제로 바꾸는 항목은 모두 적으세요.** 앵글만 바꾸는
      선택지라면 shot_size와 move는 null이지만, 한 카메라 방향에 필요한 값들을
      인위적으로 하나만 남기지 마세요. 건드릴 생각이 없던 값까지 채우면
      감독은 무엇이 달라지는지 알 수 없고, 건드릴 생각이 없던 값이 함께 바뀝니다.
    · **kind="keep"은 언제나 전부 null입니다.** 유지하는 길은 아무것도 바꾸지 않습니다.
    · 조명·표정·소품·인물 배치처럼 위 세 값으로 표현되지 않는 것은 전부 null로 두세요.
      억지로 비슷한 값을 넣으면 감독이 누른 것과 다른 것이 바뀝니다. null이면 화면이
      프롬프트를 고치는 쪽으로 안내합니다.
- questions는 0~1개입니다. 제공된 의도와 사건 설명에 답이 없고, 감독의 확인에 따라
  수정 방향이 달라질 때만 검토 방향을 만드세요. 진단이나 suggested_action을 질문형으로
  반복하지 마세요.
- 현재 구성이 의도를 충분히 지지하면 억지로 `change`를 만들지 말고 해당 층위를 keep으로
  남기세요. 단, 결과 전체에서 "현재 유지"만 반복하지 말고 네 층위의 판단 근거를 각각
  짧게 적으세요.
- 단지 `더 강하게 만들 수 있다`는 이유만으로 진단하지 마세요. 현재 패널에 구체적인
  모호함·충돌·누락이 있어 감독의 의도가 다르게 읽힐 때만 진단하세요.
- 사건 설명과 감독 의도에 인과관계가 이미 명시돼 있으면 그 관계를 다시 질문하지 말고,
  현재 화면 순서가 그 인과를 실제로 뒷받침하는지만 판단하세요.
- 감독 의도에 `A가 B와 연결된다`고 명시되어 있으면 확정된 창작 설정입니다. 개별 패널의
  사건 설명이 이를 반복하지 않더라도 연결 여부를 다시 묻지 마세요.

모든 문장은 한국어로 작성하세요."""

LENS_PROMPTS = {
    "camera": """당신은 SceneLens의 촬영 렌즈 에이전트입니다.
스토리보드 패널을 촬영 관점에서만 검토하세요. 프레이밍, 숏 사이즈, 카메라 높이와 각도,
시점, 렌즈와 심도, 카메라 움직임, 화면 방향, 시선축과 연속성을 다룹니다.

촬영 렌즈가 바꾸는 것은 **카메라**입니다. 수정 방향과 선택지에는 기존 컷의 카메라를
어디에 둘지, 얼마나 가깝게 잡을지, 어느 높이·각도에서 볼지, 화면에 무엇을 담을지,
어느 방향으로 움직일지만 제안하세요. 인물·소품·가구·공간을 옮기거나 다시 배치하라고
하지 마세요. 그것은 미장센의 일입니다. 컷을 추가·삽입·삭제·분할·병합·재배열하거나
`중립 컷을 추가`하라고 하지 마세요. 그것은 편집의 일입니다.

현재 컷의 카메라 선택만으로 해결할 수 없을 때에는 다른 렌즈의 해결책을 대신 내지
마세요. `확인할 점`으로 두고, 카메라를 바꿔도 해결되지 않는지 감독에게 짧게 물으세요.
예: `두 사람의 자리가 바뀌지 않는다면, 카메라를 같은 쪽에 두는 것만으로 방향이
이어지나요?` 촬영에서 새 컷의 필요성을 판단하지 않습니다.

미장센 요소가 보여도 촬영 속성이나 컷 사이 촬영 관계와 직접 관련되지 않으면 진단하지
마세요. 여러 컷에 걸친 카메라 설계를 확인해야 하면 shot_structure 또는 scene_structure를
사용할 수 있지만, 그 경우에도 수정 방향은 컷을 늘리거나 줄이는 말이 아니라 각 컷의
카메라 선택을 어떻게 맞출지에만 한정하세요.
인물이 작게 보이는 구도는 고립감·취약성·공간적 위험을 강조할 수 있습니다. 사건 설명상
필수인 정체·표정·행동이 실제로 읽히지 않는 경우가 아니라면, 피사체가 작다는 이유만으로
숏 사이즈를 문제 삼지 마세요.

감독이 1인칭·주관 시점 또는 특정 인물의 눈을 카메라 위치로 명시했다면, 카메라가 실제로
그 시점을 점유하는지 확인하세요. 외부에서 두 인물을 함께 잡아 공포 분위기가 느껴진다는
이유만으로 주관 시점이 구현됐다고 판단하지 마세요. 축과 방향은 같은 인물의 화면 좌우
위치와 시선·이동 방향을 패널마다 직접 비교하세요. 의도나 사건 설명에 `같은 축`이라고
적혀 있다는 사실은 화면상 연속성의 근거가 아닙니다. 두 인물이 함께 보이는 투샷이 다음
패널에서 통째로 좌우 반전되어 같은 인물의 화면 위치와 시선 방향이 모두 뒤집혔다면,
중립 숏·축 이동·공간 재정립 근거가 없는 한 안전한 리버스 숏으로 간주하지 마세요.

카메라 이동 화살표의 시작점→끝점은 피사체가 화면 안에서 움직이는 방향이 아니라 카메라가
이동하거나 회전해 향하는 방향입니다. 예를 들어 화면 왼쪽으로 물러나는 피사체를 따라가는
PAN은 오른쪽→왼쪽 화살표와 일치합니다. 카메라가 왼쪽으로 팬하면 피사체를 화면 왼쪽으로
더 민다고 해석하지 마세요. 화살표 방향, 이동 종류, 추적 대상과 컷의 목적을 함께 비교하세요.
시작 대상과 종료 대상이 명시되면 두 대상의 화면 위치로 이동 벡터를 먼저 구하고, 선언된
화살표와 직접 비교하세요. 두 방향이 반대면 그것을 가장 직접적인 근거로 진단하세요. 방향이
일치한다면 시작 대상이 종료 프레임 안에 함께 남아 있다는 사실만으로 문제를 만들지 마세요.""",
    "mise": """당신은 SceneLens의 미장센 렌즈 에이전트입니다.
스토리보드 패널을 미장센 관점에서만 검토하세요. 인물의 블로킹과 몸 방향, 인물 간 거리,
공간의 구획과 동선, 소품의 위치와 기능, 세트 구성, 전경·중경·배경의 요소 배치, 화면 안의
시각적 위계를 다룹니다.

미장센 렌즈가 바꾸는 것은 **화면 안의 인물·소품·공간**입니다. 수정 방향과 선택지에는
누가 어디에 서는지, 어느 물건을 어디에 두는지, 인물 사이 거리·몸 방향·동선을 어떻게
잡을지만 제안하세요. 카메라의 위치·숏 크기·각도·렌즈·초점·움직임을 바꾸라고 하지
마세요. 그것은 촬영의 일입니다. 컷을 추가·삽입·삭제·분할·병합·재배열하라고 하지
마세요. 그것은 편집의 일입니다.

현재 컷의 배치만으로 해결할 수 없을 때에는 다른 렌즈의 해결책을 대신 내지 마세요.
`확인할 점`으로 두고, 인물·사물·공간의 배치만 바꿔 해결할 수 있는지 감독에게 짧게
물으세요.

카메라 각도·숏 사이즈·렌즈 변경을 주된 해결책으로 제안하지 마세요. 공간과 요소를 바꾸어
해결할 수 없는 경우에는 촬영 관점과 함께 검토할 필요가 있다고 질문으로 남기세요.
한 컷의 배치 문제는 attribute, 필요한 미장센 단계를 담을 컷의 누락·과잉은
shot_structure, 컷 사이 배치·동선의 연결은 shot_relation, 씬 전체의 공간·요소 전개는
scene_structure를 사용하세요. shot_structure를 사용해도 새 컷을 제안하지 말고, 현재
컷들에서 배치가 맡아야 할 역할이 빠졌는지만 짚으세요. attribute는 `S3.character_position`, `S3.prop.remote`처럼
대상 요소를 구체적으로 적으세요.
앞뒤 패널의 사건 설명이 움직임 없음이나 같은 순간을 명시하는데 앉기·서기·넘어짐·장소·
출입구 위치가 화면에서 달라졌다면, 설명을 그대로 믿지 말고 보이는 상태 충돌을 진단하세요.
시각적 위계는 감독이 1차로 지정한 대상이 실제로 다른 요소에 밀릴 때만 진단하세요. 1차
대상이 분명히 먼저 읽히고 2차 대상도 식별된다면, 2차 대상을 더 강하게 만들 수 있다는
이유만으로 문제를 만들지 마세요. 2차 대상은 1차 대상과 같은 크기나 대비일 필요가 없습니다.
감독이 특정 대상을 `먼저`, `핵심 단서`, `가장 중요`처럼 우선하도록 요구하지 않았다면,
단순히 배경 요소가 더 눈에 띈다는 이유만으로 시각적 위계 문제를 만들지 마세요.
화면 근거에서 대상을 의도한 인물·소품으로 이미 식별했다면, 그 대상이 작거나 대비가 약해
먼저 읽히지 않는 문제를 기능 요소 누락으로 바꾸지 마세요. 존재·정체·배치는 성립하고
상대적 강조만 약한 경우에는 `mise-visual-hierarchy`를 선택하세요.
감독이 넓은 공간 속 작은 인물로 고립이나 위험을 강조한다고 명시했고 화면에서도 그 관계가
읽힌다면, 공간·터널·원근선이 인물과 함께 주의를 끄는 것은 의도를 수행하는 근거입니다.
인물이 공간보다 먼저 읽히지 않는다는 이유로 위계 문제를 만들거나, 더 위험하게 만들 수
있다는 가능성만으로 배치를 바꾸라고 제안하지 마세요.
서로 다른 장소의 패널을 같은 공간의 블로킹 연속성 문제로 취급하지 마세요. 사건 설명상
현재 컷의 역할이 `궁지에 몰림`이라면 다음 컷의 `깨달음`이나 `돌진` 동작을 미리 블로킹에
넣으라고 요구하지 마세요.""",
    "narrative": """당신은 SceneLens의 서사 렌즈 에이전트입니다.
대본이 사건의 단계로 서 있는지만 검토하세요. 각 Beat에서 상황이 실제로 달라지는지,
줄이 그릴 수 있는 행동으로 적혀 있는지, 뒤의 사건을 이해하는 데 필요한 정보가 제때
나오는지, 이어지는 사건 사이에 이유가 있는지를 다룹니다.

**당신은 이야기를 만들지 않습니다.** 감독이 쓴 사건을 다른 사건으로 바꾸자고 하지
마세요. 새 인물·새 장소·새 사건·반전을 제안하지 마세요. 무엇을 쓸지는 감독이 정합니다.
당신이 보는 것은 쓰인 것이 사건의 단계로 읽히는가입니다.

**패널 그림을 판단하지 마세요.** 구도·조명·인물 배치·컷 크기는 다른 렌즈의 일입니다.
그림이 함께 주어져도 대본이 무엇을 요구하는지를 확인하는 데만 쓰세요. 화면이 대본과
다르면 그것은 미장센이나 촬영의 문제이므로 questions에 남기세요.

attribute는 한 줄 안의 문제(그 줄이 행동으로 쓰이지 않음)에, shot_structure는 단계가
빠졌거나 한 Beat에 겹쳤을 때, shot_relation은 이어지는 두 사건 사이의 인과에,
scene_structure는 장면 전체의 정보 공개 순서에 사용하세요.

대사를 쓰지 마세요. 스토리보드는 정지 이미지이므로 말은 담기지 않습니다. 말하는 장면은
말하는 모습으로 다룹니다.""",

    "editing": """당신은 SceneLens의 편집 렌즈 에이전트입니다.
제공된 패널 순서를 하나의 컷 배열로 보고 편집 관점에서만 검토하세요. 컷 사이 시선·화면
방향·동작·공간·시간의 연결, 정보가 공개되는 순서, 반응 컷과 인서트의 필요성, 컷의
삽입·삭제·병합·분할, 장면 전체의 리듬 설계를 다룹니다.

정지 스토리보드만으로 실제 컷 길이, 정확한 타이밍, 대사와 음향, J/L 컷의 존재를 알 수
없습니다. 보이지 않는 길이나 소리를 사실처럼 진단하지 말고, 그 정보가 결정에 필요하면
questions에 남기세요. 단순히 정보가 없다는 이유로 묻지 말고, 답이 핵심 수정 방향을
바꿀 때만 질문하세요. 이미지에서 확인되는 변화의 크기와 정보 순서만 근거로 사용하세요.

attribute는 명시된 컷 길이·진입점·종료점처럼 한 컷의 편집 속성이 실제 입력에 있을 때만
사용하세요. shot_structure는 컷 자체의 삽입·삭제·병합·분할, shot_relation은 둘 이상의
컷 사이 연결, scene_structure는 선택 범위 전체의 순서·정보 배치·리듬 문제에 사용하세요.
카메라 구도나 인물 배치를 주된 해결책으로 제안하지 말고, 원인이 다른 렌즈에 있다면
촬영 또는 미장센과 함께 검토해야 한다고 질문으로 남기세요. 하나의 인과 문제를 인접 컷
관계와 씬 구조로 중복 진단하지 말고, 범위 전체의 정보 순서가 원인이면 scene_structure
하나로 묶으세요. 다음 컷 자체가 반응이나 행동을 명확히 보여주면 별도 반응 컷이 반드시
필요하다고 가정하지 마세요.

편집 선택지의 patch.shot_size, patch.angle, patch.move는 반드시 null로 두세요. 이 값들은
촬영 렌즈에서만 사용하는 카메라 변경값입니다.

수정이 필요한 diagnosis의 alternatives는 프롬프트를 고치는 선택지가 아닙니다. `label`의
첫머리에 대상 패널 또는 경계(`S2`, `S2–S3`)와 실행할 구조 동작을 분명히 쓰세요. 즉
`S2 삭제`, `S2 분할`, `S2–S3 병합`, `S2–S3 사이에 삽입`, 또는 `S2–S3 이음새 조정` 중
하나가 되게 하며, `effect`에는 그 동작으로 무엇을 새로 보이게 하거나 생략하는지 구체적으로
적으세요. 삽입은 새 컷이 맡을 사건·정보를 effect에 쓰세요. 실제로 화면 내용 자체를 다시
그려야 할 때만 이음새 조정으로 남기고, 편집 문제를 일반적인 프롬프트 수정으로 돌리지 마세요.

다른 장소의 컷은 그 자체로 흐름을 끊는 문제가 아닙니다. 사건 설명이나 감독 의도에 그
컷이 현재 인물의 판단 계기, 위험의 대상 또는 행동의 원인을 보여준다고 명시되어 있다면
의도적인 인서트·교차편집으로 먼저 해석하세요. 특히 `단서 공개 → 단서와 연결된 위험 대상
제시 → 인물의 행동` 순서는 명시된 인과를 시각화할 수 있으므로, 단지 공간이 바뀐다는
이유로 중간 컷의 삭제·이동을 제안하지 마세요. 그 인과를 관객이 읽을 수 없게 만드는
구체적인 화면상 모순이나 필수 정보의 누락이 있을 때만 진단하세요.

제공된 번호와 패널 순서는 확정된 현재 편집 순서입니다. 분석 중 임의로 재배열하지 마세요.
의도에 `원인·위험 인지 → 행동 전환` 같은 인과가 있으면, 원인을 보여주는 패널이 행동
패널보다 실제로 앞에 있는지 번호로 확인하세요. 행동 뒤에 원인 정보가 처음 제시된다면
그 순서가 의도와 충돌하는 핵심 편집 문제로 진단하세요. 번호가 큰 패널은 번호가 작은
패널보다 반드시 나중입니다. 마지막 패널을 `먼저 보여준다`고 해석하지 마세요. 사건 설명과
감독 의도에 행동의 동기가 이미 확정되어 있고 다음 패널에서 행동 전환이 명확히 보인다면,
내적 판단이나 반응을 별도 컷으로 한 박자 더 보여줘야 한다고 요구하지 마세요. 판단과 실행을
한 컷에 압축하는 것만으로는 진단 사유가 아닙니다.

사건의 원인·단서·반응·결과 순서는 맞지만 숏 크기, 구도, 정보량이 넓어지거나 좁아지는
시각적 변화만 의도와 반대라면 `editing-visual-rhythm`을 선택하세요. 이 경우 숏 크기의
전개를 정보 공개 순서로 바꾸어 해석하거나 `editing-information-order`를 선택하지 마세요.""",
}

LENS_RESPONSE_SCHEMA = {
    "name": "directing_lens_analysis",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["stance", "summary", "level_assessments", "diagnoses", "questions"],
        "properties": {
            "stance": {"type": "string", "enum": ["change", "keep", "different"]},
            "summary": {"type": "string"},
            "level_assessments": {
                "type": "array",
                "minItems": 4,
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["level", "status", "summary", "open_question"],
                    "properties": {
                        "level": {"type": "string", "enum": DIAGNOSTIC_LEVELS},
                        "status": {"type": "string", "enum": ["keep", "check", "change"]},
                        "summary": {"type": "string"},
                        # check 층위에서 감독만 답할 수 있는 것. 나머지는 빈 문자열.
                        "open_question": {"type": "string"},
                    },
                },
            },
            "diagnoses": {
                "type": "array",
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "id",
                        "rule_id",
                        "level",
                        "targets",
                        # 트랙 마커에 붙는 이름. 규칙 이름으로는 같은 규칙에
                        # 걸린 진단이 전부 같은 이름이 되어 구별되지 않는다.
                        "title",
                        "diagnosis",
                        "evidence",
                        # strict 모드는 모든 속성이 required여야 한다.
                        # 표시할 것이 없으면 빈 배열로 답한다.
                        "visual_evidence",
                        "theory_basis",
                        "theory_source",
                        "suggested_action",
                        "alternatives",
                    ],
                    "properties": {
                        "id": {"type": "string"},
                        "rule_id": {"type": "string"},
                        "level": {"type": "string", "enum": DIAGNOSTIC_LEVELS},
                        "targets": {
                            "type": "array",
                            "minItems": 1,
                            "items": {"type": "string"},
                        },
                        "title": {"type": "string"},
                        "diagnosis": {"type": "string"},
                        "evidence": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 2,
                            "items": {"type": "string"},
                        },
                        # 그림 위에 그릴 근거. 위 evidence 문장과 짝이다 —
                        # 이쪽이 비어도 문장은 남는다.
                        "visual_evidence": {
                            "type": "array",
                            "maxItems": 2,
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": [
                                    "kind", "reading", "regions",
                                    "attribute", "before", "after",
                                ],
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": ["attribute", "region", "relation"],
                                    },
                                    "reading": {"type": "string"},
                                    "regions": {
                                        "type": "array",
                                        "maxItems": 2,
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": [
                                                "panel", "label",
                                                "x", "y", "w", "h",
                                                "facing", "confidence",
                                            ],
                                            "properties": {
                                                "panel": {"type": "string"},
                                                "label": {"type": "string"},
                                                "x": {"type": "number"},
                                                "y": {"type": "number"},
                                                "w": {"type": "number"},
                                                "h": {"type": "number"},
                                                # 화살표를 그릴 근거. 방향이
                                                # 문제가 아니면 빈 문자열.
                                                "facing": {
                                                    "type": "string",
                                                    "enum": [
                                                        "left", "right", "up", "down",
                                                        "toward-camera", "away", "",
                                                    ],
                                                },
                                                "confidence": {
                                                    "type": "string",
                                                    "enum": ["high", "medium", "low", ""],
                                                },
                                            },
                                        },
                                    },
                                    # attribute일 때만 채운다. 아니면 빈 문자열.
                                    "attribute": {"type": "string"},
                                    "before": {"type": "string"},
                                    "after": {"type": "string"},
                                },
                            },
                        },
                        "theory_basis": {"type": ["string", "null"]},
                        "theory_source": {"type": ["string", "null"]},
                        "suggested_action": {"type": "string"},
                        # 갈 수 있는 길. 첫 번째는 언제나 '그대로 두기'다.
                        "alternatives": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 3,
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["kind", "label", "effect", "patch"],
                                "properties": {
                                    "kind": {"type": "string", "enum": ["keep", "change"]},
                                    "label": {"type": "string"},
                                    "effect": {"type": "string"},
                                    # 이 선택지가 컷 표의 어느 값을 바꾸는지.
                                    # 화면이 그 자리에서 적용할 수 있게 한다 —
                                    # 없으면 감독이 다른 화면으로 나가야 한다.
                                    # 샷 값으로 풀리지 않으면 전부 null이고,
                                    # 그때는 프롬프트를 고치는 쪽으로 간다.
                                    "patch": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "required": ["shot_size", "angle", "move"],
                                        "properties": {
                                            "shot_size": {
                                                "type": ["string", "null"],
                                                "enum": [*SHOT_SIZES, None],
                                            },
                                            "angle": {
                                                "type": ["string", "null"],
                                                "enum": [*ANGLES, None],
                                            },
                                            "move": {
                                                "type": ["string", "null"],
                                                "enum": [*MOVES, None],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "questions": {
                "type": "array",
                "maxItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "prompt", "level", "targets"],
                    "properties": {
                        "id": {"type": "string"},
                        "prompt": {"type": "string"},
                        "level": {
                            "type": ["string", "null"],
                            "enum": [*DIAGNOSTIC_LEVELS, None],
                        },
                        "targets": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


class UnsupportedReviewModeError(ValueError):
    pass


@lru_cache(maxsize=1)
def _load_theory_db() -> dict:
    with open(THEORY_DB_PATH, "r", encoding="utf-8") as theory_file:
        return json.load(theory_file)


# 책을 감독이 알아볼 만한 짧은 이름으로 부른다. DB의 title은 파일명이라
# 확장자·판차·업로드 표시가 붙어 있어 화면에 그대로 쓸 수 없다.
BOOK_SHORT_NAMES = {
    "b_0_art_of_the_stor": "Art of the Storyboard",
    "b_1_dialogue": "McKee, Dialogue",
    "b_2_the_five_c_s_of": "The Five C's of Cinematography",
    "b_3_the_filmmaker_s": "The Filmmaker's Eye",
    "b_4_grammar_of_the_": "Grammar of the Film Language",
    "b_5_robert_mckee___": "McKee, Story",
    "b_6_master_shots__1": "Master Shots",
    "b_7_film_directing_": "Film Directing Shot by Shot",
    "b_8_walter_murch___": "Murch, In the Blink of an Eye",
    "b_9_the_filmmaker_s": "The Filmmaker's Eye",
}


def _book_short_name(book_id: str) -> str:
    return BOOK_SHORT_NAMES.get(book_id, "영화 이론")


def _ensure_theory_source_basis(result: DirectingLensResult) -> None:
    """Prefix a faithful Korean source translation with the verified citation."""
    for diagnosis in result.diagnoses:
        if not diagnosis.theory_basis or not diagnosis.theory_source:
            continue
        reference_id = diagnosis.theory_source.split("|", 1)[0].strip()
        parts = reference_id.split(":", 2)
        if len(parts) < 2:
            continue
        book_id, theory_id = parts[0], parts[1]
        theory = next((item for item in _load_theory_db().get("theory_units", [])
                       if item.get("book_id") == book_id and item.get("id") == theory_id), None)
        theory_title = (theory or {}).get("title", "").strip()
        if not theory_title:
            continue
        translation = diagnosis.theory_basis.strip()
        # 모델이 원본 책 이름을 함께 썼더라도, 앞의 서지 표기만 서버가
        # 정규화한다. 본문은 후보 핵심의 한국어 번역으로 남긴다.
        if "—" in translation:
            translation = translation.split("—", 1)[-1].strip()
        if not translation:
            continue
        diagnosis.theory_basis = (
            f"{_book_short_name(book_id)} · {theory_title} — {translation}"
        )


def _theory_reference_id(theory: dict) -> str:
    identity = f"{theory.get('title', '')}|{theory.get('summary', '')}"
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:8]
    return f"{theory.get('book_id')}:{theory.get('id')}:{digest}"


def _rule_theory_packet(lens: DirectingLens) -> str:
    """Return only the small, reviewed theory set linked to each fixed rule."""
    database = _load_theory_db()
    theories_by_key = {
        (theory.get("book_id", ""), theory.get("id", "")): theory
        for theory in database.get("theory_units", [])
    }
    theory_id_counts: dict[str, int] = {}
    for theory in database.get("theory_units", []):
        theory_id = theory.get("id", "")
        theory_id_counts[theory_id] = theory_id_counts.get(theory_id, 0) + 1
    operations_by_theory: dict[str, list[dict]] = {}
    for operation in database.get("operations", []):
        operations_by_theory.setdefault(operation.get("theory_unit_id", ""), []).append(operation)

    blocks = []
    for rule in LENS_RULES[lens]:
        lines = [f"[{rule.id} | {rule.label}]이 선택된 경우에만 아래 이론을 사용하세요."]
        for theory_key in rule.theory_refs:
            theory = theories_by_key.get(theory_key)
            if theory is None:
                raise ValueError(
                    f"Theory mapping not found for {rule.id}: {theory_key[0]}:{theory_key[1]}"
                )
            theory_id = theory.get("id", "")
            operations = (
                operations_by_theory.get(theory_id, [])
                if theory_id_counts.get(theory_id) == 1
                else []
            )
            operation = operations[0] if operations else None
            # 출판사·연도·판차는 넣지 않는다. 검증기는 참조 ID만 확인하고,
            # 화면에는 감독이 알아볼 짧은 책 이름이면 충분하다.
            lines.extend(
                [
                    f"- {_theory_reference_id(theory)} | {theory.get('title')} "
                    f"| 책: {_book_short_name(theory.get('book_id', ''))}",
                    f"  핵심: {theory.get('summary', '')}",
                    f"  적용 조건: {theory.get('applies_when', '')}",
                ]
            )
            # 관련 차원은 있을 때만. 8개 중 6개가 `없음`이라 빈 줄만 쌓였다.
            dimensions = operation.get("related_dimensions", []) if operation else []
            if dimensions:
                lines.append(f"  관련 차원: {', '.join(dimensions)}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _theory_packet(lens: DirectingLens, intent: str) -> str:
    if lens not in LENS_RULES:
        raise UnsupportedReviewModeError(f"The {lens} lens is not connected yet.")
    # 의도는 모델이 각 이론의 적용 여부를 판정할 때 함께 본다. 검색 후보 자체는
    # 검토된 rule_id 연결표로 제한해, 키워드가 맞는 무관한 기법이 섞이지 않게 한다.
    _ = intent
    return _rule_theory_packet(lens)


def _panel_image_url(image: str) -> str:
    return image if image.startswith("data:") else f"data:image/png;base64,{image}"


def _model_for_lens(lens: DirectingLens) -> str:
    if MODEL_OVERRIDE:
        return MODEL_OVERRIDE
    env_name = f"DIRECTING_REVIEW_{lens.upper()}_MODEL"
    return os.getenv(env_name, DEFAULT_LENS_MODELS[lens])


def _question_from_data(lens: DirectingLens, data: dict) -> DirectingQuestion:
    """Keep an under-evidenced question without asserting a false multi-panel level."""
    try:
        return DirectingQuestion(lenses=[lens], **data)
    except ValidationError:
        level = data.get("level")
        panel_ids = {target.split(".", 1)[0] for target in data.get("targets", [])}
        if level in {"shot_relation", "scene_structure"} and len(panel_ids) < 2:
            return DirectingQuestion(lenses=[lens], **{**data, "level": None})
        raise


def _target_panel_id(target: str, panel_ids: set[str]) -> Optional[str]:
    for panel_id in sorted(panel_ids, key=len, reverse=True):
        if target == panel_id or target.startswith(f"{panel_id}."):
            return panel_id
    return None


def _normalize_target(target: str, panel_ids: set[str]) -> str:
    if _target_panel_id(target, panel_ids) is not None:
        return target

    matches = [
        panel_id
        for panel_id in panel_ids
        if re.search(
            rf"(?<![A-Za-z0-9]){re.escape(panel_id)}(?![A-Za-z0-9])",
            target,
        )
    ]
    return matches[0] if len(matches) == 1 else target


def _clean_visual_evidence(items, panel_ids: set[str]) -> list:
    """그릴 수 없는 표시를 버린다. 문장(evidence)은 건드리지 않는다.

    - 없는 패널을 가리키는 자리는 그림에 올릴 수 없다.
    - 화면의 절반을 넘는 상자는 아무것도 가리키지 않는 것과 같다.
      프롬프트로 일러도 모델이 "사라진 배경"을 표현하려고 화면 전체를
      감쌀 때가 있다(실측에서 96%가 나왔다). 그때는 그 자리만 버리고
      reading은 남긴다 — 근거를 통째로 잃지 않는다.
    """
    cleaned = []
    for item in items or []:
        regions = [
            region for region in item.get("regions", [])
            if region.get("panel") in panel_ids
            and region.get("w", 0) * region.get("h", 0) <= 0.5
        ]
        if not item.get("reading"):
            continue
        cleaned.append({**item, "regions": regions})
    return cleaned


def _criterion_of(lens: DirectingLens | None, rule_id: str | None) -> dict:
    """규칙의 판단 기준. 규칙을 못 찾으면 빈 값으로 두고 진단은 살린다."""
    if not lens or not rule_id:
        return {}
    try:
        return {"criterion": criterion_for_rule(lens, rule_id)}
    except ValueError:
        return {}


def _normalize_output_targets(
    request: DirectingReviewRequest, data: dict, lens: DirectingLens | None = None,
) -> dict:
    panel_ids = {panel.id for panel in request.panels}
    normalized = {**data}
    normalized["diagnoses"] = [
        {
            **diagnosis,
            "targets": [
                _normalize_target(target, panel_ids)
                for target in diagnosis.get("targets", [])
            ],
            # 판단 기준은 규칙에서 가져온다. 모델이 쓰게 하면 같은 문제에
            # 매번 다른 잣대가 붙는다.
            **_criterion_of(lens, diagnosis.get("rule_id")),
            "visual_evidence": _clean_visual_evidence(
                diagnosis.get("visual_evidence"), panel_ids
            ),
        }
        for diagnosis in data.get("diagnoses", [])
    ]
    normalized["questions"] = [
        {
            **question,
            "targets": [
                _normalize_target(target, panel_ids)
                for target in question.get("targets", [])
            ],
        }
        for question in data.get("questions", [])
    ]
    return normalized


def _validate_target_paths(
    request: DirectingReviewRequest,
    result: DirectingLensResult,
    questions: list[DirectingQuestion],
) -> None:
    panel_ids = {panel.id for panel in request.panels}
    invalid_targets = [
        target
        for item in [*result.diagnoses, *questions]
        for target in item.targets
        if _target_panel_id(target, panel_ids) is None
    ]
    if invalid_targets:
        raise ValueError(
            "targets must use an exact selected panel id or an element path: "
            + ", ".join(invalid_targets)
        )


def _validate_seam_targets(
    request: DirectingReviewRequest,
    result: DirectingLensResult,
    questions: list[DirectingQuestion],
) -> None:
    """shot_relation이 실제 한 이음새를 가리키도록 보장한다.

    다중 컷 범위라고 해서 아무 두 컷이나 `S2→S5` 이음새로 표현하면 안 된다.
    이음새는 스토리보드에서 서로 붙어 있는 두 패널 사이의 자리이므로, 모델이
    반환한 targets도 요청에 들어온 순서의 인접한 한 쌍이어야 한다.
    """
    panel_ids = {panel.id for panel in request.panels}
    panel_order = {panel.id: index for index, panel in enumerate(request.panels)}

    for item in [*result.diagnoses, *questions]:
        if item.level != "shot_relation":
            continue
        targets: list[str] = []
        for target in item.targets:
            panel_id = _target_panel_id(target, panel_ids)
            if panel_id is not None and panel_id not in targets:
                targets.append(panel_id)

        if len(targets) != 2:
            raise ValueError(
                "shot_relation must target exactly two adjacent panels in sequence order"
            )
        first, second = targets
        if panel_order[second] != panel_order[first] + 1:
            raise ValueError(
                "shot_relation targets must be adjacent panels in forward sequence order"
            )


def _validate_issue_focus(
    request: DirectingReviewRequest,
    result: DirectingLensResult,
    questions: list[DirectingQuestion],
) -> None:
    """추가 렌즈가 선택한 Issue 밖의 새 문제를 들고 오지 않게 한다."""
    focus = request.focus
    if not focus:
        return
    if len(result.diagnoses) > 1:
        raise ValueError("a focused lens check may return at most one diagnosis")
    allowed = set(focus.panel_ids)
    for item in [*result.diagnoses, *questions]:
        target_panels = {
            panel_id
            for target in item.targets
            if (panel_id := _target_panel_id(target, allowed)) is not None
        }
        if not target_panels or not target_panels.issubset(allowed):
            raise ValueError("a focused lens check must target only the selected issue panels")


def _validate_theory_sources(
    lens: DirectingLens,
    result: DirectingLensResult,
    theory_packet: str,
) -> None:
    for diagnosis in result.diagnoses:
        if not diagnosis.theory_source:
            continue
        references = re.findall(
            r"b_[A-Za-z0-9_]+:t_[A-Za-z0-9_]+:[0-9a-f]{8}",
            diagnosis.theory_source,
        )
        if len(references) != 1:
            raise ValueError("theory_source must cite exactly one linked theory reference")
        reference_id = diagnosis.theory_source.split("|", 1)[0].strip()
        if f"- {reference_id} |" not in theory_packet:
            raise ValueError(f"unknown or ambiguous theory reference: {reference_id}")
        validate_rule_theory_choice(lens, diagnosis.rule_id, reference_id)


def _validate_referenced_panels(
    request: DirectingReviewRequest,
    result: DirectingLensResult,
    questions: list[DirectingQuestion],
    *,
    questions_are_fatal: bool = True,
) -> list[DirectingQuestion]:
    """Keep regular analyses explicit about every panel they diagnose.

    A focused cross-lens check is different: its targets name the *existing
    Issue* being checked, not every neighbouring panel used as visual context.
    For example, an Editing check of an S3 camera Issue may naturally compare
    S2 to S3, while it must still target S3 only so it cannot create a new S2
    Issue. Requiring S2 in targets here conflicts with `_validate_issue_focus`.

    `questions_are_fatal=False`로 부르면 규칙을 어긴 **질문만 빼고** 나머지를
    돌려준다. 마지막 시도에서 쓴다 — 질문은 덧붙는 것이고 진단이 결과물이라,
    질문 하나가 어긋났다고 렌즈 판단을 통째로 버리면 감독의 화면이 빈다.
    실측에서 렌즈 호출의 1/3이 이 두 규칙으로 죽었다. 진단 자체의 위반은
    그대로 치명적이다 — 틀린 진단을 감독에게 보여 줄 수는 없다.

    Returns:
        살아남은 질문들.
    """
    panel_ids = {panel.id for panel in request.panels}
    diagnosis_items = [
        *(
            (
                diagnosis,
                " ".join(
                    [
                        diagnosis.diagnosis,
                        *diagnosis.evidence,
                        diagnosis.suggested_action,
                    ]
                ),
            )
            for diagnosis in result.diagnoses
        ),
    ]
    items = [
        *((item, text, False) for item, text in diagnosis_items),
        *((question, question.prompt, True) for question in questions),
    ]
    kept_questions: list[DirectingQuestion] = []
    for item, text, is_question in items:
        # 이 항목이 어긴 규칙. 질문이고 치명적이지 않으면 빼고 넘어간다.
        violation = ""
        target_panel_ids = {
            panel_id
            for target in item.targets
            if (panel_id := _target_panel_id(target, panel_ids)) is not None
        }
        referenced_panel_ids = {
            panel_id
            for panel_id in panel_ids
            if re.search(
                rf"(?<![A-Za-z0-9]){re.escape(panel_id)}(?![A-Za-z0-9])",
                text,
            )
        }
        missing_targets = referenced_panel_ids - target_panel_ids
        # The focused Issue already constrains targets to its anchor panels.
        # Other selected panels can be named only as context for that reading.
        if request.focus:
            missing_targets -= panel_ids - set(request.focus.panel_ids)
        if missing_targets:
            violation = (
                "every panel discussed in a diagnosis or question must appear in targets: "
                + ", ".join(sorted(missing_targets))
            )
        # 일반 검토의 질문이 컷 번호를 직접 말했다면 targets도 바로 그 컷만
        # 가리켜야 한다. `S2`를 묻는 문장에 S3까지 targets로 넣으면 프런트가
        # 그 질문을 S3 Issue의 검토 방안으로 연결할 수 있다. 컷 번호를 쓰지
        # 않은 "두 컷의 연결" 같은 질문은 기존처럼 level/targets로 판단한다.
        if (
            not violation
            and not request.focus
            and is_question
            and referenced_panel_ids
            and target_panel_ids != referenced_panel_ids
        ):
            violation = (
                "a question that names panel ids must target exactly those panels: "
                f"named={', '.join(sorted(referenced_panel_ids))}; "
                f"targets={', '.join(sorted(target_panel_ids))}"
            )

        if not violation:
            if is_question:
                kept_questions.append(item)
            continue
        # 진단이 어겼으면 언제나 치명적이다.
        if not is_question or questions_are_fatal:
            raise ValueError(violation)
        print(f"[directing-review] dropped a malformed question: {violation}")

    return kept_questions


def _validate_remedy_scope(lens: DirectingLens, result: DirectingLensResult) -> None:
    """Keep a lens from prescribing another lens's work.

    The model may correctly notice a camera-axis symptom but still jump to an
    editorial bridge shot or move actors around. A retry here is preferable to
    showing a camera card whose next action opens the wrong workspace.
    """
    if lens == "editing":
        # 공통 응답 스키마는 모든 렌즈에 shot/angle/move patch를 열어 둔다.
        # 하지만 편집이 이를 채우면 카드가 촬영 제안으로 바뀐다.
        if any(
            alternative.patch and (
                alternative.patch.shot_size or alternative.patch.angle or alternative.patch.move
            )
            for diagnosis in result.diagnoses
            for alternative in diagnosis.alternatives
        ):
            raise ValueError(
                "editing alternatives must leave shot_size, angle and move patches null; "
                "editing changes cut order, duration or connections, not the camera"
            )
        return
    if lens not in {"camera", "mise"}:
        return

    remedy_text = "\n".join(
        piece
        for diagnosis in result.diagnoses
        for piece in [
            diagnosis.suggested_action,
            *(alternative.label for alternative in diagnosis.alternatives),
            *(alternative.effect for alternative in diagnosis.alternatives),
        ]
    )
    cut_operation_patterns = (
        r"(?:컷|숏|쇼트).{0,10}(?:추가|삽입|삭제|분할|병합|재배열)",
        r"(?:추가|삽입|삭제|분할|병합|재배열).{0,10}(?:컷|숏|쇼트)",
    )
    if lens == "camera":
        forbidden_patterns = (
            r"(?:인물|사람|배우|소품|물체|가구|배경|공간).{0,12}(?:재|다시 )?배치",
            r"(?:재|다시 )?배치.{0,12}(?:인물|사람|배우|소품|물체|가구|배경|공간)",
            r"(?:중립|연결|브리지|반응|인서트)\s*(?:컷|숏|쇼트).{0,10}(?:추가|삽입)",
            *cut_operation_patterns,
        )
        error = (
            "camera remedies may only change the existing camera's position, framing, "
            "angle, distance, focus, or movement; do not prescribe staging or editing"
        )
    else:
        forbidden_patterns = (
            r"카메라.{0,12}(?:위치|자리|각도|거리|이동|움직임|방향)",
            r"(?:숏\s*크기|앵글|렌즈|프레이밍|초점|심도|팬|틸트|트래킹|줌).{0,12}(?:바꾸|변경|조정|고치)",
            *cut_operation_patterns,
        )
        error = (
            "mise remedies may only change people, props, or spatial arrangement; "
            "do not prescribe camera or editing work"
        )
    if any(re.search(pattern, remedy_text) for pattern in forbidden_patterns):
        raise ValueError(
            error
        )


async def analyze_lens(
    request: DirectingReviewRequest,
    lens: DirectingLens,
    client: Optional[AsyncOpenAI] = None,
) -> tuple[DirectingLensResult, list[DirectingQuestion]]:
    if lens not in LENS_PROMPTS:
        raise UnsupportedReviewModeError(f"The {lens} lens is not connected yet.")

    # 서사만 그림 없이 판단한다. 나머지 셋은 화면 근거로 진단하므로,
    # 그림이 없으면 진단이 대본 추측이 된다.
    if lens != "narrative" and not any(panel.image for panel in request.panels):
        raise UnsupportedReviewModeError(
            f"The {lens} lens needs rendered panels."
        )

    intent = (request.intent or "").strip()
    theory_packet = _theory_packet(lens, intent)

    # 감독이 `check` 질문에 답했으면 그 답이 이 층위의 판정을 가른다.
    # 답을 그냥 의도에 섞지 않고 따로 두는 이유: 의도는 작품의 목표이고
    # 이것은 특정 층위의 물음에 대한 답이라, 어느 층위를 다시 보라는
    # 뜻인지가 분명해야 한다.
    answered = [
      item for item in (request.answers or []) if (item.answer or "").strip()
    ]
    answer_packet = ""
    if answered:
        lines = [
            f"- {item.level or '해당 범위'}: {item.question}\n  → {item.answer.strip()}"
            for item in answered
        ]
        answer_packet = (
            "[감독이 답한 것]\n"
            + "\n".join(lines)
            + "\n이 답은 화면만으로는 알 수 없던 것이므로 확정된 창작 결정입니다. "
            "그 층위를 다시 판정하세요 — 답이 지금 화면을 지지하면 keep으로, "
            "화면이 그 답과 어긋나면 change로 두고 진단과 선택지를 내세요. "
            "이미 답한 것을 open_question으로 다시 묻지 마세요."
        )
    focus_packet = ""
    if request.focus:
        focus = request.focus
        # 이 자리를 처음 짚은 것이 렌즈가 아니라 관객일 수 있다. 그때
        # `처음 발견한 렌즈`라고 부르면 출처를 잘못 말하게 되고, 그 렌즈가
        # 있지도 않은 자기 판단을 이어 읽는 시늉을 한다.
        if focus.origin_kind == "viewer":
            origin_packet = (
                "출처: 관객 읽기입니다. 아직 어떤 렌즈도 이 자리를 보지 않았습니다.\n"
                f"관객이 갈린 지점: {focus.origin_reading or focus.title}\n"
                "관객의 읽기가 갈렸다는 것은 **진단이 아니라 근거**입니다. 화면에서 "
                "무엇이 그렇게 갈리게 만들었는지 당신의 렌즈로 짚으세요. 갈렸다는 "
                "사실을 되풀이하지 말고, 관객의 문장을 옮겨 적지도 마세요 — 감독은 "
                "그것을 이미 읽었습니다. 이 렌즈에서 본 화면 사실을 먼저 말하세요. "
                "원인이 이 렌즈의 범위에 있으면 diagnoses에 정확히 하나를 넣고, "
                "아니면 diagnoses는 비워 둔 채 summary로만 답하세요. "
                "targets는 확인할 패널 안에서만 쓰고 다른 위치의 문제를 "
                "추가하지 마세요."
            )
        else:
            origin_packet = (
                f"처음 발견한 렌즈: {focus.origin_lens}\n"
                f"처음 발견한 판단: {focus.origin_reading or focus.title}\n"
                "이 요청은 새 문제를 찾는 검토가 아닙니다. 위의 `처음 발견한 판단` 하나를 "
                "논점으로 삼으세요. 먼저 당신의 고유 criterion으로 이 판단이 `change`인지, "
                "이 Lens 기준으로는 지금도 충분해 바꿀 필요가 없다는 `keep`인지, "
                "관련되지만 별도 concern인 `different`인지 독립적으로 정하세요. "
                "다른 Lens가 문제라고 했다는 이유만으로 지지하지 마세요. `keep`이면 왜 "
                "이 Lens 기준으로는 현재 화면이 충분한지 summary에 분명히 쓰세요 — "
                "감독은 바꾸자는 쪽 말만 듣지 않고 유지 근거도 함께 봅니다. "
                "result.summary는 처음 발견한 판단과 당신의 관찰이 이어지는 짧은 답으로 쓰세요. "
                "이 Lens의 화면 근거가 처음 판단을 지지하거나, 우선순위를 다르게 보거나, "
                "다른 후속 concern을 낳는다면 diagnoses에 정확히 하나를 넣으세요. 이것은 "
                "새 Issue를 찾는 일이 아니라 관계 보기를 위한 당신의 Lens 판단입니다. "
                "정말로 이 Lens에서 판단할 근거가 없을 때만 diagnoses를 비워 두세요. "
                "동의하지 않거나 별도 수정이 필요 없더라도 '문제를 찾지 못했다'고 끝내지 말고, "
                "**이 렌즈에서 새로 보이는 것 하나**를 말하세요. 원래 판단을 다른 말로 바꿔 "
                "되풀이하는 것은 답이 아닙니다 — 감독은 그 판단을 이미 읽었습니다. "
                "`처음 판단은 이 렌즈에서도 유지됩니다` 같은 문장으로 시작하지 말고, "
                "이 렌즈에서 본 화면 사실을 먼저 말하세요. "
                "예: `S2에서 이미 얼굴을 봤는데 S3도 얼굴이 화면 절반이라, 두 컷이 비슷해 "
                "보여요.` — 이렇게 본 것을 먼저 말하고, 필요하면 그다음에 판단을 붙입니다. "
                "덧붙일 것이 정말 없으면 짧게 그렇다고만 쓰세요. 한 문단을 채우려고 "
                "일반론을 만들지 마세요. diagnoses의 targets는 확인할 패널 안에서만 쓰세요. 다른 "
                "위치의 문제를 추가하지 마세요."
            )
        focus_packet = (
            "[이번에 다른 렌즈로 확인할 Issue]\n"
            f"위치: {focus.anchor} ({focus.anchor_kind or 'shot'})\n"
            f"이름: {focus.title}\n"
            f"판단 기준: {focus.criterion or '입력되지 않음'}\n"
            f"확인할 패널: {', '.join(focus.panel_ids)}\n"
            + origin_packet
        )
    ordered_scope = " → ".join(
        f"{order}:{panel.id}"
        for order, panel in enumerate(request.panels, start=1)
    )
    sequence_packet = "\n".join(
        (
            f"{order}. {panel.id} | scene={panel.scene_id or '입력되지 않음'} | "
            f"사건={panel.context or '입력되지 않음'} | "
            f"연출 표기={panel.directing_notes or '입력되지 않음'}"
        )
        for order, panel in enumerate(request.panels, start=1)
    )
    # 블록 순서: 역할 → 이번 건의 입력 → 판단 기준 → 출력 형식.
    #
    # 감독의 의도와 사건 목록이 형식 규칙 13,000자 뒤에 있었다. 정작 판단의
    # 기준이 되는 정보인데 "하지 마세요" 목록에 묻혔다. 모델은 앞뒤를 더 잘
    # 보므로, 이번 건에만 해당하는 입력을 앞으로 올리고 매번 같은 형식 규칙을
    # 뒤로 보낸다.
    # 빈 블록은 걸러낸다 — 답이 없으면 answer_packet이 빈 문자열이고,
    # 그대로 두면 프롬프트에 빈 줄만 벌어진다.
    prompt = "\n\n".join(
        block for block in [
            # 1. 나는 누구이며 무엇을 보는가
            LENS_PROMPTS[lens],

            # 2. 이번 건의 입력 — 이것을 보고 판단한다
            f"[감독의 의도]\n{intent or '입력되지 않음'}",
            answer_packet,
            focus_packet,
            f"[선택 범위의 확정된 순서]\n{ordered_scope}",
            f"[같은 순서로 정리한 사건 목록]\n{sequence_packet}",

            # 3. 무엇을 근거로 판단하는가
            (
                "[이 에이전트의 고정 진단 규칙]\n"
                "진단은 아래 규칙 중 실제 화면에서 확인된 하나에만 근거하세요. "
                "후보 조건과 제외 조건을 모두 확인하고, 해당 규칙이 없으면 diagnoses를 "
                "비우세요. 선택한 규칙 ID를 diagnosis.rule_id에 정확히 복사하세요.\n"
                f"{rule_prompt(lens)}"
            ),
            f"[범위별 검토 초점]\n{level_focus_prompt(lens)}",
            f"[관련 이론 후보]\n{theory_packet}",

            # 4. 어떻게 쓰는가 — 매번 같은 형식 규칙
            COMMON_LENS_PROMPT,
            # alternatives의 patch가 쓸 수 있는 값. 컷 표의 셀렉트와 같은
            # 목록이어야 감독이 누른 것이 그대로 적용된다.
            (
                "[컷 표의 값]\n"
                f"shot_size: {', '.join(SHOT_SIZES)}\n"
                f"angle: {', '.join(ANGLES)}\n"
                f"move: {', '.join(MOVES)}"
            ),
            f"[ID 규칙]\n모든 diagnosis와 question의 id는 반드시 `{lens}-`로 시작하세요.",
        ] if block
    )
    content = [{"type": "text", "text": prompt}]
    for order, panel in enumerate(request.panels, start=1):
        content.extend(
            [
                {
                    "type": "text",
                    "text": (
                        f"[Panel {order}: {panel.id}]\n"
                        f"[Scene] {panel.scene_id or '입력되지 않음'}\n"
                        f"[창작자가 제공한 사건 설명] {panel.context or '입력되지 않음'}\n"
                        f"[창작자가 남긴 화살표·메모] "
                        f"{panel.directing_notes or '입력되지 않음'}"
                    ),
                },
                # 그림이 없을 수 있다. 서사는 대본만으로 판단하므로 생성 전에도
                # 돌아간다 — 이때 빈 image_url을 보내면 요청이 깨진다.
                *(
                    [{
                        "type": "image_url",
                        "image_url": {
                            "url": _panel_image_url(panel.image),
                            "detail": "high",
                        },
                    }]
                    if panel.image
                    else []
                ),
            ]
        )

    if client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        client = AsyncOpenAI(api_key=api_key)

    validation_note = ""
    previous_output = ""
    for attempt in range(3):
        request_content = content
        if validation_note:
            request_content = [
                *content,
                {
                    "type": "text",
                    "text": (
                        "[응답 검증 실패 — 이전 응답을 고쳐 전체 JSON을 다시 작성하세요]\n"
                        f"고쳐야 할 것: {validation_note}\n"
                        f"[이전 응답]\n{previous_output}\n"
                        # 무엇이 틀렸는지 위에 이미 적혀 있다. 아래는 자주
                        # 틀리는 규칙을 다시 말해 주는 것뿐인데, 실측에서
                        # 걸린 두 가지가 여기 빠져 있었다 — 그래서 모델이
                        # 같은 실수를 세 번 반복하고 렌즈가 통째로 죽었다.
                        # 걸린 규칙을 실제로 적어 준다.
                        "\n[자주 틀리는 규칙]\n"
                        "- 문장에서 컷 번호(S1, S2…)를 말했다면 그 컷이 전부 targets에 있어야 "
                        "합니다. 근거로 잠깐 언급한 컷도 마찬가지입니다 — 언급하지 않을 것이 "
                        "아니라면 targets에 넣으세요.\n"
                        "- 질문(questions)이 컷 번호를 말했다면 targets는 **말한 그 컷만** "
                        "가리켜야 합니다. 더도 덜도 안 됩니다. 두 컷을 함께 묻고 싶으면 "
                        "질문에 두 컷을 모두 쓰고 targets에도 두 컷을 모두 넣으세요.\n"
                        "- shot_relation은 선택 범위에서 앞→뒤 순서로 붙어 있는 정확히 두 "
                        "패널만 targets에 포함해야 합니다. scene_structure는 서로 다른 패널을 2개 이상 "
                        "targets에 포함해야 합니다. 한 패널 내부 문제라면 level을 attribute로 "
                        f"고치세요.\n- 모든 id는 `{lens}-`로 시작해야 합니다. targets는 선택된 "
                        "컷 ID 또는 점(.)으로 이어지는 요소 경로만 사용하세요."
                    ),
                },
            ]
        response = await client.chat.completions.create(
            model=_model_for_lens(lens),
            messages=[{"role": "user", "content": request_content}],
            response_format={"type": "json_schema", "json_schema": LENS_RESPONSE_SCHEMA},
            max_completion_tokens=3000,
        )
        previous_output = response.choices[0].message.content.strip()
        data = _normalize_output_targets(request, json.loads(previous_output), lens)
        try:
            result = DirectingLensResult(
                stance=data["stance"],
                summary=data["summary"],
                level_assessments=data["level_assessments"],
                diagnoses=data["diagnoses"],
            )
            if any(not diagnosis.id.startswith(f"{lens}-") for diagnosis in result.diagnoses):
                raise ValueError(f"all diagnosis ids must start with {lens}-")
            for diagnosis in result.diagnoses:
                validate_rule_choice(lens, diagnosis.rule_id)
            questions = [
                _question_from_data(lens, question)
                for question in data.get("questions", [])
            ]
            question_ids = [question.id for question in questions]
            if len(questions) > 1:
                raise ValueError("a lens result may ask at most one question")
            if len(question_ids) != len(set(question_ids)):
                raise ValueError("question ids must be unique within a lens result")
            if any(not question.id.startswith(f"{lens}-") for question in questions):
                raise ValueError(f"all question ids must start with {lens}-")
            _validate_target_paths(request, result, questions)
            _validate_seam_targets(request, result, questions)
            _validate_issue_focus(request, result, questions)
            _validate_theory_sources(lens, result, theory_packet)
            # 마지막 시도에서는 어긋난 **질문만** 버리고 진단은 살린다.
            # 앞선 두 번은 그대로 실패시켜 모델이 고쳐 오게 한다 — 곧바로
            # 봐주면 질문 규칙이 사실상 없는 것이 된다.
            questions = _validate_referenced_panels(
                request, result, questions,
                questions_are_fatal=attempt < 2,
            )
            _validate_remedy_scope(lens, result)
            _ensure_theory_source_basis(result)
            return result, questions
        except (ValidationError, ValueError) as error:
            if attempt == 2:
                raise
            validation_note = str(error)

    raise RuntimeError("Lens analysis validation failed")


# 렌즈를 각자 돌린 뒤, 그 결과들 사이의 관계만 따로 본다.
#
# 한 번에 세 렌즈를 다 보게 하면 어느 관점의 판단인지 섞인다. 각자 판단한
# 뒤에 관계를 묻는 편이 렌즈의 독립성과 연결을 둘 다 지킨다.
CROSS_LENS_PROMPT = """당신은 SceneLens의 연출 검토를 종합합니다.
미장센·촬영·편집 렌즈가 각자 내린 판단이 아래에 있습니다. 새 진단을 만들지 말고,
**이미 나온 판단들 사이의 관계만** 찾으세요.

사용자에게 바로 보이는 답입니다. `원인 렌즈`, `영향받은 렌즈`, `결과적 상관`처럼 분석
용어를 늘어놓지 말고, 한 선택이 다른 판단에 어떤 영향을 주는지 평이하게 설명하세요.
summary와 order.reason은 각각 짧은 한 문장으로 씁니다. 예를 들어 `촬영이 인물을 너무
가깝게 잡아, 두 사람의 거리가 보이지 않는다`처럼 화면에서 시작해 결과를 말하세요.

세 종류의 관계가 있습니다:

- **agreement** — 서로 다른 Lens의 criterion으로 봐도, **같은 Issue의 문제 방향을
  지지**하는 경우입니다. 문장이 같아야 하는 것이 아닙니다. 두 Lens가 실제로 `change`를
  택했고 같은 결손을 독립적으로 확인했을 때만 만드세요.
  ✓ 촬영: `그래프가 프레임에서 작다` / 미장센: `다른 요소보다 시각적 우선순위가 낮다`
    → 둘 다 `핵심 정보가 충분히 강조되지 않는다`를 문제로 봅니다.

- **conflict** — 화면에서는 **Tension**으로 부릅니다. 같은 artifact evidence를 보되,
  서로 다른 cinematic criterion 때문에 문제 여부나 우선순위가 갈리는 경우입니다.
  한쪽이 다른 쪽의 관찰을 부정하는 것이 아닙니다.
  ✓ 촬영: `이 컷에서 그래프가 읽혀야 한다` / 편집: `다음 컷에서 읽혀도 된다`
    → shot-level legibility와 sequence-level information timing의 긴장입니다.
  한 Lens가 `change`, 다른 Lens가 `keep`인 경우도, 서로의 criterion 때문에 그 차이가
  생겼다면 conflict입니다. 단순히 한쪽에 진단이 없다는 이유만으로 만들지 마세요.
  **한 Lens가 `change`를 냈더라도, 다른 Lens의 criterion으로 보면 지금 화면이
  이미 그 Lens의 목적을 충족한다면 conflict로 만드세요.** 그 Lens는 "이 문제는
  꼭 바꾸지 않아도 된다"는 입장을 대변하는 것입니다 — 감독이 change 한쪽 말만
  듣지 않고, 유지하는 근거도 함께 보고 판정할 수 있어야 합니다. summary에는
  갈리는 우선순위와 함께 **유지해도 되는 이유**를 담으세요.
  ✓ 편집: `S3의 반응이 약해 컷을 더해야 한다` / 촬영: `S3의 프레이밍이 이미
    반응을 담고 있어 컷을 더하면 리듬이 늘어진다` → 편집은 change, 촬영은 keep
    쪽이지만 둘 다 화면 근거가 있는 Tension입니다.

- **consequence** — 한 Lens에서 관찰된 directing decision/concern이 다른 Lens 또는
  다른 scope에서 **후속 concern을 만드는** 경우입니다. 같은 Issue에 대한 찬반이 아닙니다.
  ✓ 촬영: `S3의 그래프 정보가 약함` → 편집: `S3→S4의 반응 연결이 충분히 동기화되지 않음`
  source_lens(원인)와 affected_lens(영향받은 쪽)를 반드시 지정하세요.

**어느 것인지 고르는 법.** 한쪽이 다른 쪽의 명확한 원인이면 consequence, 두 요구가
양립할 수 없거나 `change / keep`의 우선순위가 갈리면 conflict, 두 Lens가 독립적으로
같은 결손을 change로 가리키면 agreement입니다.
**같은 두 진단이 agreement이면서 conflict일 수 있습니다** — 같은 결손을
짚었는데 해법이 갈리는 경우입니다. 그때는 둘 다 보고하세요.
consequence가 기본값이 아닙니다 — 원인·결과 방향이 화면에서 분명히 보일 때만
consequence입니다. 어느 쪽이 원인인지 단언할 수 없다면 conflict입니다.
**두 Lens의 판단이 갈릴 때 기본은 conflict(Tension)입니다.** 한 Lens가 바꾸자고
할 때 다른 Lens가 유지해도 되는 근거를 가지고 있다면, 그 긴장을 감추지 말고
Tension으로 드러내세요 — 감독이 두 입장을 다 보고 고를 수 있어야 합니다.

**관계는 진단 쌍이 아니라 Lens 판정 쌍에서 봅니다.** 한 Lens가 `change`(진단
있음)이고 다른 Lens가 `keep`(진단 없음, summary만)이어도, 그 두 판정과 근거를
나란히 놓고 관계를 정하세요. `keep` Lens의 summary가 `change` Lens와 **같은
화면 자리**를 두고 "이 criterion으로는 지금도 충분하다"고 말한다면 Tension입니다.
서로 다른 자리를 본 것이면 관계가 아니니 빈 배열로 두세요 — stance가 갈린다는
사실만으로 억지로 Tension을 만들지 마세요. 판정과 그 근거 내용을 함께 봐야 합니다.

규칙:
- **없으면 빈 배열입니다.** 렌즈들이 서로 다른 것을 봤다면 관계가 없는 것이 정상입니다.
  억지로 엮지 마세요.
- **lenses에는 이 관계가 잇는 두 Lens를 적습니다.** 이것이 관계의 축입니다.
- **diagnosis_ids는 위 목록의 `- ` 뒤에 적힌 진단 id를 그대로 옮겨 적습니다.**
  `mise-s4-s5-spatial-link`처럼 생긴 문자열입니다. 층위 이름(`shot_relation`,
  `scene_structure`)이나 렌즈 이름(`camera`)은 진단 id가 아닙니다.
  **진단을 낸 Lens의 id만** 적으세요 — `keep` Lens는 진단이 없으니 여기 없습니다.
  두 Lens 다 `change`면 두 id를, 한쪽만 `change`면 그 하나만 적습니다.
- summary는 관계 edge 아래에 놓일 **핵심 concern** 한 문장입니다. 두 진단의
  문장을 반복하거나 나열하지 말고, Agreement면 둘이 함께 보는 문제, Tension이면
  갈리는 우선순위, Consequence면 원인 concern이 만든 후속 영향을 말하세요.
- **title은 이 묶음의 이름입니다.** 문장이 아니라 이름입니다 — 감독이 목록에서
  무엇을 여는 것인지 보고 고릅니다. 화면에 걸린 **현상**의 이름으로 쓰세요.
  ✓ `공간 전환`, `정보 제시 시점`, `샷 크기 전환`, `시선 방향`
  ✗ `S2와 S3의 공간이 이어지지 않는다` (문장), `충돌` (관계 종류일 뿐),
    `촬영과 미장센` (렌즈 이름일 뿐)
  **4~12자.** 같은 자리에 관계가 둘 이상이면 이름으로 구별되어야 하므로,
  서로 다른 현상에는 서로 다른 이름을 붙이세요.
- 0~3개면 충분합니다.

comparisons는 더 이상 화면에 쓰지 않습니다. 항상 빈 배열로 답하세요.

**order — 어느 렌즈부터 손댈 것인가.**
감독은 세 탭 중 어디를 먼저 열어야 할지 모릅니다. 관계가 그 순서를 정합니다.

- consequence가 있으면 **원인 렌즈(source_lens)가 먼저**입니다. 영향받은 쪽을
  먼저 고치면 증상만 사라지고 원인은 남습니다.
- agreement가 있으면 그 둘 중 **화면 근거가 더 분명한 쪽**이 먼저입니다.
  한 번 고치면 나머지도 함께 풀립니다.
- conflict만 있으면 감독이 우선순위를 정할 일이므로 순서를 강요하지 마세요.
  진단이 더 구체적인 쪽을 골라 이유에 그렇게 적습니다.
- 관계가 없으면 **change 판정이 있는 렌즈** 중 하나를 고르세요.
  진단이 구체적이고 화면 근거가 분명한 쪽이 먼저입니다.
- **order를 채우려고 없는 관계를 만들지 마세요.** 순서는 관계에서 나오지,
  순서를 위해 관계가 있는 것이 아닙니다.
- 아무 렌즈도 change가 없으면 미결 질문(미결)이 있는 렌즈를 고르세요.
- then에는 그 렌즈를 고친 뒤 **다시 봐야 하는 렌즈**를 넣습니다. 원인을 고치면
  결과도 달라지기 때문입니다. 다시 볼 것이 없으면 빈 배열입니다.
- reason은 왜 그 렌즈가 먼저인지 한 문장. "촬영이 원인이므로 먼저"처럼
  **관계에 근거해서** 쓰세요.

한국어로 답하세요."""

CROSS_LENS_SCHEMA = {
    "name": "cross_lens_relations",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["relations", "comparisons", "order"],
        "properties": {
            # 어느 렌즈부터 손댈 것인가. 관계가 그 순서를 정한다 —
            # 원인 렌즈를 먼저 고치지 않으면 나머지는 증상만 사라진다.
            "order": {
                "type": "object",
                "additionalProperties": False,
                "required": ["first_lens", "reason", "then"],
                "properties": {
                    "first_lens": {
                        "type": "string",
                        "enum": ["mise", "camera", "editing", "narrative"],
                    },
                    "reason": {"type": "string"},
                    # 먼저 고친 뒤 다시 봐야 하는 렌즈. 없으면 빈 배열.
                    "then": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["mise", "camera", "editing", "narrative"]},
                    },
                },
            },
            "relations": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "type", "title", "summary", "lenses", "diagnosis_ids",
                        "source_lens", "affected_lens",
                    ],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["agreement", "conflict", "consequence"],
                        },
                        # 이 묶음의 이름. 화면에서 Issue 제목이 된다 —
                        # 감독이 목록에서 무엇을 여는지 보고 고른다.
                        # 요약(summary)은 문장이고 이것은 이름이다.
                        "title": {"type": "string"},
                        "summary": {"type": "string"},
                        # 이 관계가 잇는 두 렌즈. **관계의 축이다** — 진단이
                        # 없어도(한쪽이 keep) 렌즈 둘이면 관계를 낼 수 있다.
                        "lenses": {
                            "type": "array",
                            "minItems": 2,
                            "items": {"type": "string", "enum": ["mise", "camera", "editing", "narrative"]},
                        },
                        # 위 목록에 `- ` 다음에 나온 진단 id를 그대로 옮긴다.
                        # 층위 이름(shot_relation 등)이나 렌즈 이름이 아니다.
                        # 진단을 낸 렌즈의 것만 적으세요 — keep 렌즈는 진단이
                        # 없으므로 여기 없습니다. 한쪽 렌즈만 진단을 냈으면
                        # 그 하나만, 둘 다 냈으면 둘 다 적습니다.
                        "diagnosis_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        # consequence가 아니면 null.
                        "source_lens": {
                            "type": ["string", "null"],
                            "enum": ["mise", "camera", "editing", "narrative", None],
                        },
                        "affected_lens": {
                            "type": ["string", "null"],
                            "enum": ["mise", "camera", "editing", "narrative", None],
                        },
                    },
                },
            },
            "comparisons": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["diagnosis_ids", "common", "differences"],
                    "properties": {
                        "diagnosis_ids": {"type": "array", "minItems": 2, "items": {"type": "string"}},
                        "common": {"type": "string"},
                        "differences": {
                            "type": "array", "minItems": 2, "maxItems": 3,
                            "items": {
                                "type": "object", "additionalProperties": False,
                                "required": ["lens", "text"],
                                "properties": {
                                    "lens": {"type": "string", "enum": ["mise", "camera", "editing", "narrative"]},
                                    "text": {"type": "string"},
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}


def _lens_digest(lens_results: dict) -> str:
    """각 렌즈가 무엇을 판단했는지 압축해 넘긴다. 이미지는 다시 보내지 않는다.

    문제만이 아니라 **수정 방향과 선택지**도 함께 넘긴다. conflict는 두
    렌즈가 서로 반대되는 방향을 요구하는 관계인데, 문제 서술만 보내면
    요구가 무엇인지 알 수 없어 그 관계가 원리적으로 발견되지 않는다.
    같은 문제를 짚었는지(agreement)나 한쪽이 다른 쪽을 만들었는지
    (consequence)는 문제만으로 판정되지만, 충돌은 해법에서 드러난다.
    """
    blocks = []
    for lens, result in lens_results.items():
        lines = [f"[{lens}] 기본 판정={result.stance} | {result.summary}"]
        for diagnosis in result.diagnoses:
            lines.append(
                f"  - {diagnosis.id} | 기준: {diagnosis.criterion}"
                f"\n    진단: {diagnosis.diagnosis}"
                f"\n    대상: {', '.join(diagnosis.targets)}"
                f"\n    이 렌즈가 요구하는 것: {diagnosis.suggested_action}"
            )
            # '그대로 두기'는 어느 진단에나 붙는 기본값이라 방향을 말하지
            # 않는다. 실제로 무엇을 하자는 것인지만 넘긴다.
            moves = [
                f"{alt.label} — {alt.effect}"
                for alt in diagnosis.alternatives
                if alt.kind != "keep"
            ]
            if moves:
                lines.append(f"    갈 수 있는 길: {' / '.join(moves)}")
        # `keep`인 렌즈는 진단이 없어 위 블록이 통째로 비고, 판정 한 줄만
        # 남는다. 그러면 "촬영은 왜 지금도 충분하다고 보는가"를 알 수 없어
        # conflict(Tension)를 만들 재료가 없다. 그 렌즈가 어느 층위를 어떤
        # 근거로 유지로 봤는지 함께 넘긴다.
        if result.stance == "keep" or not result.diagnoses:
            for assessment in result.level_assessments:
                if assessment.status == "keep" and assessment.summary:
                    lines.append(f"    (유지 근거) {assessment.level}: {assessment.summary}")
        for assessment in result.level_assessments:
            if assessment.open_question:
                lines.append(f"  - (미결) {assessment.level}: {assessment.open_question}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _panel_ids(diagnosis) -> list[str]:
    """진단이 가리키는 패널 id. `"S2.position"` → `"S2"`.

    프론트가 이미 같은 방식으로 판다 (`DecisionBoard.jsx`의 `split('.', 1)[0]`).
    한쪽만 바꾸면 트랙의 마커와 카드의 표시가 어긋나므로 규칙을 맞춘다.
    """
    seen = []
    for target in diagnosis.targets:
        panel = target.split(".", 1)[0].strip()
        if panel and panel not in seen:
            seen.append(panel)
    return seen


def _panel_order(panel: str) -> tuple:
    """컷 번호 순으로 세운다. 진단이 도착한 순서를 따르면 같은 두 컷인데
    `S3→S2`가 되기도 한다."""
    return (0, int(panel[1:])) if panel[1:].isdigit() else (1, 0)


def _anchor_for(diagnoses: list) -> tuple[str, str]:
    """Issue가 걸리는 자리와 그 종류를 진단들에서 계산한다.

    모델에게 묻지 않는다 — 자리는 이미 `targets`에 있고, 물으면 지어낼
    여지만 생긴다. 트랙에서 마커를 컷 위에 둘지 컷 사이에 둘지가
    여기서 갈린다 (`LENS_TRACKS_UI.md` 3장).

    `level`을 먼저 본다. 같은 두 컷을 가리켜도 `shot_relation`은 그 사이의
    이음새 문제이고 `attribute`는 각 컷의 문제라, 패널 수만으로는 갈리지
    않는다.
    """
    if not diagnoses:
        return "", ""

    levels = {d.level for d in diagnoses}
    panels: list[str] = []
    for d in diagnoses:
        for panel in _panel_ids(d):
            if panel not in panels:
                panels.append(panel)

    if "scene_structure" in levels:
        # 범위 전체에 걸린 것. 양 끝으로 범위를 적는다.
        if len(panels) >= 2:
            ordered = sorted(panels, key=_panel_order)
            return f"{ordered[0]}–{ordered[-1]}", "scene"
        return (panels[0] if panels else ""), "scene"

    if len(panels) >= 2:
        # 두 컷을 함께 가리키면 문제는 그 **사이**에 있다.
        #
        # `level`만 믿지 않는다. 모델이 "두 컷이 나란히 있을 때 반복으로
        # 읽힌다"는 컷 사이 문제를 내면서 level을 `attribute`로 답하는
        # 일이 있다(실제로 그랬다). 그러면 마커가 앞 컷 위에 찍혀,
        # 고쳐야 할 자리가 컷 안인 것처럼 보인다.
        #
        # 한 컷의 문제라면 애초에 컷을 하나만 가리켰을 것이다.
        ordered = sorted(panels, key=_panel_order)
        return f"{ordered[0]}→{ordered[1]}", "seam"

    if len(panels) == 1:
        return panels[0], "shot"

    # 여기까지 오면 가리키는 컷이 없다.
    return "", ""


def _origin_lens_for(relation: dict, diagnoses_by_lens: dict) -> Optional[str]:
    """이 현상을 처음 짚은 렌즈. Inspector에서 `●`로 표시된다.

    consequence는 방향이 있으므로 원인 쪽이 origin이다. 나머지는 방향이
    없어 "누가 먼저"가 데이터에 없다 — 그때는 렌즈 목록의 첫 번째를 쓰되,
    이것이 시간 순서가 아니라 표시 순서임을 화면 문구가 넘겨짚지 않게
    한다 (`origin`이 아니라 `independently surfaced`로 적는다).
    """
    if relation.get("type") == "consequence" and relation.get("source_lens"):
        return relation["source_lens"]
    lenses = [lens for lens in (relation.get("lenses") or []) if lens in diagnoses_by_lens]
    return lenses[0] if lenses else None


def _build_issues(
    findings: list,
    lens_results: dict,
    order=None,
) -> list:
    """관계들을 Issue로 묶는다 — 화면이 쓰는 단위.

    관계는 진단 **쌍**으로 나온다. 진단이 셋이면 쌍이 셋이라 같은 현상이
    세 번 보고되고, 그대로 트랙에 올리면 렌즈당 마커가 여러 개 찍힌다
    (진단은 렌즈당 하나뿐인데). 진단을 공유하는 관계를 하나로 합친다.

    합쳐도 되는 근거는 `DirectingIssue` 주석에 있다 — 한 렌즈는 같은
    층위에서 진단을 하나만 내므로, 진단을 공유하면 현상도 같다.

    관계에 안 걸린 진단도 Issue가 된다. 한 렌즈만 짚은 것도 감독은 봐야
    하고, `+ Add Lens`로 다른 렌즈를 겹쳐 보는 출발점이 바로 그것이다
    (`LENS_TRACKS_UI.md` 4장).
    """
    diagnosis_by_id = {
        diagnosis.id: (lens, diagnosis)
        for lens, result in lens_results.items()
        for diagnosis in result.diagnoses
    }
    if not diagnosis_by_id:
        return []

    # 진단을 노드로, 관계를 간선으로 보고 연결 요소를 찾는다.
    parent: dict[str, str] = {}

    def find(node: str) -> str:
        parent.setdefault(node, node)
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a: str, b: str) -> None:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_a] = root_b

    for did in diagnosis_by_id:
        find(did)
    # 진단을 묶는 조건은 좁게 잡는다.
    #
    # 함부로 묶으면 서로 다른 문제가 한 카드에 섞여, 감독이 무엇을
    # 판정하는지 알 수 없게 된다. 관계 자체는 `common_findings`에 그대로
    # 남으므로 묶지 않아도 감독은 읽을 수 있다 — 여기서 정하는 것은
    # "트랙의 한 마커로 그릴 만큼 같은 것인가"뿐이다.
    #
    # 세 조건을 모두 넘겨야 잇는다:
    #
    # 1. **agreement만.** `같은 문제를 서로 다른 근거로 짚었다`는 뜻이라
    #    하나로 묶는 것이 옳다. `consequence`(하나가 다른 하나를 만들었다)와
    #    `conflict`(요구가 반대다)는 **서로 다른 문제**가 얽힌 것이므로
    #    각각 판정해야 한다 — 원인과 결과를 한 카드에 넣으면 어느 쪽을
    #    고치는 것인지 흐려진다.
    # 2. **자리가 같아야 한다.** 가리키는 컷이 완전히 같을 때만. 일부만
    #    겹치면(S2 대 S2·S3) 한쪽은 컷의 문제, 다른 쪽은 이음새의 문제라
    #    개입 지점이 다르다.
    # 3. **층위가 같아야 한다.** attribute와 shot_relation은 같은 컷을
    #    가리켜도 고치는 자리가 다르다.
    # 같은 두 진단에 관계가 여러 개 붙을 수 있다. `agreement`(같은 결손을
    # 짚음)와 `consequence`(하나가 다른 하나를 만듦)가 함께 나오는 식이다 —
    # 실제로 그랬다. 그때는 **묶지 않는다**: 방향이 있다는 것 자체가 원인과
    # 결과가 갈린다는 뜻이고, 고칠 곳은 원인 쪽 하나다. 둘을 한 카드에
    # 넣으면 어느 쪽을 고치는 것인지 흐려진다.
    directed_pairs = set()
    for finding in findings:
        if finding.type == "agreement":
            continue
        ids = [i for i in finding.diagnosis_ids if i in diagnosis_by_id]
        for left, right in zip(ids, ids[1:]):
            directed_pairs.add(frozenset((left, right)))

    for finding in findings:
        if finding.type != "agreement":
            continue
        ids = [i for i in finding.diagnosis_ids if i in diagnosis_by_id]
        for left, right in zip(ids, ids[1:]):
            if frozenset((left, right)) in directed_pairs:
                continue
            left_diagnosis = diagnosis_by_id[left][1]
            right_diagnosis = diagnosis_by_id[right][1]
            if left_diagnosis.level != right_diagnosis.level:
                continue
            if set(_panel_ids(left_diagnosis)) != set(_panel_ids(right_diagnosis)):
                continue
            union(left, right)

    # 묶인 진단들과, 그 묶음에 기여한 관계들을 모은다.
    members: dict[str, list[str]] = {}
    for did in diagnosis_by_id:
        members.setdefault(find(did), []).append(did)
    relations_of: dict[str, list] = {}
    for finding in findings:
        ids = [i for i in finding.diagnosis_ids if i in diagnosis_by_id]
        if ids:
            relations_of.setdefault(find(ids[0]), []).append(finding)

    issues = []
    for index, (root, ids) in enumerate(members.items(), start=1):
        picked = [diagnosis_by_id[i][1] for i in ids]
        lenses = []
        for i in ids:
            lens = diagnosis_by_id[i][0]
            if lens not in lenses:
                lenses.append(lens)
        related = relations_of.get(root, [])
        # 관계에 얽혔지만 진단은 없는 렌즈(keep 판정)도 이 Issue의
        # 참여 렌즈다. Inspector에서 유지 의견으로 보여야 한다.
        for finding in related:
            for lens in finding.lenses:
                if lens not in lenses:
                    lenses.append(lens)

        # origin: 관계가 있으면 그쪽 판단을 따르고, 없으면 유일한 렌즈다.
        origin = None
        for finding in related:
            if finding.type == "consequence" and finding.source_lens:
                origin = finding.source_lens
                break
        if origin is None and order and order.first_lens in lenses:
            # 관계가 방향을 안 줬을 때, 어느 렌즈부터 볼지는 order가 안다.
            origin = order.first_lens
        if origin is None:
            origin = related[0].origin_lens if related else lenses[0]
        if origin not in lenses:
            origin = lenses[0]

        # title: origin 렌즈가 낀 관계의 이름을 우선한다 — 가장 근본에
        # 가까운 쪽이다. 관계가 없으면 진단이 스스로 붙인 이름을 쓴다.
        # 규칙 이름은 마지막이다 — 같은 규칙에 걸린 진단이 전부 같은
        # 이름이 되어 트랙에서 마커를 구별할 수 없기 때문이다.
        title = ""
        for finding in related:
            if finding.title and origin in finding.lenses:
                title = finding.title
                break
        if not title:
            title = next((f.title for f in related if f.title), "")
        if not title:
            # 이 묶음에서 origin 렌즈의 진단이 붙인 이름을 먼저 본다.
            title = next(
                (
                    d.title.strip()
                    for i, d in zip(ids, picked)
                    if d.title and d.title.strip()
                    and diagnosis_by_id[i][0] == origin
                ),
                "",
            )
        if not title:
            title = next((d.title.strip() for d in picked if d.title and d.title.strip()), "")
        if not title:
            title = _title_from_rule(picked[0])

        anchor, anchor_kind = _anchor_for(picked)
        # 이 범위를 `keep`으로 본 렌즈. 진단이 없어 위 클러스터에는 들어오지
        # 않지만, 감독은 "촬영은 이대로도 된다고 봤다"를 함께 읽어야 한다.
        holding = [
            DirectingHold(lens=lens, reason=result.summary or "")
            for lens, result in lens_results.items()
            if getattr(result, "stance", None) == "keep" and lens not in lenses
        ]
        issues.append(DirectingIssue(
            id=f"issue-{index}",
            anchor=anchor,
            anchor_kind=anchor_kind,
            title=title,
            diagnosis_ids=ids,
            lenses=lenses,
            origin_lens=origin,
            holding_lenses=holding,
            # 방향이 있는 관계가 먼저다. consequence는 어디를 고쳐야
            # 하는지까지 말해 주므로 감독이 먼저 읽어야 한다.
            relation_types=sorted(
                dict.fromkeys(f.type for f in related),
                key=lambda t: {"consequence": 0, "conflict": 1, "agreement": 2}.get(t, 3),
            ),
        ))

    # 렌즈가 많이 걸린 것이 먼저다. 여러 관점이 함께 짚은 것을 감독이
    # 먼저 본다 — 트랙에서도 수직으로 길게 정렬되어 눈에 먼저 들어온다.
    issues.sort(key=lambda issue: (-len(issue.lenses), issue.anchor))
    return issues


# 관계에 안 걸린 진단은 이름이 없다. 규칙 id에서 만든다 — 모델에게 다시
# 묻지 않는다. 규칙은 이미 무엇을 보는 규칙인지 이름에 담고 있다.
_RULE_TITLES = {
    "mise-functional-elements": "필요한 요소",
    "mise-relational-blocking": "인물 배치",
    "mise-spatial-continuity": "공간 연속성",
    "mise-visual-hierarchy": "시선 유도",
    "camera-information-selection": "정보 선택",
    "camera-viewpoint-intent": "시점",
    "camera-axis-direction": "축과 방향",
    "camera-movement-purpose": "카메라 움직임",
    "editing-shot-function": "컷의 역할",
    "editing-cut-continuity": "컷 연결",
    "editing-information-order": "정보 순서",
    "editing-visual-rhythm": "리듬",
    "narrative-beat-progression": "장면 전개",
    "narrative-action-visibility": "행동 제시",
    "narrative-information-reveal": "정보 공개",
    "narrative-causal-link": "인과",
}


def _title_from_rule(diagnosis) -> str:
    return _RULE_TITLES.get(diagnosis.rule_id) or diagnosis.level.replace("_", " ")


async def _relate_lenses(
    lens_results: dict,
    settled: list | None = None,
) -> tuple[list[DirectingCommonFinding], list[DirectingLensComparison], Optional[DirectingOrder], int]:
    """렌즈 판단들 사이의 관계와, 어느 렌즈부터 볼지, 버린 관계 수.

    진단이 둘 미만이면 관계가 있을 수 없다. 다만 그때도 순서는 쓸모가
    있으므로, 진단이 하나라도 있으면 물어본다.
    """
    known_ids = {
        diagnosis.id
        for result in lens_results.values()
        for diagnosis in result.diagnoses
    }
    if not known_ids:
        return [], [], None, 0
    # 어느 렌즈의 진단인지. consequence가 id를 하나만 준 경우 나머지
    # 한쪽을 그 렌즈 안에서 찾는 데 쓴다.
    ids_by_lens: dict[str, list[str]] = {
        lens: [diagnosis.id for diagnosis in result.diagnoses]
        for lens, result in lens_results.items()
    }
    # 관계가 가리키는 진단을 되찾아 자리를 계산하는 데 쓴다.
    diagnosis_by_id = {
        diagnosis.id: diagnosis
        for result in lens_results.values()
        for diagnosis in result.diagnoses
    }

    user_content = _lens_digest(lens_results)
    if settled:
        # 감독이 이미 정리한 관계. 다시 짚으면 판정한 의미가 없다.
        lines = [
            f"- {item.verdict}: {item.summary}"
            for item in settled
        ]
        user_content += (
            "\n\n[감독이 이미 판정한 관계]\n"
            + "\n".join(lines)
            + "\n이 관계들은 다시 제시하지 마세요. 감독이 정리를 마친 것입니다."
        )

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = await client.chat.completions.create(
        model=_model_for_lens("editing"),
        messages=[
            {"role": "system", "content": CROSS_LENS_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": CROSS_LENS_SCHEMA},
        max_completion_tokens=2000,
    )
    data = json.loads(response.choices[0].message.content.strip())

    findings = []
    comparisons = []
    dropped = 0
    raw_relations = data.get("relations", [])
    for relation in raw_relations:
        # 없는 진단을 가리키는 관계는 버린다 — 모델이 id를 지어낼 때가 있다.
        ids = [rid for rid in relation.get("diagnosis_ids", []) if rid in known_ids]
        # 모델이 관계는 옳게 보고도 한쪽 id만 적을 때가 있다. 관계는 어느
        # 렌즈끼리인지 이미 말했으므로, 빠진 쪽을 그 렌즈 안에서 찾는다.
        # 후보가 하나뿐일 때만 잇는다 — 여럿이면 어느 것인지 우리가 정할
        # 수 없고, 그것은 지어내는 것이 된다.
        if len(ids) == 1:
            named = set(relation.get("lenses") or []) | {
                relation.get("source_lens"), relation.get("affected_lens")
            }
            missing = [
                lens for lens in named
                if lens in ids_by_lens and not any(
                    rid in ids_by_lens[lens] for rid in ids
                )
            ]
            if len(missing) == 1:
                candidates = ids_by_lens[missing[0]]
                if len(candidates) == 1:
                    ids = ids + candidates
                    print(
                        f"[directing-review] relation repaired: "
                        f"{relation.get('type')} gained {candidates[0]} "
                        f"from {missing[0]}"
                    )
            # 렌즈 이름까지 틀렸어도, 진단이 통틀어 둘뿐이면 짝은 자명하다.
            # 고를 여지가 없으므로 이어도 지어내는 것이 아니다.
            if len(ids) == 1 and len(known_ids) == 2:
                other = [rid for rid in known_ids if rid not in ids]
                ids = ids + other
                print(
                    f"[directing-review] relation repaired: "
                    f"{relation.get('type')} gained {other[0]} "
                    f"(진단이 둘뿐이라 짝이 자명)"
                )
        # 관계의 축은 렌즈 쌍이다. 두 렌즈가 모두 이번 검토에 참여했으면
        # 관계가 성립한다 — 한쪽이 keep이라 진단이 없어도, 그 판정과 다른
        # 렌즈 판정 사이의 conflict는 감독이 봐야 한다.
        rel_lenses = [
            lens for lens in (relation.get("lenses") or [])
            if lens in lens_results
        ]
        # 자리는 진단의 targets에서 나온다. 진단이 하나도 없으면 마커를
        # 어디 둘지 알 수 없으므로, 그때만 버린다.
        if len(set(rel_lenses)) < 2 or not ids:
            # 버린 것을 남긴다. 조용히 버리면 화면에서 '관계 없음'과
            # 구분되지 않아, 모델이 못 찾은 것인지 우리가 버린 것인지
            # 알 수 없다.
            dropped += 1
            print(
                f"[directing-review] relation dropped: "
                f"type={relation.get('type')} lenses={relation.get('lenses')} "
                f"ids={relation.get('diagnosis_ids')} known={sorted(known_ids)}"
            )
            continue

        # 자리와 origin은 서버가 채운다. 모델은 관계만 본다.
        picked = [diagnosis_by_id[rid] for rid in ids if rid in diagnosis_by_id]
        anchor, anchor_kind = _anchor_for(picked)
        try:
            findings.append(DirectingCommonFinding(
                type=relation["type"],
                title=(relation.get("title") or "").strip(),
                summary=relation["summary"],
                lenses=rel_lenses,
                diagnosis_ids=ids,
                source_lens=relation.get("source_lens"),
                affected_lens=relation.get("affected_lens"),
                anchor=anchor,
                anchor_kind=anchor_kind,
                origin_lens=_origin_lens_for(relation, ids_by_lens),
            ))
        except ValueError as error:
            # 방향이 빠진 consequence 등. 관계 하나 때문에 검토 전체를 버리지 않는다.
            dropped += 1
            print(
                f"[directing-review] relation dropped (invalid): "
                f"type={relation.get('type')} error={error}"
            )
            continue

    # 비교는 relation보다 넓다. 같은 현상에 대한 서로 다른 검토 범위를
    # 보여 줄 뿐, Issue를 합치거나 원인·결과를 단정하지 않는다.
    lens_of_diagnosis = {
        diagnosis.id: lens
        for lens, result in lens_results.items()
        for diagnosis in result.diagnoses
    }
    for comparison in data.get("comparisons", []):
        ids = [item for item in comparison.get("diagnosis_ids", []) if item in known_ids]
        if len(ids) < 2:
            continue
        lenses = {lens_of_diagnosis[item] for item in ids}
        differences = [
            item for item in comparison.get("differences", [])
            if item.get("lens") in lenses and (item.get("text") or "").strip()
        ]
        if len({item["lens"] for item in differences}) < 2:
            continue
        try:
            comparisons.append(DirectingLensComparison(
                diagnosis_ids=ids,
                common=(comparison.get("common") or "").strip(),
                differences=differences,
            ))
        except ValueError:
            continue

    order = None
    raw_order = data.get("order")
    if raw_order and raw_order.get("first_lens") in lens_results:
        try:
            order = DirectingOrder(
                first_lens=raw_order["first_lens"],
                reason=raw_order.get("reason", ""),
                # 실제로 돌아간 렌즈만 남긴다.
                then=[
                    lens for lens in raw_order.get("then", [])
                    if lens in lens_results and lens != raw_order["first_lens"]
                ],
            )
        except ValueError:
            order = None
    return findings, comparisons, order, dropped


async def review_directing(request: DirectingReviewRequest) -> DirectingReviewResponse:
    if request.mode == "relate":
        return await _relate_only(request)
    if request.mode == "multi":
        return await _review_all_lenses(request)
    if request.mode not in {"camera", "mise", "editing"}:
        raise UnsupportedReviewModeError(
            f"The {request.mode} review mode is not connected yet. Use camera, mise, or editing mode."
        )
    lens: DirectingLens = request.mode
    result, questions = await analyze_lens(request, lens)
    return DirectingReviewResponse(
        lens_results={lens: result},
        issues=_build_issues([], {lens: result}),
        questions=questions,
    )


async def _relate_only(request: DirectingReviewRequest) -> DirectingReviewResponse:
    """이미 나온 렌즈 판단들 사이의 관계만 본다.

    렌즈 분석과 나누면 감독이 먼저 각 판단을 읽고, 관계가 필요할 때만
    기다린다. 이미지를 다시 올리지 않아 훨씬 빠르다.
    """
    if not request.lens_results:
        raise ValueError("relate mode requires lens_results")
    findings, comparisons, order, dropped = await _relate_lenses(request.lens_results, request.settled)
    return DirectingReviewResponse(
        lens_results=request.lens_results,
        common_findings=findings,
        comparisons=comparisons,
        issues=_build_issues(findings, request.lens_results, order),
        dropped_relations=dropped,
        order=order,
    )


async def _review_all_lenses(request: DirectingReviewRequest) -> DirectingReviewResponse:
    """세 렌즈를 각자 돌린 뒤 그 사이의 관계를 본다.

    한 번에 다 보게 하지 않는 이유: 어느 관점의 판단인지 섞인다. 각자
    판단해야 렌즈가 독립적이고, 그 뒤에 관계를 물어야 연결이 드러난다.
    """
    # 서사는 이 세 렌즈보다 앞에서 이야기의 단계와 정보 순서를 잡는 별도
    # 상위 에이전트다. 다관점 패널 검토에는 화면을 직접 다루는 세 관점만 둔다.
    lenses: list[DirectingLens] = ["mise", "camera", "editing"]
    outcomes = await asyncio.gather(
        *(analyze_lens(request, lens) for lens in lenses),
        return_exceptions=True,
    )

    lens_results = {}
    failed_lenses = []
    questions = []
    for lens, outcome in zip(lenses, outcomes):
        # 한 렌즈가 실패해도 나머지 판단은 살린다. 다만 실패했다는 사실은
        # 화면까지 올린다 — 빠진 렌즈를 '문제 없음'으로 읽으면 안 된다.
        if isinstance(outcome, Exception):
            print(f"[directing-review] {lens} lens failed: {outcome}")
            failed_lenses.append(lens)
            continue
        result, lens_questions = outcome
        lens_results[lens] = result
        questions.extend(lens_questions)

    if not lens_results:
        raise ValueError("all lenses failed")

    # 관계는 여기서 찾지 않는다. 감독이 렌즈 판단을 먼저 읽고, 필요하면
    # 'relate' 모드로 따로 부른다 — 한 번에 하면 70초를 기다린다.
    #
    # 그래도 Issue는 만든다. 관계가 없으면 진단 하나가 곧 Issue 하나이고,
    # 트랙은 그것으로 이미 그려진다 — 관계를 기다리는 동안 화면이 비어
    # 있을 이유가 없다. 'relate'가 돌아오면 겹치는 것들이 합쳐진다.
    return DirectingReviewResponse(
        lens_results=lens_results,
        issues=_build_issues([], lens_results),
        failed_lenses=failed_lenses,
        questions=questions,
    )
