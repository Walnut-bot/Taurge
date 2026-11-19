"""OCR haute précision via Gemini Vision (multimodal).

Spécialisation : bulles de manhwa/webtoon/manga à typographie stylisée,
bulles semi-transparentes ou lumineuses, textes avec contour épais (halo)
traversés par une bordure de case, colonnes verticales japonaises et SFX.

Utilisé automatiquement dès que `GEMINI_API_KEY` est configurée sur le
serveur (0 Mo de RAM supplémentaire sur Render 512 Mo, ~2 s par bulle et
~3-4 s par planche complète). Si la clé est absente ou en cas d'erreur
réseau, `OCRService` bascule automatiquement sur les moteurs locaux
(PaddleOCR / MangaOCR / Tesseract).
"""

import asyncio
import base64
import io
import json
import logging
import os
import urllib.error
import urllib.request

from PIL import Image

from app.ocr.bubble_grouping import (
    normalize_cjk_spacing,
    normalize_korean_spacing,
)
from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

PROVIDER_NAME = "gemini-vision"

GEMINI_OCR_MODELS = (
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
)

LANG_NAMES: dict[str, str] = {
    "ko": "Korean (Hangul)",
    "ja": "Japanese",
    "jp": "Japanese",
    "ja-jp": "Japanese",
    "zh": "Chinese",
    "zh-hans": "Chinese (Simplified)",
    "zh-cn": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)",
    "zh-tw": "Chinese (Traditional)",
    "en": "English",
    "fr": "French",
    "es": "Spanish",
    "pt": "Portuguese",
    "de": "German",
}


def _normalize_text(text: str, source_lang: str) -> str:
    cleaned = " ".join((text or "").replace("\r", " ").replace("\n", " ").split()).strip()
    if not cleaned:
        return ""
    lang = (source_lang or "").strip().lower()
    if lang.startswith("ko"):
        return normalize_korean_spacing(cleaned)
    if lang.startswith("ja") or lang.startswith("jp") or lang.startswith("zh"):
        return normalize_cjk_spacing(cleaned)
    return cleaned


