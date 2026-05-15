from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .score_parser import analyze_score

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

app = FastAPI(title="Absolute Ear API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/scores/analyze")
async def score_analyze(file: UploadFile = File(...)) -> dict:
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande")

    try:
        analysis = analyze_score(file.filename or "score", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo procesar la partitura: {exc}") from exc

    return {
        "filename": file.filename,
        "contentType": file.content_type,
        **analysis,
    }
