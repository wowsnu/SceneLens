# SceneLens v3 에이전트 아키텍처 코드 감사

## 설계 명세에서 구현으로 옮기기 위한 작업 지도

- 작성일: 2026-07-22
- 기준 문서: `SCENELENS_DECISION_SYSTEM_SPEC.md`
- 대상 코드: SceneLens `v3`
- 범위: 읽기 기반 감사와 구현 제안
- 비범위: 이번 단계에서는 제품 기능 코드를 변경하지 않음

---

## 1. 결론

현재 v3는 UI를 전면 재작성할 필요가 없다. 다음 자산은 이미 충분히 유용하다.

- 대본과 Beat를 다루는 좌측 Storyboard 영역
- Grid, Graph, Card로 장면을 보는 Scene Overview
- 손그림, 빈 패널, AI 생성, 스케치 보강을 섞는 편집 흐름
- 단일 패널을 분석하는 CIR
- 대안별 이미지 Preview와 전후 비교
- Gap Fill과 Range Auto Fill
- 선택 패널 재생성 및 샷 교체

핵심 문제는 화면 형태가 아니라 화면 안의 데이터와 에이전트 관계다.

현재 Decision Board는 네 개의 동등한 Lens와 정적 Mock Option을 보여주는 시각 프로토타입이다. 실제 대본, 샷, 생성 기록, Decision 상태, Round 버전과 연결되어 있지 않다. 백엔드도 한 장의 스케치와 필수 연출 의도를 입력받아 세 개의 통합 Strategy를 반환하는 이전 모델에 맞춰져 있다.

따라서 권장 방향은 다음과 같다.

1. UI shell과 편집·생성 기능은 유지한다.
2. `Strategy` 중심 계약을 `Decision → Option Set → Round` 계약으로 교체한다.
3. Narrative를 상위 계층으로 이동한다.
4. Mise-en-scène, Cinematography, Editing은 동일한 Option 프로토콜을 쓰는 하위 에이전트로 둔다.
5. Decision Inventory, Event Log, Round 관리는 에이전트가 아닌 결정론적 시스템 계층으로 둔다.
6. 첫 구현은 기존 왼쪽 Narrative 패널의 대본 입력과 Beat 편집 흐름을 기준으로 시작한다.

이 접근이면 디자인 변경 위험을 낮추면서 에이전트 구조의 핵심 가설부터 검증할 수 있다.

---

## 2. 현재 실행 흐름

현재의 실질적인 AI 흐름은 다음과 같다.

~~~text
대본 + 현재 Canvas + 연출 의도
  ↓
IntentBar
  ↓ analyzeSketch
CIR 분석
  ↓ suggestStrategies
선택된 축(reframe / mise / lighting / freeform)을 모두 합친 Strategy 3개
  ↓
StrategyOverlay
  ↓ reframeSketch
Preview 이미지 + reframeHistory
  ↓
선택된 Strategy 또는 현재 샷 상태 갱신
~~~

동시에 `DecisionBoard.jsx`는 위 흐름과 별개로 작동한다.

~~~text
정적 LENSES 4개
  + 정적 MOCK_OPTIONS
  + 정적 MOCK_RELATIONS
  + 정적 MOCK_DEBATE_TURNS
  + 컴포넌트 내부 Round 상태
  ↓
Decision Board 시각 데모
~~~

즉, 현재 제품에는 서로 연결되지 않은 두 개의 개념이 있다.

- 실제로 호출되는 구형 Strategy 파이프라인
- 실제 상태를 바꾸지 않는 신형 Decision Board 프로토타입

다음 구현의 핵심은 새 화면을 만드는 것이 아니라 이 두 흐름을 하나의 Decision 계약으로 합치는 것이다.

---

## 3. 목표 실행 흐름

~~~text
Script
  ↓
Narrative Scaffold
  Beat / 정보 순서 / 임시 Cut / Narrative 제약
  ↓
Hybrid Board
  손그림 / AI 생성 / 보강 / Import / Blank
  ↓
Event Log + Candidate Extraction
  ↓
Decision Inventory
  currentChoice / provenance / status / target
  ↓
