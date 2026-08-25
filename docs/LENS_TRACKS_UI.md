# Lens Tracks — 인터페이스 확정본

작성 2026-08-25. SceneLens v3의 **인터페이스 개편 확정본**이다.
구현이 이 문서와 어긋나면 구현을 고친다 (`PAPER_SECTION_4.md`와 같은 원칙).

바꾸는 것은 **표현 계층이다.** 진단 로직·프롬프트·규칙은 그대로 둔다.
백엔드는 한 곳만 바뀐다 (6장 — Issue 묶기).

---

## 0. 왜 바꾸는가

지금 화면은 렌즈가 **탭**이다. `reviewMode`가 단일 값이라
(`DecisionBoard.jsx:1893`) 한 번에 한 관점만 볼 수 있다.

그런데 연구 주장은 "네 평가자가 각자 채점한다"가 아니라 **"렌즈들이 서로
독립적이지 않고 결합되어 scene meaning을 만든다"**이다
(`PAPER_SECTION_4.md:112`). 탭은 이 주장과 반대로 작동한다 — 한 번에 하나만
보이면 관점은 배타적인 것이 되고, 관계는 별도 카드로 밀려난다.

**Lens Tracks**는 이 관계를 화면의 기본 형태로 만든다. 세 렌즈가 가로축을
공유하면, 여러 렌즈가 같은 지점을 짚은 것이 **수직 정렬**로 보인다.
설명이 아니라 배치가 그것을 말한다.

부수 효과로 에이전트를 캐릭터화하지 않아도 된다. 사용자가 하는 행위가
"Camera 에이전트에게 질문한다"가 아니라 **"이 Issue에 Cinematography 렌즈를
하나 더 겹쳐 본다"**가 된다.

---

## 1. 전체 구조 — 네 영역

```
┌────────────────────────────────────────────────────────────────────┐
│ SceneLens                                      [ Viewer Reading → ]│
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ ① STORYBOARD                                                       │
│                                                                    │
│      S1             S2             S3             S4               │
│   ┌───────┐      ┌───────┐      ┌───────┐      ┌───────┐          │
│   │ IMAGE │──────│ IMAGE │──────│ IMAGE │──────│ IMAGE │          │
│   └───────┘      └───────┘      └───────┘      └───────┘          │
│                         ↑ seam                                     │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ ② LENS TRACKS                                                      │
│                                                                    │
│ Mise       ───●──────────●──────────●────────────────────          │
│                                  │                                 │
│ Camera     ───────●──────────────●──────●───────────────           │
│                                  │                                 │
│ Editing    ──────────────────────●──────────●───────────           │
│                                  │                                 │
│                              Issue 03                              │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ ③ ISSUE INSPECTOR                                                  │
│                                                                    │
│ S2 → S3 · SEAM                         Spatial Transition          │
│                                                                    │
│ Mise                 Camera                 Editing                │
│ Character position   Spatial cues lost      Movement ambiguous     │
│                                                                    │
│ [criterion/evidence 펼치기]              [ + Check another lens ]  │
│                                              [ Revise issue → ]    │
├────────────────────────────────────────────────────────────────────┤
│ ④ REVISION WORKSPACE  ← 필요할 때만 열림                           │
│                                                                    │
│ Selected target: S2 → S3 seam                                      │
│ [ Insert ] [ Swap ] [ Merge ] [ Split ] ...                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Viewer는 이 화면에 넣지 않고 별도 모드로 전환한다 (7장).

### 각 영역은 질문 하나만 담당한다

| 영역 | 사용자 질문 | 핵심 단위 |
|---|---|---|
| ① Storyboard | 어디를 보고 있는가? | Shot / Seam |
| ② Lens Tracks | 어떤 관점에서 무엇이 걸렸는가? | Lens Concern |
| ③ Issue Inspector | 이 문제를 여러 관점에서 어떻게 이해할까? | Issue |
| ④ Revision Workspace | 실제 어디를 어떻게 바꿀까? | Intervention target |
| ⑤ Viewer Reading | 결과가 다른 사람에게 어떻게 읽힐까? | Interpretation |

역할이 겹치면 화면이 엉킨다. 한 영역이 두 질문을 맡지 않는다.

---

## 2. ① Storyboard — 깨끗하게 유지한다

```
      SHOT           SEAM            SHOT
       ↓              ↓               ↓

      S2                              S3
   ┌───────┐                       ┌───────┐
   │ IMAGE │────────────●──────────│ IMAGE │
   └───────┘                       └───────┘
```

여기는 **artifact navigation만** 담당한다. Shot 선택, Seam 선택, sequence
확인, concern 위치 확인.

**분석 내용을 스토리보드 위에 쓰지 않는다.** 진단 문장, 렌즈 이름, 근거는
전부 ③으로 간다. 스토리보드는 artifact 자체를 읽는 공간이다.

---

## 3. ② Lens Tracks — 개편의 중심

```
        S1        S2        S3        S4

