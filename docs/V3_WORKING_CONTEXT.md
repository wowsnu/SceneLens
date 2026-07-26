# SceneLens v3 작업 맥락과 인수인계

- 마지막 정리: 2026-07-26
- 작업 브랜치: `feature/scene-flow-fill`
- 작업 출발 커밋: `48fa9f4`
- 관련 설계: [`SCENELENS_DECISION_SYSTEM_SPEC.md`](./SCENELENS_DECISION_SYSTEM_SPEC.md)
- 코드 감사: [`V3_AGENT_ARCHITECTURE_AUDIT.md`](./V3_AGENT_ARCHITECTURE_AUDIT.md)
- 패널 생성 설계: [`PANEL_GENERATION_DESIGN.md`](./PANEL_GENERATION_DESIGN.md)
  (프롬프트는 컷에서 조립. Agent를 새로 띄우지 않고 Option card로. 비구속 표시는 미정)
- 서사 렌즈 재프레이밍: [`NARRATIVE_LENS_AS_JULCONTI.md`](./NARRATIVE_LENS_AS_JULCONTI.md)
  (서사 렌즈 = 줄콘티의 계산적 구현. Narrative rail에 `Propose Cut Plan` 추가 제안)

이 문서는 대화를 다시 읽지 않아도 SceneLens v3 작업을 이어갈 수 있도록 만든
현재 맥락 문서다. 장기적인 개념 명세는 Decision System Spec에, 실제 코드와
다음 작업 사이의 연결은 이 문서에 기록한다.

---

## 1. 제품을 바라보는 기본 관점

SceneLens가 만드는 스토리보드는 완성 영상을 픽셀 단위로 미리 확정하는 결과물이
아니다. 스토리보드는 원래 핵심을 추려내는 low-fidelity 표현에서 출발하며,
SceneLens도 그 성격을 보존해야 한다.

따라서 시스템의 목적은 다음과 같다.

- AI가 모든 패널과 세부사항을 한 번에 완성하도록 강제하지 않는다.
- 사용자가 직접 그린 패널, AI로 생성한 패널, 빈 패널을 한 보드에 함께 둘 수 있다.
- 창작자가 무엇을 이미 정했고 무엇을 더 검토해야 하며 무엇을 일부러 열어
  두었는지 구분할 수 있게 한다.
- AI가 채운 디테일을 자동으로 감독의 결정으로 취급하지 않는다.
- 감독 한 사람만을 위한 도구에 머물지 않고 작가, 촬영, 미술, 연기, 편집 등
  여러 관점이 스토리보드를 통해 대화할 수 있게 한다.

`Open`은 이 마지막 목표와 직접 연결된다. Open은 빠뜨렸거나 중요하지 않은
결정이 아니라, 검토한 뒤에도 다른 참여자가 해석하거나 구체화할 여지를 남긴
결정이다.

---

## 2. 현재 합의된 개념

### 2.1 에이전트 구조

Narrative는 네 번째 동등한 Lens가 아니라 상위 Agent다.

```text
사용자
  ↕
Narrative Agent
  ├─ Mise-en-scène Lens
  ├─ Cinematography Lens
  └─ Editing Lens
```

- Narrative Agent는 사용자의 대본과 요청을 직접 받는다.
- Narrative는 Beat, 정보 공개 순서, 임시 Cut 구성과 서사적 제약을 다룬다.
- Narrative가 모든 하위 질문을 일방적으로 작성하지는 않는다.
- 세 하위 Agent는 UI에서 관리해야 하는 별도 인격보다 같은 장면을 읽는
  `Creative Lens`로 보여준다.
- 하위 Lens는 관련 축의 질문과 대안을 제안할 수 있고, Narrative 검토가 필요한
  충돌을 위로 올릴 수 있다.

#### 초기 Creative Lens 기준

Mock 단계에서는 다음의 작고 고정된 기준을 사용한다.

- Cinematography: 거리, 각도, 프레이밍, 시야·가림, 카메라 움직임
- Mise-en-scène: 인물 배치, 인물 간 거리, 시선, 소품, 배경
- Editing: 컷 분할, 순서, 전환, 반응 타이밍, 리듬

Narrative는 상위에서 Beat, 정보 공개 순서, 인과관계와 감정 변화를 관리한다.

