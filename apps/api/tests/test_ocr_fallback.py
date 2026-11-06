"""Régression OCR : le repli Tesseract doit réellement lire une page.

Bug vécu en local : « Aucun moteur OCR disponible sur cette machine »
alors que Tesseract était installé — il ne manquait que le paquet
Python `pytesseract` dans l'environnement. Ce test vérifie la chaîne
complète : moteur principal (Paddle/Manga) absent ou en échec ->
repli Tesseract -> texte lu. Il est ignoré (skip) sur une machine où
ni le binaire Tesseract ni pytesseract ne sont présents.
"""
import asyncio
import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.ocr.ocr_service import OCRService
from app.ocr.providers.tesseract_provider import (
    TesseractOCRProvider,
    find_tesseract_binary,
)

pytesseract = pytest.importorskip("pytesseract")

pytestmark = pytest.mark.skipif(
    find_tesseract_binary() is None,
    reason="Binaire Tesseract absent de cette machine.",
)


def _text_image(text: str) -> bytes:
    try:
        font = ImageFont.truetype("arial.ttf", 72)
    except OSError:
        font = ImageFont.load_default(size=72)
    image = Image.new("RGB", (1100, 300), color="white")
    ImageDraw.Draw(image).text((60, 100), text, fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_tesseract_provider_reads_text():
    blocks = asyncio.run(
        TesseractOCRProvider().detect_text(_text_image("HELLO TAURGE OCR"), "en")
    )
    assert any("HELLO" in block.text for block in blocks)
    assert all(block.provider == "tesseract" for block in blocks)


def test_service_falls_back_to_tesseract_when_primary_unavailable():
    # Sur la machine de dev, Paddle/Manga peuvent être absents : le
    # service doit basculer sur Tesseract au lieu de lever l'erreur
    # « Aucun moteur OCR disponible ».
    class BrokenPrimary:
        async def detect_text(self, image_bytes: bytes, source_lang: str):
            raise ImportError("moteur principal absent (simulation)")

    service = OCRService(
        manga_provider=BrokenPrimary(),
        paddle_provider=BrokenPrimary(),
    )
    blocks = asyncio.run(service.detect_text(_text_image("HELLO TAURGE OCR"), "en"))
    assert any("HELLO" in block.text for block in blocks)
