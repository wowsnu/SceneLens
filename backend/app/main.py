from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes import sketch, strategy, overlay, image_gen

load_dotenv()

app = FastAPI(
    title="SceneLens Cinematic Reasoning Engine",
    version="2.0",
    description="AI-powered storyboard analysis and cinematic strategy generation"
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
