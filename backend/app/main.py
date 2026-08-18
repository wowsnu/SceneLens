import asyncio
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from app.routes import cut_plan, directing_review, prompt_rewrite, scene_state, seam_design, seam_insert, seam_split, shot_design, shot_fix, panel_image, reference_image, space_layout, fill_shot, image_gen, narrative, overlay, segment, sketch, story, strategy, viewer
from app.services.strategy_engine import warmup_theory_cache

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 컨텍스트 캐시 워밍업은 끈다 — 무료 티어는 캐시 저장 한도가 0이라 429가 뜬다.
    # 캐시 없이도 이론 텍스트를 프롬프트에 직접 넣어 답을 만들므로 기능은 그대로다.
    # print("[Main] Starting up... Warming up theory cache.")
    # warmup_theory_cache()
    print("[Main] Starting up... (theory cache disabled)")

    # 세그멘테이션(MobileSAM)은 torch를 올려 노트북에서 무겁다. 기본은 끈다.
    # 그리기 도구의 오려내기를 쓸 때만 SEGMENT_WARMUP=1로 켠다 — 끈 상태에서도
    # 첫 요청에서 lazy-load되므로 기능이 사라지지는 않는다.
    if os.getenv("SEGMENT_WARMUP", "0") != "0":
        try:
            from app.services.segmenter import Segmenter
            Segmenter.get()
        except Exception as e:
            print(f"[Main] Segmenter warmup failed (will lazy-load on first request): {e}")

    yield
    # Shutdown: Clean up if needed
    print("[Main] Shutting down...")

app = FastAPI(
    title="SceneLens Cinematic Reasoning Engine",
    version="2.0",
    description="AI-powered storyboard analysis and cinematic strategy generation",
    lifespan=lifespan
)

# CORS for React frontend (localhost dev + Vercel production/preview deployments)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        *[origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()],
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://.*:517[3-5]",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "engine": "SceneLens Cinematic Reasoning Engine v2"
    }

# Include routers
app.include_router(sketch.router, prefix="/api")
app.include_router(strategy.router, prefix="/api")
app.include_router(overlay.router, prefix="/api")
app.include_router(image_gen.router, prefix="/api")
app.include_router(fill_shot.router, prefix="/api")
app.include_router(segment.router, prefix="/api")
app.include_router(viewer.router, prefix="/api")
app.include_router(story.router, prefix="/api")
app.include_router(narrative.router, prefix="/api")
app.include_router(cut_plan.router, prefix="/api")
app.include_router(shot_design.router, prefix="/api")
app.include_router(shot_fix.router, prefix="/api")
app.include_router(prompt_rewrite.router, prefix="/api")
app.include_router(panel_image.router, prefix="/api")
app.include_router(reference_image.router, prefix="/api")
app.include_router(space_layout.router, prefix="/api")
app.include_router(scene_state.router, prefix="/api")
app.include_router(seam_design.router, prefix="/api")
app.include_router(seam_insert.router, prefix="/api")
app.include_router(seam_split.router, prefix="/api")
app.include_router(directing_review.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
