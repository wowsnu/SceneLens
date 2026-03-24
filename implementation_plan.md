# SceneLens v2 — Full-Stack Rebuild Plan

AI 기반 Cinematic Design Assistant를 **React (Vite) + Express + Gemini Vision API** 풀스택으로 재구축합니다.
기존 Vanilla JS 프로토타입(2,600줄 단일 파일)의 UI 컨셉을 계승하되, **실제로 동작하는 연구 시스템**으로 탈바꿈합니다.

> [!IMPORTANT]
> 이 계획은 **6개의 독립적인 Phase**로 나뉘어 있으며, 각 Phase가 끝날 때마다 동작을 확인하고 다음으로 넘어갑니다. 한꺼번에 전부 만들지 않습니다.

---

## Proposed Changes

### Phase 1: Project Scaffolding

프로젝트 기반 세팅. Vite + React 프론트엔드와 Express 백엔드를 monorepo 스타일로 구성합니다.

#### [NEW] 프로젝트 구조

```
SceneLens-v2/
├── client/                    ← Vite + React
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css          ← 글로벌 디자인 시스템
│   │   ├── components/        ← React 컴포넌트
│   │   ├── hooks/             ← 커스텀 훅
│   │   ├── services/          ← API 호출 함수
│   │   └── stores/            ← Zustand 상태관리
│   └── vite.config.js
│
├── server/
│   ├── index.js               ← Express 메인 서버
│   ├── routes/
│   │   ├── sketch.js          ← POST /api/analyze-sketch
│   │   └── strategy.js        ← POST /api/suggest-strategies
│   ├── services/
│   │   ├── sketchAnalyzer.js  ← Gemini Vision API → CIR 8속성
│   │   └── strategyEngine.js  ← Intent + CIR → DB 매칭 → 전략
│   ├── db/
│   │   └── theory_db.json     ← 5권 병합 DB
│   └── prompts/
│       ├── sketch_to_cir.txt
│       └── strategy_suggest.txt
│
├── package.json               ← Root scripts (dev, build)
└── .env                       ← GEMINI_API_KEY
```

**기술 스택**:
- **Frontend**: Vite + React 18, Zustand (상태관리), CSS Modules
- **Backend**: Express.js, `@google/generative-ai` (Gemini SDK)
- **DB**: JSON 파일 기반 (SQLite 불필요 — 연구 프로토타입)

---

### Phase 2: 핵심 파이프라인 — Sketch → CIR 8속성 분석

SceneLens의 가장 중요한 기능. 감독의 스케치 이미지를 Gemini Vision에 보내 8가지 속성값을 자동 추출합니다.

#### [NEW] [sketchAnalyzer.js](file:///Users/sangwoo/Desktop/HCI/SceneLens-v2/server/services/sketchAnalyzer.js)
- Gemini `gemini-2.0-flash` 모델에 이미지(base64) + 시스템 프롬프트 전송
- 시스템 프롬프트: "이 스토리보드 스케치를 분석하여 8가지 CIR 속성값을 JSON으로 리턴하라"
- 응답 파싱 → `{ shotSize, cameraAngle, cameraLevel, relation, blockingDist, eyeline, occlusion, motionHint }` 리턴

#### [NEW] [sketch.js (라우트)](file:///Users/sangwoo/Desktop/HCI/SceneLens-v2/server/routes/sketch.js)
- `POST /api/analyze-sketch` — body: `{ image: base64, script_context: string }`
- sketchAnalyzer 호출 → CIR 결과 + 스케치 설명(alignment) 리턴

---

### Phase 3: Theory DB 엔진 — Intent + CIR → 전략 제안

5권의 이론서 DB를 활용하여 감독의 의도에 맞는 **2~3개의 분기형 전략(Branching Strategies)**을 생성합니다.

#### [NEW] [theory_db.json](file:///Users/sangwoo/Desktop/HCI/SceneLens-v2/server/db/theory_db.json)
- 기존에 만든 5개 JSON 파일(arijon, mastershots, fivecs, shotbyshot, filmmakerseye)을 **하나의 통합 파일**로 병합