하위 Axis Agent
  Decision Question → Option Set → effect / cost / scope
  ↓
구조화된 Cross-agent Response
  Supports / Trade-off / Narrative check
  ↓
Round Plan
  Fixed / Tentative / Open
  ↓
Selective Preview 또는 Apply
  ↓
Board Version
  ↓
Viewer Reflection
~~~

여기서 창작 에이전트와 시스템 서비스를 분리해야 한다.

UI 용어는 런타임 구조와 구분한다. Narrative만 사용자 요청을 직접 받는
`Agent`로 노출하고, Mise-en-scène·Cinematography·Editing은 동일 장면을
살펴보는 세 개의 `Creative Lens`로 표현한다. 내부 구현은 Agent여도 되지만,
사용자가 네 개의 대화형 인격을 관리하게 만들지는 않는다.

| 계층 | 책임 | LLM 필요 여부 |
|---|---|---:|
| Narrative Agent | Beat와 정보 흐름, 임시 Cut, Narrative 질문과 Check | 필요 |
| Mise-en-scène Agent | Blocking, 공간, 소품, 배경에 대한 Option | 필요 |
| Cinematography Agent | Shot size, angle, framing, depth, motion에 대한 Option | 필요 |
| Editing Agent | Cut, transition, duration, rhythm에 대한 Option | 필요 |
| Decision Inventory Manager | ID, 상태, target, current choice, 관계 유지 | 원칙적으로 불필요 |
| Event Logger | User/AI provenance의 근거 기록 | 불필요 |
| Round Manager | 선택 묶음, 충돌 검증, 버전 생성 | 대부분 불필요 |
| Viewer Reflection | 의도 비공개 순차 읽기와 Cue Trace | 필요 |

Decision의 출처와 상태를 에이전트가 추측하게 만들지 않는 것이 중요하다. 그것은 사용자의 행동과 생성 호출을 기록한 Event Log에서 결정되어야 한다.

---

## 4. 재사용·수정·교체 지도

| 현재 자산 | 판정 | 이유와 변경 방향 |
|---|---|---|
| `App.jsx`의 좌·중앙 레이아웃 | 유지 | Narrative/Storyboard와 Decision Board의 큰 위치는 목표 구조와 맞음 |
| `DecisionBoard.jsx`의 shell, scope strip, card 시각 언어 | 수정 후 유지 | 데이터만 Mock에서 Store selector로 교체하고 Narrative를 상단으로 이동 |
| `DecisionBoard.jsx`의 네 개 peer lens | 교체 | Narrative는 상위, 하위 lane은 Mise/Cinematography/Editing만 사용 |
| `MOCK_OPTIONS`, `MOCK_RELATIONS`, `MOCK_DEBATE_TURNS` | 제거 | persistent Decision/Option/CrossAgentResponse로 대체 |
| Decision Board 내부의 local Round state | 제거 | 별도 Decision store와 Round Manager로 이동 |
| `StoryboardView.jsx` | 유지 | Script, Beat, split/merge, add/draw 흐름이 Narrative scaffold의 수용점이 됨 |
| `SceneOverview.jsx`와 Grid/Graph/Card | 유지 | Board Version과 Decision 상태 overlay를 얹을 수 있음 |
| `CenterPanel`, `DrawingCanvas`, `DrawingToolbar` | 유지 | Hybrid board의 수동 편집 경로 |
| `IntentBar.jsx` | 축소·재배치 | 필수 intent 전제를 제거하고 Decision 질문 입력 또는 선택 맥락 입력으로 변경 |
| `AxisChips.jsx` | 교체 | `reframe/mise/lighting/freeform`을 새 axis 모델과 혼용하지 않도록 정리 |
| `StrategyOverlay.jsx` | 로직 재사용, 개념 교체 | Preview, CIR mapping, before/after는 유지하되 Strategy card가 아닌 Option Preview로 변경 |
| `reframeHistory` / `comparePreview` | 재사용 | Option Preview cache의 초기 구현으로 활용. Board Version과는 분리 유지 |
| Gap Fill / Auto Fill Range | 어댑터 후 유지 | Editing Option과 selective apply의 기반으로 사용 |
| `strategy_engine.py` | Cinematography adapter로 단계적 교체 | 이론 검색과 CIR 활용은 유지, 출력 계약과 prompt는 Decision 중심으로 변경 |
| `fill_shot_engine.py` | 재사용 | Planning과 Rendering 분리 패턴이 Option 생성/Preview 분리와 잘 맞음 |
| 이미지 생성·보강·분할 API | 유지 | Agent 추론과 분리된 실행 도구로 사용 |

