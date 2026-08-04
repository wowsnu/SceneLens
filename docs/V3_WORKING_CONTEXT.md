# SceneLens v3 작업 맥락과 인수인계

- 마지막 정리: 2026-08-04
- 작업 브랜치: `feature/scene-flow-fill`
- 구현 기준 커밋: `05bfe6c`
- 관련 설계: [`SCENELENS_DECISION_SYSTEM_SPEC.md`](./SCENELENS_DECISION_SYSTEM_SPEC.md)
- 코드 감사: [`V3_AGENT_ARCHITECTURE_AUDIT.md`](./V3_AGENT_ARCHITECTURE_AUDIT.md)
- 패널 생성 설계: [`PANEL_GENERATION_DESIGN.md`](./PANEL_GENERATION_DESIGN.md)
  (프롬프트는 컷에서 조립. Agent를 새로 띄우지 않고 Option card로.
  비구속 표시 미결 → DG1 P3로 흡수, §1.1 참조)
- 서사 렌즈 재프레이밍: [`NARRATIVE_LENS_AS_JULCONTI.md`](./NARRATIVE_LENS_AS_JULCONTI.md)
  (서사 렌즈 = 줄콘티의 계산적 구현. 근거는 전문가 formative 세션)
- **Design Goal (2026-08-04 재구성)**: [`design_goal.md`](./design_goal.md)
  — 구현 우선순위의 상위 기준. 아래 §1.1 참조

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

### 1.1 Design Goal (2026-08-04 재구성)

DG가 4개(expose → negotiate → commit → verify)에서 **3개 / 연산 4개**로
재구성됐다. 전체 서술은 [`design_goal.md`](./design_goal.md)에 있고, 여기에는
구현 판단에 필요한 만큼만 옮긴다.

**프레임.** 스토리보드에서 부재는 비워진 상태가 아니라 설계 대상이다. 화면에
없는 것이 보완해야 할 **결손**인지 후속 공정에 맡긴 **위임**인지 구분하는 것이
핵심이다.

**연산 4개.** 드러내기(surface) – 구분하기(distinguish) – 보완하기(repair) –
재검토하기(reappraise)

| | 위치 | 다루는 것 | 연산 |
|---|---|---|---|
| **DG1** | 의도 → 작품 | 미결 | surface + distinguish |
| **DG2** | 작품 | 기결의 변경 | repair |
| **DG3** | 작품 → 관객 | 기결의 읽힘 | reappraise |

순서대로 한 번 거치는 단계가 아니라 순환이다. DG3에서 발견된 어긋남은 원인이
있는 층위(DG1의 선언 갱신 또는 DG2의 개입)로 되돌아간다. **발견과 처분을
분리하는 것**이 핵심이며, 모든 어긋남이 패널 재생성으로 흘러가는 우회를 막는다.

#### 구현 순서에 영향을 주는 연결

`design_goal.md`의 DG1 → DG3 연결이 병목을 지정한다.

> 무엇을 담지 않을지 먼저 선언해야 관객 검토가 실제 결손만 가리킨다.

즉 **DG1 P3(이미지가 책임질 범위를 선언한다)가 DG3보다 먼저**여야 한다. P3가
없으면 Viewer Agent는 의도적으로 비워둔 것까지 전달 실패로 보고한다.

P3는 또한 `PANEL_GENERATION_DESIGN.md` §4.3이 미결로 남긴 "비구속을 어떻게 보일
것인가"와 같은 문제다. 별개 설계가 아니다.

#### P3 구현에서 정해진 것 (2026-08-04)

세 가지가 초안에서 바뀌었다. 셋 다 사용자 지적에서 나왔다.

**축은 책임 하나다.** 초기 `shared_decision_state_revised.png`에는 구속 강도
(엄격히 고정 / 범주 내 허용 / 자유)가 함께 있었으나 제거했다. 재생성이 없는
동안 `strict`만 동작하고 나머지 둘은 코드상 구분이 없어 고를 이유가 없었다.
더 근본적으로는 P4와 어긋난다 — 무엇을 얼마나 묶을지는 결과를 보기 전에 정할
수 있는 것이 아니다. **`이미지에서 확정`이 곧 이후 생성의 제약**이 된다.
`design_goal.md` P1·P3도 함께 고쳤다.

