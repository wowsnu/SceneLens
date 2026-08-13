"""Run positive/negative vision tests for the 12 directing review rules.

This is an evaluation harness, not a unit test: it calls the configured OpenAI
models with the fixed viewer-test panels and prints one JSON record per case.
"""

import argparse
import asyncio
import base64
import io
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image, ImageOps

from app.models.schemas import DirectingReviewPanel, DirectingReviewRequest
from app.services.directing_review import analyze_lens
from app.services.directing_rules import validate_rule_theory_choice


ROOT = Path(__file__).resolve().parents[3]
IMAGE_DIR = ROOT / "public" / "img" / "viewer-test"


@dataclass(frozen=True)
class PanelCase:
    image: str
    context: str
    directing_notes: str = ""
    scene_id: str = "scene-control-room"
    flip_horizontal: bool = False


@dataclass(frozen=True)
class RuleCase:
    id: str
    lens: str
    expected_rule: Optional[str]
    intent: str
    panels: tuple[PanelCase, ...]
    expected_level: Optional[str] = None
    max_questions: int = 0


CASES = (
    RuleCase(
        id="mise-functional-elements-positive",
        lens="mise",
        expected_rule="mise-functional-elements",
        intent="노란 우비 아이가 위협의 원인임을 관제실 모니터 화면에서 분명히 보여주고 싶다.",
        panels=(PanelCase(
            "panel-01-control-room-establishing.png",
            "관제실 모니터 한 화면에 노란 우비 아이가 분명히 보여야 하며, 그 아이가 위협의 원인이다.",
        ),),
        expected_level="attribute",
        max_questions=1,
    ),
    RuleCase(
        id="mise-functional-elements-negative",
        lens="mise",
        expected_rule=None,
        intent="빨간 버튼 리모컨을 처음 공개해 위협의 원인을 분명히 보여주고 싶다.",
        panels=(PanelCase(
            "panel-07-remote-revealed.png",
            "민호가 빨간 버튼 리모컨을 드러내고 재인이 뒤에서 경계한다.",
        ),),
    ),
    RuleCase(
        id="mise-relational-blocking-positive",
        lens="mise",
        expected_rule="mise-relational-blocking",
        intent="화해 직후 두 사람이 서로 가까이 기대고 시선을 부드럽게 맞추는 친밀함을 보여주고 싶다.",
        panels=(PanelCase(
            "panel-05-jaein-points-camera.png",
            "두 사람이 화해해 경계 없이 가까이 서 있는 순간이다.",
        ),),
        expected_level="attribute",
    ),
    RuleCase(
        id="mise-relational-blocking-negative",
        lens="mise",
        expected_rule=None,
        intent="두 인물의 거리와 민호의 위치로 재인이 방 안쪽으로 가지 못하고 궁지에 몰렸음을 보여주고 싶다.",
        panels=(PanelCase(
            "panel-08-jaein-cornered.png",
            "재인은 화면 왼쪽 출입문과 벽 사이에 있고, 민호는 오른쪽 전경에서 방 안쪽 길을 막아선다.",
        ),),
    ),
    RuleCase(
        id="mise-spatial-continuity-positive",
        lens="mise",
        expected_rule="mise-spatial-continuity",
        intent="두 컷은 움직임 없이 바로 이어지는 같은 순간으로 보여야 한다.",
        panels=(
            PanelCase(
                "panel-02-jaein-enters.png",
                "재인은 출입문 안쪽에 서 있고 민호는 콘솔에 앉아 있다.",
            ),
            PanelCase(
                "panel-10-jaein-lunges.png",
                "아무도 이동하거나 일어서지 않은 채 같은 대화가 계속된다.",
            ),
        ),
        expected_level="shot_relation",
    ),
    RuleCase(
        id="mise-spatial-continuity-negative",
        lens="mise",
        expected_rule=None,
        intent="같은 순간의 인물 위치와 자세가 두 컷에서 그대로 이어지게 하고 싶다.",
        panels=(
            PanelCase(
                "panel-08-jaein-cornered.png",
                "재인은 화면 왼쪽 벽 앞에 서 있고 민호는 오른쪽 전경에 서 있다.",
            ),
            PanelCase(
                "panel-08-jaein-cornered.png",
                "아무도 움직이지 않은 같은 순간이며 위치와 자세가 그대로 유지된다.",
            ),
        ),
    ),
    RuleCase(
        id="mise-visual-hierarchy-positive",
        lens="mise",
        expected_rule="mise-visual-hierarchy",
        intent="재인이 들고 있는 작은 출입카드가 사건의 핵심 단서이므로 이 카드가 가장 먼저 읽히게 하고 싶다.",
        panels=(PanelCase(
            "panel-05-jaein-points-camera.png",
            "재인은 한 손에 출입카드를 들고 다른 손으로 감시 카메라를 가리키며, 민호는 이를 지켜본다.",
        ),),
        expected_level="attribute",
    ),
    RuleCase(
        id="mise-visual-hierarchy-negative",
        lens="mise",
        expected_rule=None,
        intent="넓고 빈 승강장 속 작은 아이로 고립과 터널의 위험을 강조하고 싶다.",
        panels=(PanelCase(
            "panel-09-child-platform.png",
            "텅 빈 승강장에 노란 우비를 입은 아이가 홀로 서 있다.",
        ),),
    ),
    RuleCase(
        id="camera-information-selection-positive",
        lens="camera",
        expected_rule="camera-information-selection",
        intent="아이의 떨리는 표정과 눈빛을 이 컷의 핵심 정보로 읽히게 하고 싶다.",
        panels=(PanelCase(
            "panel-09-child-platform.png",
            "노란 우비를 입은 아이가 공포에 떨며 터널을 바라본다.",
        ),),
        expected_level="attribute",
    ),
    RuleCase(
        id="camera-information-selection-negative",
        lens="camera",
        expected_rule=None,
        intent="광대한 빈 승강장 속 작은 아이로 고립과 터널의 위험을 강조하고 싶다.",
        panels=(PanelCase(
            "panel-09-child-platform.png",
            "텅 빈 승강장에 노란 우비를 입은 아이가 홀로 서 있다.",
        ),),
    ),
    RuleCase(
        id="camera-viewpoint-intent-positive",
        lens="camera",
        expected_rule="camera-viewpoint-intent",
        intent="재인의 주관적 시점에서 민호가 화면을 압도하며 덮쳐오는 공포를 느끼게 하고 싶다.",
        panels=(PanelCase(
            "panel-05-jaein-points-camera.png",
            "재인이 민호와 대치하며 민호를 바라본다.",
        ),),
        expected_level="attribute",
    ),
    RuleCase(
        id="camera-viewpoint-intent-negative",
        lens="camera",
        expected_rule=None,
        intent="객관적 거리에서 두 사람과 퇴로의 공간관계를 함께 보여주고 싶다.",
        panels=(PanelCase(
            "panel-08-jaein-cornered.png",
            "민호가 리모컨을 든 채 퇴로를 막고 재인은 출입문과 벽 사이에 몰린다.",
        ),),
    ),
    RuleCase(
        id="camera-axis-direction-positive",
        lens="camera",
        expected_rule="camera-axis-direction",
        intent="같은 대치축을 유지한 채 두 컷을 바로 이어 공간관계를 명료하게 보여주고 싶다.",
        panels=(
            PanelCase(
                "panel-05-jaein-points-camera.png",
                "재인은 화면 왼쪽, 민호는 오른쪽에서 서로 마주 본다.",
            ),
            PanelCase(
                "panel-05-jaein-points-camera.png",
                "아무도 자리를 바꾸거나 시선을 돌리지 않은 채 같은 대치가 이어진다.",
                flip_horizontal=True,
            ),
        ),
        expected_level="shot_relation",
    ),
    RuleCase(
        id="camera-axis-direction-negative",
        lens="camera",
        expected_rule=None,
        intent="재인은 화면 왼쪽, 민호는 오른쪽에 유지해 대치 방향을 명료하게 보여주고 싶다.",
        panels=(
            PanelCase(
                "panel-05-jaein-points-camera.png",
                "재인이 왼쪽에서 오른쪽의 민호와 카메라를 가리킨다.",
            ),
            PanelCase(
                "panel-08-jaein-cornered.png",
                "재인은 왼쪽 출입문에, 민호는 오른쪽에서 재인을 막아선다.",
            ),
        ),
    ),
    RuleCase(
        id="camera-movement-purpose-positive",
        lens="camera",
        expected_rule="camera-movement-purpose",
        intent="오른쪽 전경의 민호에서 왼쪽 출입문의 재인까지 팬해 두 인물과 막힌 퇴로의 공간관계를 차례로 보여주고 싶다.",
        panels=(PanelCase(
            "panel-08-jaein-cornered.png",
            "오른쪽 전경에 민호가 있고 왼쪽 출입문에 재인이 있다. 이 패널은 팬의 종료 구도다.",
            "시작 대상=오른쪽 전경의 민호; 종료 대상=왼쪽 출입문의 재인; "
            "카메라가 회전해 향하는 방향 PAN: (0.20, 0.50) → (0.80, 0.50)",
        ),),
        expected_level="attribute",
    ),
    RuleCase(
        id="camera-movement-purpose-negative",
        lens="camera",
        expected_rule=None,
        intent="오른쪽 전경의 민호에서 왼쪽 출입문의 재인까지 팬해 두 인물과 막힌 퇴로의 공간관계를 차례로 보여주고 싶다.",
        panels=(PanelCase(
            "panel-08-jaein-cornered.png",
            "오른쪽 전경에 민호가 있고 왼쪽 출입문에 재인이 있다. 이 패널은 팬의 종료 구도다.",
            "시작 대상=오른쪽 전경의 민호; 종료 대상=왼쪽 출입문의 재인; "
            "카메라가 회전해 향하는 방향 PAN: (0.80, 0.50) → (0.20, 0.50)",
        ),),
    ),
    RuleCase(
        id="editing-shot-function-positive",
        lens="editing",
        expected_rule="editing-shot-function",
        intent="리모컨 공개는 한 번만 명확하게 보여주고 곧바로 다음 사건으로 넘어가고 싶다.",
        panels=(
            PanelCase(
                "panel-07-remote-revealed.png",
                "민호가 빨간 버튼 리모컨을 처음 드러낸다.",
            ),
            PanelCase(
                "panel-07-remote-revealed.png",
                "민호가 같은 자세로 같은 리모컨을 다시 보여준다.",
            ),
        ),
        expected_level="shot_structure",
    ),
    RuleCase(
        id="editing-shot-function-negative",
        lens="editing",
        expected_rule=None,
        intent="열차라는 위험의 대상과 그것을 조종할 리모컨을 차례로 연결하고 싶다.",
        panels=(
            PanelCase(
                "panel-06-monitor-wall.png",
                "민호가 모니터에서 터널의 열차를 확인한다.",
            ),
            PanelCase(
                "panel-07-remote-revealed.png",
                "민호가 열차와 연결된 빨간 버튼 리모컨을 드러낸다.",
            ),
        ),
    ),
    RuleCase(
        id="editing-cut-continuity-positive",
        lens="editing",
        expected_rule="editing-cut-continuity",
        intent="두 컷은 시간 생략 없이 아무도 움직이지 않은 같은 순간으로 이어져야 한다.",
        panels=(
            PanelCase(
                "panel-02-jaein-enters.png",
                "재인은 출입문에 서 있고 민호는 콘솔에 앉아 있다.",
            ),
            PanelCase(
                "panel-08-jaein-cornered.png",
                "아무도 이동하거나 일어서지 않은 채 같은 대화가 이어진다.",
            ),
        ),
        expected_level="shot_relation",
    ),
    RuleCase(
        id="editing-cut-continuity-negative",
        lens="editing",
        expected_rule=None,
        intent="재인이 들어온 뒤 민호가 몸을 돌려 확인하는 연속 동작을 자연스럽게 잇고 싶다.",
        panels=(
            PanelCase(
                "panel-02-jaein-enters.png",
                "재인이 출입문으로 들어오고 민호는 콘솔을 향해 앉아 있다.",
            ),
            PanelCase(
                "panel-03-minho-looks-back.png",
                "민호가 앉은 채 몸을 돌려 출입문의 재인을 확인한다.",
            ),
        ),
    ),
    RuleCase(
        id="editing-information-order-positive",
        lens="editing",
        expected_rule="editing-information-order",
        intent="관객이 승강장의 아이가 위험하다는 사실을 먼저 보고, 그 때문에 재인이 리모컨으로 몸을 던진다고 이해하게 하고 싶다.",
        panels=(
            PanelCase(
                "panel-10-jaein-lunges.png",
                "재인이 민호의 리모컨을 향해 몸을 던진다.",
            ),
            PanelCase(
                "panel-09-child-platform.png",
                "그제야 터널 앞에 홀로 선 아이가 처음 보인다.",
                scene_id="scene-platform",
            ),
        ),
        expected_level="scene_structure",
    ),
    RuleCase(
        id="editing-information-order-negative",
        lens="editing",
        expected_rule=None,
        intent="관객이 승강장의 아이가 위험하다는 사실을 먼저 보고, 그 때문에 재인이 리모컨으로 몸을 던진다고 이해하게 하고 싶다.",
        panels=(
            PanelCase(
                "panel-09-child-platform.png",
                "터널 앞에 홀로 선 아이가 위험에 노출되어 있다.",
                scene_id="scene-platform",
            ),
            PanelCase(
                "panel-10-jaein-lunges.png",
                "아이를 본 재인이 민호의 리모컨을 향해 몸을 던진다.",
            ),
        ),
    ),
    RuleCase(
        id="editing-visual-rhythm-positive",
        lens="editing",
        expected_rule="editing-visual-rhythm",
        intent="내용 순서는 그대로 유지하되, 대치가 진행될수록 화면을 점점 좁혀 마지막 궁지에서 시각적으로 절정에 이르게 하고 싶다.",
        panels=(
            PanelCase(
                "panel-10-jaein-lunges.png",
                "재인과 민호의 가까운 대치가 시작된다.",
            ),
            PanelCase(
                "panel-05-jaein-points-camera.png",
                "같은 대치가 이어지며 긴장이 높아진다.",
            ),
            PanelCase(
                "panel-08-jaein-cornered.png",
                "민호가 퇴로를 막아 재인을 궁지로 몬다.",
            ),
        ),
        expected_level="scene_structure",
    ),
    RuleCase(
        id="editing-visual-rhythm-negative",
        lens="editing",
        expected_rule=None,
        intent="공간 제시에서 반응, 대치, 행동 충돌로 넘어가며 의도적으로 화면 크기와 정보량을 변화시키고 싶다.",
        panels=(
            PanelCase(
                "panel-01-control-room-establishing.png",
                "빈 관제실과 모니터 벽을 넓게 제시한다.",
            ),
            PanelCase(
                "panel-04-minho-turns.png",
                "민호가 재인을 향해 돌아보는 반응을 가까이 보여준다.",
            ),
            PanelCase(
                "panel-08-jaein-cornered.png",
                "두 사람과 막힌 퇴로를 함께 보여준다.",
            ),
            PanelCase(
                "panel-10-jaein-lunges.png",
                "재인이 리모컨으로 몸을 던지는 충돌을 가까이 보여준다.",
            ),
        ),
    ),
)