Lens 기준은 고정되지만 실제 Decision 항목은 장면, 선택 target, Board version에
따라 달라진다. 항목은 사용자 요청, Narrative 제약, 사용자 편집, AI 생성 기록,
사용자가 확인한 시각적 후보 중 하나 이상의 근거를 가져야 한다. 같은 Board
version에서 항목 목록이 임의로 바뀌어서는 안 되며, 근거가 없으면 억지로
항목을 만들지 않는다.

### 2.2 초기 입력과 Narrative의 역할

초기 필수 입력은 간단한 대본이면 충분하다. 연출 의도는 선택 사항이다.

- `Scene intention`은 별도 작업 단계가 아니라 대본 입력 창 안에 둔다.
- Decision/Lens 화면에는 `Narrative request` 하나를 둔다.
- `Suggest structure`와 `Propose script changes`는 사용자 관점에서 하나의
  Narrative 제안 흐름으로 합친다.
- Narrative의 제안은 원문을 몰래 덮어쓰지 않는다.
- 사용자는 Beat 분할, 대사/액션 수정, 패널 수 제안 등을 각각 수락하거나
  버릴 수 있어야 한다.

Narrative는 초기 Storyboard의 구조를 마련하지만 모든 패널 이미지를 생성할
필요는 없다. 구조를 만든 뒤 각 패널을 `Blank / Draw / Generate / Import` 중
어떤 방식으로 채울지는 사용자가 정할 수 있어야 한다.

### 2.3 Decision 상태

장기 설계에서는 같은 Decision 데이터를 누적적으로 보여주는 세 가지 보기를
사용한다.

| 보기 | 표시 범위 | 의도 |
|---|---|---|
| Production | Fixed | 후속 제작에서 보존할 결정 |
| Review | Fixed + Tentative | 현재 검토할 결정. 기본 저작 보기 |
| Full | Fixed + Tentative + Open | 의도적으로 남긴 유연성까지 포함한 전체 지도 |

상태와 출처는 서로 다른 정보다.

- 상태: `Fixed / Tentative / Open`
- 초기 출처: `User / AI`
- 출처는 Agent의 판단이 아니라 Event Log로부터 결정한다.
- AI 제안을 사용자가 수락해도 그 기원이 User로 바뀌지는 않는다.

### 2.4 질문, Option, Round

- Decision 질문은 사용자, Narrative, 관련 하위 Lens 중 누구나 시작할 수 있다.
- Narrative는 하위 Agent에게 모든 질문을 내려보내기보다 서사 제약을 제공한다.
- 현재 결과도 특권적인 정답이 아니라 대안과 나란히 놓이는 `current choice`다.
- 하나의 Decision 주제 아래 현재 선택과 대조적인 Option을 묶는다.
- 사용자가 원하는 여러 선택을 한 번에 반영해 새 Storyboard 버전을 만드는
  단위를 `Round`로 본다.
- Preview와 Apply는 다르다. Preview만으로 새 Board 버전이나 상태 전환이
  생기면 안 된다.

### 2.5 Viewer Reflection

Viewer 기능은 실제 관객의 분포를 시뮬레이션한다고 주장하지 않는다.

- 여러 페르소나 Agent의 발언 수를 인간 관객 표본이나 확률 분포로 해석하지 않는다.
- 핵심 기능은 의도를 보지 않은 순차 읽기, 가능한 대안 읽기, 실제 화면 Cue의
  추적이다.
- 결과는 창작자에게 성찰 자료를 주며 Storyboard를 자동 수정하지 않는다.
- 페르소나는 핵심 Viewer pipeline이 안정된 뒤의 선택적 Perspective Probe로
  미룬다.

---

## 3. 일부러 보류한 개념

다음 항목은 유용할 수 있지만 첫 Decision loop를 만들기 전에 데이터 모델에
넣지 않는다.

- `owner`
- `invariant`
- `flexibleRange`
- `decisionStage`
- `Mixed` 또는 `Derived` provenance
- 역할별 권한과 handoff
- Open Decision의 역할 위임
- 페르소나 기반 Viewer 분석
- 반복 호출 결과를 관객 분포로 표현하는 기능

`Range`와 `Boundary`도 같은 축의 값으로 취급하지 않는다.

