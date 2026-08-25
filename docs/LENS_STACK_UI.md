# Lens Stack — 인터페이스 컨셉 확정본

작성 2026-08-25. 이 문서는 SceneLens v3의 **인터페이스 개편 확정본**이다.
구현이 이 문서와 어긋나면 구현을 고친다 (`PAPER_SECTION_4.md`와 같은 원칙).

바꾸는 것은 **표현 계층뿐이다.** 진단 로직·데이터 구조·백엔드는 그대로 둔다.
아래 4장에서 확인하듯, 이 컨셉이 요구하는 데이터는 이미 전부 있다.

---

## 1. 왜 바꾸는가

지금 화면은 렌즈가 **탭**이다. `reviewMode`가 단일 값이라
(`DecisionBoard.jsx:1893`) 한 번에 한 관점만 볼 수 있다.

그런데 SceneLens의 연구 주장은 "네 개의 평가자가 각자 채점한다"가 아니라
**"렌즈들이 서로 독립적이지 않고 결합되어 scene meaning을 만든다"**이다
(`PAPER_SECTION_4.md:112`). 탭은 이 주장과 반대로 작동한다 — 한 번에 하나만
보이면 관점은 배타적인 것이 되고, 관계는 별도 카드로 밀려난다.

**Lens는 탭이 아니라 오버레이여야 한다.** Photoshop 레이어를 켜고 끄듯
cinematic perspective를 중첩해서 본다. 그래야 "여러 렌즈가 같은 곳을 본다"가
설명이 아니라 **화면에서 보이는 것**이 된다.

### 부수 효과: 에이전트를 캐릭터화하지 않아도 된다

멀티에이전트 UI는 보통 이렇게 간다.

```
🎬 Director Agent  📷 Camera Agent  ✂️ Editor Agent
   → 셋이 채팅한다
```

이러면 연구 기여보다 "AI agent demo"로 읽힌다. Lens Stack에서는 사용자가
경험하는 개념이 에이전트가 아니라 **artifact를 통과하는 렌즈**다.

| | Chat UI | Lens Stack |
|---|---|---|
| 다른 관점 요청 | "Camera에게도 물어볼까요?" | "이 issue에 Camera lens를 추가한다" |
| 성격 | 대화 상대 | 검사 도구 |

AI 아키텍처는 뒤에 있고, 표면의 개념은 Lens / Focus / Stack이다.

---

## 2. 용어 (이 다섯 개로 통일한다)

| 용어 | 뜻 | 화면에서 |
|---|---|---|
| **Lens** | 관점 | 왼쪽 스택에서 켜고 끄는 것 |
| **Focus** | 지금 검토 중인 대상 | 클릭한 이슈. 주변은 흐려진다 |
| **Stack** | 같은 대상을 보는 여러 렌즈 | 겹친 원 아이콘 `◎ 3` |
| **Scope** | 실제 개입 범위 | 기존 개념 유지 |
| **Viewer** | 외부 reading | 기존 개념 유지 |

용어를 섞지 않는다. 특히 "탭", "모드", "패널"을 렌즈에 쓰지 않는다 — 그
말들이 배타적 전환을 함의하기 때문이다.

---

## 3. 화면

### 3.1 기본 — 스토리보드가 곧 overview

별도의 "이슈 목록 화면"을 만들지 않는다. **스토리보드 자체가 overview다.**

```
┌──────────────────────────────────────────────────────────────┐
│ SCENELENS                                Viewer Reading →    │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│ LENS STACK    │                 STORYBOARD                   │
│               │                                              │
│ ● Mise        │   S1         S2          S3         S4       │
│ ● Camera      │  [   ] ──── [   ] ──◎── [   ] ─── [   ]     │
│ ● Editing     │                   │                          │
│               │                   │                          │
│ [ All lenses ]│                3 lenses                      │
│               │                                              │
│───────────────│                                              │
│ ISSUES        │                                              │
│               │                                              │
│ 01 S1         │                                              │
│ 02 S2→S3  ●   │                                              │
│ 03 S3         │                                              │
│ 04 S3→S4      │                                              │
├───────────────┴───────────────────────┬──────────────────────┤
│ FOCUS                                 │ APPLIED LENSES       │
│                                       │                      │
│ S2 → S3                               │ ● Mise               │
│ Spatial transition                    │ ● Camera             │
│                                       │ ● Editing            │
│ Artifact evidence                     │                      │
│ [S2 crop] → [S3 crop]                 │ + Add lens           │
│                                       │                      │
├───────────────────────────────────────┴──────────────────────┤
│ [Keep]        [Inspect seam]        [Revise →]               │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 렌즈를 켜고 끈다

Camera만:
```
[○ Mise] [● Camera] [○ Editing]