Mise    ──●────────●────────●────────────

Camera  ─────●─────●────────────●────────

Editing ────────────●──────●─────────────
```

가로축은 스토리보드 sequence와 **정확히 정렬**된다. 각 행이 하나의 렌즈다.

### 마커의 의미

마커 하나는 **"이 렌즈에서 이 위치에 검토할 만한 concern이 있다"**이다.
아직 error가 아니다. 이 어조를 UI 문구에서 유지한다.

### Shot과 Seam을 위치로 구분한다

```
       S2                     S3
      [  ] ----------------- [  ]
       ↑             ↑
      SHOT          SEAM
       ●             ●
```

마커가 컷 중앙에 있으면 shot 문제, 컷 사이에 있으면 seam 문제다.
스토리보드와 물리적으로 대응된다.

### 수직 정렬이 cross-lens를 보여준다

```
                      S2 → S3
                         │
Mise       ──────────────●
                         │
Camera     ──────────────●
                         │
Editing    ──────────────●
                         │
                    Issue 03
```

세 렌즈가 같은 지점에 있으면 그것이 곧 "여러 관점이 이 현상에 연결되어
있다"는 표시다. 별도 관계 카드를 읽지 않아도 보인다.

### **같은 위치라고 같은 Issue는 아니다**

이것이 이 구조에서 가장 중요한 지점이다.

```
                    S2 → S3

Mise         ─────────● A

Camera       ─────────● A       ● B

Editing      ─────────● A             ● C
```

A는 셋이 같은 현상을 본 것이다. B와 C는 **같은 seam에서 발견됐지만 다른
concern**이다. 위치가 같다고 자동으로 묶으면 서로 다른 문제가 한 카드에
섞여, 감독이 무엇을 판정하는지 알 수 없게 된다.

그래서 정보 구조는 **3단**이다:

```
ANCHOR
S2 → S3
   │
   ├── Issue A : Spatial transition
   │      ├ Mise
   │      ├ Camera
   │      └ Editing
   │
   ├── Issue B : Shot-scale transition
   │      └ Camera
   │
   └── Issue C : Information timing
          └ Editing
```

**위치 → Issue → Lens.** 이것이 UI의 핵심 정보 구조다.

> 이 3단 구조가 백엔드에 한 곳 변경을 요구한다 (6장). 나머지는 전부 기존
> 데이터로 된다.

---

## 4. ③ Issue Inspector — 한 문제를 여러 관점에서

마커를 선택하면 열린다.

```
┌──────────────────────────────────────────────────────────┐
│ S2 → S3 · SEAM                                           │
│                                                          │
│ Spatial Transition                                       │
│ 두 shot 사이 공간 변화가 충분히 이해될 수 있는가?        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ MISE                  CAMERA                 EDITING     │
│                                                          │
│ Character position    Tighter framing        Movement    │
│ changes between       removes spatial        becomes     │
│ shots.                context.               ambiguous.  │
│                                                          │
│ [Evidence ↓]          [Evidence ↓]           [Evidence ↓]│
├──────────────────────────────────────────────────────────┤
│ + Check another lens                         Revise →    │
└──────────────────────────────────────────────────────────┘
```

### 정보 계층 (이 순서를 지킨다)

| | 무엇 | 데이터 |
|---|---|---|
| A | **Where** — `S2 → S3`, SEAM | `targets`, `level` |
| B | **What** — Spatial Transition | Issue 제목 (6장) |
| C | **Criterion** — 판단 기준 질문 | `criterion` |
| D | **Lens perspectives** — 각 렌즈의 관찰 | `diagnosis` |
| E | **Evidence** — 렌즈별 근거 | `evidence` |
| F | **Action** — Revise this issue → | `alternatives` |

처음부터 다 펼치지 않는다. **progressive disclosure** — D까지 보이고
E는 접어 둔다.

### 렌즈를 겹쳐 보기

Editing만 발견한 상태:

```
Spatial Transition

● Editing
  Movement is difficult to follow.
  independently surfaced

○ Cinematography
  Not checked for this issue

○ Mise-en-scène
  Not checked for this issue

      [ + Add Lens ]
```

Camera를 추가하면:

```
● Editing
  Origin

◐ Cinematography
  Cross-lens response