**`방향만 표시`는 중간 강도가 아니라 결정을 둘로 쪼개는 상태다.** 방향은
스토리보드가 정하고 값은 후속 공정에 남는다 — 카메라가 어느 쪽으로 움직이는지는
표시하되 속도·거리는 정하지 않는다. 그래서 선언에 `direction` 필드가 있다.
채널(`OFFIMAGE_CHANNELS`)은 그 방향을 어디에 기록하느냐이지 그 자체가 답이
아니다.

**선언 단계를 따로 두지 않는다.** 초안에는 컷 확정과 패널 사이에 `책임 범위`
화면을 넣었으나 제거했다. 아무것도 보지 못한 상태에서 조명·의상·질감을 판정하게
하는 것은 P4와 정면으로 부딪힌다 — 창작자는 결과를 보기 전에 무엇을 원하는지 다
알지 못한다.

DG1 → DG3 연결은 **선언이 생성보다 앞설 것**을 요구하지 그것이 별도 화면일 것을
요구하지 않는다. 판정은 Shot Inspector의 `책임 범위` 목록에서 그림을 보며 한다.

되돌릴 수 없는 선언(여러 컷에 걸치는 인물 외형 일관성)만 생성 버튼 옆에
붙여 묻는 안도 만들어 봤으나 제거했다. 생성 바가 이미 범위 선택·Accept
all·Generate로 붐벼서 카드가 하나만 붙어도 화면이 지저분해졌다. 지금은
이것도 인스펙터에서 판정한다.

**AI 제안은 확정처럼 보이면 안 된다.** 제안에도 기본 responsibility가 있어
칩이 칠해져 있었고, 그래서 아무도 누르지 않은 값이 프롬프트의 `고정:` 줄에
이미 들어가 있었다. 판정 전 칩은 점선·빈 배경으로 두고 카드에 `미정`을 단다.

**판정하는 자리는 하나다.** 축마다 결과가 다른 곳에 뜬다 — `이미지에서 확정`은
프롬프트 `고정:` 줄, `위임`은 "이 그림이 정하지 않는 것", `방향만 표시`는 패널
화살표. 결과는 여러 곳에 보이되 **고치는 것은 언제나 인스펙터의 `책임 범위`
목록**에서 한다. 판정한 선언도 목록에 남겨 제약을 해제할 수 있게 한다 (P4).

**컷에서 Fixed/Tentative/Open을 제거했다.** 책임 축이 생기고 나니 세 값이
각각 다른 축의 일이었다.

- `Open`("검토 후 의도적으로 열어둠")은 책임 축의 **위임**과 같은 말이었다.
  둘 다 "일부러 안 정했고 후속 공정이 정하며 누락이 아니다"를 뜻한다.
- `Fixed`는 프롬프트에 아무 영향도 주지 않고 색만 바꾸고 있었다. 실제 제약은
  이제 `이미지에서 확정` 선언이 만든다.
- `Tentative`("미검토, AI가 채운 가정일 수 있음")는 **`provenance`가 이미
  말하고 있다.** AI가 만든 뒤 사용자가 손대지 않았으면 미확인 컷이다.

그래서 컷에 남은 축은 `provenance`(AI/User) 하나다. 컷 플랜 표의 왼쪽 선과
푸터의 "미확인 N"이 이것을 표시하고, 프롬프트만 고친 경우에는 출처가 바뀌지
않는 기존 가드가 그대로 유지된다.

Spec §7은 아직 Decision status를 정의하고 있다. 컷에는 적용하지 않지만
Decision 객체 자체에는 남아 있으므로 지우지 않았다 — Decision 데이터 구조를
별도 slice로 만들 때 다시 판단한다.

**이미지 밖 채널은 패널 위에 표시된다.** 목록의 글자로만 두면 "그림 밖 채널에
기록한다"가 성립하지 않는다. `OFFIMAGE_CHANNELS`의 각 항목이 `mark`를 갖는다.

| mark | 표현 | 채널 |
|---|---|---|
| `arrow` | 패널 위 화살표 — **사용자가 직접 그린다** | 움직임 화살표, 카메라 이동 |
| `corner` | 모서리 배지 | 타임코드 |
| `note` | 패널 아래 텍스트 | 액팅 메모, 카피 |

