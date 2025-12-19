# Doc AI OCR Demo

Example FastAPI + React app that shows how to run Mistral Document AI (Azure Foundry deployment) on PDFs and images, then view or download the extracted text.

## What the model does (mistral-document-ai-2505)
- Model card: https://ai.azure.com/catalog/models/mistral-document-ai-2505
- OCR for PDFs and images (expects base64 data URLs in the request).
- Returns text and per-page content; can include base64 images when requested.
- Supports schema-based extraction via `bbox_annotation_format` and `document_annotation_format` (JSON schema).
- Handles both PDF and image inputs via the `document` object (`type`: `document_url` for PDFs, `image_url` for images).
- Typical request limit shown in the portal: 60 requests per minute (adjust your backoff if needed).
- Supported languages: see the model catalog for the current list (multilingual OCR, Latin scripts and more). If you rely on a specific language, confirm in the catalog and validate with a sample doc.

## What this app does
- Upload up to 10 files (PDF, PNG, JPG, JPEG), 5MB max each.
- Parallel OCR with retry/backoff to respect rate limits.
- Combine all outputs into one view by default, or switch to per-file view.
- Rendered vs raw toggle for the extracted content.
- Download Markdown or PDF (client-side render).
- Light/dark theme with Tailwind styling.

## Tech stack
- Backend: FastAPI, httpx (async), pydantic-settings.
- Frontend: React + Vite + TypeScript + Tailwind, react-markdown, html2pdf.js.
- Container: Dockerfiles for API and web, `docker-compose` for local orchestration.

## Prerequisites
- Python 3.11+
- Node 18+ (tested with Node 20) and npm
- Docker (optional, for containerized runs)

## Configuration
Create `.env` in the repo root (copy from `.env.example`):
```
AZURE_OCR_ENDPOINT=https://reuben-mistal-doc-ai-25-resource.services.ai.azure.com/providers/mistral/azure/ocr
AZURE_API_KEY=your_key_here
MISTRAL_MODEL=mistral-document-ai-2505
MAX_FILE_SIZE_MB=5
MAX_FILES=10
MAX_CONCURRENCY=3
REQUEST_TIMEOUT_S=60
AUTH_HEADER_STYLE=both   # options: both | bearer | api-key
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
VITE_API_BASE_URL=http://localhost:8001
```

If the endpoint only accepts one header style, set `AUTH_HEADER_STYLE` to `api-key` or `bearer` accordingly.

## Run the API (dev)
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Run the web app (dev)
```bash
cd apps/web
npm install
npm run dev -- --host --port 5173
```
Open http://localhost:5173.

## Run with Docker
```bash
docker compose up --build
```
The compose file builds both images. Set `VITE_API_BASE_URL` in `.env` to the reachable API URL (`http://api:8000` in compose).

## How it works
- Frontend uploads files (multipart) to `/api/ocr`.
- Backend validates type/size, base64-encodes the file as a data URL, builds the payload (`document_url` for PDFs, `image_url` for images).
- Backend calls the Azure OCR endpoint with retries/backoff and whichever auth headers you configure.
- A parsing heuristic walks the response to pull `markdown` or `text`, falling back to page text or all string leaves if needed.
- Frontend shows rendered Markdown or raw text, and can export Markdown or a client-side PDF snapshot.

## Notes and troubleshooting
- 401 errors: verify the key and try switching `AUTH_HEADER_STYLE` (`both` → `api-key` or `bearer`). Restart the API after changing `.env`.
- CORS errors: update `CORS_ORIGINS` to include your dev host/port and restart the API.
- Large files: 5MB cap per file; adjust in `.env` if needed (and restart the API).
