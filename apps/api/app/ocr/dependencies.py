from app.ocr.ocr_service import OCRService

# Point de câblage unique : les routeurs/jobs reçoivent l'orchestrateur,
# qui route lui-même ja -> MangaOCR, autres langues -> PaddleOCR.
ocr_service = OCRService()


def get_ocr_provider() -> OCRService:
    return ocr_service