#### [NEW] [strategyEngine.js](file:///Users/sangwoo/Desktop/HCI/SceneLens-v2/server/services/strategyEngine.js)
- 입력: `{ cir: {8속성}, intent: string, script_context: string }`
- DB에서 `intention_tags`, `soft_tags`, `applies_when` 기반으로 관련 Theory Units 필터링
- Gemini API에 "현재 CIR + 의도 + 관련 이론들"을 보내 전략 2~3개 생성 요청
- 각 전략: `{ name, shots: [{순서, CIR변화, 이론근거, 출처}], intention_tags }`

#### [NEW] [strategy.js (라우트)](file:///Users/sangwoo/Desktop/HCI/SceneLens-v2/server/routes/strategy.js)
- `POST /api/suggest-strategies` — body: `{ cir, intent, script_context }`

---

### Phase 4: React UI — 핵심 컴포넌트

기존 프로토타입의 UI 컨셉을 **React 컴포넌트**로 재구축합니다.

#### 주요 컴포넌트 목록

| 컴포넌트 | 역할 |
|---|---|
| `App.jsx` | 전체 레이아웃 + 뷰 모드 전환 |
| `ScriptPanel.jsx` | 대본 표시 + 비트(Beat) 하이라이트 |
| `CanvasWorkspace.jsx` | 스케치 드로잉 캔버스 + 오버레이(삼분할선 등) |
| `IntentBar.jsx` | 감독 의도 입력 + Analyze 버튼 |
| `StrategyTabs.jsx` | 전략 A/B/C 탭 전환 |
| `ShotGuidance.jsx` | CIR 8속성 표시 + 이론 근거 + 영화 레퍼런스 |
| `ShotStrip.jsx` | 하단 샷 프로그레션 썸네일 스트립 |

---

### Phase 5: Scene Flow Graph + Branching

논문의 핵심 시각화. 전략별 샷 시퀀스를 **분기형 노드 그래프**로 표현합니다.

#### [NEW] `SceneFlowGraph.jsx`
- SVG 기반 노드-엣지 그래프
- 전략별로 색상이 다른 경로(A=초록, B=보라, C=빨강)
- 노드 클릭 시 해당 샷의 CIR 속성 및 이론 패널로 연동

---

### Phase 6: 통합 테스트 & 폴리시

- 전체 파이프라인 E2E 테스트 (스케치 업로드 → 분석 → 전략 제안 → UI 표시)
- UI 디자인 폴리시 (다크 모드, 마이크로 애니메이션, 반응형)
- 에러 처리 및 로딩 상태

---

## User Review Required

> [!IMPORTANT]
> **Gemini API Key**: 제공해주신 키(`AIzaSyBvQ59W...`)를 `.env` 파일에 저장하여 사용합니다.
> 혹시 이 키가 만료되었거나 Gemini Vision(gemini-2.0-flash) 모델 접근 권한이 없다면, [Google AI Studio](https://aistudio.google.com)에서 새 키를 발급받으셔야 합니다.

> [!WARNING]
> **프로젝트 위치**: 기존 `SceneLens/` 폴더는 건드리지 않고, **새로운 `SceneLens-v2/` 폴더**를 `Desktop/HCI/` 아래에 생성합니다. 기존 프로토타입은 디자인 레퍼런스로 계속 참고합니다.

---

## Verification Plan

### Phase 1 검증
- `npm run dev` 실행 → 프론트(localhost:5173) + 백엔드(localhost:3001) 동시 기동 확인
- 브라우저에서 빈 React 앱 렌더링 확인

### Phase 2 검증 (핵심)
- `curl`로 `/api/analyze-sketch` 엔드포인트에 테스트 이미지(base64) 전송
- Gemini Vision 응답이 CIR 8속성 JSON 형태로 정상 파싱되는지 확인
- 브라우저 UI에서 캔버스에 그림 그리기 → "Analyze" 클릭 → 8속성 표시 확인

### Phase 3 검증
- `/api/suggest-strategies`에 CIR + Intent 전송
- 2~3개의 전략이 DB 이론 근거와 함께 리턴되는지 확인

### Phase 4~6 검증
- 브라우저에서 전체 플로우 수동 테스트: 대본 읽기 → 스케치 그리기 → 의도 입력 → 분석 → 전략 확인 → 씬 플로우 그래프 확인