○ Mise-en-scène
```

세 상태를 구분한다:

| 표시 | 뜻 |
|---|---|
| `●` | 이 렌즈가 스스로 짚었다 (origin) |
| `◐` | 다른 렌즈가 짚은 것을 보고 답했다 (cross-lens response) |
| `○` | 아직 안 봤다 (not checked) |

**`○`(안 봄)과 "보고 문제없음"을 같게 표시하지 않는다.** 섞으면 감독이
침묵을 승인으로 읽는다 (`design_goal.md` DG1 P2 — 조용히 빠진 것은 없어야
한다).

---

## 5. ④ Revision Workspace — 여기부터 DG2

`Revise →`를 누르면 열린다. 여기서부터는 **렌즈가 중심이 아니라 intervention
target/scope가 중심**이다.

**문제의 층위와 개입 지점은 같을 필요가 없다.** scene-level 문제라도 seam
하나를 고쳐서 풀릴 수 있다.

```
Issue
Scene-level information ordering
        ↓
실제 수정
S2 ──── SEAM ──── S3
          ↑
      Insert Shot
```

### target에 따라 도구가 달라진다

| target | 도구 |
|---|---|
| **Shot / element** | Prompt Edit · Draw-over · Reframe · Shot size · Camera angle |
| **Seam** | Insert Shot · Split · Merge · Swap · Delete |
| **Scene** | Character Position · Space · Temporal State · Information State |

> Swap은 이전에 GridView에서 제거했다. Seam 도구로 되살릴지는 열린 결정
> (12장).

---

## 6. 데이터 — 한 곳만 바뀐다

기존 스키마로 되는 것 (검증 완료):

| 필요한 것 | 이미 있는 것 | 위치 |
|---|---|---|
| 렌즈별 결과 | `lens_results: Dict[DirectingLens, ...]` | `schemas.py:707` |
| 앵커 좌표 | `targets: List[str]` (`"S2.xxx"`) | `schemas.py:543` |
| shot/seam 구분 | `level` 4단계 | `schemas.py:542` |
| 관계·방향 | `common_findings`, `source_lens`/`affected_lens` | `schemas.py:637,651` |
| 먼저 볼 렌즈 | `order` | `schemas.py:663` |
| **단일 렌즈 추가 호출** | `mode: "mise"\|"camera"\|"editing"` | `schemas.py:455` |
| 판단 기준 | `criterion` | `schemas.py:546` |
| 근거 | `evidence` | `schemas.py:547` |

`+ Add Lens`는 **기존 API로 바로 된다** — `mode`에 렌즈 이름을 넣으면 그
렌즈만 돈다. (그림 없이 부르면 `501 needs rendered panels` — 모드가 없는
것이 아니라 입력이 없는 것.)

### 바뀌어야 하는 한 곳: Issue 묶기

3장에서 본 대로 **위치만으로는 Issue를 만들 수 없다.** 지금
`common_findings`는 `type`(agreement/conflict/consequence) 중심이라
"이것들은 같은 현상"이라는 묶음과 **그 묶음의 이름**(`Spatial Transition`)이
없다.

필요한 것:

```python
class DirectingIssue(BaseModel):
    id: str
    # 이 Issue가 붙는 자리. targets에서 파생하지 않고 명시한다 —
    # 같은 자리에 여러 Issue가 있을 수 있다.
    anchor: str                    # "S2→S3" 또는 "S2"
    anchor_kind: Literal["shot", "seam", "scene"]
    # ③의 B. 감독이 목록에서 고를 수 있는 짧은 이름.
    title: str                     # "Spatial Transition"
    # ③의 C. 이 Issue를 판정하는 질문.
    criterion: str
    # 이 Issue를 구성하는 진단들. 렌즈별로 하나씩.
    diagnosis_ids: List[str]
    # 처음 짚은 렌즈. ●로 표시된다.
    origin_lens: DirectingLens
```

`common_findings`를 대체하지 않고 **그 위에 얹는다** — 관계 종류
(agreement/conflict/consequence)는 Issue 안에서 여전히 유효한 정보다.

가능하면 `_relate_lenses`가 이미 하는 일(진단들을 묶는 것)에 `title`과
`anchor`를 덧붙이는 방향으로 간다. 새 LLM 호출을 추가하지 않는다.

---

## 7. ⑤ Viewer는 별도 모드

Viewer를 트랙으로 넣지 않는다. 성격이 다르기 때문이다.

| | 하는 일 |
|---|---|
| Lens | directing decision을 **inspect** |
| Viewer | 그 결과가 어떻게 읽히는지 **reappraise** |

Viewer는 audience prediction이 아니라, independent reading으로
interpretation variation을 드러내는 **reflective probe**다.

```
┌─────────────────────────────────────────────────────┐
│ VIEWER READINGS                                     │
│                                                     │
│ S1          S2          S3          S4              │
│ [ ] ────── [ ] ────── [ ] ────── [ ]                │
│                                                     │
│ Reading A ──── 이해 ───── 변화 ───── hypothesis     │
│ Reading B ──── 이해 ───── 다른 해석 ── hypothesis   │
│ Reading C ──── 이해 ───── ??? ─────── hypothesis    │
│                  ↑                                  │
│          Interpretation divergence                  │
│                                                     │
│           [ Revise ] [ Retain ] [ Defer ]           │
└─────────────────────────────────────────────────────┘
```

---

## 8. 전체 흐름

```
   STORYBOARD  →  LENS TRACKS  →  ISSUE INSPECTOR  →  REVISION  →  STORYBOARD
                                                                       ↓
                                                                VIEWER READING
