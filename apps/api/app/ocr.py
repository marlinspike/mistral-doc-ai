from __future__ import annotations

import asyncio
import base64
import mimetypes
import random
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from fastapi import UploadFile

from .config import settings
from .extract import extract_text_and_markdown

ALLOWED_MIME_TYPES = {
    "application/pdf": "application/pdf",
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
}

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def normalize_mime_type(content_type: Optional[str], filename: Optional[str]) -> Optional[str]:
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in ALLOWED_MIME_TYPES:
            return ALLOWED_MIME_TYPES[base]
    if filename:
        guessed, _ = mimetypes.guess_type(filename)
        if guessed in ALLOWED_MIME_TYPES:
            return ALLOWED_MIME_TYPES[guessed]
    return None


def build_data_url(mime_type: str, data: bytes) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def build_payload(data_url: str, mime_type: str) -> Dict[str, Any]:
    is_pdf = mime_type == "application/pdf"
    document_key = "document_url" if is_pdf else "image_url"
    return {
        "model": settings.mistral_model,
        "document": {
            "type": "document_url" if is_pdf else "image_url",
            document_key: data_url,
        },
        "include_image_base64": False,
    }


async def process_uploads(files: List[UploadFile]) -> List[Dict[str, Any]]:
    semaphore = asyncio.Semaphore(settings.max_concurrency)
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        tasks = [
            _process_single(file, client, semaphore)
            for file in files
        ]
        return await asyncio.gather(*tasks)


async def _process_single(
    file: UploadFile,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "id": uuid4().hex,
        "filename": file.filename or "unnamed",
    }

    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        result["error"] = "File exceeds the 5MB limit."
        return result

    mime_type = normalize_mime_type(file.content_type, file.filename)
    if not mime_type:
        result["error"] = "Unsupported file type."
        return result

    data_url = build_data_url(mime_type, data)
    payload = build_payload(data_url, mime_type)

    try:
        async with semaphore:
            response = await _post_with_backoff(client, payload)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        result["error"] = f"OCR request failed with status {status}."
        return result
    except Exception:
        result["error"] = "OCR request failed."
        return result

    text, markdown = extract_text_and_markdown(response)
    result["text"] = text
    result["markdown"] = markdown
    return result


async def _post_with_backoff(client: httpx.AsyncClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    headers = _build_headers()

    last_exc: Optional[Exception] = None
    for attempt in range(1, 5):
        try:
            response = await client.post(settings.azure_ocr_endpoint, headers=headers, json=payload)
            if response.status_code in RETRYABLE_STATUS:
                raise httpx.HTTPStatusError("Retryable status", request=response.request, response=response)
            response.raise_for_status()
            return response.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if isinstance(exc, httpx.HTTPStatusError):
                status = exc.response.status_code
                if status not in RETRYABLE_STATUS:
                    raise
            if attempt >= 4:
                raise
            await asyncio.sleep(_backoff_delay(attempt))

    if last_exc:
        raise last_exc
    raise httpx.HTTPError("Request failed")


def _backoff_delay(attempt: int) -> float:
    base = 0.7 * (2 ** (attempt - 1))
    jitter = random.uniform(0, 0.4)
    return min(base + jitter, 6.0)


def _build_headers() -> Dict[str, str]:
    style = settings.auth_header_style.lower()
    key = settings.azure_api_key

    if style == "bearer":
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        }
    if style == "api-key":
        return {
            "Content-Type": "application/json",
            "api-key": key,
        }
    # default: send both for compatibility
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "api-key": key,
    }