S1        S2        S3        S4
[ ] ──── [ ] ──── [ ] ──── [ ]
           ↑         ↑
         C01       C02
```

Editing을 더하면:
```
[○ Mise] [● Camera] [● Editing]

S1        S2        S3        S4
[ ] ──── [ ] ──●── [ ] ──── [ ]
           ↑      ↑
         C01   Camera + Editing
```

마커는 **켜진 렌즈의 것만** 보인다. 끄면 사라진다. 이것이 오버레이다.

### 3.3 Stack — 여러 렌즈가 같은 곳을 볼 때

```
           S2              S3
         [    ] ─── ◉ ─── [    ]
                      │
                 3 LENSES
```

누르면:
```
┌──────────────────────────┐
│ S2 → S3                  │
│ Spatial transition       │
│                          │
│ ◎ MISE                   │
│ Character position...    │
│                          │
│ ◎ CAMERA                 │
│ Spatial cue...           │
│                          │
│ ◎ EDITING                │
│ Movement continuity...   │
└──────────────────────────┘
```

아이콘은 겹친 원 — 스택임이 형태로 읽혀야 한다.

```
 ◯
  ◯     또는     ◎ 3
   ◯
```

사용자가 보자마자 "여긴 여러 렌즈에서 볼 게 있구나"를 알아야 한다.

### 3.4 Focus — 클릭하면 주변이 약해진다

```
S1          S2          S3          S4
░░░░       [████] ─── [████]       ░░░░
                   ↑
                 FOCUS
```

Focus는 화면 전환이 아니라 **강조**다. 스토리보드를 떠나지 않는다 — 지금
구조에서 검토 화면이 스토리보드를 덮어 버리는 문제(패널이 접히고 rail이
사라지는 일련의 버그)가 여기서 구조적으로 사라진다.

### 3.5 렌즈 추가 — 한 렌즈가 발견한 것을 다른 렌즈로도 본다

Editing이 처음 짚었다면:
```
S2 ──── ◉ ──── S3

      EDITING
      Origin
```

이슈를 열면:
```
Spatial transition

● Editing
  Original observation

○ Mise
  Not inspected for this issue

○ Camera
  Not inspected for this issue

[ Add lenses + ]
```

누르면 그 이슈 위에 렌즈가 한 겹씩 더 얹힌다.

**중요:** "아직 안 본 것"과 "보고 문제없다고 한 것"을 구분해서 표시한다.
`Not inspected`와 `No issue`는 다른 상태다. 섞으면 감독이 침묵을 승인으로
읽는다 (`design_goal.md` DG1 P2와 같은 논리 — 조용히 빠진 것은 없어야 한다).

---

## 4. 데이터는 이미 다 있다

이 개편에 **백엔드 변경이 필요 없다.** 확인한 것:

| 컨셉이 필요로 하는 것 | 이미 있는 것 | 위치 |
|---|---|---|
| 렌즈별 결과 | `lens_results: Dict[DirectingLens, ...]` | `schemas.py:707` |
| 이슈의 앵커 좌표 | `targets: List[str]` (`"S2.xxx"` 형태) | `schemas.py:543` |
| 이음새/컷 구분 | `level` 4단계 | `schemas.py:542` |
| Stack (같은 곳 = 여러 렌즈) | `common_findings[].diagnosis_ids` | `schemas.py:637` |
| 관계의 방향 | `source_lens` / `affected_lens` | `schemas.py:651` |
| 어느 렌즈부터 | `order` | `schemas.py:663` |
| **단일 렌즈 추가 호출** | `mode: "mise"\|"camera"\|"editing"` | `schemas.py:455` |

특히 마지막이 중요하다. **`+ Add lens`는 이미 있는 API로 바로 된다** —
`DirectingReviewRequest.mode`에 렌즈 이름을 넣으면 그 렌즈만 돈다.

Stack을 만드는 방법도 이미 정해져 있다: 같은 `targets`(또는
`common_findings`로 묶인 `diagnosis_ids`)를 공유하는 진단들을 한 앵커에
모으면 그것이 Stack이다. 새 필드가 필요 없다.

**검증함 (2026-08-25).** 실제 스키마로 세 렌즈가 `S2→S3`를 짚는 응답을
만들어 그룹핑을 돌렸다.

- `targets`의 `"S2.position"`, `"S2.axis"`, `"S2"`가 모두 `S2`로 파싱되어
  하나의 seam 앵커(`S2→S3`)에 모였다 → `◎ 3`
- 앵커로 묶은 `diagnosis_ids`와 `common_findings`가 묶은 것이 **일치**했다.
  둘 중 어느 쪽을 근거로 삼아도 같은 Stack이 나온다.
- `mode=mise|camera|editing` 단일 호출은 살아 있다 (그림 없이 부르면
  `501 "needs rendered panels"` — 모드가 없는 것이 아니라 입력이 없는 것).

즉 이 개편은 백엔드를 건드리지 않는다.

---

## 5. Narrative는 Stack에 넣지 않는다

렌즈는 넷인데 스택은 셋이다. 의도된 것이다.

`PAPER_SECTION_4.md:305-332`이 근거를 이미 확정해 두었다:

- 코드가 이미 `PERSPECTIVES = [NARRATIVE_AGENT, ...CREATIVE_LENSES]`로 서사를
  셋 위에 둔다. 레인에 넣으면 이 위계가 평평해진다.
- **시점이 다르다.** 셋은 *그려진 화면*을 진단한다. 서사는 *무엇을 그릴지*가
  정해지기 전에 판단한다. 서사 문제의 층위는 컷 플랜이지 패널이 아니다.
- Decision Board에서 "이 컷은 필요 없다"를 들으면 이미 그린 것을 버려야 한다.
  **그리기 전에 짚어야 싸다.**

그래서 서사는 컷 플랜 단계의 자기 레일에 남는다 (`/api/narrative/check`).

논문에는 "4 lenses"로 쓰되 서사가 **같은 자리·같은 때에 작동하지 않음**을
밝힌다. 이건 4.4의 "문제가 존재하는 층위에서 개입한다"와 같은 논리다.

> 개편 중 "렌즈가 4개인데 왜 3개만 보이나"라는 이유로 서사를 스택에 넣지
> 말 것. 그건 되돌리는 것이지 고치는 것이 아니다.

---

## 6. 구조상 바뀌어야 하는 것

가장 큰 변경은 하나다.

```js
// 지금 — 탭 (배타적)
const [reviewMode, setReviewMode] = useState('multi')