---

## 5. 프론트엔드 감사

### 5.1 `src/App.jsx`

현재 앱은 좌측 `StoryboardView`, 중앙 `DecisionBoard`의 단순한 구조다. 이 큰 틀은 유지해도 된다.

권장 변경:

- 좌측 상단 Narrative 표시는 추후 Narrative scaffold 상태를 보여주는 영역으로 확장한다.
- 중앙 Decision Board는 선택된 panel/range/transition/scene을 읽는 소비자가 된다.
- Zen mode와 panel maximize는 그대로 유지한다.
- Viewer Reflection은 Round 적용 전에는 주 작업 공간에 상시 노출하지 않고, 적용 후의 별도 view 또는 drawer로 추가한다.

### 5.2 `src/components/DecisionBoard.jsx`

이 파일은 700줄이 넘는 단일 컴포넌트이며 다음 책임을 동시에 가진다.

- agent lane 정의
- Mock Option과 관계 정의
- panel/range scope 상태
- Option 선택
- Round 목록
- agent intent 편집
- debate 표시
- shot 편집 modal

현재 상태로 API만 연결하면 더 큰 단일 컴포넌트가 된다. 시각 스타일은 유지하되 다음 단위로 분리하는 편이 안전하다.

~~~text
DecisionBoard
├── NarrativeHeader
├── DecisionScopeBar
├── DecisionInventorySummary
├── AxisLaneList
│   ├── AxisLane
│   └── DecisionOptionSet
├── CrossAgentResponsePanel
├── RoundPlanTray
└── BoardEditModal
~~~

필수 변경:

- `LENSES`에서 Narrative peer lane을 제거한다.
- Option을 `lensId`로 직접 나열하지 않고 `decisionId` 아래에 둔다.
- 현재 선택도 Option 중 하나인 `currentChoice`로 표시한다.
- `single/range`는 UI focus mode일 뿐 Decision의 범주가 아니게 한다.
- target은 `panelIds`, `transitionIds`, 또는 `sceneId`로 정규화한다.
- debate transcript는 `supports`, `tradeOff`, `narrativeCheck` 필드로 교체한다.
- local Round 배열은 store의 `activeRoundPlan` selector로 교체한다.
- Preview, Choose, Apply를 서로 다른 명령으로 유지한다.

### 5.3 `src/store/useStore.js`

현재 store에는 다음 상태가 한 파일에 함께 있다.

- screenplay와 Beat 편집
- canvas/drawing
- scenes, branches, shots
- legacy strategies와 proposals
- gap/auto fill
- preview와 reframe history
- layout와 modal 상태
- chat와 analysis 상태

특히 `strategies`와 `scenes`, 전역 `activeShot`과 scene 내부 `activeShot`처럼 비슷한 정보가 중복된다. 새 Decision 도메인까지 이 파일에 바로 추가하면 동기화 오류가 커진다.

권장:

- 기존 `useStore.js`는 당분간 scene, shot, drawing 실행 상태의 source로 유지한다.
- 새 `src/store/useDecisionStore.js`를 만들거나 명시적인 Zustand slice로 분리한다.
- 이후 첫 Decision 수직 슬라이스에서는 두 store를 이벤트 명령에서만 연결한다.
- UI 컴포넌트가 두 store의 내부 구조를 임의로 함께 수정하지 않게 한다.

새 store가 가져야 할 최소 상태:

~~~js
{
  decisionsById,
  decisionOrder,
  optionsById,
  optionIdsByDecision,
  activeDecisionId,
  activeRoundPlan,
  boardVersions,
  eventLog,
  narrativeScaffold,
  crossAgentResponsesByOption,
}
~~~