- Range는 여러 패널을 묶어 현재 보고 있는 범위다.
- Boundary는 패널 사이의 transition/cut 지점이다.
- 사용자의 현재 focus와 Option이 직접 적용되는 target, 간접 영향을 받는 target은
  서로 분리한다.

---

## 4. 작업할 때 지켜야 할 진행 원칙

이 프로젝트는 먼저 거대한 Decision/CIR 파이프라인을 코드에 넣는 방식으로
진행하지 않는다. 사용자가 실제로 밟는 흐름을 개념적으로 확인한 뒤 한 단계씩
구현한다.

현재 우선순위 흐름은 다음과 같다.

```text
대본 입력
→ Narrative의 Beat/구조 제안
→ 사용자의 검토와 수정
→ 초기 패널 구성
→ 패널별 Draw / Generate / Blank / Import
→ 초기 hybrid Storyboard
→ 그 다음에 Decision Inventory와 Round
```

기존 CIR, Strategy, Gap Fill 코드는 폐기 대상으로 확정된 것이 아니다. 다만
새 사용자 흐름의 출발점으로 삼지 않는다. 나중에 Cinematography Option의 분석,
Preview, 실행 도구로 재사용할 수 있다.

---

## 5. 현재 UI에서 사용하는 화면 이름

`전체화면`이라는 말이 서로 다른 상태를 가리켜 혼동이 있었으므로 다음처럼
구분한다.

### 5.1 Storyboard 제작 화면

- 앱의 기본 진입 화면이다.
- 왼쪽 Narrative/Storyboard 패널이 작업 공간 전체를 넓게 사용한다.
- 대본, Beat, 패널을 함께 보고 초기 Storyboard를 만든다.
- AI batch draft bar가 이 화면에서만 보인다.

### 5.2 Decision/Lens 화면

- 왼쪽에는 좁은 대본/Storyboard reference가 남는다.
- 오른쪽에는 상위 Narrative Agent와 세 Creative Lens가 보인다.
- Storyboard 제작 화면의 AI batch draft bar는 자동으로 숨긴다.

### 5.3 Draw 분할 화면

- 패널의 `Draw`를 누르면 별도 modal이나 완전히 새로운 화면으로 이동하지 않는다.
- 왼쪽에는 대본과 Storyboard가 남고, 오른쪽에 Drawing Canvas가 열린다.
- 현재 그리고 있는 패널이 속한 Beat를 왼쪽 대본에서 확인할 수 있다.

### 5.4 Drawing Focus

- Draw 분할 화면에서 `Focus` 또는 `Z`를 누르면 Drawing 영역을 넓힌다.
- 이때 Drawing 안에 현재 Beat의 접을 수 있는 `Script reference`를 표시한다.
- `Exit Focus` 또는 `Escape`로 Draw 분할 화면에 돌아온다.
- `Back to Storyboard`는 Drawing을 닫고 Storyboard 제작 화면으로 돌아간다.

브라우저 자체의 fullscreen은 `F`이며 위 UI 상태들과 별개다.

---

## 6. 현재 구현된 내용

### 6.1 Narrative mock과 Creative Lens UI

기준 커밋: `d3f2db8`

- Narrative를 Decision Board의 동등한 네 번째 lane에서 상위 영역으로 이동했다.
- 나머지 세 축은 `Agent`보다 `Creative Lens`라는 UI 언어를 사용한다.
- 대본 입력 창에 선택적 `Scene intention`을 추가했다.
- Decision/Lens 화면에는 `Narrative request` 하나를 제공한다.
- mock Narrative 요청은 기존 Beat와 대본 위치에 제안 카드를 만든다.
- 일부 제안은 Beat 분할, 패널 수 추가, script line 삽입/교체로 수락할 수 있다.
- 이 기능은 아직 실제 Narrative backend Agent가 아니라 UI와 상태 흐름을
  검증하기 위한 Mock이다.

주요 파일:

- `src/components/DecisionBoard.jsx`
- `src/components/DecisionBoard.css`
- `src/components/StoryboardView.jsx`
- `src/store/useStore.js`

### 6.2 초기 Storyboard 제작

기준 커밋: `0865aee`