// 개편 — 스택 (집합)
const [activeLenses, setActiveLenses] = useState(new Set(['mise','camera','editing']))
const [focusedIssueId, setFocusedIssueId] = useState(null)
```

`reviewMode`가 단일 값이라 렌즈 동시 활성이 구조적으로 불가능하다. 이걸
집합으로 바꾸는 것이 개편의 축이다. 나머지(마커 렌더, Focus 흐림, Stack
아이콘)는 이 상태 위에 얹힌다.

`viewer`와 `scene`은 렌즈가 아니라 **다른 종류의 읽기**이므로 스택에
넣지 않고 별도 진입점으로 유지한다 (화면 우상단 `Viewer Reading →`).

### 이슈 앵커 만들기

진단을 앵커에 모으는 규칙:

| `level` | 앵커 | 표시 위치 |
|---|---|---|
| `attribute`, `shot_structure` | 단일 컷 | 패널 위 |
| `shot_relation` | 컷 사이 | 이음새 |
| `scene_structure` | 범위 전체 | 스토리보드 상단 |

`targets`의 `"S2.xxx"`에서 패널 id를 파싱하는 코드는 백엔드 검증에 이미
있다 (`target.split(".", 1)[0]`, `schemas.py:578`). 같은 방식을 쓴다.

---

## 7. 무엇을 하지 않는가

- **진단 로직·프롬프트·규칙을 건드리지 않는다.** 표현만 바꾼다.
- **백엔드 스키마를 바꾸지 않는다.** 4장에서 확인했듯 불필요하다.
- **별도 이슈 목록 화면을 만들지 않는다.** 스토리보드가 overview다.
- **에이전트를 의인화하지 않는다.** 이모지 아바타, 말풍선, 에이전트 간
  대화 UI를 쓰지 않는다.
- **서사를 스택에 넣지 않는다** (5장).

---

## 8. 열린 결정

구현 전에 정해야 하지만 아직 정하지 않은 것:

1. **`All lenses`가 기본인가?** 셋 다 켜진 채로 시작하면 마커가 많아 첫
   인상이 복잡할 수 있다. 반대로 하나만 켜면 "여러 관점"이라는 주장이 첫
   화면에서 안 보인다.
2. **Stack 아이콘의 임계.** 2개부터 스택으로 볼 것인가, 3개부터인가.
3. **`Not inspected` 표시 강도.** 너무 강하면 "다 돌려야 한다"는 압박이 되고,
   너무 약하면 침묵을 승인으로 읽는다.
4. **기존 검토 화면(`boardView='split'`)의 처리.** 점진 교체할지, 한 번에
   갈아탈지.