기존 `shot.source`와 `isAIGenerated`는 panel 수준의 힌트로는 재사용할 수 있다. 그러나 Decision provenance의 source of truth로는 부족하다. 한 패널 안에도 User가 그린 인물 위치와 AI가 채운 배경처럼 출처가 다른 Decision이 공존할 수 있기 때문이다.

### 5.4 선택 범위 상태

현재 범위 선택은 Decision Board와 Card View에서 서로 다른 local state로 존재한다. 첫 구현에서는 단일 패널만 지원해도 되지만, range를 붙일 때는 공통 selection model로 합쳐야 한다.

권장 selection 상태:

~~~js
{
  focusType: 'panel' | 'panel-range' | 'transition' | 'scene',
  sceneId,
  panelIds: [],
  transitionIds: [],
}
~~~

이 selection은 사용자가 현재 어디를 보고 있는지를 뜻한다. 개별 Option의 적용 target과 영향 target은 별도 필드다.

---

## 6. 백엔드 감사

### 6.1 현재 API

`src/services/api.js`와 FastAPI router에는 다음 기능이 있다.

- sketch 분석과 CIR 추출
- strategy 추천
- 이론 질의
- sketch 생성과 보강
- reframe
- overlay
- gap fill과 range auto fill
- segmentation

아직 없는 계약:

- Narrative scaffold
- Decision Inventory 생성과 갱신
- Decision별 Option 생성
- 구조화된 cross-agent response
- Round 검증 또는 적용 plan
- Board Version metadata
- Viewer Reflection

Decision Inventory, Event Log, Round의 핵심 상태는 우선 프론트엔드의 deterministic domain layer로 구현할 수 있다. 모든 것을 백엔드 LLM API로 만들 필요는 없다.

### 6.2 `backend/app/models/schemas.py`

현재 중심 계약은 다음과 같다.

~~~text
SuggestStrategiesRequest
  image + script + required intent + CIR + selected axes

SuggestStrategiesResponse
  Strategy[]
    Shot[]
      CIR / mise / lighting / freeform
~~~

새 설계와의 차이:

- `intent`가 필수다.
- Decision question과 current choice가 없다.
- target과 provenance가 없다.
- effect는 있지만 cost/trade-off가 명시적인 계약이 아니다.
- Option의 Preview와 선택 상태가 분리되어 있지 않다.
- 여러 axis를 하나의 Strategy 안에 통합한다.
- 정확히 한 shot, 정확히 세 Strategy를 전제로 한다.

기존 schema를 즉시 제거하기보다 새 schema를 병렬 추가한 뒤 frontend migration이 끝나면 legacy endpoint를 정리하는 편이 안전하다.

### 6.3 `backend/app/services/strategy_engine.py`

활용 가능한 부분:

- CIR를 입력 맥락으로 사용하는 방식
- film theory cache
- multimodal sketch 입력
- retry와 response parsing
- 기존 recommendation/effect 요약

교체해야 할 부분:

- `AXIS_BLOCKS`의 축 정의
- 모든 선택 축을 하나의 Strategy에 합치라는 prompt
- 필수 Director's Intent 전제
- 현재 선택을 기준 Option으로 반환하지 않는 구조
- cost, direct target, affected target이 없는 출력
- exactly 3 strategies / exactly 1 shot 고정

첫 단계에서는 기존 엔진을 삭제하지 않고 `CinematographyOptionService`가 감싸는 adapter로 쓸 수 있다. 다만 adapter가 단순히 필드 이름만 바꾸는 데 그치면 안 된다. prompt 단계에서 Decision 질문, current choice, 대안 간 대비, effect, cost를 명시해야 한다.

### 6.4 Narrative와 Editing의 경계

현재 backend에는 상위 Narrative 서비스가 없다. Gap Fill은 이미 cut 사이를 채우는 planning 능력이 있으므로 Editing Agent의 실행 기반으로 재사용할 수 있다.

- Narrative: 어떤 정보가 언제 드러나야 하는가, Beat는 무엇인가, 임시 Cut이 필요한가
- Editing: 주어진 Narrative 제약 안에서 Cut 연결, duration, transition, rhythm을 어떻게 설계할 것인가