화살표를 방향 문구에서 유추해 자동으로 그리려던 초안은 폐기했다. 카메라가 어느
쪽으로 움직이는지는 감독이 화면을 보고 정하는 것이지 텍스트에서 읽을 것이
아니다. 유추한 화살표는 창작자가 말하지 않은 것을 화면이 주장하게 만든다.

지금은 패널 아래 `화살표` 버튼을 눌러 그리기 모드로 들어가고, 그림 위를 끌어서
그린다. 그린 화살표를 클릭하면 지워진다. 좌표는 패널 크기와 무관하게 0~1 비율로
`shot.arrows`에 저장된다(`addShotArrow` / `removeShotArrow`).

버튼이 패널 **밖**에 있는 이유: 화살표는 그림을 고치는 것이 아니라 그림 밖
채널이다. 패널 위 `Draw`(그림 수정)와 자리를 나눠야 두 일이 섞이지 않는다.

선언은 했는데 아직 화살표를 그리지 않은 컷은 패널 아래 목록에 `needsArrow`로
표시된다 — 선언해 놓고 그리지 않으면 그 지시는 어디에도 남지 않는다.

미판정(`Proposed`) 방향 선언도 패널까지 온다. 방향은 대개 컷이 이미 말한 것을
옮겨 적은 것이라, 판정 전이라고 감추면 컷에 있는 정보가 패널에서 사라진다.
대신 흐리게 표시해 확정과 구분한다.

그리고 패널마다 자유 텍스트 메모(`shot.note`, `setShotNote`)가 있다. 선언으로
잡히지 않는 지시가 갈 자리다. 갈 곳이 없으면 결국 누락되기 때문이다.

메모는 포스트잇처럼 그림 위에 붙는다. 상시 입력칸으로 두면 쓰지 않은 패널까지
빈 칸을 달고 있어 스토리보드가 어지러워진다. 없으면 자리를 차지하지 않고,
추가 버튼은 패널 hover에서만 나타난다.

#### 컷을 가로지르는 기준 (2026-08-04)

생성 단위는 컷이지만 기준은 씬에 있어야 한다. 컷마다 프롬프트를 따로 조립하면
컷 1의 '관제실'과 컷 5의 '관제실'이 각자 해석되어 다른 방이 된다. 한 번에
생성하든 하나씩 하든 같다 — 순서 문제가 아니라 공유 상태가 없는 문제다.

`useStore`의 `sceneState`가 그 기준이다. `buildCutPrompt`가 컷에 등장하는
인물과 공간의 기준을 프롬프트에 넣으므로, 한 곳을 고치면 그 인물이 나오는 모든
컷이 함께 바뀐다 (DG2 P2: 여러 컷을 가로지르는 것은 개별 이미지가 아니라 편집
가능한 구조로 표현하고, 구조를 바꾸면 관련 패널에 반영되게 한다).

`open: true`인 항목은 프롬프트에 넣지 않는다. 미정을 문장으로 만들면 모델이
그것을 정해버린다. `setSceneFact`로 값을 채우면 `open`이 풀리고 그때부터
반영된다.

**아직 연결되지 않은 것:** `DecisionBoard.jsx`의 미장센 `Scene State` 화면이
같은 정보를 `MOCK_MISE_SCENE_STATE` + 로컬 `useState`로 따로 들고 있다. 그래서
그 화면에서 인물 카드를 고쳐도 프롬프트는 바뀌지 않는다. `sceneState`는 그
상수와 같은 모양으로 만들어 두었으므로, `useState`를 `useStore`로 바꾸면
연결된다. 그 파일은 이번 작업에서 건드리지 않았다(미커밋 변경이 남아 있음).

#### 구 DG 번호를 만나면

이전 문서의 DG 번호는 이 표와 대응하지 않는다. 재구성 전 번호를 쓰는 곳은
현재 `NARRATIVE_LENS_AS_JULCONTI.md`와 `PANEL_GENERATION_DESIGN.md` 두 곳뿐이고,
둘 다 갱신하면서 주석을 달아두었다. 그 밖에서 DG 번호를 만나면 재구성 전
문서일 수 있으니 `design_goal.md`를 기준으로 다시 확인한다.

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

`Hide panels` 토글은 Panels 단계에서만 보인다. 컷을 확정하기 전에는 패널
자체가 없으므로 토글이 의미를 갖지 않는다.