class GeminiVisionOCRProvider:
    """Reconnaissance OCR multimodale via l'API Gemini Flash-Lite."""

    def __init__(self, api_key: str | None = None) -> None:
        self._explicit_api_key = api_key

    def _get_api_key(self) -> str:
        if self._explicit_api_key is not None:
            return self._explicit_api_key.strip()
        return (os.environ.get("GEMINI_API_KEY") or "").strip()

    def is_configured(self) -> bool:
        return bool(self._get_api_key())

    def _call_gemini_sync(
        self,
        image_bytes: bytes,
        prompt: str,
        json_mode: bool = False,
        timeout: float = 20.0,
    ) -> str:
        api_key = self._get_api_key()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY non configurée.")

        b64 = base64.b64encode(image_bytes).decode("ascii")
        gen_config: dict = {"temperature": 0.0}
        if json_mode:
            gen_config["responseMimeType"] = "application/json"

        payload = json.dumps(
            {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/png", "data": b64}},
                        ]
                    }
                ],
                "generationConfig": gen_config,
            }
        ).encode("utf-8")

        last_exc: Exception | None = None
        for model in GEMINI_OCR_MODELS:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={api_key}"
            )
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                candidates = body.get("candidates") or []
                if not candidates:
                    return ""
                parts = (candidates[0].get("content") or {}).get("parts") or []
                text = "".join(
                    p.get("text", "") for p in parts if not p.get("thought")
                ).strip()
                return text
            except urllib.error.HTTPError as exc:
                last_exc = exc
                if exc.code in (400, 404):
                    continue
                raise
            except Exception as exc:
                last_exc = exc
                continue

        if last_exc:
            raise last_exc
        return ""

    def _recognize_crop_sync(
        self, crop_bytes: bytes, source_lang: str
    ) -> OCRBlockData | None:
        if not crop_bytes or not self.is_configured():
            return None

        img = Image.open(io.BytesIO(crop_bytes)).convert("RGB")
        w, h = img.size
        buf = io.BytesIO()
        img.save(buf, format="PNG")

        lang_label = LANG_NAMES.get(
            (source_lang or "").strip().lower(), source_lang or "the original language"
        )
        prompt = (
            f"Read all {lang_label} text inside this comic/manga/manhwa speech bubble "
            "or caption box in natural reading order (top-to-bottom, or right-to-left "
            "vertical columns for Japanese manga). Include every single line and "
            "syllable — even if a panel border line passes behind the text or the "
            "bubble background is translucent/glowing. "
            "Output ONLY the exact transcribed text on a single line, with no "
            "commentary, no translation, and no quotation marks."
        )
        raw = self._call_gemini_sync(buf.getvalue(), prompt, json_mode=False, timeout=15.0)
        text = _normalize_text(raw, source_lang)
        if not text:
            return None
        return OCRBlockData(
            text=text,
            bbox_x=0,
            bbox_y=0,
            bbox_w=w,
            bbox_h=h,
            confidence=0.98,
            provider=PROVIDER_NAME,
        )

    async def recognize_crop(
        self, crop_bytes: bytes, source_lang: str
    ) -> OCRBlockData | None:
        return await asyncio.to_thread(self._recognize_crop_sync, crop_bytes, source_lang)

    def _detect_page_sync(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        if not image_bytes or not self.is_configured():
            raise RuntimeError("GEMINI_API_KEY non configurée.")

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = img.size
        buf = io.BytesIO()
        img.save(buf, format="PNG")

        lang_label = LANG_NAMES.get(
            (source_lang or "").strip().lower(), source_lang or "the original language"
        )
        prompt = (
            f"Detect all comic/manga/manhwa speech bubbles, translucent/glowing speech "
            f"bubbles, narration boxes, and dialogue text blocks in {lang_label} on this page.\n"
            "Ignore phone status bars (clock, battery, signal icons, browser URL bar at the very top) "
            "and site watermarks.\n"
            "For each bubble or text block, return a JSON array of objects in reading order with:\n"
            '- "text": the exact transcribed text in the original language (merge all lines belonging '
            "to the same bubble into a single string)\n"
            '- "box_2d": [ymin, xmin, ymax, xmax] as 4 integers normalized to 0..1000 tightly '
            "enclosing the text inside that bubble.\n"
            "Return ONLY a valid JSON array."
        )
        raw_json = self._call_gemini_sync(
            buf.getvalue(), prompt, json_mode=True, timeout=25.0
        )
        if not raw_json:
            return []

        items = json.loads(raw_json)
        if isinstance(items, dict):
            items = items.get("bubbles") or items.get("blocks") or items.get("items") or []
        if not isinstance(items, list):
            return []

        blocks: list[OCRBlockData] = []
        pad = 4
        for item in items:
            if not isinstance(item, dict):
                continue
            text = _normalize_text(str(item.get("text") or ""), source_lang)
            if not text:
                continue
            box = item.get("box_2d") or item.get("bbox")
            if not isinstance(box, list) or not box:
                continue
            if isinstance(box[0], list):
                box = box[0]
            if len(box) != 4:
                continue
            try:
                ymin, xmin, ymax, xmax = (float(v) for v in box)
            except (TypeError, ValueError):
                continue

            x0 = max(0, min(int(xmin * width / 1000.0) - pad, width - 1))
            y0 = max(0, min(int(ymin * height / 1000.0) - pad, height - 1))
            x1 = max(x0 + 1, min(int(xmax * width / 1000.0) + pad, width))
            y1 = max(y0 + 1, min(int(ymax * height / 1000.0) + pad, height))

            # Ignorer la barre de statut du téléphone tout en haut si jamais incluse
            cy = (y0 + y1) / 2.0
            if cy < 0.045 * height and (y1 - y0) < 0.05 * height:
                continue

            blocks.append(
                OCRBlockData(
                    text=text,
                    bbox_x=x0,
                    bbox_y=y0,
                    bbox_w=x1 - x0,
                    bbox_h=y1 - y0,
                    confidence=0.96,
                    provider=PROVIDER_NAME,
                )
            )
        return blocks

    async def detect_text(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        return await asyncio.to_thread(self._detect_page_sync, image_bytes, source_lang)
