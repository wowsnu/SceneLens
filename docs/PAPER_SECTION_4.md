# 논문 4장 — SceneLens

이 문서는 논문 4장의 확정본이다. 구현이 여기서 벗어나면 구현을 고친다.
문단 끝의 **[구현]** 표시는 코드에서 어디에 해당하는지 가리킨다.

---

## 4.1 Design Goals

Formative에서 나온 DR을 SceneLens가 취하는 설계 방향으로 변환.

### DG1. Make directing decisions inspectable before and after generation

**P1. Externalize intended decisions before generation.**
Cut Plan에서 beat, 필요한 cut, cut의 역할, shot 등을 먼저 검토한다.

**P2. Externalize instantiated decisions after generation.**
생성된 결과를 Narrative / Mise-en-scène / Cinematography / Editing × level로
다시 풀어 보여준다.

**P3. Turn implicit criteria and gaps into questions for judgment.**
각 decision에 evaluative criterion을 질문으로 제공하고, 필요한데 보이지 않는
정보도 판단 대상으로 만든다. 필요하면 decision alternatives를 제시한다.

### DG2. Enable revision at the level of the problem

**출발점 — F2.** 참가자들이 발견한 문제는 개별 이미지 속성뿐 아니라 shot의
존재/구성, shot 간 관계, sequence 구조에도 있었다. 그런데 수정 수단은 주로
개별 panel 수준에 머물렀다. 문제를 발견한 level과 실제 개입할 수 있는 level을
맞춰야 한다.

**P1. 문제의 범위를 명시한다.**
분석된 문제가 `element / shot / sequence` 중 어디에서 작동하는지 보여준다.

**P2. Panel 밖의 관계 자체를 편집 대상으로 만든다.**
shot과 shot 사이의 관계를 직접 다룬다 — `insert / split / merge / reorder`.
continuity, information flow, pacing 등 여러 shot에 걸친 문제는 sequence
구조에서 검토·수정한다. **seam**이 이 자리다.

**P3. 각 level에 맞는 revision alternative를 제공한다.**
- element 문제 → 해당 element 수정
- shot 문제 → framing/composition/shot 자체 수정
- sequence 문제 → insert/split/merge/reorder 등 구조적 alternative

사용자가 문제를 찾았는데 다시 panel regeneration으로 돌아가는 것을 막는다.

### DG3. Make the storyboard available to an outside reading

DR3: creator intent와 독립된 평가가 필요하다.
creator intent / storyboard evidence / possible viewer interpretation을
구분하고, intention-blind viewer를 통해 outside reading을 제공한다.

### 요약

| | 묻는 것 |
|---|---|
| **DG1 — Inspect the decisions** | 어떤 종류의 directing decision인가? |
| **DG2 — Intervene at the decision level** | 그 decision은 어디에서 수정해야 하는가? |
| **DG3 — Reappraise its communicative consequence** | 그 결과가 viewer에게 어떻게 읽히는가? |

**AI-generated storyboard 안에 이미 구현된 directing decisions를 다시
inspectable하고 revisable하게 만드는 것.**

---

## 4.2 System Overview

```
Scene intent 입력
  → AI rough storyboard 생성
  → Lens를 통해 directing decisions 검토
  → 문제 level에서 수정
  → Viewer로 communicability 검토
  → 필요하면 다시 수정
```

---

## 4.3 Planning and Inspecting Directing Decisions

DG1 구현. 기존 `Inspecting`보다 **generation 전 Cut Plan까지 포함**하도록 확장.

**Before generation — Cut Plan**
beat / cut / cut의 역할 / 주요 인물 / shot 등을 textual plan으로 먼저
외부화한다. 이미지가 생성되기 전에 필요한 cut과 역할을 검토·수정한다.
실제 줄콘티/shot planning practice와 연결된다. **[구현]** 컷 플랜 단계.

**After generation — Lens Analysis**
4 cinematic lenses — Narrative / Mise-en-scène / Cinematography / Editing.
생성된 결과에 실제로 구현된 directing decisions를 lens별로 분석한다.
**[구현]** `directing_review.py`. 단 narrative는 규칙이 없어 다관점에서
빠져 있다 (아래 미비점 참고).

**Decision card**
- 현재 어떤 decision이 구현되어 있는지
- **Criterion:** 그 결정을 판단할 evaluative question
- **Alternative:** `Keep / Widen / Shift POV`처럼 가능한 다른 directing choice

