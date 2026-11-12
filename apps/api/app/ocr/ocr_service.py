"""Orchestrateur OCR adaptatif selon la langue source du projet.

Routage :
- japonais (``ja``) -> `MangaOCRProvider` (vertical, furigana) ;
- toute autre langue (``ko``, ``zh``, ``en``, ``es``, ``pt``, ``de``...)
  -> `PaddleOCRProvider` (boîtes + confiance natives) ;
- si le moteur principal est indisponible sur la machine (bibliothèque
  native non chargée, paquet absent…), repli automatique sur
  `TesseractOCRProvider`, qui fonctionne sans AVX.

Le moteur indisponible n'est essayé qu'une fois par processus : le
re-tenter à chaque page (batch de 60 pages) rendait le premier appel
très lent sans jamais aboutir. La sortie brute (une boîte par ligne)
est ensuite regroupée par bulle et débarrassée du hors-bulle par
`app.ocr.bubble_grouping` : une bulle = un bloc.

La sortie est standardisée : `list[OCRBlockData]`, sérialisable en JSON
structuré via `OCRBlockData.to_dict()` (texte, bbox, confiance).
"""

import asyncio
import io
import logging
import os

from PIL import Image

from app.ocr.bubble_grouping import BubbleRegion, detect_bubble_regions, refine_blocks
from app.ocr.provider import OCRBlockData, OCRProvider
from app.ocr.providers.manga_ocr_provider import MangaOCRProvider
from app.ocr.providers.paddle_ocr_provider import PaddleOCRProvider
from app.ocr.providers.tesseract_provider import TesseractOCRProvider

logger = logging.getLogger(__name__)

JAPANESE_CODES = {"ja", "jp", "ja-jp"}

# Erreurs qui signifient « moteur indisponible sur cette machine »
# (et non « page illisible ») : elles déclenchent le repli Tesseract.
_UNAVAILABLE_ERRORS = (RuntimeError, ImportError, NameError, OSError)

# Budget total d'une page OCR. Au-delà, on échoue proprement avec un
# message clair au lieu de laisser le client expirer (300 s côté web)
# pendant que le serveur télécharge un modèle ou lit une page
# immense zone par zone. Le premier lancement (téléchargement des
# modèles) reste le cas lent connu :
# il a lieu dans le job d'arrière-plan, pas dans une requête HTTP.
OCR_TIMEOUT_SECONDS = float(os.environ.get("OCR_TIMEOUT_SECONDS", "240"))
# Relecture bulle par bulle : chaque bulle relance Tesseract, on borne.
MAX_REREAD_BUBBLES = 12


class OCRTimeoutError(TimeoutError):
    """Budget temps OCR dépassé pour une page."""


def _is_japanese(source_lang: str) -> bool:
    return (source_lang or "").strip().lower().replace("_", "-") in JAPANESE_CODES