Editing이 cut 수를 바꾸려 할 때 Narrative 제약에 영향을 주면 자동으로 적용하지 않고 `narrativeCheck`를 요청한다.

---

## 7. 제안하는 도메인 계약

아래는 Narrative 흐름 이후 시작할 Decision 단계의 최소 형태다. 최종 API 이름은 첫 Decision 수직 슬라이스에서 조정할 수 있다.

### 7.1 Decision

~~~ts
type DecisionStatus = 'fixed' | 'tentative' | 'open'
type Provenance = 'user' | 'ai'
type DecisionAxis = 'narrative' | 'mise-en-scene' | 'cinematography' | 'editing'

type DecisionTarget = {
  sceneId: string
  panelIds: string[]
  transitionIds: string[]
}

type Decision = {
  id: string
  axis: DecisionAxis
  topic: string
  question: string
  currentChoiceOptionId: string
  chosenOptionId: string | null
  provenance: Provenance
  status: DecisionStatus
  target: DecisionTarget
  evidenceEventIds: string[]
  createdAt: string
  updatedAt: string
}
~~~

### 7.2 Option

~~~ts
type Option = {
  id: string
  decisionId: string
  label: string
  summary: string
  effect: string
  cost: string
  directTarget: DecisionTarget
  affectedTarget: DecisionTarget
  payload: Record<string, unknown>
  isCurrentChoice: boolean
  preview: {
    status: 'idle' | 'loading' | 'ready' | 'failed'
    assetId?: string
    image?: string
  }
}
~~~

`payload`는 axis별 실행 명령을 담는다.

- Cinematography: CIR delta
- Mise-en-scène: blocking/props/set delta
- Editing: insert/remove/reorder/transition/duration instruction
- Narrative: scaffold 또는 constraint delta

### 7.3 Event Log

~~~ts
type DecisionEvent = {
  id: string
  type:
    | 'user-drew'
    | 'user-imported'
    | 'ai-generated'
    | 'ai-enhanced'
    | 'option-previewed'
    | 'option-chosen'
    | 'status-changed'
    | 'round-applied'
  actor: 'user' | 'ai' | 'system'
  target: DecisionTarget
  decisionId?: string
  optionId?: string
  boardVersionId: string
  timestamp: string
}
~~~

### 7.4 Round와 Board Version

~~~ts
type RoundPlan = {
  id: string
  baseBoardVersionId: string
  entries: Array<{
    decisionId: string
    optionId: string | null
    nextStatus: DecisionStatus
  }>
}

type BoardVersion = {
  id: string
  parentVersionId: string | null
  roundId: string | null
  sceneSnapshot: unknown
  decisionSnapshot: unknown
  createdAt: string
}
~~~

Preview는 Board Version을 만들지 않는다. `Apply Round`만 새 버전을 만든다.

---

## 8. 제안 API 경계

명칭은 제안이며, 구현 전에 request/response example로 확정한다.

| Endpoint | 역할 | 우선순위 |
|---|---|---:|
| `POST /api/narrative/scaffold` | Script에서 Beat, 정보 순서, 임시 Cut, 제약 생성 | 1 |
| `POST /api/decisions/options` | 하나의 Decision 질문에 대한 axis별 Option Set 생성 | 2 |
| `POST /api/options/cross-check` | 선택 Option의 supports/trade-off/narrativeCheck 생성 | 3 |
| 기존 `POST /api/reframe-sketch` | Cinematography Option Preview/Apply 실행 | 재사용 |
| 기존 Gap/Auto Fill endpoint | Editing Option Preview/Apply 실행 | 재사용 |
| `POST /api/viewer/reflection` | 의도 비공개 reading, alternatives, cue trace | 4 |

Inventory 생성과 Round commit은 첫 단계에서 local domain command로 둔다. 협업 또는 서버 저장이 필요해지는 시점에 persistence API를 추가한다.

`/api/decisions/options`의 최소 입력:

~~~json
{
  "decision": {
    "axis": "cinematography",
    "topic": "현재 패널의 카메라 거리",
    "question": "이 감정 전환을 어느 거리에서 보여줄 것인가?",
    "currentChoice": {}
  },
  "target": {},
  "scriptContext": "...",
  "narrativeConstraints": [],
  "optionalIntent": "...",
  "currentBoardContext": {}
}
~~~