Narrative rail의 `Create Script`는 이후 제거했다(6.9 참고). 전체 대본을
한 번에 만드는 대신 줄글 → 대본 → Beat 순으로 단계적으로 진행한다.

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

### 6.8 대본 입력과 인라인 편집

기준 커밋: `48fa9f4`

- 첫 화면을 `Write scene`으로 바꾸고 대본을 빈 상태에서 시작한다.
  예시는 줄글 형태의 거친 초안과 정리된 대본 두 가지를 고를 수 있다.
- Script 단계에서 대본을 줄 단위로 그 자리에서 고친다. 별도 raw 편집기를
  열고 전체를 다시 붙여넣지 않아도 되며 beat 구조가 보존된다.
  - Enter는 커서 뒤 내용을 새 줄로 넘기고 커서가 따라간다.
  - 줄 맨 앞 Backspace는 앞 줄과 합친다.
  - 위아래 화살표로 줄 사이를 오간다.
- 줄 종류 변경과 삭제는 Beat 헤더의 `줄 편집`으로 모았다. 줄마다 버튼이
  hover로 튀어나오면 대본 읽기를 방해한다.
- Beat 헤더에서 Beat 추가·합치기. 빈 Beat는 존재할 수 없으므로 빈 줄
  하나를 함께 만든다.

주의: 기존 `Apply to Storyboard` 경로는 여전히 모든 줄을 `beat: 0`으로
초기화한다. 인라인 편집만 beat를 보존한다.

### 6.9 단계 분리와 Narrative rail

기준 커밋: `c9499d3`, `48fa9f4`

Script / Cut plan / Panels를 화면 단위로 구분했다.

- `selectCutStage`로 단계 파생을 한 곳에 모아 컴포넌트 간 기준이 어긋나지
  않게 한다.
- 단계 이동은 작업을 지우지 않는다. 삭제는 명시적 Discard에서만 일어난다.
- rail의 `Create Script`를 제거하고, 상태를 보고 다음 단계를 먼저 제시한다.
  줄거리 → 대본으로 다듬기 → Beat 나누기 → 컷 플랜.
- `대본으로 다듬기`는 지문·대사 분리와 Beat 나누기를 한 번에 하고 전체
  초안으로 검토받는다.
- 보조 동작은 언제나 건너뛰기로 고정한다. 상황에 따라 삭제로 바뀌면 같은
  자리의 버튼이 다른 일을 하게 된다.

### 6.10 줄콘티(Cut plan)

기준 커밋: `c9499d3`, `48fa9f4`

대본과 패널 사이의 경유 단계. 설계 근거는
[`NARRATIVE_LENS_AS_JULCONTI.md`](./NARRATIVE_LENS_AS_JULCONTI.md).

- 현업 관행대로 `shotSize`, `angle`, `cameraMove`까지 포함한다. 하위 Lens는
  이 값을 처음 정하는 주체가 아니라 Tentative 제안을 검토하는 주체다.
- 표 형태로 컷을 나란히 놓는다.
  (컷 / 시간 / 장소 / 내용 / 중요한 것 / 인물 / 샷 / 상태)
- 컷 번호는 `1-1`, `2-1` 형식이라 Beat 구조가 번호에 드러난다. 순서를
  바꾸면 `beatOrder`도 함께 재계산된다.
- Beat별로 묶고 접었다 펼 수 있다.
- 항목별 `Fixed / Tentative / Open` 상태와 `User / AI` 출처. 상태 전환은
  출처를 바꾸지 않는다(Spec §8.2).
- Skip은 자동 생성하되 건너뛴 사실을 기록해 전부 Tentative로 남긴다.

`Accept cut plan`이 컷 구성을 패널에 반영한다.

- 컷 개수 = 패널 개수, 컷의 `shotSize`가 패널 `cir`가 된다.
- 패널에 `cutPlanItemId`가 붙어 출처가 남는다.
- 이미 그린 그림은 컷을 재배열해도 따라 이동한다.
- 연결되지 못한 그림은 조용히 버리지 않고 경고로 알린다. 다만 현재는
  경고만 하고 복구는 하지 못한다.

### 6.11 Beat 분할·병합의 불변성

기준 커밋: `60ece55` 이후

