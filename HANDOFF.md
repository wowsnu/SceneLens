# SceneLens v2 — 인수인계 문서

## 프로젝트 개요

SceneLens는 영화 감독/스토리보드 작가를 위한 AI 기반 촬영 구도 설계 도구입니다.
사용자가 스케치를 그리면 AI가 촬영 구도(CIR)를 분석하고, 영화 이론 DB를 기반으로 대안 전략을 제안합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React + Vite |
| 백엔드 | FastAPI (Python) |
| AI | Google Gemini API (gemini-3-flash-preview) |
| 인프라 | AWS EC2 (Amazon Linux 2023) |
| 배포 | GitHub Actions (CI/CD) |

---

## 레포지토리 구조

- **백엔드**: `github.com/wowsnu/SceneLens` (이 레포)
- **프론트엔드**: 별도 레포 (미생성)

---

## 백엔드 구조

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱 진입점
│   ├── models/
│   │   └── schemas.py       # CIR, Strategy 등 데이터 모델
│   ├── routes/
│   │   ├── sketch.py        # POST /api/analyze-sketch
│   │   ├── strategy.py      # POST /api/suggest-strategies
│   │   ├── overlay.py       # POST /api/generate-overlay
│   │   └── image_gen.py     # POST /api/generate-sketch 등
│   ├── services/
│   │   ├── sketch_analyzer.py   # Gemini Vision으로 CIR 추출
│   │   ├── strategy_engine.py   # Theory DB 필터링 + 전략 생성
│   │   ├── overlay_generator.py # 오버레이 이미지 생성
│   │   └── image_generator.py   # 스케치 생성
│   ├── prompts/
│   │   ├── sketch_to_cir.txt    # CIR 추출 프롬프트
│   │   ├── strategy_suggest.txt # 전략 생성 프롬프트
│   │   ├── overlay_guide.txt    # 오버레이 생성 프롬프트
│   │   ├── enhance_sketch.txt
│   │   └── generate_sketch.txt
│   ├── db/
│   │   └── theory_db.json   # 영화 이론 DB (2079 유닛, 2042 ops, 10권)
│   └── tools/
│       └── db_builder/      # PDF → theory_db 빌드 스크립트
└── requirements.txt
```

---

## 핵심 개념: CIR (Cinematic Intermediate Representation)

스케치에서 추출하는 8개 촬영 속성:

| 속성 | 설명 | 예시 값 |
|------|------|---------|
| shotSize | 프레이밍 | Wide, Medium, Close |
| cameraAngle | 수평 각도 | High, Neutral, Low, Dutch |
| cameraLevel | 수직 높이 | High, Eye, Low |
| relation | 인물 배치 | Single, Two-shot, OTS |
| blockingDistance | 인물 간 거리 | Far, Mid, Near |
| eyeline | 시선 방향 | Face-to-face, Averted |
| occlusion | 가림 여부 | None, Partial |
| motionHint | 움직임 힌트 | Static, Moving |

---

## 전략 엔진 동작 방식

```
스케치 (base64)
    ↓
Gemini Vision → CIR 8개 속성 + alignment(한국어)
    ↓
theory_db에서 2단계 필터링
  Stage 1: CIR 속성 → related_dimensions 키워드 매핑 (+1점)
  Stage 2: 감독 의도 → soft_tags 매핑 (+2점)
    ↓
상위 15개 이론 선별
    ↓
Gemini: 15개 이론 중 선택해서 전략 2~3개 생성
  (CIR 2~4개 속성만 변경, 한국어 이론 근거 포함)
    ↓
전략 A/B/C → 오버레이 이미지 생성 (선택 시)
```

---

## Theory DB

- **위치**: `backend/app/db/theory_db.json`
- **규모**: 2079 theory units, 2042 operations, 10권
- **출처 도서**: Five C's of Cinematography, Grammar of the Film Language, Master Shots, Film Directing Shot by Shot, The Filmmaker's Eye, Dialogue, Walter Murch, Robert McKee, Art of the Storyboard 등
- **operation 없는 유닛**: 500개 (24%) — intent 태그로만 매칭 가능, CIR 변경 제안 약함
- **DB 재빌드**: `backend/app/tools/db_builder/extract_pdf_to_db.py` 사용

---

## 인프라

### EC2
- **IP**: `13.238.143.131`
- **OS**: Amazon Linux 2023
- **유저**: `ec2-user`
- **Python 가상환경**: `/home/ec2-user/SceneLens/.venv`
- **환경변수**: `/home/ec2-user/SceneLens/.env` (GEMINI_API_KEY)

### 서버 실행 (systemd)
재부팅 시 자동 시작, 죽으면 자동 재시작으로 등록됨.

```bash
sudo systemctl start scenelens
sudo systemctl stop scenelens
sudo systemctl restart scenelens
sudo systemctl status scenelens
```

### 로그 확인
```bash
sudo journalctl -u scenelens -f
```

### CI/CD
- `main` 브랜치에 push하면 GitHub Actions가 자동으로 EC2에 배포
- 워크플로우: `.github/workflows/deploy.yml`
- 배포 과정: `git pull` → `pip install` → `systemctl restart`
- GitHub Secret 필요: `EC2_SSH_KEY` (EC2 pem 키 내용)

---

## 로컬 개발 환경

### 백엔드 실행
```bash
cd SceneLens/v2
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 프론트엔드 실행
```bash
cd SceneLens/v2
npm run dev
```
- 태블릿 등 외부 기기 접속 시: `npm run dev -- --host`
- API 엔드포인트: `src/services/api.js` (현재 EC2 IP 고정)

### 환경변수
```
GEMINI_API_KEY=...
PORT=8000
```

---

## API 엔드포인트 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/analyze-sketch` | 스케치 → CIR 분석 |
| POST | `/api/suggest-strategies` | CIR + 의도 → 전략 2~3개 |
| POST | `/api/generate-overlay` | 전략 → 오버레이 이미지 |
| POST | `/api/generate-sketch` | 텍스트 → 스케치 생성 |
| POST | `/api/enhance-sketch` | 스케치 보정 |