**[구현]** `directing_rules.py`의 규칙 12개가 각자 `criterion`을 갖고,
서버가 `rule_id`로 진단에 붙인다. `alternatives`는 첫 번째가 언제나 `keep`.

**Cross-lens relation**
한 lens의 결정이 다른 lens의 판단에 어떤 영향을 주는지 연결해서 보여준다.
4 lenses를 독립적인 evaluator가 아니라 **interconnected views**로 설명한다.
**[구현]** `_relate_lenses`. `consequence` 관계에 방향이 있고
(`camera → editing`), 그 방향에서 `먼저 볼 렌즈`가 나온다.

**Citation rationale**
- 왜 이 4개인가
- 왜 storyboard 단계에서 다룰 수 있는가
- 완전한 taxonomy가 아니라 pragmatic coverage
- lens들이 서로 독립적이지 않고 결합되어 scene meaning을 만든다는 근거

---

## 4.4 Diagnosing and Revising at the Level of the Problem

DG2 구현.

**Problem scope를 명시** — `element / shot / sequence`.
사용자가 발견한 문제가 어느 level에서 작동하는지 보여준다.

**Level-matched revision**
- element → 해당 visual element 수정
- shot → framing/composition/shot 수정
- sequence → insert / split / merge / reorder

**Shot seam을 편집 대상으로 사용**
- 두 shot 사이에서 빠진 사건
- 연결 방식
- 추가 shot 필요 여부
- continuity / information flow / pacing

각 level에 맞는 **revision alternatives**를 제안한다.

**핵심: panel regeneration이 아니라 problem이 존재하는 structural level에서
intervention.**

**[구현]** `RULE_DESTINATIONS` — 규칙 12개가 각자 목적지를 갖는다
(seam / merge / split / layout / prompt / draw / narrative).

---

## 4.5 Reviewing Through Intention-Blind Viewer Readings

DG3 구현.

**Creator intent를 숨긴 채 읽기.**
Viewer에는 panel image + sequence만 제공한다. script / cut label /
creator intent 등은 제공하지 않는다.

**Sequential interpretation.**
각 cut에서 visible evidence / 현재 이해 / 이전 cut 대비 변화 /
current hypothesis / open question을 순차적으로 형성한다.
→ **"이 시점까지 viewer가 무엇을 알고 있는가"**를 확인한다.

**Multiple independent readings.**
동일 storyboard를 1–3개의 서로 다른 **reading conditions**가 독립적으로
읽는다. 서로의 interpretation은 보지 않는다. 이후에만 공통적으로 읽힌 부분과
interpretation이 갈린 지점을 비교한다.
핵심은 **누가 맞는지 판정하는 게 아니라, 어떤 cue가 서로 다른 해석을
만들었는지 드러내는 것**이다.

**Creator intent와 사후 비교.**
Viewer 생성 단계에서는 intent를 주지 않는다. 이후 creator가
**Intent ↔ Evidence ↔ Interpretation**을 비교한다. 그래서 intention-blind
원칙을 유지하면서도 communicability를 reflection할 수 있다.

**Difference ≠ Error.**
interpretation divergence를 자동 결함으로 판단하지 않는다. 사용자가
`revise / intentionally retain / defer` 중 하나를 판단하도록 한다.

**Reflective probe, not audience simulation.**
이 1–3개 조건을 실제 인구집단이나 실제 관객을 대표하는 persona라고 주장하지
않는다. **artifact가 서로 다르게 읽힐 가능성을 드러내는 reflective probes**로
위치시킨다.

### Reading conditions를 논문에서 어떻게 쓸 것인가

4.5의 메인 논리는 `intention-blind reading`이고, **reading conditions 자체를
너무 크게 이론화하지 않는다.** 리뷰어가 궁금해할 것만 답한다:

- 1–3개가 **무엇이 다른 조건인지**
- 왜 그 차이가 필요한지
- 서로 다른 "persona"인지, 아니면 **같은 artifact를 읽는 서로 다른
  attention/interpretation condition**인지
- 결과 차이를 어떻게 해석하는지

System에서는 이 정도만 명확히 한다:

> Each reading condition receives the same storyboard sequence without
> creator intent, but is prompted to attend to a different aspect of the
> presented evidence. The conditions independently construct
> interpretations before their readings are compared.