중요한 점은 `optionalIntent`가 비어도 요청이 유효해야 한다는 것이다.

---

## 9. 첫 구현: 왼쪽 패널 기반 Narrative scaffold

첫 슬라이스는 새 입력 화면을 만들지 않는다. 현재 왼쪽 `NARRATIVE` 패널에서 대본을 입력하고 Beat/Cut 초안을 검토하여 초기 storyboard scaffold를 만드는 흐름을 연결한다.

### 9.1 사용자 흐름

~~~text
1. 사용자가 왼쪽 패널의 Edit Script를 연다.
2. Paste & Sync Screenplay에 대본을 입력한다.
3. Apply to Storyboard가 대본만 저장한다.
4. 사용자가 Propose Beat & Cut Structure를 실행한다.
5. Narrative Agent가 Beat, 정보 순서, 임시 Cut, 각 Cut의 목적을 제안한다.
6. 사용자가 제안을 전체/부분 수용하거나 Split/Merge로 수정한다.
7. Accept Scaffold가 임시 빈 shot 구조를 만든다.
8. 사용자가 각 panel을 Blank / Draw / Generate / Import 중 하나로 채운다.
9. 이 결과가 초기 hybrid Board가 된다.
~~~

### 9.2 재사용할 기존 기능

- `App.jsx`의 왼쪽 `NARRATIVE` 패널과 `Edit Script` 버튼
- `StoryboardView.jsx`의 `Paste & Sync Screenplay`
- `screenplay` Zustand 상태와 `setScreenplay`
- 기존 `Split Beat`와 `Merge`
- Beat별 shot stack과 `Add shot`
- 빈 shot을 열어 손그림으로 시작하는 흐름
- 기존 AI 생성, 보강, Import 경로

### 9.3 이 슬라이스에서 만들 것

새 파일 후보:

~~~text
src/domain/narrativeScaffold.js
src/services/narrativeApi.js
src/components/narrative/NarrativeScaffoldDraft.jsx

backend/app/routes/narrative.py
backend/app/services/narrative_agent.py
backend/app/prompts/narrative_scaffold.txt
~~~

변경할 파일:

~~~text
src/components/StoryboardView.jsx
src/store/useStore.js
src/services/api.js
backend/app/main.py
backend/app/models/schemas.py
~~~

첫 슬라이스에서는 Decision Inventory, 하위 세 Agent, Round, Viewer Reflection을 구현하지 않는다. Narrative가 생성한 구조와 사용자가 수용한 구조를 명확히 분리하는 데 집중한다.

### 9.4 완료 조건

- 별도의 대본 입력 화면을 만들지 않는다.
- 왼쪽 패널의 `screenplay`가 유일한 대본 source of truth다.
- 연출 의도가 비어 있어도 Narrative 제안이 가능하다.
- `Apply to Storyboard`는 대본만 저장하고 AI 구조를 자동 적용하지 않는다.
- AI가 제안한 Beat/Cut과 사용자가 수용한 구조가 구분된다.
- 사용자는 전체 수용, 부분 수용, 수정, 폐기가 가능하다.
- 기존 수동 `Split Beat`와 `Merge`가 계속 작동한다.
- scaffold 수용 후에도 모든 panel 이미지를 생성할 필요가 없다.
- Blank / Draw / Generate / Import가 panel별로 가능하다.

### 9.5 최소 Narrative 계약

현재 `screenplay` 요소는 배열 index에 의존한다. Narrative draft를 안전하게 수정하려면 `Apply to Storyboard` 시 각 요소에 stable ID를 부여하고, draft가 분석한 screenplay revision을 기록해야 한다.

입력:

~~~ts
type NarrativeScaffoldRequest = {
  screenplayRevisionId: string
  elements: Array<{
    id: string
    type: 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition'
    text: string
  }>
  optionalIntention?: string
  existingUserBeatBoundaries?: string[]
}
~~~

출력 초안:

~~~ts
type NarrativeScaffoldDraft = {
  id: string
  screenplayRevisionId: string
  sceneSummary: string
  provisionalInterpretation?: string
  beats: Array<{
    id: string
    elementIds: string[]
    summary: string
    narrativeChange: string
    informationState: string
    cuts: Array<{
      id: string
      elementIds: string[]
      purpose: string
    }>
  }>
}
~~~

Narrative의 Cut은 “무엇을 분리해 보여줄지”와 “그 Cut의 서사적 목적”까지만 말한다. Shot size, angle, blocking 같은 구체적 구현은 하위 Agent의 책임이므로 이 계약에 넣지 않는다.

사용자가 이미 만든 Beat 경계는 User 입력으로 취급한다. Narrative는 이를 조용히 덮어쓰지 않고 유지하거나 변경 제안으로 명시해야 한다.

---

## 10. 이후 구현 순서

### 단계 0. 왼쪽 패널 흐름 고정

- `screenplay`를 대본 source of truth로 유지
- `Apply to Storyboard`와 AI 제안 trigger 분리
- accepted state와 draft state의 차이 정의
- Beat와 Cut의 화면 표현 구분

### 단계 1. Narrative scaffold

- Script 필수, intention 선택
- Beat, 정보 순서, 임시 Cut 생성
- StoryboardView에 scaffold 수용
- 전체/부분 수용, 수정, 폐기
- panel별 Blank / Draw / Generate / Import 선택
- Narrative constraint를 하위 agent 요청에 전달
- Narrative를 Decision Board 상단으로 이동

### 단계 2. Decision domain foundation

- core entity와 reducer/action 정의
- Decision store 추가
- stable scene/panel/transition ID 확인
- Event Log와 provenance 규칙 추가
- accepted Narrative scaffold를 Decision의 맥락으로 사용

### 단계 3. Cinematography 수직 슬라이스

- 하나의 실제 Decision question과 Option Set
- Preview / Choose / Status / Apply Round 분리
- 선택 패널 재생성
- Board Version 저장

### 단계 4. Mise-en-scène과 Editing

- 공통 Option 계약으로 agent 추가
- Mise payload와 선택적 이미지 수정
- Gap Fill과 Auto Fill을 Editing Option으로 감싸기
- panel뿐 아니라 transition target 추가

### 단계 5. 구조화된 agent 연결

- Supports
- Trade-off
- Narrative check
- affected target 추적
- 자유 debate UI 제거

### 단계 6. Commitment view와 Viewer Reflection

- Production: Fixed
- Review: Fixed + Tentative
- Full: Fixed + Tentative + Open
- Blind Sequential Reading
- Alternative Reading Explorer, 최대 2개
- Cue Trace와 새 Decision 질문 연결

---

## 11. 주요 위험과 방지책

### 11.1 거대한 Zustand store

위험: 기존 state와 새 Decision state가 결합되면 shot update 하나가 Round, history, preview를 동시에 망가뜨릴 수 있다.

방지: Decision domain을 별도 store 또는 slice로 분리하고 공개 command를 통해서만 scene store와 연결한다.

### 11.2 Preview와 Apply의 혼동

위험: 현재 Strategy 선택 흐름 일부는 proposal 선택과 이미지 생성을 함께 시작한다.

방지: `previewOption`, `chooseOption`, `applyRound`를 별도 action으로 구현하고 불변식을 테스트한다.

### 11.3 provenance의 단순화

위험: `shot.isAIGenerated`만 보면 hybrid panel 내부 Decision의 출처를 잃는다.

방지: 생성, 보강, draw, import, 선택을 event로 남기고 Decision은 관련 event ID를 가진다.

### 11.4 전체 이미지 재생성으로 인한 의도치 않은 변화

위험: 카메라 변경 하나 때문에 Fixed mise detail이 변할 수 있다.

방지: 적용 prompt에 Fixed constraint를 포함하고, 직접 target 밖으로 regeneration 범위를 넓히지 않으며, 전후 검증을 남긴다.

### 11.5 Narrative와 Editing의 중복

위험: 두 agent가 각각 cut structure를 바꾸면 책임이 불명확해진다.

방지: Narrative가 정보 순서와 임시 cut scaffold를 소유하고 Editing은 그 제약 아래 rhythm/transition을 제안한다. 제약 변경은 narrativeCheck로 올린다.

