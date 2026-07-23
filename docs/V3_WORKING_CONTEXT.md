# SceneLens v3 작업 맥락과 인수인계

- 마지막 정리: 2026-07-23
- 작업 브랜치: `feature/scene-flow-fill`
- 구현 기준 커밋: `0865aee`
- 관련 설계: [`SCENELENS_DECISION_SYSTEM_SPEC.md`](./SCENELENS_DECISION_SYSTEM_SPEC.md)
- 코드 감사: [`V3_AGENT_ARCHITECTURE_AUDIT.md`](./V3_AGENT_ARCHITECTURE_AUDIT.md)

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

1. 현재 Storyboard 제작 → Draw 분할 → Focus → 복귀 흐름을 브라우저에서
   실제 사용자 동작으로 다시 확인한다.
2. Narrative mock 제안이 대본, Beat, shot 수를 바꿀 때 모든 active index와
   Canvas가 안정적으로 동기화되는지 확인한다.
3. `Blank / Draw / Generate / Import`가 패널 source로 일관되게 보이도록
   초기 Board 제작 흐름을 마무리한다.
4. Mock batch candidate를 실제 이미지 생성 호출에 연결하되, 우선 한 패널의
   생성 → candidate 검토 → Accept를 완성한다.
5. 그 다음 동일 계약을 Beat/Selected/All blanks batch로 확장한다.

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

`0865aee` 커밋 직전에 다음 검증을 통과했다.

- 수정 파일 대상 ESLint 통과
- `npm run build` 통과
- `git diff --check` 통과

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

이 문서를 만들기 직전의 상태:

- 브랜치: `feature/scene-flow-fill`
- 원격: `origin/feature/scene-flow-fill`
- 원격보다 로컬이 3개 커밋 앞서 있었음
- 최근 기능 커밋:
  - `0865aee feat: add storyboard drafting and split drawing workspace`
  - `d3f2db8 feat: prototype narrative agent and creative lens workflow`
  - `8aab13c feat: expand storyboard decision workflow`

이 숫자는 이후 커밋과 push에 따라 달라질 수 있으므로, 실제 재개 시에는
`git status --short --branch`로 다시 확인한다.