그리고 바로 구체적으로 Condition A/B/C가 각각 무엇에 더 주목하는지 1–2문장씩.

**중요한 것은 "왜 3개냐"보다 "왜 서로 다른 reading이 필요하냐"다:**

> 단일 Viewer의 해석을 "관객의 해석"처럼 권위화하지 않고, 동일한 evidence가
> 여러 방식으로 읽힐 수 있음을 드러내기 위해 복수의 독립 reading을 사용한다.

이 논리가 `reflective probe, not audience replacement` framing을 강하게
해준다.

**주의.** 이 절은 "페르소나"라는 말을 쓰지 않는다. 앞선 논의에서 나왔던
`처음 보는 관객 / 영화에 익숙한 관객 / 이 이야기와 가까운 관객`은
persona가 아니라 **attention condition**으로 서술해야 이 framing과
어긋나지 않는다.

---

## 구현 대조 (2026-08-13)

사양과 코드를 항목별로 대조한 결과. 확인한 방법을 함께 적는다.

### 맞는 것

| 항목 | 확인 |
|---|---|
| 4.3 Criterion | 규칙 12개 전부 `criterion` 보유. 서버가 `rule_id`로 붙임 |
| 4.3 Alternative | `ensure_keep_alternative` validator가 `keep`을 보장 |
| 4.3 Cross-lens | `consequence`에 `source_lens`/`affected_lens` 방향 있음 |
| 4.5 intent 비공개 | `ViewerPanelInput`이 `image` 하나뿐. 프롬프트도 명시 |
| 4.5 순차 해석 | `noticed_cues / immediate_reading / relation_to_previous / current_hypothesis / open_question` |
| 4.5 독립 읽기 | 조건별로 따로 호출하고, 비교는 그 뒤 별도 프롬프트 |
| 4.5 reading conditions | `first_viewer / film_literate / context_close` — 이미 **persona가 아니라 attention condition**으로 되어 있다 (`focus` 필드) |
| 4.5 Difference ≠ Error | `revise / retain / defer` 세 판정이 UI에 있음 |

### 어긋나는 것

**1. level 이름이 다르다.**
- 사양: `element / shot / sequence` (3단계)
- 코드: `attribute / shot_structure / shot_relation / scene_structure` (4단계)

코드가 더 잘게 나뉘어 있다. `shot_structure`(컷의 존재·필요성)와
`shot_relation`(컷 사이)이 사양의 `shot`과 `sequence` 사이에 걸친다.
논문을 코드에 맞출지, 코드를 논문에 맞출지 정해야 한다.
**논문 쪽을 4단계로 고치는 편이 나아 보인다** — 실제로 컷의 존재 문제와
컷 사이 관계 문제는 개입 지점이 다르다.

**2. seam에 `insert`와 `reorder`가 없다.**
- 사양 4.4: `insert / split / merge / reorder`
- 코드: seam에는 `split`과 `merge`만. `moveCutPlanItem`(reorder)과
  `addCutPlanItem`(insert)은 컷 플랜 표에만 있다.

4.4의 핵심이 "panel regeneration이 아니라 structural level에서 intervention"
인데, 순서 바꾸기와 컷 넣기를 하려면 여전히 컷 플랜 표로 되돌아가야 한다.
**seam에 둘을 추가해야 사양대로다.**

**3. narrative 렌즈가 다관점에 없다.**
- 사양 4.3: 4 lenses (Narrative 포함)
- 코드: `LENS_RULES`에 `mise / camera / editing` 셋뿐. narrative는 규칙이 없다.

다관점은 셋만 돈다. 논문이 "4 lenses"라고 쓰려면 narrative 규칙을 이론에서
뽑아야 하고, 아니면 "generation 이후 분석은 3 lenses, narrative는 생성 전
단계에서 작동한다"고 명시해야 한다. 후자가 실제 구조에 가깝다 —
narrative는 대본과 Beat를 다루지 생성된 이미지를 진단하지 않는다.

**4. Citation rationale이 없다.**
사양 4.3의 마지막 항목(왜 이 4개인가, pragmatic coverage라는 근거)이
문서에도 코드 주석에도 없다. 논문 쓸 때 채워야 한다.

### 하지 않은 것

- 4.5의 `Intent ↔ Evidence ↔ Interpretation` **사후 비교 화면**은 없다.
  관객 읽기와 창작 의도를 나란히 놓고 비교하는 자리가 아직 없다.