`splitBeat`와 `mergeBeat`는 `[...state.screenplay]` 얕은 복사 후
`element.beat`를 직접 변형하고 있었다. 원본 요소를 건드리므로 모듈 상수인
`SCREENPLAY`, `ROUGH_SCREENPLAY`까지 오염되어, Beat를 한 번 나눈 뒤 예시
대본을 다시 불러오면 이미 나뉜 상태가 나왔다.

둘 다 `map`으로 새 객체를 만들도록 고쳤다. Beat 번호를 0부터 빈 틈 없이
다시 매기는 동작은 그대로다.

### 6.12 컷에서 프롬프트 조립과 Shot Inspector

기준 커밋: `05bfe6c`. 설계 근거는
[`PANEL_GENERATION_DESIGN.md`](./PANEL_GENERATION_DESIGN.md).

`buildCutPrompt`가 컷에서 프롬프트를 조립한다. 사용자가 백지에서 쓰지
않는다(Spec §22.12).

- place + time + angle + shotSize → 첫 문장
- content → 무슨 일이 일어나는가. 대사 컷은 `"..."라고 말하는 순간`으로
  감싼다. 그대로 두면 이미지 모델이 글자를 그리려 한다
- characters → 앞 문장에 이미 나온 인물은 제외하고 나열
- purpose → 묘사가 아니라 구도 지시로 번역 (`PURPOSE_PHRASES`)
- 앵글은 기본값(Eye level)일 때 적지 않는다

조립된 프롬프트는 그 자리에서 고칠 수 있다(`promptOverride`).

- 프롬프트 문구만 고치면 컷 출처는 AI로 유지되고 프롬프트만 User가 된다.
  샷 사이즈나 내용 같은 결정을 고쳐야 컷 출처가 User로 바뀐다.
- `되돌리기`로 조립분을 회복한다. 고친 상태에서도 컷 기준 문장을 함께
  보여줘 어긋남을 알아챌 수 있게 한다.
- 조명·그림체처럼 장면 전체에 걸리는 지시는 `scenePromptNote`로 따로 둔다.

Panels 단계에서 패널을 클릭하면 rail 자리에 `ShotInspector`가 열린다.

- 샷 사이즈 / 앵글 / 카메라 / 시간 / 장소 / 인물 / 중요한 것
- 출처(AI / User). 컷에 Fixed/Tentative/Open 축은 없다 — §1.1 참조
- 프롬프트 편집
- **인스펙터가 고치는 것은 패널이 아니라 컷이다.** 컷 플랜 표와 같은
  데이터를 보므로 한쪽을 고치면 다른 쪽도 바뀐다

---

## 7. 아직 구현되지 않았거나 Mock인 부분

현재 UI가 보여준다고 해서 아래 기능이 실제 Agent 파이프라인으로 완성된 것은
아니다.

- Narrative request의 실제 LLM 호출
- Narrative scaffold의 영속 데이터 모델
- 실제 이미지 생성 API 연결. `createMockPanelImage`가 shot 순번으로 SVG를
  만들 뿐이고, **조립된 프롬프트가 아직 생성에 쓰이지 않는다**
- 실제 여러 패널 이미지 생성과 batch API
- AI candidate의 영속 저장과 생성 작업 상태
- Import를 포함한 완전한 네 가지 panel source UI
- canonical Decision 모델과 Decision Inventory
- Event Log 기반 provenance (현재 출처는 store 액션에서 직접 정한다)
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

부분적으로만 된 것:

- `Fixed / Tentative / Open`은 컷 플랜과 Shot Inspector에서 실제 상태로
  다루지만, 아직 생성 제약으로 쓰이지는 않는다(Spec §22.12 미구현).
- Shot Inspector는 현재 값을 고치는 데까지만 한다. 대안을 나란히 놓는
  Option Set은 없다(Spec §15).

새로 확인된 항목:

- 비구속(Tentative/Open) 요소를 화면에서 어떻게 보일지 미정.
  [`PANEL_GENERATION_DESIGN.md`](./PANEL_GENERATION_DESIGN.md) §4.3에 후보
  세 가지를 적어두었다.
- `Accept cut plan`에서 컷과 연결되지 못한 그림은 경고만 하고 사라진다.
  되돌리려면 Round/버전 개념이 필요하다(Spec §17).
