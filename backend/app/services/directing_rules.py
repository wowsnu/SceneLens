"""Fixed diagnostic rules for the three directing suggestion agents.

The rules find *candidates*, not defects. The vision model still has to verify the
condition against the selected panels and the director's intent. This keeps the
agent's vocabulary stable without turning a creative difference into an error.
"""

from dataclasses import dataclass

from app.models.schemas import DirectingLens

TheoryKey = tuple[str, str]


@dataclass(frozen=True)
class DirectingRule:
    id: str
    label: str
    # 이 규칙이 무엇을 보고 판단하는가. trigger/reject_when을 감독이 읽을
    # 한 문장으로 옮긴 것이다 — 새 기준이 아니라 같은 기준의 다른 표현이다.
    #
    # 진단에 이 문장을 함께 실어 보내는 이유: 무엇이 문제인지만 말하면
    # 감독은 그 판단 자체를 반박할 수 없다. 기준이 드러나야 "그 기준으로는
    # 그렇지만 여기서는 아니다"라고 말할 수 있다 (design_goal.md DG1 P2).
    criterion: str
    trigger: str
    reject_when: str
    theory_refs: tuple[TheoryKey, ...]


LENS_RULES: dict[DirectingLens, tuple[DirectingRule, ...]] = {
    "mise": (
        DirectingRule(
            id="mise-functional-elements",
            label="서사 기능 요소의 존재와 배치",
            criterion="이 사건에 필요한 인물·소품·공간이 화면에서 식별되는가?",
            trigger=(
                "사건에 필요한 인물·소품·공간 단서를 화면 근거만으로 식별할 수 없거나, "
                "다른 인물·위치에 놓였거나, 배치와 관계가 그 요소의 서사적 기능을 "
                "수행하지 못한다."
            ),
            reject_when=(
                "다른 컷이 그 기능을 담당하거나, 의도적으로 숨긴 정보이거나, 요소의 "
                "존재와 배치는 적절하고 카메라 프레이밍만 바꾸면 해결되는 경우, 또는 "
                "대상이 의도한 인물·소품으로 식별되고 상대적 주의 우선순위만 약해 "
                "시각적 위계 규칙으로 다뤄야 하는 경우."
            ),
            theory_refs=(
                ("b_2_the_five_c_s_of", "t_book_pg56_02"),
                ("b_7_film_directing_", "t_book_pg109_02"),
            ),
        ),
        DirectingRule(
            id="mise-relational-blocking",
            label="인물 관계를 만드는 블로킹",
            criterion="인물의 거리와 자세가 의도한 관계로 읽히는가?",
            trigger=(
                "인물의 거리·높이·몸 방향·자세·시선·제스처가 감독이 의도한 친밀감, "
                "긴장, 권력 또는 고립의 관계와 충돌한다."
            ),
            reject_when=(
                "관계가 이미 배치와 행동으로 읽히거나, 문제의 원인이 카메라 높이·각도·"
                "거리 또는 컷 순서에 있는 경우."
            ),
            theory_refs=(
                ("b_7_film_directing_", "t_book_pg236_03"),
                ("b_7_film_directing_", "t_book_pg293_01"),
            ),
        ),
        DirectingRule(
            id="mise-spatial-continuity",
            label="공간과 동선의 일관성",
            criterion="컷이 이어질 때 누가 어디에 있는지 알 수 있는가?",
            trigger=(
                "인물·소품·공간의 위치, 앉고 선 자세, 몸 방향과 이동 상태가 컷 또는 "
                "씬의 전개에서 설명 없이 충돌해 공간과 동선을 이해하기 어렵게 한다."
            ),
            reject_when=(
                "카메라 시점 변화만으로 달라 보이거나, 사건 설명에 이동·회전·상태 변화가 "
                "있거나, 서로 다른 장소인 경우."
            ),
            theory_refs=(
                ("b_7_film_directing_", "t_book_pg158_01"),
                ("b_2_the_five_c_s_of", "t_book_pg70_02"),
            ),
        ),
        DirectingRule(
            id="mise-visual-hierarchy",
            label="시각적 주의와 극적 강조",
            criterion="먼저 보아야 할 것에 관객의 시선이 먼저 가는가?",
            trigger=(
                "감독이 특정 인물·행동·소품을 1차 정보나 핵심 강조점으로 명시했고 그 대상이 "
                "화면에서 식별되지만, 배치·크기·색·조명·전경과 배경의 관계가 다른 요소에 "
                "관객의 주의를 모은다."
            ),
            reject_when=(
                "넓은 공간이나 작은 인물이 고립·위험·거리감을 의도적으로 만드는 경우, "
                "다른 컷이 해당 강조를 담당하는 경우, 필요한 요소 자체를 식별할 수 없어 "
                "기능 요소 규칙으로 다뤄야 하는 경우, 1차 대상은 분명히 먼저 읽히고 "
                "후속 대상도 식별되는 경우, 감독이 특정 시각적 우선순위를 요구하지 않은 "
                "경우, 또는 프레이밍·초점만이 원인인 경우."
            ),
            theory_refs=(
                ("b_2_the_five_c_s_of", "t_book_pg194_01"),
                ("b_9_the_filmmaker_s", "t_b_Mercado_FilmmakersEye_2020_pg9_02"),
            ),
        ),
    ),
    "camera": (
        DirectingRule(
            id="camera-information-selection",
            label="프레이밍과 초점의 정보 선택",
            criterion="이 프레이밍이 필요한 정보를 담고 있는가?",
            trigger=(
                "존재하는 표정·행동·소품·공간 관계가 숏 크기, 프레이밍, 초점, 심도 또는 "
                "카메라 위치 때문에 배제되거나 의도와 다른 중요도로 읽힌다."
            ),
            reject_when=(
                "다른 컷이 그 정보를 담당하거나, 판독을 늦추는 것이 감독의 의도이거나, "
                "피사체가 작은 대신 공간적 의미가 분명하거나, 요소 자체가 없거나 잘못 "
                "배치된 경우."
            ),
            theory_refs=(
                ("b_9_the_filmmaker_s", "t_b_Mercado_FilmmakersEye_2020_pg7_01"),
                ("b_9_the_filmmaker_s", "t_b_Mercado_FilmmakersEye_2020_pg14_03"),
            ),
        ),
        DirectingRule(
            id="camera-viewpoint-intent",
            label="시점과 의도의 관계",
            criterion="카메라의 위치가 의도한 관계를 만드는가?",
            trigger=(
                "카메라 높이·각도·거리·시점이 의도한 권력, 거리, 취약성 또는 주관성과 "
                "반대되는 관계를 만든다."
            ),
            reject_when=(
                "단지 더 강한 연출이 가능하다는 정도이거나, 현재 시점도 의도를 충분히 "
                "지지하는 경우."
            ),
            theory_refs=(
                ("b_2_the_five_c_s_of", "t_book_pg08_01"),
                ("b_2_the_five_c_s_of", "t_book_pg57_01"),
            ),
        ),
        DirectingRule(
            id="camera-axis-direction",
            label="촬영축과 공간 방향",
            criterion="컷을 이어 볼 때 공간의 방향이 일관되는가?",
            trigger=(
                "카메라 위치가 만든 축, 시선, 이동 또는 화면 방향이 컷과 씬의 공간 관계를 "
                "모순되거나 불분명하게 읽히게 한다."
            ),
            reject_when=(
                "의도적 축 파괴이거나, 촬영 방향은 일관되고 컷 순서·연결 시점만이 원인인 경우."
            ),
            theory_refs=(
                ("b_2_the_five_c_s_of", "t_book_pg90_01"),
                ("b_2_the_five_c_s_of", "t_book_pg106_02"),
            ),
        ),
        DirectingRule(
            id="camera-movement-purpose",
            label="카메라 움직임의 목적과 경로",
            criterion="이 카메라 움직임이 컷의 역할을 수행하는가?",
            trigger=(
                "화살표·메모로 선언된 카메라 움직임의 시작, 방향, 대상 또는 종료가 정보 "
                "공개·감정 변화·대상 추적이라는 컷의 역할과 충돌한다."
            ),
            reject_when=(
                "움직임이 입력에 선언되지 않아 정지 패널만으로 추측해야 하거나, 선언된 "
                "움직임이 컷의 역할을 분명하게 수행하는 경우."
            ),
            theory_refs=(
                ("b_6_master_shots__1", "t_bms_pg10_01"),
                ("b_2_the_five_c_s_of", "t_159_05"),
            ),
        ),
    ),
    "editing": (
        DirectingRule(
            id="editing-shot-function",
            label="컷의 기능과 필요성",
            criterion="이 컷이 없으면 사건이 읽히지 않는가?",
            trigger=(
                "컷이 사건·감정·정보를 진전시키는 기능을 수행하지 못하거나, 필수 단계가 "
                "빠졌거나, 같은 기능이 반복되거나, 서로 다른 단계가 과도하게 압축됐다."
            ),
            reject_when=(
                "현재 배열만으로 사건이 이미 읽히거나, 단지 강조를 더할 수 있다는 이유뿐인 경우."
            ),
            theory_refs=(
                ("b_8_walter_murch___", "t_book_pg15_R2_story"),
                ("b_2_the_five_c_s_of", "t_book_pg64_04"),
            ),
        ),
        DirectingRule(
            id="editing-cut-continuity",
            label="컷 사이 연속성과 연결",
            criterion="이 전환에서 관객의 이해가 이어지는가?",
            trigger=(
                "컷을 이어 볼 때 동작·시간·공간·화면 방향·시선 또는 그래픽 흐름이 설명 "
                "없이 충돌해 이음새에서 관객의 이해가 끊긴다."
            ),
            reject_when=(
                "의도적 생략·점프·불연속이거나, 문제의 원인이 실제 배치나 촬영축 자체에 "
                "있고 컷의 선택·순서·연결은 적절한 경우."
            ),
            theory_refs=(
                ("b_2_the_five_c_s_of", "t_book_pg10_02"),
                ("b_8_walter_murch___", "t_book_pg15_R4_eyetrace"),
            ),
        ),
        DirectingRule(
            id="editing-information-order",
            label="정보 공개와 관객의 주의 전개",
            criterion="정보가 밝혀지는 순서가 의도한 이해를 만드는가?",
            trigger=(
                "선택 범위 전체에서 원인·단서·반응·결과의 공개 순서가 감독이 의도한 "
                "관객의 이해, 기대, 반전 시점 또는 주의 이동과 충돌한다."
            ),
            reject_when=(
                "의도적으로 숨기거나 모호하게 둔 정보이거나, 현재 순서에도 인과 근거가 "
                "충분히 존재하거나, 사건·정보 순서는 맞고 숏 크기·구도·정보량의 시각적 "
                "변화 패턴만 의도와 충돌해 시각적 리듬 규칙으로 다뤄야 하는 경우."
            ),
            theory_refs=(
                ("b_8_walter_murch___", "t_pg39_02"),
                ("b_8_walter_murch___", "t_pg38_02"),
            ),
        ),
        DirectingRule(
            id="editing-visual-rhythm",
            label="시각적 리듬과 변화",
            criterion="숏 크기와 정보량의 변화가 강조점을 살리는가?",
            trigger=(
                "패널 배열에서 숏 크기·구도·정보량·행동 단계의 반복과 변화가 장면의 강조점 "
                "또는 의도한 흐름을 약화한다."
            ),
            reject_when=(
                "실제 컷 길이·진입점·종료점이 있어야만 판단할 수 있거나, 반복과 정체가 "
                "의도된 리듬인 경우. 정확한 페이싱 정보가 필요하면 질문으로 남긴다."
            ),
            theory_refs=(
                ("b_8_walter_murch___", "t_book_pg15_R3_rhythm"),
                ("b_8_walter_murch___", "t_pg41_01"),
            ),
        ),
    ),
    # 서사는 그림이 아니라 대본을 본다. 나머지 셋은 패널이 있어야 판단할
    # 수 있지만, 서사가 묻는 것은 "이 사건이 단계로 서 있는가"라서 컷 플랜
    # 이전에도 성립한다. 그래서 이 렌즈만 생성 전에 쓸 수 있다.
    "narrative": (
        DirectingRule(
            id="narrative-beat-progression",
            label="사건의 단계와 진전",
            criterion="이 Beat에서 상황이 실제로 달라지는가?",
            trigger=(
                "Beat 안의 줄들이 같은 상태를 다시 말할 뿐 상황을 진전시키지 않거나, "
                "한 Beat에 서로 다른 국면이 겹쳐 있어 어디서 달라졌는지 짚을 수 없다."
            ),
            reject_when=(
                "머무름 자체가 의도된 정체·긴장이거나, 진전이 다음 Beat에서 일어나도록 "
                "쓰였거나, 반복이 강조를 위한 것인 경우."
            ),
            theory_refs=(
                ("b_1_dialogue", "t_book_pg113_01"),
                ("b_1_dialogue", "t_book_pg29_01"),
            ),
        ),
        DirectingRule(
            id="narrative-action-visibility",
            label="화면에 보이는 행동으로 쓰였는가",
            criterion="이 줄이 그릴 수 있는 행동으로 적혀 있는가?",
            trigger=(
                "인물의 상태·감정·관계가 행동이 아니라 설명으로 적혀 있거나, "
                "행동이 적혀 있어도 '대치한다·다툰다·설득한다'처럼 요약된 말이어서 "
                "무엇을 그려야 그 내용이 전달되는지 화면 근거가 정해지지 않는다."
            ),
            reject_when=(
                "그 줄이 장면 설정이나 공간 서술이어서 행동을 요구하지 않거나, 이미 "
                "다른 줄이 그 상태를 행동으로 보여 주는 경우."
            ),
            theory_refs=(
                ("b_1_dialogue", "t_book_pg29_01"),
                ("b_1_dialogue", "t_book_pg39_01"),
            ),
        ),
        DirectingRule(
            id="narrative-information-reveal",
            label="정보가 드러나는 자리",
            criterion="관객이 이것을 알아야 할 때 알게 되는가?",
            trigger=(
                "뒤의 사건을 이해하는 데 필요한 정보가 대본에 아직 나오지 않았거나, "
                "필요한 시점보다 앞서 밝혀져 그 사건이 걸리는 힘을 잃는다."
            ),
            reject_when=(
                "의도적으로 늦추거나 숨긴 정보이거나, 이 장면 밖에서 이미 확립된 "
                "정보이거나, 관객이 몰라도 사건이 읽히는 경우."
            ),
            theory_refs=(
                ("b_1_dialogue", "t_book_pg32_01"),
                ("b_1_dialogue", "t_book_pg33_02"),
            ),
        ),
        DirectingRule(
            id="narrative-causal-link",
            label="사건 사이의 인과",
            criterion="앞의 사건이 뒤의 사건을 불러오는가?",
            trigger=(
                "이어지는 두 사건 사이에 이유가 적혀 있지 않아, 뒤의 사건이 앞의 것과 "
                "무관하게 일어난 것으로 읽힌다."
            ),
            reject_when=(
                "인과가 아니라 병치·대조로 놓인 것이거나, 이유를 뒤에 밝히려고 "
                "일부러 비워 둔 경우."
            ),
            theory_refs=(
                ("b_1_dialogue", "t_book_pg29_01"),
                ("b_1_dialogue", "t_book_pg32_01"),
            ),
        ),
    ),
}