def encode_image(panel: PanelCase) -> str:
    """Resize only in memory to keep the evaluation request small."""
    with Image.open(IMAGE_DIR / panel.image) as image:
        image = image.convert("RGB")
        if panel.flip_horizontal:
            image = ImageOps.mirror(image)
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=88, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


async def run_case(case: RuleCase, semaphore: asyncio.Semaphore) -> dict:
    panels = [
        DirectingReviewPanel(
            id=f"S{index}",
            image=encode_image(panel),
            context=panel.context,
            directing_notes=panel.directing_notes or None,
            scene_id=panel.scene_id,
        )
        for index, panel in enumerate(case.panels, start=1)
    ]
    request = DirectingReviewRequest(
        mode=case.lens,
        panels=panels,
        intent=case.intent,
    )

    started = time.monotonic()
    async with semaphore:
        for attempt in range(1, 4):
            try:
                result, questions = await analyze_lens(request, case.lens)
                expected_diagnosis = next(
                    (
                        diagnosis
                        for diagnosis in result.diagnoses
                        if diagnosis.rule_id == case.expected_rule
                    ),
                    None,
                )
                diagnosis = expected_diagnosis if case.expected_rule else (
                    result.diagnoses[0] if result.diagnoses else None
                )
                actual_rule = diagnosis.rule_id if diagnosis else None
                assessment_by_level = {
                    assessment.level: assessment.status
                    for assessment in result.level_assessments
                }
                assessment_valid = (
                    set(assessment_by_level) == {
                        "attribute", "shot_structure", "shot_relation", "scene_structure",
                    }
                    and len(result.level_assessments) == 4
                    and all(assessment.summary.strip() for assessment in result.level_assessments)
                    and (
                        case.expected_rule is None
                        or assessment_by_level.get(case.expected_level) == "change"
                    )
                )
                rule_match = (
                    expected_diagnosis is not None
                    if case.expected_rule is not None
                    else not result.diagnoses
                )
                level_match = (
                    expected_diagnosis.level == case.expected_level
                    if case.expected_rule is not None and expected_diagnosis is not None
                    else not result.diagnoses
                )
                evidence_valid = (
                    1 <= len(diagnosis.evidence) <= 2
                    and all(value.strip() for value in diagnosis.evidence)
                    if diagnosis is not None else not result.diagnoses
                )
                action_valid = (
                    bool(diagnosis.suggested_action.strip())
                    if diagnosis is not None else not result.diagnoses
                )
                theory_valid = case.expected_rule is None and not result.diagnoses
                if diagnosis is not None and diagnosis.theory_source:
                    references = re.findall(
                        r"b_[A-Za-z0-9_]+:t_[A-Za-z0-9_]+:[0-9a-f]{8}",
                        diagnosis.theory_source,
                    )
                    try:
                        if len(references) == 1:
                            validate_rule_theory_choice(
                                case.lens,
                                diagnosis.rule_id,
                                references[0],
                            )
                            theory_valid = True
                    except ValueError:
                        theory_valid = False
                questions_valid = len(questions) <= case.max_questions
                structural_checks = {
                    "assessments": assessment_valid,
                    "rule": rule_match,
                    "level": level_match,
                    "evidence": evidence_valid,
                    "action": action_valid,
                    "theory": theory_valid,
                    "questions": questions_valid,
                }
                return {
                    "id": case.id,
                    "lens": case.lens,
                    "expected_rule": case.expected_rule,
                    "expected_level": case.expected_level,
                    "level_assessments": assessment_by_level,
                    "actual_rule": actual_rule,
                    "actual_rules": [item.rule_id for item in result.diagnoses],
                    "passed": all(structural_checks.values()),
                    "checks": structural_checks,
                    "level": diagnosis.level if diagnosis else None,
                    "diagnosis": diagnosis.diagnosis if diagnosis else None,
                    "evidence": diagnosis.evidence if diagnosis else [],
                    "theory_source": diagnosis.theory_source if diagnosis else None,
                    "suggested_action": diagnosis.suggested_action if diagnosis else None,
                    "questions": [question.prompt for question in questions],
                    "summary": result.summary,
                    "seconds": round(time.monotonic() - started, 2),
                }
            except Exception as error:  # noqa: BLE001 - report external API failures per case
                if attempt == 3:
                    return {
                        "id": case.id,
                        "lens": case.lens,
                        "expected_rule": case.expected_rule,
                        "actual_rule": None,
                        "passed": False,
                        "error": str(error),
                        "seconds": round(time.monotonic() - started, 2),
                    }
                await asyncio.sleep(5 * attempt)
    raise RuntimeError("unreachable")


async def main(case_filter: str = "", concurrency: int = 3, repeat: int = 1) -> None:
    filters = [value.strip() for value in case_filter.split(",") if value.strip()]
    selected = [
        case for case in CASES
        if not filters or any(value in case.id for value in filters)
    ]
    semaphore = asyncio.Semaphore(concurrency)
    results = await asyncio.gather(*(
        run_case(case, semaphore)
        for case in selected
        for _ in range(repeat)
    ))
    for result in results:
        print("CASE_RESULT " + json.dumps(result, ensure_ascii=False))

    passed = sum(result.get("passed", False) for result in results)
    summary = {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "positive": sum(result.get("expected_rule") is not None for result in results),
        "negative": sum(result.get("expected_rule") is None for result in results),
    }
    print("TEST_SUMMARY " + json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--filter", default="")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "backend" / ".env", override=False)
    asyncio.run(main(args.filter, max(1, args.concurrency), max(1, args.repeat)))