- 첫 화면은 `maximizedPanel: 'left'`인 Storyboard 제작 화면이다.
- 각 패널에서 `Draw`와 `Generate`를 직접 선택할 수 있다.
- 빈 패널을 한 번에 생성하기 위한 범위는 다음 세 가지다.
  - 현재 Beat
  - 사용자가 선택한 패널
  - 전체 빈 패널
- 기존 그림과 import 이미지는 기본 batch 생성으로 덮어쓰지 않는다.
- 이미지가 있는 패널에는 명시적인 `AI variant`를 제공한다.
- AI 결과는 즉시 확정하지 않고 candidate로 나타난다.
- candidate에서 `Dismiss / Again / Draw over / Accept`를 선택할 수 있다.
- 여러 candidate를 `Accept all`로 수락할 수 있다.
- 현재 candidate 이미지는 실제 생성이 아닌 SVG Mock이다.

패널 조작:

- `Add shot`은 다른 화면으로 이동하지 않고 현재 Beat에 바로 빈 패널을 추가한다.
- 패널 삭제 버튼을 추가했다.
- Scene에 최소 한 패널은 남긴다.
- 빈 패널에는 미정인 Wide/ECU 같은 촬영 메타데이터를 미리 표시하지 않는다.
- 카드의 우측 상단 `B1 · 1 shot` 요약도 제거했다.
- 빈/new shot은 기본 `Medium` CIR을 갖지 않고 `cir: {}`로 시작한다.

선택 동작:

- 선택된 패널 ID는 `selectedStoryboardShotIds`로 store에 둔다.
- Beat 또는 All blanks 범위로 바꾸면 selected 범위를 해제한다.
- Decision/Lens 화면 또는 Drawing으로 이동하면 selected 상태를 해제한다.
- Beat를 클릭하면 해당 Beat와 그 Beat의 첫 패널이 활성화된다.

### 6.3 Drawing 흐름

기준 커밋: `0865aee`

- `drawingWorkspaceOpen` 상태로 Drawing workspace를 명시적으로 관리한다.
- Storyboard 카드와 Decision Board의 `Edit Shot` 모두 같은 Drawing 경로를 연다.
- Draw 분할 상태에서 Storyboard는 unmount하지 않고 왼쪽에 유지한다.
- Drawing Focus에서는 왼쪽을 숨기되 컴포넌트 상태는 유지한다.
- Focus 안의 script reference는 기본적으로 열려 있고 접을 수 있다.
- Beat를 바꾸면 대본뿐 아니라 활성 panel과 Canvas 이미지도 함께 바뀐다.
- DrawingCanvas의 캐시 키는 단순 shot index가 아니라
  `scene + branch + shot ID`를 사용한다.
- 이미지가 없는 대상 패널로 이동하면 이전 그림이 남지 않고 흰 Canvas가 열린다.

관련 store action:

- `openDrawingWorkspace`
- `closeDrawingWorkspace`
- `updateFlowShotById`
- `setSelectedStoryboardShotIds`
- `clearStoryboardShotSelection`

주요 파일:

- `src/App.jsx`
- `src/components/StoryboardView.jsx`
- `src/components/CenterPanel.jsx`
- `src/components/DrawingCanvas.jsx`
- `src/components/DecisionBoard.jsx`
- `src/store/useStore.js`

### 6.4 Narrative 작업 위치 조정

2026-07-23 후속 작업에서 Narrative의 주 요청창을 Decision/Lens 화면에서
Storyboard 제작 화면의 오른쪽 Agent rail로 옮겼다.

- 넓은 대본 화면 오른쪽에 접을 수 있는 세로형 `Narrative Agent` panel이 있다.
- 대본과 Storyboard는 독립적으로 스크롤되고 Agent는 옆에 계속 남는다.
- 사용자는 대본과 패널을 함께 보면서 구조 변경이나 script 수정을 요청한다.
- 생성된 Mock 제안은 기존과 같이 관련 대본 위치에서 `Accept / Dismiss`한다.
- inline 제안은 Agent 경고 카드가 아니라 대본에 붙은 작은 review/diff 형태로
  표시하고, 제안 유형과 실제 변경 범위를 함께 보여준다.
- Decision/Lens 화면의 Narrative 영역은 요청창이 아니라 `Narrative check`로
  축소했다.