def rule_prompt(lens: DirectingLens) -> str:
    """Render the lens rules as a compact, stable prompt packet."""
    blocks = []
    for rule in LENS_RULES[lens]:
        blocks.append(
            "\n".join(
                [
                    f"- {rule.id} | {rule.label}",
                    f"  판단 기준: {rule.criterion}",
                    f"  후보 조건: {rule.trigger}",
                    f"  제외 조건: {rule.reject_when}",
                ]
            )
        )
    return "\n".join(blocks)


def validate_rule_choice(lens: DirectingLens, rule_id: str) -> None:
    rules = {rule.id: rule for rule in LENS_RULES[lens]}
    if rule_id not in rules:
        raise ValueError(f"unknown {lens} rule: {rule_id}")


def criterion_for_rule(lens: DirectingLens, rule_id: str) -> str:
    """이 규칙이 무엇을 보고 판단하는가.

    모델이 쓰게 하지 않고 규칙에서 가져온다 — 매번 다른 기준이 나오면
    같은 문제에 다른 잣대가 적용되고, 근거도 규칙에 붙은 이론 출처를
    벗어난다.
    """
    validate_rule_choice(lens, rule_id)
    return next(rule.criterion for rule in LENS_RULES[lens] if rule.id == rule_id)


def theory_keys_for_rule(lens: DirectingLens, rule_id: str) -> tuple[TheoryKey, ...]:
    validate_rule_choice(lens, rule_id)
    return next(rule.theory_refs for rule in LENS_RULES[lens] if rule.id == rule_id)


def validate_rule_theory_choice(
    lens: DirectingLens,
    rule_id: str,
    source_reference: str,
) -> None:
    parts = source_reference.split(":", 2)
    if len(parts) < 2:
        raise ValueError("theory_source must start with a book_id:theory_id reference")
    if (parts[0], parts[1]) not in theory_keys_for_rule(lens, rule_id):
        raise ValueError(f"{source_reference} is not linked to rule {rule_id}")
