"""Replis de la chaîne IA avec providers FACTICES (aucun moteur réel).

Complète test_ocr_fallback.py (qui exige le binaire Tesseract) : ici tout
est simulé, donc ces tests tournent partout, y compris en CI sans
paddlepaddle / paddleocr / manga-ocr installés (requirements-ocr.txt).

Contrats vérifiés :
- OCR : moteur principal absent/en panne -> repli Tesseract, une seule
  tentative du moteur cassé par processus, erreur claire si tout échoue,
  routage japonais -> MangaOCR.
- Traduction : Ollama prioritaire (budget borné quand DeepL existe),
  repli DeepL journalisé via last_provider, et JAMAIS de texte source
  renvoyé comme traduit en cas d'échec total.
"""
import asyncio
import io

import pytest
from PIL import Image

from app.ocr.ocr_service import OCRService
from app.ocr.provider import OCRBlockData
from app.translation.translation_service import TranslationService


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (200, 120), color="white").save(buffer, format="PNG")
    return buffer.getvalue()


def _block(text: str, provider: str) -> OCRBlockData:
    return OCRBlockData(
        text=text, bbox_x=10, bbox_y=10, bbox_w=80, bbox_h=20,
        confidence=0.95, provider=provider,
    )


class _BrokenOCR:
    def __init__(self, exc: Exception | None = None):
        self.calls = 0
        self._exc = exc or ImportError("moteur absent (simulation)")

    async def detect_text(self, image_bytes: bytes, source_lang: str):
        self.calls += 1
        raise self._exc


class _FakeOCR:
    def __init__(self, provider: str, text: str = "HELLO"):
        self._provider = provider
        self._text = text
        self.calls = 0

    async def detect_text(self, image_bytes: bytes, source_lang: str):
        self.calls += 1
        return [_block(self._text, self._provider)]


# ── OCR ──────────────────────────────────────────────────────────────

def test_ocr_falls_back_to_tesseract_when_paddle_missing():
    paddle = _BrokenOCR(ImportError("No module named 'paddleocr'"))
    tesseract = _FakeOCR("tesseract")
    service = OCRService(paddle_provider=paddle, tesseract_provider=tesseract)
    blocks = asyncio.run(service.detect_text(_png_bytes(), "en"))
    assert [b.text for b in blocks] == ["HELLO"]
    assert all(b.provider == "tesseract" for b in blocks)


def test_ocr_falls_back_to_tesseract_when_manga_missing_for_japanese():
    manga = _BrokenOCR(RuntimeError("manga-ocr indisponible (simulation)"))
    tesseract = _FakeOCR("tesseract", "こんにちは")
    service = OCRService(manga_provider=manga, tesseract_provider=tesseract)
    blocks = asyncio.run(service.detect_text(_png_bytes(), "ja"))
    assert [b.text for b in blocks] == ["こんにちは"]
    assert manga.calls == 1


def test_ocr_uses_manga_for_japanese_when_available():
    manga = _FakeOCR("manga-ocr", "こんにちは")
    paddle = _FakeOCR("paddleocr", "WRONG ENGINE")
    service = OCRService(manga_provider=manga, paddle_provider=paddle,
                         tesseract_provider=_FakeOCR("tesseract"))
    blocks = asyncio.run(service.detect_text(_png_bytes(), "ja"))
    assert [b.text for b in blocks] == ["こんにちは"]
    assert paddle.calls == 0


def test_ocr_broken_primary_is_tried_only_once_per_process():
    paddle = _BrokenOCR(RuntimeError("libpaddle non chargée (simulation)"))
    tesseract = _FakeOCR("tesseract")
    service = OCRService(paddle_provider=paddle, tesseract_provider=tesseract)
    asyncio.run(service.detect_text(_png_bytes(), "en"))
    asyncio.run(service.detect_text(_png_bytes(), "ko"))
    assert paddle.calls == 1
    assert tesseract.calls == 2


def test_ocr_clear_error_when_no_engine_available():
    service = OCRService(
        paddle_provider=_BrokenOCR(ImportError("paddle absent")),
        tesseract_provider=_BrokenOCR(RuntimeError("Tesseract introuvable")),
    )
    with pytest.raises(RuntimeError, match="Aucun moteur OCR disponible"):
        asyncio.run(service.detect_text(_png_bytes(), "en"))


# ── Traduction ───────────────────────────────────────────────────────

class _FakeOllama:
    def __init__(self, result=None, exc: Exception | None = None, delay: float = 0):
        self._result = result
        self._exc = exc
        self._delay = delay
        self.calls = 0

    async def translate_batch(self, texts, source_lang, target_lang, glossary=None):
        self.calls += 1
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._exc:
            raise self._exc
        return list(self._result)


class _FakeDeepL:
    def __init__(self, result=None, exc: Exception | None = None, available: bool = True):
        self._result = result
        self._exc = exc
        self._available = available
        self.calls = 0

    def is_available(self) -> bool:
        return self._available

    async def translate_batch(self, texts, source_lang, target_lang, glossary=None):
        self.calls += 1
        if self._exc:
            raise self._exc
        return list(self._result)


def test_translation_prefers_ollama_and_records_provider():
    deepl = _FakeDeepL(result=["DEEPL"])
    service = TranslationService(ollama=_FakeOllama(result=["BONJOUR"]), deepl=deepl)
    assert asyncio.run(service.translate_batch(["HELLO"], "en", "fr")) == ["BONJOUR"]
    assert service.last_provider == "ollama"
    assert deepl.calls == 0


def test_translation_falls_back_to_deepl_and_records_provider():
    service = TranslationService(
        ollama=_FakeOllama(exc=RuntimeError("Ollama injoignable")),
        deepl=_FakeDeepL(result=["BONJOUR"]),
    )
    assert asyncio.run(service.translate_batch(["HELLO"], "en", "fr")) == ["BONJOUR"]
    assert service.last_provider == "deepl"


def test_translation_slow_ollama_is_bounded_by_budget_when_deepl_exists():
    service = TranslationService(
        ollama=_FakeOllama(result=["TROP TARD"], delay=5),
        deepl=_FakeDeepL(result=["BONJOUR"]),
        ollama_budget_seconds=0.2,
    )
    assert asyncio.run(service.translate_batch(["HELLO"], "en", "fr")) == ["BONJOUR"]
    assert service.last_provider == "deepl"


def test_translation_empty_ollama_batch_falls_back_to_deepl():
    service = TranslationService(
        ollama=_FakeOllama(result=[]),
        deepl=_FakeDeepL(result=["BONJOUR"]),
    )
    assert asyncio.run(service.translate_batch(["HELLO"], "en", "fr")) == ["BONJOUR"]
    assert service.last_provider == "deepl"


def test_translation_total_failure_never_returns_source_text():
    service = TranslationService(
        ollama=_FakeOllama(exc=RuntimeError("Ollama KO")),
        deepl=_FakeDeepL(exc=RuntimeError("DeepL KO")),
    )
    with pytest.raises(RuntimeError, match="Ollama et DeepL ont échoué"):
        asyncio.run(service.translate_batch(["HELLO"], "en", "fr"))
    with pytest.raises(RuntimeError):
        asyncio.run(service.translate("HELLO", "en", "fr"))