- Narrative check는 현재 Beat, Scene intention, 미검토 제안 수를 보여준다.
- `Open screenplay`로 넓은 Storyboard 제작 화면에 돌아갈 수 있다.

이 배치는 Narrative를 상위 Agent로 두되, 실제 대본 작업을 하려면 대본이
작아지는 기존의 역전된 사용 흐름을 없애기 위한 것이다.

### 6.5 Script Focus와 대본 생성 Mock

Storyboard 제작 화면은 별도 대본 페이지를 만들지 않고 같은 데이터 위에서 두
가지 보기 상태를 지원한다.

- `Hide panels`: 이미지 panel column과 batch generation bar를 숨기고 대본을
  넓게 보는 Script Focus
- `Show panels`: 기존 이미지와 빈 패널을 그대로 복원하는 Storyboard 보기
- panel을 숨겨도 shot이나 이미지를 삭제하지 않는다.
- 숨길 때 batch 생성을 위한 임시 selected panel 상태만 해제한다.

오른쪽 Narrative rail에는 두 작업을 구분하는 toggle을 추가했다.

- `Revise Beat`: 현재 Beat에 작은 inline 제안을 생성
- `Create Script`: 아이디어나 장면 설명에서 전체 `Script Draft` Mock을 생성

전체 Script Draft는 현재 대본을 즉시 덮어쓰지 않는다. 메인 대본 영역에 별도
후보로 표시하고 `Dismiss / Again / Use draft`로 검토한다. `Use draft`를 선택한
경우에만 실제 screenplay와 Beat가 갱신된다.

최근 추가한 Narrative rail, inline suggestion, Script Draft, Storyboard 생성
제어의 작은 글자는 읽을 수 있는 크기로 함께 상향했다.

### 6.6 Decision Board와 Creative Lens Mock

Decision/Lens 화면은 상위 Narrative와 세 하위 Creative Lens의 역할을 실제 UI
흐름으로 시험하는 단계다. 아직 실제 Agent 호출이나 canonical Decision
데이터 모델은 연결되지 않았으며, 현재 내용은 장면별 Mock이다.

공통 UI:

- 사용자가 `미장센 / 촬영 / 편집` 중 주 렌즈를 직접 선택한다.
- 선택한 렌즈의 작업 공간만 바로 아래에 표시한다.
- 기존 화면 중앙에 떠 있던 `Overlap` 버튼은 제거하고, 주 렌즈 선택 영역의
  `렌즈 비교 / Overlap`으로 고정했다.
- 새로 만든 카드와 동작 이름은 한글을 먼저 쓰고 필요한 경우에만
  `한글 / English term` 형식으로 전문용어를 함께 표시한다.
- 분석문을 길게 늘어놓기보다 한 줄의 핵심 판단 뒤에 실행 가능한 제안을
  우선한다.

#### Cinematography

- 현재 Shot 또는 Range의 촬영 상태와 통합 촬영안을 구분해 표시한다.
- Single은 한 Shot의 샷 크기, 각도, 프레이밍, 시야·가림, 움직임을 다룬다.
- Range는 여러 Shot의 크기와 시각적 중심이 어떻게 진행되는지 다룬다.
- 제안은 축을 하나씩 고르는 질문이 아니라 함께 작동하는 촬영안 묶음이다.
- 현재 분석과 이론 기반 제안을 구분하지만, Viewer처럼 보이는 것을 장황하게
  재서술하지 않는 방향으로 계속 압축해야 한다.

#### Mise-en-scène

Mise-en-scène은 `씬 기준 / Scene State`와 `샷 미장센 / Shot Staging`으로
나뉜다.

Scene State:

- 인물 기준 카드는 사진을 앞면에 먼저 보여주고, 뒷면에서 이름, 역할, 외형
  정보를 수정한다.
- 장소는 현재 `장소 정체`와 `고정 소품`만 간단히 표시한다.
- 장소 카드의 큰 2D 평면도를 누르면 기존 `SpatialMap`을 재사용한 공간
  편집기가 열린다.
- 관제실, 콘솔, 모니터 벽, 철문, 캐비닛과 재인·민호의 위치를 조작할 수 있다.
- 공간 편집 결과는 편집기를 닫았다 다시 열어도 유지된다.

Shot Staging:

- 그림이나 현재 상태표를 반복하지 않고, 현재 Shot의 핵심 판단 한 줄 뒤에
  제안을 바로 표시한다.