```

화면에서도 이 흐름이 **위에서 아래로** 내려간다.

논문의 **Inspect → Intervene → Reappraise**가 그대로 보존된다:

| 논문 | 화면 |
|---|---|
| Inspect | ② Lens Tracks + ③ Issue Inspector |
| Intervene | ④ Revision Workspace |
| Reappraise | ⑤ Viewer Reading |

---

## 9. Narrative는 트랙에 넣지 않는다

렌즈는 넷인데 트랙은 셋이다. 의도된 것이다.

`PAPER_SECTION_4.md:305-332`이 근거를 확정해 두었다:

- 코드가 이미 `PERSPECTIVES = [NARRATIVE_AGENT, ...CREATIVE_LENSES]`로 서사를
  셋 위에 둔다. 레인에 넣으면 위계가 평평해진다.
- **시점이 다르다.** 셋은 *그려진 화면*을 진단한다. 서사는 *무엇을 그릴지*가
  정해지기 전에 판단한다. 서사 문제의 층위는 컷 플랜이지 패널이 아니다.
- Decision Board에서 "이 컷은 필요 없다"를 들으면 이미 그린 것을 버려야 한다.
  **그리기 전에 짚어야 싸다.**

서사는 컷 플랜 단계의 자기 레일에 남는다 (`/api/narrative/check`).

> 개편 중 "렌즈가 4개인데 왜 3개만"이라는 이유로 서사를 트랙에 넣지 말 것.
> 그건 되돌리는 것이지 고치는 것이 아니다.

---

## 10. 구조상 바뀌어야 하는 것

```js
// 지금 — 탭 (배타적)
const [reviewMode, setReviewMode] = useState('multi')

// 개편 — 트랙 + 선택된 Issue
const [activeLenses, setActiveLenses] = useState(new Set(['mise','camera','editing']))
const [selectedIssueId, setSelectedIssueId] = useState(null)
```

`reviewMode`가 단일 값이라 렌즈 동시 표시가 구조적으로 불가능하다. 이걸
집합으로 바꾸는 것이 개편의 축이다.

Focus는 별도 상태로 두지 않는다 — `selectedIssueId`가 있으면 그 Issue의
앵커가 곧 focus다. 초기 컨셉에서 `Focus`를 독립 개념으로 뒀으나, Issue
선택과 항상 같이 움직여서 상태를 둘로 나눌 이유가 없다.

---

## 11. 무엇을 하지 않는가

- **진단 로직·프롬프트·규칙을 건드리지 않는다.**
- **별도 이슈 목록 화면을 만들지 않는다.** Lens Tracks가 overview다.
- **에이전트를 의인화하지 않는다.** 이모지 아바타, 말풍선, 에이전트 간 대화
  UI를 쓰지 않는다.
- **스토리보드에 분석 문장을 쓰지 않는다** (2장).
- **서사를 트랙에 넣지 않는다** (9장).
- **Viewer를 네 번째 트랙으로 넣지 않는다** (7장).

---

## 12. 열린 결정

1. **마커 밀도.** 한 렌즈가 한 위치에 여러 concern을 가질 때 마커를 겹칠지,
   나눌지.
2. **Issue 없는 concern.** 한 렌즈만 짚고 다른 렌즈가 안 본 것도 Issue로
   만들 것인가, 아니면 `+ Add Lens`로 승격될 때 만들 것인가.
3. **Swap 되살리기.** Seam 도구 목록에 있으나 이전에 제거했다.
4. **트랙의 가로 스크롤.** 컷이 18개일 때 스토리보드와 어떻게 동기화할지.
5. **기존 `boardView='split'` 처리.** 점진 교체 대 한 번에 갈아타기.

---

## 13. 구현 순서

의존 관계상 이 순서를 지킨다.

| 단계 | 무엇 | 왜 먼저 |
|---|---|---|
| 1 | Issue 묶기 (백엔드) | ②③이 전부 Issue 단위로 돈다 |
| 2 | ② Lens Tracks | 개편의 중심. ①은 거의 그대로 |
| 3 | ③ Issue Inspector | 트랙에서 선택된 것을 받는다 |
| 4 | `+ Add Lens` | ③ 안에 들어간다. API는 이미 있다 |
| 5 | ④ Revision Workspace | 기존 도구를 target 기준으로 재배치 |
| 6 | ⑤ Viewer 분리 | 기존 화면을 별도 모드로 |
