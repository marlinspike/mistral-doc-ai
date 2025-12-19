from __future__ import annotations

import string
from typing import Any, Iterable, List, Optional, Sequence, Tuple


PREFERRED_TEXT_PATHS: Sequence[Tuple[str, ...]] = (
    ("document", "text"),
    ("document", "content"),
    ("text",),
    ("content",),
    ("ocr", "text"),
)

PREFERRED_MARKDOWN_PATHS: Sequence[Tuple[str, ...]] = (
    ("document", "markdown"),
    ("markdown",),
    ("md",),
)

SKIP_KEYWORDS = ("base64", "image", "bbox", "coordinates", "polygon")


def extract_text_and_markdown(payload: Any) -> tuple[str, str]:
    markdown = _first_path_match(payload, PREFERRED_MARKDOWN_PATHS)
    text = _first_path_match(payload, PREFERRED_TEXT_PATHS)

    pages_text = _extract_pages(payload)
    if not text and pages_text:
        text = pages_text

    if not markdown and pages_text:
        markdown = pages_text

    if not text:
        text = _fallback_collect_text(payload)

    if not markdown:
        markdown = text

    return (text or "").strip(), (markdown or "").strip()


def _first_path_match(payload: Any, paths: Sequence[Tuple[str, ...]]) -> Optional[str]:
    for path in paths:
        value = _get_path(payload, path)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _get_path(payload: Any, path: Tuple[str, ...]) -> Any:
    current = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def _extract_pages(payload: Any) -> Optional[str]:
    pages = None
    if isinstance(payload, dict):
        pages = payload.get("pages") or payload.get("document", {}).get("pages")

    if not isinstance(pages, list):
        return None

    texts: List[str] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        for key in ("text", "content", "markdown"):
            value = page.get(key)
            if isinstance(value, str) and value.strip():
                texts.append(value.strip())
                break

    return "\n\n".join(texts) if texts else None


def _fallback_collect_text(payload: Any) -> str:
    strings = [s.strip() for s in _collect_strings(payload) if s.strip()]
    return "\n\n".join(strings)


def _collect_strings(payload: Any, parent_key: str = "") -> Iterable[str]:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if _should_skip_key(key):
                continue
            yield from _collect_strings(value, key)
    elif isinstance(payload, list):
        for item in payload:
            yield from _collect_strings(item, parent_key)
    elif isinstance(payload, str):
        if _looks_like_base64(payload):
            return
        yield payload


def _should_skip_key(key: str) -> bool:
    lowered = key.lower()
    return any(token in lowered for token in SKIP_KEYWORDS)


def _looks_like_base64(value: str) -> bool:
    if len(value) < 200:
        return False
    allowed = set(string.ascii_letters + string.digits + "+/=\n")
    return all(ch in allowed for ch in value)