### 11.6 Mock UI를 실제 시스템으로 오인

위험: 예쁜 Option 카드가 실제 Decision source of truth처럼 보이지만 reload 또는 selection 변경 시 사라진다.

방지: Mock 상수를 먼저 selector 기반 read model로 교체하고 이후 agent API를 연결한다.

### 11.7 자동화 검증 부족

현재 전용 테스트는 사실상 segmentation 도구용 파일만 확인된다. frontend package에는 test script가 없다.

Narrative 첫 슬라이스에서 최소한 다음 domain test를 추가해야 한다.

- 대본 저장만으로 AI scaffold가 적용되지 않음
- Beat proposal과 accepted Beat가 분리됨
- 일부 Beat만 수용 가능
- 제안 폐기 시 기존 screenplay와 shot이 불변
- Split/Merge 후 accepted scaffold와 shot mapping 유지
- intention이 없어도 request가 유효함

### 11.8 저장소 문서의 민감·오래된 정보

과거 구현 문서 중 일부에는 credential처럼 보이는 문자열과 오래된 배포 정보가 포함되어 있다. 이 감사에서는 해당 값을 재기록하지 않았다.

방지:

- 실제 사용 여부를 확인하고 관련 credential을 회전한다.
- 문서에서 값을 제거하거나 placeholder로 바꾼다.
- 배포 구조가 현재와 다르면 historical 문서로 명확히 표시한다.

이 정리는 에이전트 리팩터와 별도 보안 작업으로 처리한다.

---

## 12. 구현 시 지켜야 할 경계

1. Narrative는 네 번째 peer lane이 아니다.
2. Decision Inventory는 LLM의 자유 텍스트가 source of truth가 아니다.
3. current generated choice도 하나의 Option이다.
4. Optional intention이 없다는 이유로 흐름이 멈추면 안 된다.
5. Range와 Transition을 동일한 scope category로 취급하지 않는다.
6. Preview는 commit이 아니다.
7. Choose는 즉시 storyboard를 덮어쓰지 않는다.
8. Apply Round만 Board Version을 만든다.
9. Fixed constraint는 selective generation 때 명시적으로 보존한다.
10. Open은 미검토가 아니라 검토된 유연성이다.
11. agent 응답은 debate transcript가 아니라 Option별 영향 보고다.
12. Viewer Reflection은 creator intention이나 agent reasoning을 입력받지 않는다.

---

## 13. 바로 다음 작업 제안

다음 커밋은 `Decision domain foundation`이 아니라 기존 왼쪽 패널을 기준으로 한 `Narrative scaffold draft`가 적합하다.

권장 범위:

1. 기존 `screenplay`를 입력으로 받는 Narrative scaffold shape를 정의한다.
2. `StoryboardView` 안에 accepted state와 분리된 draft 영역을 만든다.
3. 우선 API 없이 deterministic sample draft로 수용/수정/폐기 흐름을 검증한다.
4. 기존 `Split Beat`, `Merge`, `Add shot`과 충돌하지 않는지 확인한다.
5. 흐름이 맞은 뒤 Narrative API를 연결한다.

이 흐름이 안정된 뒤 Decision data와 하위 Agent를 붙인다. 이렇게 해야 시스템 내부 구조보다 사용자가 대본에서 storyboard로 이동하는 경험을 먼저 검증할 수 있다.

---

## 14. 최종 판단

현재 UI는 크게 이상하지 않다. 오히려 Decision Card, Round tray, scope strip, storyboard 편집 기능은 새 설계를 담을 수 있는 수준까지 이미 만들어져 있다.

지금 가장 먼저 바꿔야 하는 것은 다음 세 가지다.

1. `Narrative + 세 하위 agent` 계층
2. `Strategy`가 아닌 persistent `Decision + Option` 계약
3. Preview, Choose, Apply Round의 명확한 분리

따라서 다음 구현은 새 입력 화면이나 CIR adapter가 아니라, 기존 왼쪽 패널에서 Narrative scaffold를 제안하고 사용자가 수용하는 흐름부터 시작하는 것이 설계 의도와 사용자 방향에 맞다.