- 제안 범주는 `인물 배치 / Blocking`, `연기 동작 / Performance`,
  `시선 설계 / Eyeline`, `소품 동선 / Prop choreography`,
  `세트 활용 / Set interaction`이다.
- 이 제안들은 서로 배타적인 방향이 아니라 함께 조합할 수 있는
  `Staging move`다.
- 여러 카드를 `미장센에 추가`할 수 있으며, 각 Shot에 맞는 구체적인 행동으로
  Mock 내용이 바뀐다.
- Shot Staging의 Range 동선·연속성 검사는 아직 구현하지 않았다.

#### Editing

Editing의 핵심 목적은 현재 Shot과 인접 Shot의 흐름을 자연스럽게 만들 수 있는
구체적인 편집 동작을 제안하는 것이다.

- 사용자에게 별도 `Boundary` 선택을 요구하지 않는다.
- Editing에서 Single Shot을 선택하면 다음 세 범위를 자동으로 함께 본다.
  - 현재 Shot 내부
  - 이전 Shot → 현재 Shot
  - 현재 Shot → 다음 Shot
- 카드에는 `현재 샷`, `이전 연결`, `다음 연결` target을 명시한다.
- 현재 Shot 내부에서는 앞부분 줄이기, Shot 나누기, 끝 반응 유지 등을
  제안한다.
- 인접 연결에서는 행동·시선 연결 시점을 조정하거나 새 Shot을 삽입하도록
  제안한다.
- 새 Shot 제안은 추상적인 촬영 용어보다 삽입 위치, 새 패널에 들어갈 내용,
  변경 결과를 `S1 → 새 Shot → S2`처럼 직접 보여준다.
- 여러 편집 동작을 `편집안에 추가`할 수 있다.
- Editing Range의 삭제, 병합, 재배열, 전체 리듬 제안은 아직 구현하지 않았다.

### 6.7 Decision Board 화면 정리

- 기존 내부 제목 블록과 장면 설명을 제거해 Scope와 실제 작업 내용을 위로
  올렸다.
- Storyboard / Lenses / Split 보기와 Edit Shot 제어는 앱 중앙 상단 헤더에
  모았다.
- Storyboard 영역 스크롤바는 Narrative 패널과 같은 시각 언어로 정리했다.
- Decision/Lens 화면 진입 시 왼쪽 서사 패널은 기본적으로 숨고, 필요할 때
  다시 펼칠 수 있다.
- 앱의 첫 진입 자체는 여전히 넓은 Storyboard/Narrative 제작 화면이다.

---

## 7. 아직 구현되지 않았거나 Mock인 부분

현재 UI가 보여준다고 해서 아래 기능이 실제 Agent 파이프라인으로 완성된 것은
아니다.

- Narrative request의 실제 LLM 호출
- Narrative scaffold의 영속 데이터 모델
- 실제 여러 패널 이미지 생성과 batch API
- AI candidate의 영속 저장과 생성 작업 상태
- Import를 포함한 완전한 네 가지 panel source UI
- canonical Decision 모델과 Decision Inventory
- Event Log 기반 provenance
- Fixed / Tentative / Open을 실제 상태로 다루는 UI
- Production / Review / Full filter
- Decision별 current choice와 Option Set
- 구조화된 Supports / Trade-off / Narrative check
- Round plan, selective Apply, Board version 비교
- Viewer Reflection
- Creative Lens 제안의 실제 LLM/Agent 호출
- Mise-en-scène Scene State와 Shot Staging의 영속 데이터 모델
- SpatialMap의 실제 Shot staging 데이터 연결
- 선택한 Staging move를 패널 배치에 적용하는 기능
- Editing 제안을 실제 trim, split, insert 작업으로 적용하는 기능
- Editing Range의 삭제, 병합, 재배열, 전체 리듬 제안
- Mise-en-scène Range의 동선·소품·배치 연속성 검사

Decision Board 안에는 여전히 정적 mock Option, 관계, 대화 데이터가 남아 있다.
기존 CIR/Strategy backend도 새 Decision 계약과 아직 연결되지 않았다.

추가로 확인된 작은 정리 항목:

- `src/components/Header.jsx` 로고에 아직 `v2` 텍스트가 남아 있다.
- Storyboard candidate가 `StoryboardView` local state라 화면 생명주기에 따라
  사라질 수 있다.
- 한 Beat에 여러 shot이 있을 때 Beat 클릭은 현재 첫 shot을 선택한다.

---

## 8. 다음 작업 권장 순서

다음 단계에서도 한 번에 Decision 시스템 전체를 만들지 않는다.

### 바로 다음 수직 슬라이스

1. 현재 Decision/Lens 화면을 실제 브라우저에서 다시 확인해 카드 크기, 스크롤,
   주 렌즈 전환, Shot 이동 동기화를 검증한다.
2. Editing Range에서 여러 Shot의 반복, 누락, 삭제·병합·재배열, 전체 리듬
   제안을 Mock으로 만든다.
3. Mise-en-scène Range에서 인물 동선, 소품 위치, 시선, 배치 연속성을
   검사하는 Mock을 만든다.
4. 선택한 Editing 또는 Staging 제안 하나를 실제 Storyboard 변경으로
   적용하는 최소 동작을 연결한다.
5. 그 다음 Mock 제안을 실제 Creative Lens 호출 계약으로 교체한다.

Storyboard 제작 흐름의 실제 이미지 생성 연결은 별도 축으로 남아 있다.

1. `Blank / Draw / Generate / Import`가 패널 source로 일관되게 보이도록
   초기 Board 제작 흐름을 마무리한다.
2. Mock batch candidate를 실제 이미지 생성 호출에 연결하되, 우선 한 패널의
   생성 → candidate 검토 → Accept를 완성한다.
3. 같은 계약을 Beat/Selected/All blanks batch로 확장한다.

### 초기 hybrid Board가 안정된 뒤

1. 최소 Decision 데이터 구조를 별도 store/slice로 만든다.
2. Event Log로 User/AI provenance를 기록한다.
3. 한 개의 Cinematography Decision에 대해 current choice와 Option Set을 만든다.
4. Preview와 Apply를 분리한다.
5. Fixed/Tentative/Open과 한 Round 적용을 연결한다.
6. 같은 프로토콜을 Mise-en-scène과 Editing에 확장한다.
7. 마지막에 Viewer Reflection을 붙인다.

---

## 9. 검증 기준

2026-07-26 Creative Lens Mock 작업에서 다음 검증을 통과했다.

- 수정 파일 대상 ESLint 통과
- `npm run build` 통과
- `git diff --check` 통과

전체 `npm run lint`는 현재 `.venv` 내부 JavaScript와 기존
`AutoFillPanel.jsx`, `SegmentCutout.jsx` 오류 때문에 실패한다. 이번 작업에서
수정한 `DecisionBoard.jsx`와 `SpatialMap.jsx`는 개별 ESLint를 통과했다.

새 작업을 이어갈 때 최소한 다음을 다시 확인한다.

```bash
npm run lint
npm run build
```

수동 UI 확인 포인트:

1. 첫 진입이 Storyboard 제작 화면인가
2. Decision/Lens 화면에서 batch bar가 숨는가
3. Selected 범위가 다른 화면으로 이동할 때 해제되는가
4. Add shot이 현재 위치에서 바로 동작하는가
5. 마지막 shot 삭제가 막히는가
6. Draw가 분할 화면을 여는가
7. Focus와 Exit Focus가 Canvas 내용을 유지하는가
8. Beat 클릭 시 대본, shot, Canvas가 함께 바뀌는가
9. 빈 shot으로 이동했을 때 이전 이미지가 남지 않는가

---

## 10. Git 상태 메모

이 문서를 갱신하기 직전의 상태:

- 브랜치: `feature/scene-flow-fill`
- 원격: `origin/feature/scene-flow-fill`
- 커밋 직전 작업 트리에 Creative Lens와 Decision Board 변경이 남아 있었음
- 최근 기능 커밋:
  - `48fa9f4 feat: rework script authoring and cut plan into a stepwise flow`
  - `c9499d3 feat: add cut plan stage between script and panels`
  - `a3335cd feat: add narrative script workspace and draft flow`

이 숫자는 이후 커밋과 push에 따라 달라질 수 있으므로, 실제 재개 시에는
`git status --short --branch`로 다시 확인한다.