- Decision Board 헤더의 `Edit Shot`이 `openDrawingWorkspace()`를 직접 불러
  단계 게이트를 우회한다. 다만 데이터를 망가뜨리지는 않고, 이 화면은
  script → cut → panel 흐름과 별개인 기존 Mock이라 그대로 두었다.
  막으려면 "컷 확정 전의 Decision Board는 무엇인가"를 먼저 정해야 한다.

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
설계는 [`PANEL_GENERATION_DESIGN.md`](./PANEL_GENERATION_DESIGN.md) §5에
정리했고, 현재 1·2단계까지 왔다.

1. ~~컷 → 프롬프트 조립을 mock으로 붙인다~~ (완료, 6.11)
2. ~~조립된 프롬프트 + 편집 UI~~ (완료, 6.11)
3. **조립된 프롬프트를 실제 이미지 생성 호출에 연결한다.** 우선 한 패널의
   생성 → candidate 검토 → Accept를 완성한다.
4. 위임한 요소가 확정처럼 보이지 않게 하는 방법을 정한다. 방향만 표시는
   오버레이로 해결됐으나, 위임(그림이 정하지 않음)은 여전히 Shot Inspector의
   목록뿐이다. 이미지 모델이 그린 디테일이 결정으로 둔갑하는 문제라
   실제 이미지가 나와야 판단이 선다.
5. Shot Inspector를 Option card로 확장한다. 현재 값 옆에 대안을 효과·비용과
   함께 놓는다(Spec §15).
6. 같은 계약을 Beat/Selected/All blanks batch로 확장한다.

3번을 먼저 하는 이유: 4·5번의 판단이 실제 생성 결과에 달려 있다.

### 초기 hybrid Board가 안정된 뒤

1. 최소 Decision 데이터 구조를 별도 store/slice로 만든다.
2. Event Log로 User/AI provenance를 기록한다.
3. 한 개의 Cinematography Decision에 대해 current choice와 Option Set을 만든다.
4. Preview와 Apply를 분리한다.
5. 책임 선언과 한 Round 적용을 연결한다.
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

단계 흐름

1. 첫 진입이 `Write scene`인가 (대본이 비어 있으므로)
2. `예시 · 거친 초안` → rail이 `대본으로 다듬기`를 제시하는가
3. 초안 수락 후 rail이 `Beat 나누기 제안`으로 바뀌는가
4. Beat가 나뉜 뒤 rail이 `컷 플랜 만들기`로 바뀌는가
5. 세 단계가 각각 다른 화면인가
   (Script=대본만, Cut plan=표만, Panels=대본+패널)
6. 단계 이동으로 되돌아가도 컷이 지워지지 않는가
7. 컷 확정 전에는 패널과 `Hide panels` 토글이 보이지 않는가

대본 편집

8. 줄 끝/중간에서 Enter가 커서를 새 줄로 옮기는가
9. 줄 맨 앞 Backspace가 앞 줄과 합치는가. 첫 줄에서는 아무 일이 없는가
10. Beat 헤더의 `줄 편집`으로만 줄 도구가 드러나는가

컷 플랜과 패널

11. 컷 번호가 `1-1`, `2-1` 형식이고 순서를 바꾸면 다시 매겨지는가
12. Beat 그룹을 접었다 펼 수 있는가
13. 가로 스크롤 없이 표가 들어오는가
14. `Accept cut plan` 후 패널 수가 컷 수와 같은가
15. 이미 그린 그림이 컷 재배열을 따라 이동하는가
16. 패널을 클릭하면 Inspector가 열리고, 거기서 고친 값이 컷 플랜 표에도
    반영되는가
17. 프롬프트만 고쳤을 때 컷 출처가 AI로 남는가

---

## 10. Git 상태 메모

이 문서를 갱신하기 직전의 상태:

- 브랜치: `feature/scene-flow-fill`
- 원격: `origin/feature/scene-flow-fill`
- 최근 기능 커밋:
  - `05bfe6c feat: prototype creative lens decision workflows`
    (Creative Lens/Decision Board 작업과 프롬프트 조립·Shot Inspector가
    한 커밋에 함께 들어갔다)
  - `48fa9f4 feat: rework script authoring and cut plan into a stepwise flow`
  - `c9499d3 feat: add cut plan stage between script and panels`

이 숫자는 이후 커밋과 push에 따라 달라질 수 있으므로, 실제 재개 시에는
`git status --short --branch`로 다시 확인한다.
