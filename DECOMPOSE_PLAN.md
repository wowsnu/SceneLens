# Image Decompose to SVG Layers — Implementation Plan

## Goal
Reframe된 이미지(래스터 PNG)를 객체별로 조작 가능한 SVG 레이어로 분해한다.
최종 결과물은 원본과 시각적으로 동일하되, 각 객체(캐릭터, 소품, 배경 등)를 SvgEditor에서 개별 선택/이동/크기조절 가능하게 만든다.

## Pipeline (Vectorize + SAM 2 ClipPath)

### Step 1: 통합 벡터화 (Recraft)
- 입력: reframe된 PNG 이미지 1장
- Recraft Vectorize API로 전체 이미지를 SVG로 변환
- 결과: 수천 개의 `<path>`로 이루어진 하나의 SVG 파일
- 원본과 100% 동일한 외형, 스타일 일관성 보장

### Step 2: 객체별 마스크 추출 (SAM 2)
- 동일한 원본 PNG를 SAM 2에 입력
- SAM 2가 자동으로 이미지 내 모든 객체의 pixel-level 마스크를 생성
- 결과: `[{ id: "person_1", mask: binary_mask_array }, ...]`

### Step 3: 마스크 → SVG ClipPath 변환
- 각 binary mask에 OpenCV `findContours`로 윤곽선 추출
- 윤곽선 좌표를 SVG `<path d="M...L...Z">`로 변환
- 이 path를 `<clipPath id="layer_N">`에 넣음

### Step 4: ClipPath로 SVG 분리 (핵심) 🔑
- 원본 SVG 전체를 N번 복제
- 각 복제본에 해당 객체의 clipPath를 적용
- 결과: 각 레이어는 원본 SVG 전체를 포함하지만, 해당 객체 영역만 보임
- path를 끊거나 수정할 필요 없음 — 렌더링 시점에 클리핑

```svg
<!-- 레이어 1: 캐릭터 -->
<defs>
  <clipPath id="character_1">
    <path d="M100,50 L150,50 L150,200 L100,200 Z"/>  <!-- SAM mask contour -->
  </clipPath>
</defs>
<g clip-path="url(#character_1)">
  <!-- 원본 SVG paths 전체 복제 -->
  <path d="..."/>
  <path d="..."/>
  ...
</g>
```

### Step 5: 프론트 로드
- 각 클립된 SVG 레이어를 SvgEditor(fabric.js)에 개별 오브젝트로 로드
- 사용자가 "캐릭터 1" 클릭 → 하나의 그룹으로 선택/이동
- 전체 레이어를 겹치면 원본과 동일하게 보임
- LayerPanel에서 각 레이어 표시

## Architecture

```
[원본 PNG] ──┬──→ [Recraft Vectorize] ──→ [Full SVG (수천 paths)]
             │                                        │
             └──→ [SAM 2 Segmentation] ──→ [Masks]    │
                                              │       │
                                     [OpenCV contours]│
                                              │       │
                                     [SVG clipPaths]  │
                                              │       │
                                              └───┬───┘
                                                  │
                                     [각 레이어 = Full SVG + clipPath]
                                                  │
                                          [SvgEditor 로드]
```

## Backend Changes

### New service: `backend/app/services/svg_decomposer.py`

```python
# Core functions:

async def decompose_image(image_base64: str) -> dict:
    """Full pipeline orchestration"""
    # 1. Vectorize (Recraft)
    # 2. Segment (SAM 2)
    # 3. Masks → clipPaths
    # 4. Assemble layered SVGs
    
def segment_image(image_bytes: bytes) -> list[dict]:
    """SAM 2로 마스크 추출"""
    # Returns: [{ id, name, mask: np.array }]
    
def mask_to_svg_clippath(mask: np.array, clip_id: str) -> str:
    """Binary mask → SVG <clipPath> element"""
    # OpenCV findContours → SVG path d attribute
    
def assemble_layered_svg(raw_svg: str, masks: list) -> tuple[str, list]:
    """원본 SVG + clipPaths → 레이어별 SVG 조각들"""
    # 각 레이어: 원본 SVG 전체 + clipPath 적용
```

### New endpoint: `POST /api/decompose-image`
- File: `backend/app/routes/image_gen.py`
- Request: `{ image: base64_string }`
- Response:
```json
{
  "layers": [
    {
      "id": "background",
      "name": "Background",
      "svg": "<svg>...<clipPath>...</clipPath><g clip-path='...'>...</g></svg>"
    },
    {
      "id": "character_1", 
      "name": "Person 1",
      "svg": "<svg>...<clipPath>...</clipPath><g clip-path='...'>...</g></svg>"
    }
  ]
}
```

### New schemas
- File: `backend/app/models/schemas.py`
- `DecomposeImageRequest` — `{ image: str }`
- `DecomposeLayer` — `{ id: str, name: str, svg: str }`
- `DecomposeImageResponse` — `{ layers: list[DecomposeLayer] }`

## Frontend Changes

### ReframePanel — "Decompose to Layers" 버튼
- Reframe 결과 이미지 옆에 버튼 추가
- 클릭 시 `/api/decompose-image` 호출
- 로딩 중 프로그레스 표시

### SvgEditor — 레이어별 로드
- 각 레이어의 SVG를 fabric.js Group 오브젝트로 로드
- 각 그룹이 독립적으로 선택/이동/크기조절 가능
- LayerPanel과 통합

### Store
- `pendingDecomposedLayers` 상태 추가

## Infrastructure

### SAM 2 서버 (GPU 필요)
- **권장: g4dn.xlarge** (T4 GPU, ~$0.526/hr on-demand)
- SAM 2 base 모델: GPU 메모리 ~4GB
- uvicorn + SAM 2 같은 인스턴스에서 실행

### Setup
```bash
pip install segment-anything-2 torch torchvision opencv-python-headless
# SAM 2 checkpoint 다운로드
```

## Dependencies (추가)
- `segment-anything-2` — SAM 2 모델
- `torch`, `torchvision` — PyTorch 런타임
- `opencv-python-headless` — contour 추출
- `numpy` — 마스크 연산
- `lxml` 또는 `xml.etree` — SVG 파싱/조합

## Performance Estimate
| Step | GPU | CPU |
|------|-----|-----|
| Recraft vectorize | ~5s | ~5s |
| SAM 2 segmentation | ~1-2s | ~15-30s |
| Contour → clipPath | ~0.1s | ~0.1s |
| SVG assembly | ~0.1s | ~0.1s |
| **Total** | **~8s** | **~35s** |

## API Calls
- Recraft vectorize: 1회
- SAM 2: 로컬 실행 (API 호출 아님)

## Advantages of ClipPath Approach
1. **Path를 끊거나 수정할 필요 없음** — 렌더링 시점에 클리핑만
2. **원본 SVG 품질 100% 보존** — 스타일 불일치 없음
3. **경계 문제 해결** — path가 객체 경계를 넘어가도 마스크가 잘라냄
4. **구현 단순** — SVG 파싱/수정 불필요, 감싸기만 하면 됨

## Limitations
- SVG 파일 크기가 레이어 수 × 원본 크기 (스토리보드 수준이면 문제없음)
- 객체 이동 시 원래 위치의 배경이 비어 보임 (인페인팅 없이는 해결 불가)
- SAM 2가 매우 작은 객체는 놓칠 수 있음
- GPU 인스턴스 비용 발생