class OCRService:
    """Service OCR unique consommé par les routeurs et les jobs."""

    def __init__(
        self,
        manga_provider: OCRProvider | None = None,
        paddle_provider: OCRProvider | None = None,
        tesseract_provider: OCRProvider | None = None,
    ) -> None:
        self._manga = manga_provider or MangaOCRProvider()
        self._paddle = paddle_provider or PaddleOCRProvider()
        self._tesseract = tesseract_provider or TesseractOCRProvider()
        self._unavailable: set[str] = set()

    def provider_name_for(self, source_lang: str) -> str:
        """Nom du moteur qui traitera cette langue (diagnostic/logs)."""
        return "manga-ocr" if _is_japanese(source_lang) else "paddleocr"

    async def _run_primary_or_fallback(
        self, image_bytes: bytes, source_lang: str
    ) -> tuple[list[OCRBlockData], bool]:
        """OCR brut ; renvoie (blocs, True si Tesseract a servi)."""
        primary = self._manga if _is_japanese(source_lang) else self._paddle
        primary_name = "manga-ocr" if _is_japanese(source_lang) else "paddleocr"
        if primary_name not in self._unavailable:
            try:
                return await primary.detect_text(image_bytes, source_lang), False
            except _UNAVAILABLE_ERRORS as primary_exc:
                # Mémorisé : ne pas recharger un moteur cassé à chaque page.
                self._unavailable.add(primary_name)
                logger.warning(
                    "[OCRService] Moteur %s indisponible (%s) — repli Tesseract "
                    "pour toute la session.",
                    primary_name,
                    primary_exc,
                )
                self._primary_error = primary_exc  # type: ignore[attr-defined]
        try:
            return await self._tesseract.detect_text(image_bytes, source_lang), True
        except Exception as fallback_exc:
            primary_exc = getattr(self, "_primary_error", None)
            raise RuntimeError(
                "Aucun moteur OCR disponible sur cette machine. "
                f"Moteur principal ({primary_name}) : {primary_exc} "
                f"Repli Tesseract : {fallback_exc}"
            ) from fallback_exc

    async def _reread_bubbles(
        self,
        image: Image.Image,
        bubbles: list[BubbleRegion],
        blocks: list[OCRBlockData],
        source_lang: str,
    ) -> list[OCRBlockData]:
        """Relit chaque bulle en gros plan et garde la meilleure lecture.

        Sur la page entière, Tesseract confond des glyphes CJK proches
        (信 lu 人, 这 lu 文) ou rate une petite bulle ; recadrée, la
        même bulle se lit correctement. La relecture ne remplace la
        lecture page que si sa confiance est au moins égale — et elle
        remplit les bulles restées vides.
        """
        result = list(blocks)
        for region in bubbles[:MAX_REREAD_BUBBLES]:
            existing = [b for b in result if region.contains_center(b)]
            inset = 10
            x0, y0 = max(0, region.x + inset), max(0, region.y + inset)
            x1, y1 = min(image.width, region.x + region.w - inset), min(image.height, region.y + region.h - inset)
            if x1 - x0 < 30 or y1 - y0 < 20:
                continue
            crop = image.crop((x0, y0, x1, y1))
            # Pré-agrandissement x2 des petites bulles : combiné à celui
            # du provider, les glyphes CJK deviennent lisibles (les 3
            # lignes de la bulle chinoise de référence, contre 1 sans).
            prescale = 2 if crop.width < 600 else 1
            if prescale > 1:
                crop = crop.resize((crop.width * prescale, crop.height * prescale), Image.LANCZOS)
            buffer = io.BytesIO()
            crop.save(buffer, format="PNG")
            try:
                found = await self._tesseract.detect_text(buffer.getvalue(), source_lang)
            except Exception as exc:
                logger.debug("[OCRService] Relecture bulle ignorée : %s", exc)
                continue
            usable = []
            for b in found:
                if b.confidence < 0.30 or not any(ch.isalnum() for ch in b.text):
                    continue
                usable.append(
                    OCRBlockData(
                        text=b.text,
                        bbox_x=x0 + int(b.bbox_x / prescale),
                        bbox_y=y0 + int(b.bbox_y / prescale),
                        bbox_w=max(1, int(b.bbox_w / prescale)),
                        bbox_h=max(1, int(b.bbox_h / prescale)),
                        confidence=b.confidence,
                        provider=b.provider,
                    )
                )
            if not usable:
                continue
            merged = refine_blocks(usable, bubbles=[region], source_lang=source_lang)
            candidates = [
                c for c in merged
                if len(c.text.strip()) >= 2 and c.confidence >= 0.40
            ]
            if not candidates:
                continue
            # La couverture d'abord : une ligne isolée très « confiante »
            # ne doit pas éclipser la bulle complète relue.
            candidate = max(
                candidates,
                key=lambda c: (len([ch for ch in c.text if ch.isalnum()]), c.confidence),
            )
            if not existing:
                result.append(candidate)
            else:
                # Relecture quasi aussi confiante (à 0,05 près) et
                # couvrant au moins 80 % du texte : elle corrige les
                # glyphes confondus en lecture page entière. Une
                # relecture partielle ne remplace jamais la bulle.
                cand_len = len([ch for ch in candidate.text if ch.isalnum()])
                exist_len = max(len([ch for ch in b.text if ch.isalnum()]) for b in existing)
                if candidate.confidence + 0.05 >= max(b.confidence for b in existing) and cand_len >= 0.8 * exist_len:
                    result = [b for b in result if b not in existing] + [candidate]
        return result

    async def detect_text(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        """Détecte le texte d'une page, regroupé par bulle.

        Si le moteur principal est indisponible (ex : `libpaddle` non
        chargé sur un CPU sans AVX), Tesseract prend le relais — une
        seule tentative du moteur cassé par processus.
        """
        if not image_bytes:
            return []
        try:
            return await asyncio.wait_for(
                self._detect_text_unbounded(image_bytes, source_lang),
                timeout=OCR_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            raise OCRTimeoutError(
                f"OCR interrompu après {int(OCR_TIMEOUT_SECONDS)} s : page trop "
                "lourde ou moteur encore en chargement. Réessayez — le moteur "
                "reste chargé en mémoire après le premier lancement."
            ) from exc

    async def _detect_text_unbounded(
        self, image_bytes: bytes, source_lang: str
    ) -> list[OCRBlockData]:
        blocks, used_tesseract = await self._run_primary_or_fallback(image_bytes, source_lang)

        image = None
        bubbles: list[BubbleRegion] = []
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            bubbles = detect_bubble_regions(image)
        except Exception as exc:
            logger.debug("[OCRService] Image non décodable, regroupement simple : %s", exc)

        refined = refine_blocks(
            blocks,
            bubbles=bubbles,
            source_lang=source_lang,
            image_size=(image.width, image.height) if image else None,
            image=image,
        )
        # Relecture bulle par bulle uniquement quand Tesseract a servi sur une langue
        # horizontale (en japonais, TesseractOCRProvider lit déjà chaque bulle/cadre
        # individuellement en mode vertical avec suppression des furigana).
        if (
            image is not None
            and bubbles
            and ((used_tesseract and not _is_japanese(source_lang)) or not refined)
        ):
            reread = await self._reread_bubbles(image, bubbles, refined, source_lang)
            refined = refine_blocks(
                reread,
                bubbles=bubbles,
                source_lang=source_lang,
                image_size=(image.width, image.height),
                image=image,
            )
        return refined

    async def detect_text_as_dicts(
        self, image_bytes: bytes, source_lang: str
    ) -> list[dict]:
        """Variante JSON structuré (texte, bbox, confiance) pour l'API."""
        blocks = await self.detect_text(image_bytes, source_lang)
        return [block.to_dict() for block in blocks]

    async def recognize_region(
        self, crop_bytes: bytes, source_lang: str
    ) -> tuple[str, float, str]:
        """Reconnaît le texte à l'intérieur d'une boîte tracée manuellement (+ Bubble).

        Contrairement à `detect_text` (qui cherche des contours de bulles fermées
        sur une planche complète et écarte les régions sans bordure fermée),
        `recognize_region` lit directement l'extrait délimité par l'utilisateur,
        y compris les bulles d'exclamation dentelées, textes flottants ou SFX.
        Renvoie `(texte, confiance, provider)`.
        """
        if not crop_bytes:
            return "", 0.0, "manual"

        from PIL import ImageOps
        from app.ocr.bubble_grouping import normalize_cjk_spacing

        crop_img = Image.open(io.BytesIO(crop_bytes)).convert("RGB")
        w, h = crop_img.size
        if w < 8 or h < 8:
            return "", 0.0, "manual"

        # 1. Japonais : lecture directe via MangaOCR sur l'extrait recadré
        if _is_japanese(source_lang):
            if "manga-ocr" not in self._unavailable and hasattr(self._manga, "recognize_crop"):
                try:
                    blk = await self._manga.recognize_crop(crop_bytes)  # type: ignore[attr-defined]
                    if blk and blk.text.strip():
                        return blk.text.strip(), float(blk.confidence), blk.provider
                except _UNAVAILABLE_ERRORS as exc:
                    self._unavailable.add("manga-ocr")
                    logger.warning("[OCRService] MangaOCR indisponible sur recognize_region : %s", exc)
                except Exception as exc:
                    logger.warning("[OCRService] Échec MangaOCR sur recognize_region : %s", exc)

            # Repli Tesseract direct sur l'extrait japonais (sans filtrage de contour)
            try:
                padded = ImageOps.expand(crop_img, border=16, fill="white")
                if min(padded.size) < 180:
                    padded = padded.resize((padded.width * 2, padded.height * 2), Image.LANCZOS)
                buf = io.BytesIO()
                padded.save(buf, format="PNG")
                t_blocks = await self._tesseract.detect_text(buf.getvalue(), source_lang)
                if t_blocks:
                    joined = normalize_cjk_spacing("".join(b.text for b in t_blocks)).strip()
                    avg_conf = sum(b.confidence for b in t_blocks) / len(t_blocks)
                    if joined:
                        return joined, float(avg_conf), "tesseract"
            except Exception as exc:
                logger.warning("[OCRService] Repli Tesseract JA sur recognize_region échoué : %s", exc)
            return "", 0.0, "manual"

        # 2. Autres langues (Coréen, Chinois, Anglais, Français, etc.) :
        # On ajoute une marge blanche de 24px et on agrandit les petits extraits
        # pour que PaddleOCR / Tesseract ne tronquent jamais les caractères au bord.
        padded_img = ImageOps.expand(crop_img, border=24, fill="white")
        if min(w, h) < 220:
            padded_img = padded_img.resize((padded_img.width * 2, padded_img.height * 2), Image.LANCZOS)
        padded_buf = io.BytesIO()
        padded_img.save(padded_buf, format="PNG")
        padded_bytes = padded_buf.getvalue()

        is_cjk = (source_lang or "").strip().lower()[:2] in {"ko", "zh"}
        sep = "" if is_cjk and (source_lang or "").strip().lower()[:2] == "zh" else " "

        if "paddleocr" not in self._unavailable:
            try:
                p_blocks = await self._paddle.detect_text(padded_bytes, source_lang)
                if p_blocks:
                    # Tri en ordre de lecture naturel (haut -> bas, gauche -> droite)
                    p_blocks.sort(key=lambda b: (b.bbox_y // 18, b.bbox_x))
                    raw = sep.join(b.text.strip() for b in p_blocks if b.text.strip()).strip()
                    text = normalize_cjk_spacing(" ".join(raw.split())) if is_cjk else " ".join(raw.split())
                    if text:
                        avg_conf = sum(b.confidence for b in p_blocks) / len(p_blocks)
                        return text, float(avg_conf), "paddleocr"
            except _UNAVAILABLE_ERRORS as exc:
                self._unavailable.add("paddleocr")
                logger.warning("[OCRService] PaddleOCR indisponible sur recognize_region : %s", exc)
            except Exception as exc:
                logger.warning("[OCRService] Échec PaddleOCR sur recognize_region : %s", exc)

        # Repli Tesseract sur l'extrait avec marge blanche
        try:
            t_blocks = await self._tesseract.detect_text(padded_bytes, source_lang)
            if t_blocks:
                t_blocks.sort(key=lambda b: (b.bbox_y // 18, b.bbox_x))
                raw = sep.join(b.text.strip() for b in t_blocks if b.text.strip()).strip()
                text = normalize_cjk_spacing(" ".join(raw.split())) if is_cjk else " ".join(raw.split())
                if text:
                    avg_conf = sum(b.confidence for b in t_blocks) / len(t_blocks)
                    return text, float(avg_conf), "tesseract"
        except Exception as exc:
            logger.warning("[OCRService] Repli Tesseract sur recognize_region échoué : %s", exc)

        return "", 0.0, "manual"
