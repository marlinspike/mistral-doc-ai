from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .ocr import process_uploads

app = FastAPI(title="Doc AI OCR")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    """Liveness probe endpoint."""
    return {"status": "ok"}


@app.post("/api/ocr")
async def ocr(files: list[UploadFile] = File(...)) -> dict:
    """Accept multiple files, forward to OCR, and return parsed results."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    if len(files) > settings.max_files:
        raise HTTPException(
            status_code=400,
            detail=f"Max {settings.max_files} files allowed.",
        )

    results = await process_uploads(files)
    return {"results": results, "count": len(results)}
