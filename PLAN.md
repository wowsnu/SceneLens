# SceneLens v2 — Feature Redesign Implementation Plan

**Date:** 2026-03-28
**Scope:** Feature 1 (Reframe Lab — CIR Recommendations) + Feature 2 (Shot Guidance Redesign) + Feature 3 (Scene Flow)

---

## Why This Matters — Core Value Proposition

SceneLens is a **pre-editing storyboard composer**. Unlike video editing tools:
- Storyboard sketches are lightweight — fast to draw, fast to rearrange
- AI fills in missing shots (inserts, reactions, details) without heavy video assets
- Multiple editing alternatives can be explored in parallel before committing
- The director can validate shot flow and rhythm before any footage is shot or cut

This is especially valuable because modern filmmaking uses **many short cuts** — inserts, reaction shots, detail cuts — that are easy to miss in pre-production planning. Scene Flow lets you plan those sequences visually and precisely, with AI assistance.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [PDF Upload & Caching System](#2-pdf-upload--caching-system)
3. [New Backend Endpoints](#3-new-backend-endpoints)
4. [Prompt Design](#4-prompt-design)
5. [Frontend Changes](#5-frontend-changes)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Implementation Phases](#7-implementation-phases)
8. [Potential Issues & Mitigations](#8-potential-issues--mitigations)
9. [Feature 3: Scene Flow](#9-feature-3-scene-flow)

---

## 1. Architecture Overview

### Current Stack (Unchanged)

```
FastAPI (EC2)              React/Vite/Zustand
  main.py                    App.jsx
  routes/sketch.py           ShotPanel.jsx (tab host)
  routes/strategy.py           ├─ ReframePanel.jsx   ← Feature 1
  routes/image_gen.py          ├─ GuidanceTab.jsx    ← Feature 2
  services/sketch_analyzer.py
  services/strategy_engine.py  ← REPLACED for Feature 2
  services/image_generator.py
  models/schemas.py
  prompts/*.txt
  db/theory_db.json            ← RETIRED for Feature 2
```

### New Components to Add

```
Backend (new files):
  services/pdf_cache.py        ← PDF upload + 48hr cache manager
  services/cir_suggester.py    ← Feature 1 logic
  services/shot_guidance.py    ← Feature 2 logic
  routes/reframe.py            ← POST /api/suggest-cir-alternatives
  routes/guidance.py           ← POST /api/shot-guidance
  prompts/cir_alternatives.txt ← Feature 1 prompt
  prompts/shot_guidance.txt    ← Feature 2 prompt

Frontend (modified files):
  services/api.js              ← 2 new API functions
  store/useStore.js            ← 2 new state slices
  components/ReframePanel.jsx  ← "Suggest CIR" button + alternatives UI
  components/GuidanceTab.jsx   ← Complete redesign
  components/GuidanceTab.css   ← New styles
```

---

## 2. PDF Upload & Caching System

### 2.1 PDF Selection

| File | Priority |
|------|----------|
| Film Directing Shot by Shot | P1 — Core composition |
| Grammar of the Film Language | P1 — Foundational visual grammar |
| Master Shots | P1 — Direct CIR-adjacent techniques |
| The Filmmaker's Eye (Mercado) | P1 — Composition rules |
| The Five C's of Cinematography | P1 — Classic reference |
| Art of the Storyboard | P2 |
| In the Blink of an Eye | P2 — Editing/rhythm |
| Story (McKee) | P3 — Less relevant |
| Dialogue | P3 — Less relevant |

**Upload 5 P1 books at startup.**

### 2.2 `pdf_cache.py` Design

```python
# Module-level state
_file_cache: Dict[str, CacheEntry]
# CacheEntry: { file_uri, uploaded_at, display_name }

PDF_MANIFEST = [
  { "path": "{PDF_DIR}/Film Directing Shot by Shot...pdf", "display_name": "Film Directing Shot by Shot", "short_name": "shot_by_shot" },
  { "path": "{PDF_DIR}/Grammar of the film language...pdf", "display_name": "Grammar of the Film Language", "short_name": "grammar" },
  { "path": "{PDF_DIR}/Master shots...pdf", "display_name": "Master Shots", "short_name": "master_shots" },
  { "path": "{PDF_DIR}/The-Filmmaker-s-Eye...pdf", "display_name": "The Filmmaker's Eye", "short_name": "filmmakers_eye" },
  { "path": "{PDF_DIR}/The Five C's of Cinematography...pdf", "display_name": "The Five C's", "short_name": "five_cs" },
]

TTL = 47 * 3600  # 47 hours (Gemini's 48hr limit minus safety margin)

async def ensure_pdfs_loaded() -> None
  # Called at FastAPI startup via lifespan event
  # asyncio.gather() all 5 uploads in parallel

async def get_pdf_file_uris() -> List[types.Part]
  # Returns cached File parts, re-uploads expired ones
  # Called by cir_suggester.py and shot_guidance.py

async def _upload_pdf(pdf_info: dict) -> CacheEntry
  # client.files.upload() then poll until state == ACTIVE (max 120s)

def get_cache_status() -> dict
  # For /api/pdf-status health endpoint
```

**main.py integration:**
```python
from contextlib import asynccontextmanager
from app.services.pdf_cache import ensure_pdfs_loaded

@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_pdfs_loaded()
    yield

app = FastAPI(..., lifespan=lifespan)
```

**EC2 path:** Use `PDF_DIR` env var in `.env`:
```
PDF_DIR=/home/ec2-user/이론
```
PDFs must be copied to EC2 via `scp`.

---

## 3. New Backend Endpoints

### 3.1 `POST /api/suggest-cir-alternatives` (Feature 1)

**New schemas:**
```python
class SuggestCIRAlternativesRequest(BaseModel):
    cir: CIR
    script_context: Optional[str] = ""
    intent: Optional[str] = ""

class CIRAlternative(BaseModel):
    label: str                     # "Option A", "Option B", "Option C"
    cir: CIR                       # Complete alternative CIR (all 9 attrs)
    changed_attributes: List[str]  # e.g. ["shotSize", "verticalLevel"]
    what_changed: str              # Korean — what attributes changed and why
    dramatic_effect: str           # Korean — expected emotional/narrative impact
    citation: str                  # "Book Title — Chapter/Concept"
    book_short: str                # Display badge e.g. "Shot by Shot"

class SuggestCIRAlternativesResponse(BaseModel):
    alternatives: List[CIRAlternative]  # always 3 options
```

**Service (`cir_suggester.py`):**
1. `pdf_cache.get_pdf_file_uris()` → get 5 PDF parts
2. Build prompt from `cir_alternatives.txt` + current CIR + context
3. Gemini text call with `[prompt, *pdf_parts]`
4. Parse JSON → `SuggestCIRAlternativesResponse`

### 3.2 `POST /api/shot-guidance` (Feature 2)

**New schemas:**
```python
class ShotGuidanceRequest(BaseModel):
    image: str                     # base64 sketch
    cir: CIR
    script_context: Optional[str] = ""
    intent: Optional[str] = ""

class ShotAnalysis(BaseModel):
    cir_script_match: str          # Korean
    cinematic_characteristics: List[str]  # Korean tags
    composition_strengths: str     # Korean
    composition_tensions: str      # Korean

class DirectorialSuggestion(BaseModel):
    category: str  # "blocking"|"lighting"|"props"|"character"|"mise_en_scene"
    suggestion: str     # Korean
    citation: str       # "Book Title — concept"
    expected_effect: str  # Korean

class ShotGuidanceResponse(BaseModel):
    shot_analysis: ShotAnalysis
    directorial_suggestions: List[DirectorialSuggestion]  # 4-6 items
    summary_note: str  # Korean one-sentence director's note
```

**Service (`shot_guidance.py`):**
1. Decode image base64 → `image_part`
2. `pdf_cache.get_pdf_file_uris()` → 5 PDF parts
3. Build prompt from `shot_guidance.txt` + CIR + context
4. Gemini multimodal call: `[prompt, image_part, *pdf_parts]`
5. Parse JSON → `ShotGuidanceResponse`

### 3.3 `GET /api/pdf-status` (optional health check)
Returns which PDFs are cached and when they expire.

---

## 4. Prompt Design

### 4.1 `cir_alternatives.txt`

```
[SYSTEM ROLE]
You are a master cinematographer with access to foundational cinematography texts.
Suggest 2-3 alternative CIR compositions for a storyboard sketch.

[CONSTRAINTS]
- Each alternative changes only 2-4 attributes from the current CIR
- Every suggestion MUST cite a specific principle from the provided books
- All Korean text fields: what_changed, why, dramatic_effect
- citation = "Book Title — specific concept/chapter"
- Return a complete, valid CIR object for each alternative

[CIR ATTRIBUTE REFERENCE]
shotSize: Extreme Close-Up | Close-Up | Medium Close-Up | Medium Shot | Medium Long Shot | Long Shot | Extreme Wide Shot
horizontalAngle: Frontal | Three-Quarter | Profile | Rear
verticalLevel: High | Eye | Low | Top-Down | Ground
subjectConfig: Single | Two-Shot | Group | Insert
viewpointFraming: Objective | OTS | POV
eyeline: Toward Subject | Averted | Off-Screen | Toward Camera
occlusion: None | Partial | Heavy
depth: Shallow | Deep (optional)
motionHint: Static | Pan | Tilt | Track | Zoom | Handheld (comma-separated)

[CURRENT STATE]
CIR: {cir_json}
Script: {script_context}
Intent: {intent}

Output valid JSON only:
{
  "alternatives": [
    {
      "label": "Option A",
      "cir": { ...complete CIR... },
      "changed_attributes": ["shotSize", "verticalLevel"],
      "what_changed": "...(Korean)...",
      "why": "...(Korean, book-grounded)...",
      "dramatic_effect": "...(Korean)...",
      "citation": "Film Directing Shot by Shot — Chapter on Close-Ups",
      "book_short": "Shot by Shot"
    }
  ]
}
```

### 4.2 `shot_guidance.txt`

```
[SYSTEM ROLE]
You are an expert film director analyzing a storyboard sketch.
You have access to foundational cinematography texts.

Your task:
1. Analyze how the current shot composition serves the script moment
2. Suggest concrete directorial improvements BEYOND CIR parameters
   (blocking, props, lighting, character additions, mise-en-scène)
   grounded in the provided books

[INPUT]
CIR: {cir_json}
Script: {script_context}
Intent: {intent}
[sketch image provided as visual input]

Output valid JSON only:
{
  "shot_analysis": {
    "cir_script_match": "...(Korean)...",
    "cinematic_characteristics": ["특성1", "특성2"],
    "composition_strengths": "...(Korean)...",
    "composition_tensions": "...(Korean)..."
  },
  "directorial_suggestions": [
    {
      "category": "blocking",
      "suggestion": "...(Korean)...",
      "citation": "Master Shots — ...",
      "expected_effect": "...(Korean)..."
    }
  ],
  "summary_note": "...(Korean, one sentence)..."
}
```

---

## 5. Frontend Changes

### 5.1 `api.js` — 2 New Functions

```javascript
export async function suggestCIRAlternatives(cir, scriptContext = '', intent = '') {
  const response = await fetch(`${API_BASE}/suggest-cir-alternatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cir, script_context: scriptContext, intent }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function getShotGuidance(imageBase64, cir, scriptContext = '', intent = '') {
  const response = await fetch(`${API_BASE}/shot-guidance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, cir, script_context: scriptContext, intent }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}
```

### 5.2 `useStore.js` — New State

```javascript
// Feature 2: Shot Guidance
shotGuidance: null,
setShotGuidance: (g) => set({ shotGuidance: g }),
isLoadingGuidance: false,
setIsLoadingGuidance: (v) => set({ isLoadingGuidance: v }),
```

### 5.3 `ReframePanel.jsx` — Feature 1 UI

**New button** (appears after Analyze Shot runs):
```
[Analyze Shot]  [Get Recommendations]  [Save (n)]
```

**Recommendations section** (appears below header after recommendations load):
```
┌─ Recommendations ────────────────────────────────────────┐
│  [Option A]  [Option B]  [Option C]   ← tab switcher     │
│ ─────────────────────────────────────────────────────────│
│  shotSize: Close-Up → Medium Shot                         │
│  verticalLevel: Eye → Low                                 │
│                                                           │
│  "낮은 카메라 각도와 미디엄 샷으로 치거의 위압감을..."     │
│  극적 효과: "긴장감과 권력 불균형 강화"                   │
│  출처: Master Shots — Low Angle Dominance                 │
└──────────────────────────────────────────────────────────┘

[CIR 토글들 — 현재 선택된 탭의 CIR 값으로 자동 세팅]

[Generate Reframe]
```

**Tab switch handler:** 탭 클릭 → `setTargetCir(alt.cir)` → 토글 즉시 반영

**Generate Reframe 시:** 선택된 탭의 `citation` + `dramatic_effect`를 프롬프트에 포함해서 Gemini에 전송 → 이론 기반 생성 품질 향상

**State additions:**
```javascript
const [recommendations, setRecommendations] = useState([])  // CIRAlternative[]
const [activeRecommendation, setActiveRecommendation] = useState(0)  // tab index
const [loadingRecs, setLoadingRecs] = useState(false)
```

**Tab switch:**
```javascript
const handleSelectRecommendation = (index) => {
  setActiveRecommendation(index)
  const alt = recommendations[index]
  setTargetCir({
    ...EMPTY_CIR,
    ...alt.cir,
    motionHint: alt.cir.motionHint?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
  })
}
```

### 5.4 `GuidanceTab.jsx` — Feature 2 Redesign

**Keep:**
- CIR attribute grid (from `analysisResult.cir`)
- Composition alignment text (`analysisResult.alignment`)
- Overlay toggles (Rule of Thirds, Eyeline Guide)

**Remove:**
- `proposals` strategy cards rendering
- `handleGenerateOverlay` / `handleSelectProposal`
- `strategyColors`, `activeProposal` usage

**Add:**

**Section 1 — Shot Analysis:**
```
┌─── Shot Analysis ────────────────────────────────────────┐
│ [Get Shot Guidance]  (button, appears when analysisResult exists)
│                                                          │
│ CIR ↔ Script: "이 쇼트는 치거의 위압적..."               │
│ Characteristics: [권력 관계] [시선 비대칭] [압박감]       │
│ Strengths: "..."    Tensions: "..."                      │
└──────────────────────────────────────────────────────────┘
```

**Section 2 — Directorial Suggestions:**
```
[All] [Blocking] [Lighting] [Props] [Character] [Mise-en-scène]

┌── Blocking ── Master Shots ─────────────────────────────┐
│ "주유소 카운터를 경계선으로 활용하여..."                  │
│ Expected: "두 인물 간 물리적 장벽 강화"                  │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow

### Feature 1

```
Analyze Shot → CIR 토글 자동 세팅
     ↓
[Get Recommendations] 버튼 클릭
     ↓
POST /api/suggest-cir-alternatives
  { cir, script_context, intent }
     ↓
cir_suggester.py
  pdf_cache.get_pdf_file_uris()
  Gemini([prompt, pdf×5])
  → parse JSON → 3 alternatives
     ↓
탭 3개 렌더링 (Option A / B / C)
기본: Option A의 CIR로 토글 세팅
     ↓
사용자가 탭 전환
  → setTargetCir(alt.cir) → 토글 즉시 반영
  → 변경된 속성 + 설명 + 출처 표시
     ↓
[Generate Reframe] 클릭
  → 선택된 탭의 citation + dramatic_effect를
    reframe 프롬프트에 포함해서 Gemini 전송
```

### Feature 2

```
Analyze Shot → analysisResult in store
     ↓
Switch to Shot Guidance tab
     ↓
[Get Shot Guidance]
     ↓
POST /api/shot-guidance
  { image, cir, script_context, intent }
     ↓
shot_guidance.py
  pdf_cache.get_pdf_file_uris()
  Gemini([prompt, image, pdf×5])
  → parse JSON
     ↓
Shot Analysis + Directorial Suggestions rendered
```

### PDF Cache Lifecycle

```
Server starts → ensure_pdfs_loaded()
  asyncio.gather(upload 5 PDFs in parallel)
  Poll each until ACTIVE (max 120s)
  Store { file_uri, uploaded_at } in _file_cache

Per request → get_pdf_file_uris()
  if age > 47hrs → re-upload
  else → types.Part.from_uri(file_uri)

Every ~47hrs → on-demand re-upload on next request
```

---

## 7. Implementation Phases

| Phase | What | Goal |
|-------|------|------|
| **1** | `pdf_cache.py` + lifespan + `/api/pdf-status` | PDFs uploading on EC2 startup |
| **2** | Feature 2 backend: `shot_guidance.py` + schemas + route | `/api/shot-guidance` returning quality JSON |
| **3** | Feature 2 frontend: `GuidanceTab.jsx` rewrite | End-to-end Shot Guidance working |
| **4** | Feature 1 backend: `cir_suggester.py` + schemas + route | `/api/suggest-cir-alternatives` working |
| **5** | Feature 1 frontend: `ReframePanel.jsx` alternatives UI | Full CIR suggestion → apply → reframe flow |
| **6** | Polish: error states, loading UX, EC2 path config, prompt tuning | Production ready |

---

## 8. Potential Issues & Mitigations

### EC2 PDF Paths
- PDFs are at `/Users/sangwoo/Desktop/HCI/이론/` locally — not on EC2
- **Fix:** `PDF_DIR` env var; `scp` PDFs to EC2 before deploying

### PDF Upload Latency at Startup
- Large PDFs may take 30-90s to reach ACTIVE state
- **Fix:** Upload in parallel (`asyncio.gather`); non-blocking startup with `_is_ready` flag; return 503 from guidance endpoints until ready

### Token Limits
- 5 PDFs + image per request may be large
- **Fix:** Gemini File API uses server-side refs (not re-transmitted); monitor `response.usage_metadata`; fall back to 3 books if needed

### JSON Parse Failures
- Gemini may return malformed JSON
- **Fix:** Strip markdown fences; try/except with safe fallback; add `response_mime_type="application/json"` in GenerateContentConfig

### CIR Schema Mismatch
- Old `cameraAngle`/`cameraLevel`/`relation`/`blockingDistance` keys still in some places
- **Fix:** New GuidanceTab uses new canonical keys throughout; audit with grep before implementing

### Response Latency
- Shot Guidance call (image + 5 PDFs) may take 15-30s
- **Fix:** Clear loading state UI ("Consulting cinematography references..."); consider streaming for MVP+

---

## 9. Feature 3: Scene Flow

### 9.1 Core Concept

Scene Flow is a **pre-editing shot sequence composer**. The director builds and explores shot sequences as storyboard frames — lightweight, fast, and AI-assisted.

**Key insight:** Modern filmmaking uses many short cuts (inserts, reaction shots, detail cuts). Planning these sequences is hard with video (heavy, slow to rearrange) but easy with sketch frames. Scene Flow enables:
- Fast visual planning of shot rhythm and pacing
- AI-generated fill shots for gaps in sequences
- Parallel exploration of alternative edit orders
- Rhythm validation before any footage is shot

### 9.2 Views

**Overview (Node Graph):**
```
Main sequence (canonical):
[Shot 1] ──→ [Shot 2] ──→ [Shot 3] ──→ [Shot 4]
                  ↓ branch
             Alt A: [Shot 1] → [Shot 3] → [Shot 2] → [Shot 4]
             Alt B: [Shot 1] → [Shot 2] → [insert] → [Shot 3] → [Shot 4]
```
- Horizontal = time, vertical = branches
- Click a node = jump to card view of that shot
- Branches can be promoted to main or deleted

**Card View (Swipe):**
```
  [prev]  ← [ CURRENT SHOT — large ] →  [next]
              small                small
```
- Swipe/click left-right to navigate
- Current shot fills center, neighbors shown small on sides
- Below current shot: CIR attributes, script beat info

**Insert Points:**
- Between every two shots, a `[+]` button appears in card view
- Click `[+]` → AI suggests 3-6 fill shots for that gap
- Each suggestion shows: frame sketch (AI generated), CIR, label (e.g. "Insert — coin detail", "Reaction — Proprietor")
- User picks one or more to insert, or dismisses

### 9.3 AI Features

**1. Sequence Alternative Suggestion**
- Button: "Suggest Reorder"
- Input: current sequence of shots (images + CIRs) + script + intent
- Output: 2-3 alternative orderings with rationale
  - "Alt A: Start with insert shot for more tension"
  - "Alt B: Reaction first, then cause — Kuleshov effect"
- Each alt shown as a branch in the node graph

**2. Fill Shot Generation**
- Triggered by `[+]` between shots
- Input: left shot + right shot (images + CIRs) + script context + intent
- Output: 3-6 suggested bridging shots
  - Each: AI-generated sketch image + CIR + label + rationale
  - Labels: Insert / Reaction / Detail / Cutaway / POV / Establishing
- User can add one or multiple

**3. Full Sequence Generation**
- Button: "Generate Full Sequence"
- Input: script beat + intent + desired shot count (e.g. 8-12 shots)
- Output: complete sequence of AI-generated sketches with CIRs
- User can then edit, rearrange, replace individual shots

### 9.4 Data Model

```javascript
// Shot in a sequence
{
  id: string,
  image: string,          // base64 or dataUrl
  cir: CIR,
  label: string,          // e.g. "Shot 3", "Insert — coin"
  scriptBeat: number,     // which beat this belongs to
  isAIGenerated: boolean,
  source: 'canvas' | 'ai_fill' | 'ai_generated',
}

// A sequence branch
{
  id: string,
  label: string,          // "Main", "Alt A", "Alt B"
  shots: Shot[],
  isMain: boolean,
  rationale: string,      // why this order (Korean)
}

// Scene flow state in Zustand
{
  branches: Branch[],
  activeBranch: number,
  activeShot: number,     // index in activeBranch.shots
  flowView: 'graph' | 'card',
}
```

### 9.5 New Backend Endpoints

**`POST /api/suggest-sequence-alts`**
```python
class SequenceAltRequest(BaseModel):
    shots: List[SequenceShot]   # image + cir + label per shot
    script_context: str
    intent: str

class SequenceAlt(BaseModel):
    label: str              # "Alt A"
    order: List[int]        # indices into original shots array
    rationale: str          # Korean
    effect: str             # Korean — expected editing effect

class SequenceAltResponse(BaseModel):
    alternatives: List[SequenceAlt]
```

**`POST /api/suggest-fill-shots`**
```python
class FillShotRequest(BaseModel):
    left_shot: SequenceShot    # shot before the gap
    right_shot: SequenceShot   # shot after the gap
    script_context: str
    intent: str
    count: int = 4             # how many suggestions (3-6)

class FillShotSuggestion(BaseModel):
    label: str              # "Insert — coin detail"
    category: str           # "insert"|"reaction"|"detail"|"cutaway"|"pov"|"establishing"
    cir: CIR
    rationale: str          # Korean — why this shot works here
    image: str              # base64 AI-generated sketch

class FillShotResponse(BaseModel):
    suggestions: List[FillShotSuggestion]
```

**`POST /api/generate-sequence`**
```python
class GenerateSequenceRequest(BaseModel):
    script_context: str
    intent: str
    shot_count: int = 10    # target number of shots

class GenerateSequenceResponse(BaseModel):
    shots: List[FillShotSuggestion]  # reuse same schema
```

### 9.6 Frontend: FlowTab.jsx Redesign

**Complete rewrite** of current FlowTab (current implementation is a non-functional placeholder).

**View toggle:**
```
[≡ Graph]  [▣ Cards]    ← top-right toggle
```

**Graph view:** SVG-based node graph
- Each branch = horizontal row of nodes
- Nodes = small thumbnail images (or numbered placeholders)
- Click node = switch to card view at that index
- "Suggest Reorder" button → calls `/api/suggest-sequence-alts` → new branch rows appear

**Card view:** Centered carousel
- Large center frame, small left/right neighbors
- Below: CIR chips, script beat label, shot label
- `[+]` buttons between shots → calls `/api/suggest-fill-shots` → picker overlay
- Swipe gestures (touch) + arrow keys (desktop)

**Shot picker overlay (for fill shots):**
```
┌─── Add Shot Between #2 and #3 ────────────────────────────┐
│  [Insert]  [Reaction]  [Detail]  ← category filter        │
│                                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                  │
│  │ img  │  │ img  │  │ img  │  │ img  │                   │
│  │Insert│  │React.│  │Detail│  │Cutaw.│                   │
│  │coin  │  │Prop. │  │hands │  │door  │                   │
│  └──────┘  └──────┘  └──────┘  └──────┘                  │
│  "코인의 앞면..."  "주유소 주인의..."                       │
│                                                            │
│  [+ Add Selected]                    [Cancel]             │
└────────────────────────────────────────────────────────────┘
```

### 9.7 Implementation Phase

| Sub-phase | What |
|-----------|------|
| F3-1 | Data model in Zustand + FlowTab shell (graph + card views, no AI) |
| F3-2 | `POST /api/suggest-fill-shots` + fill shot picker UI |
| F3-3 | `POST /api/suggest-sequence-alts` + branch rendering in graph |
| F3-4 | `POST /api/generate-sequence` + full sequence generation UI |
| F3-5 | Polish: drag reorder, delete, promote branch to main |
