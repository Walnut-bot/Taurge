"""Regroupement des lignes OCR par bulle et filtrage du hors-bulle.

Les moteurs ligne à ligne (Tesseract, PaddleOCR) renvoient une boîte par
ligne — voire par fragment — et attrapent aussi le texte hors bulle
(barre de statut d'un téléphone dessiné, SFX, icônes). Sur la page
coréenne de référence, une bulle de 2 lignes sortait en 2 blocs et une
bulle de 3 lignes en 3 blocs, plus 7 parasites.

Ce module, indépendant du moteur, corrige les trois défauts :
1. détection des bulles claires à contour fermé (composantes blanches) ;
2. fusion en UN bloc des lignes dont le centre tombe dans la même bulle
   (repli : fusion géométrique des lignes proches et alignées) ;
3. élimination du bruit : confiance quasi nulle, boîtes minuscules,
   fragments hors bulle à faible confiance.

Le texte hors bulle net est conservé (confiance >= 0.60), y compris
blanc sur fond noir (narration) ; seule la barre de statut du
téléphone, tout en haut de ces captures d'écran, est exclue.
"""

import logging
from dataclasses import dataclass

from app.ocr.provider import OCRBlockData

logger = logging.getLogger(__name__)

MIN_CONFIDENCE = 0.30
MIN_OUTSIDE_CONFIDENCE = 0.60
MIN_BOX_PX = 8


@dataclass
class BubbleRegion:
    x: int
    y: int
    w: int
    h: int

    @property
    def x1(self) -> int:
        return self.x + self.w

    @property
    def y1(self) -> int:
        return self.y + self.h

    def contains_center(self, block: OCRBlockData, pad: int = 6) -> bool:
        cx = block.bbox_x + block.bbox_w / 2
        cy = block.bbox_y + block.bbox_h / 2
        return self.x - pad <= cx <= self.x1 + pad and self.y - pad <= cy <= self.y1 + pad


def _is_hangul(ch: str) -> bool:
    return "\uac00" <= ch <= "\ud7a3"


def _has_alnum(text: str) -> bool:
    return any(ch.isalnum() for ch in text)


def clean_tokens(text: str) -> str:
    """Retire les jetons parasites (|, 」) mais garde la ponctuation CJK."""
    keep_punct = set("。！？…、，；：")
    return " ".join(
        tok
        for tok in (text or "").split()
        if _has_alnum(tok) or any(ch in keep_punct for ch in tok)
    )


def _is_cjk(ch: str) -> bool:
    return (
        "\u3400" <= ch <= "\u4dbf"
        or "\u4e00" <= ch <= "\u9fff"
        or "\u3040" <= ch <= "\u30ff"
        or "\uf900" <= ch <= "\ufaff"
    )


_CJK_PUNCT = set("。！？、，；：…·「」『』（）《》")


def normalize_cjk_spacing(text: str) -> str:
    """Supprime les espaces entre caractères CJK (chinois/japonais).

    Tesseract rend chaque idéogramme comme un « mot » : « 真 是 难以
    置信 。 » doit redevenir « 真是难以置信。 ».
    """
    chars: list[str] = []
    raw = list(text or "")
    for i, ch in enumerate(raw):
        if ch == " ":
            prev = raw[i - 1] if i > 0 else ""
            nxt = raw[i + 1] if i + 1 < len(raw) else ""
            if (_is_cjk(prev) or prev in _CJK_PUNCT) and (_is_cjk(nxt) or nxt in _CJK_PUNCT):
                continue
            if nxt in _CJK_PUNCT:
                continue
        chars.append(ch)
    return "".join(chars)


def normalize_korean_spacing(text: str) -> str:
    """Recolle les syllabes hangul isolées par Tesseract.

    Tesseract coréen sépare souvent chaque syllabe : « 미 래 로 ».
    Une suite de syllabes isolées forme un seul mot (« 미래로 ») ; un mot
    de plusieurs syllabes garde son espace (« 다뤄 주십시오. »).
    """
    tokens = (text or "").split()
    out: list[str] = []
    prev_single_hangul = False
    for tok in tokens:
        single = len(tok) == 1 and _is_hangul(tok)
        if single and prev_single_hangul and out:
            out[-1] += tok
        else:
            out.append(tok)
        prev_single_hangul = single
    return " ".join(out)


def detect_bubble_regions(image) -> list[BubbleRegion]:
    """Bulles claires à contour fermé, par composantes connexes blanches.

    ``image`` : tableau BGR/RGB (numpy) ou image PIL. Les bulles manhwa
    sont des zones blanches fermées par un liseré noir ; le fond blanc
    des gouttières touche les bords sur toute la hauteur et est écarté
    par les filtres de taille/remplissage.
    """
    try:
        import cv2
        import numpy as np

        if hasattr(image, "convert"):  # PIL
            array = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        else:
            array = image
            if array.ndim == 3:
                array = cv2.cvtColor(array, cv2.COLOR_BGR2GRAY)
        height, width = array.shape
        _, white = cv2.threshold(array, 205, 255, cv2.THRESH_BINARY)
        count, _labels, stats, _cent = cv2.connectedComponentsWithStats(white, 8)
    except Exception as exc:  # image illisible : aucun regroupement spatial
        logger.debug("[BubbleGrouping] Détection de bulles impossible : %s", exc)
        return []

    page_area = max(1, width * height)
    regions: list[BubbleRegion] = []
    for i in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[i])
        if w < 70 or h < 40:
            continue
        if not (0.0008 <= area / page_area <= 0.20):
            continue
        if w > width * 0.65 or h > height * 0.45:
            continue
        if area / max(1, w * h) < 0.48:  # zone claire morcelée (visage, ciel…)
            continue
        if not (0.45 <= w / max(1, h) <= 4.0):
            continue
        regions.append(BubbleRegion(x=x, y=y, w=w, h=h))
    regions.sort(key=lambda r: (r.y, r.x))
    return regions


def _is_junk(block: OCRBlockData) -> bool:
    if not _has_alnum(block.text or ""):
        return True
    if block.bbox_w < MIN_BOX_PX or block.bbox_h < MIN_BOX_PX:
        return True
    if block.confidence < MIN_CONFIDENCE:
        return True
    alnum = [ch for ch in block.text if ch.isalnum()]
    if len(alnum) == 1 and block.confidence < 0.50:
        return True  # caractère isolé peu fiable (faux positif sur visage)
    return False


def _reading_order(blocks: list[OCRBlockData]) -> list[OCRBlockData]:
    return sorted(blocks, key=lambda b: (b.bbox_y, b.bbox_x))


def _merge(blocks: list[OCRBlockData], source_lang: str) -> OCRBlockData:
    ordered = _reading_order(blocks)
    text = " ".join(clean_tokens(b.text) for b in ordered)
    text = " ".join(text.split())
    lang = (source_lang or "").strip().lower()
    if lang.startswith("ko"):
        text = normalize_korean_spacing(text)
    elif lang.startswith("zh") or lang.startswith("ja"):
        text = normalize_cjk_spacing(text)
    x0 = min(b.bbox_x for b in ordered)
    y0 = min(b.bbox_y for b in ordered)
    x1 = max(b.bbox_x + b.bbox_w for b in ordered)
    y1 = max(b.bbox_y + b.bbox_h for b in ordered)
    total = sum(max(1, len(b.text)) for b in ordered)
    confidence = sum(b.confidence * max(1, len(b.text)) for b in ordered) / total
    return OCRBlockData(
        text=text,
        bbox_x=x0,
        bbox_y=y0,
        bbox_w=max(1, x1 - x0),
        bbox_h=max(1, y1 - y0),
        confidence=round(confidence, 4),
        provider=ordered[0].provider,
    )


def _overlap_area(a: OCRBlockData, b: OCRBlockData) -> int:
    x = max(0, min(a.bbox_x + a.bbox_w, b.bbox_x + b.bbox_w) - max(a.bbox_x, b.bbox_x))
    y = max(0, min(a.bbox_y + a.bbox_h, b.bbox_y + b.bbox_h) - max(a.bbox_y, b.bbox_y))
    return x * y


def _dedupe(blocks: list[OCRBlockData]) -> list[OCRBlockData]:
    kept: list[OCRBlockData] = []
    for block in _reading_order(blocks):
        duplicate = None
        for other in kept:
            inter = _overlap_area(block, other)
            smaller = min(block.bbox_w * block.bbox_h, other.bbox_w * other.bbox_h)
            if smaller and inter / smaller > 0.7:
                duplicate = other
                break
        if duplicate is None:
            kept.append(block)
        elif block.confidence > duplicate.confidence:
            kept[kept.index(duplicate)] = block
    return kept


def _can_merge_lines(a: OCRBlockData, b: OCRBlockData) -> bool:
    avg_h = (a.bbox_h + b.bbox_h) / 2
    # Même ligne : recouvrement vertical fort, écart horizontal faible.
    v_overlap = max(0, min(a.bbox_y + a.bbox_h, b.bbox_y + b.bbox_h) - max(a.bbox_y, b.bbox_y))
    h_gap = max(b.bbox_x - (a.bbox_x + a.bbox_w), a.bbox_x - (b.bbox_x + b.bbox_w))
    if v_overlap >= 0.5 * min(a.bbox_h, b.bbox_h) and h_gap <= max(24.0, 1.2 * avg_h):
        return True
    # Lignes empilées d'une même bulle : recouvrement horizontal net,
    # écart vertical inférieur à une hauteur de ligne.
    h_overlap = max(0, min(a.bbox_x + a.bbox_w, b.bbox_x + b.bbox_w) - max(a.bbox_x, b.bbox_x))
    v_gap = max(b.bbox_y - (a.bbox_y + a.bbox_h), a.bbox_y - (b.bbox_y + b.bbox_h))
    return h_overlap >= 0.35 * min(a.bbox_w, b.bbox_w) and v_gap <= 0.85 * avg_h


def _geometric_group(blocks: list[OCRBlockData], source_lang: str) -> list[OCRBlockData]:
    groups: list[list[OCRBlockData]] = [[b] for b in blocks]
    changed = True
    while changed:
        changed = False
        for i in range(len(groups)):
            if changed:
                break
            for j in range(i + 1, len(groups)):
                merged_i = _merge(groups[i], source_lang)
                if any(_can_merge_lines(merged_i, b) for b in groups[j]):
                    groups[i] = groups[i] + groups[j]
                    del groups[j]
                    changed = True
                    break
    return [_merge(group, source_lang) for group in groups]


def _to_gray(image):
    """Convertit une image PIL ou numpy en niveaux de gris numpy."""
    if image is None:
        return None
    try:
        import cv2
        import numpy as np

        if hasattr(image, "convert"):
            return cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        if image.ndim == 3:
            return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return image
    except Exception:
        return None


def _light_ring_fraction(gray, block: OCRBlockData) -> float | None:
    """Fraction claire de l'anneau autour d'un bloc.

    Le texte de bulle repose sur un fond clair quasi uniforme ; le
    texte lu sur le dessin (barre de statut noire, SFX) est entouré
    de pixels sombres ou texturés.
    """
    if gray is None:
        return None
    height, width = gray.shape
    pad = max(8, block.bbox_h // 2)
    x0, y0 = max(0, block.bbox_x - pad), max(0, block.bbox_y - pad)
    x1, y1 = min(width, block.bbox_x + block.bbox_w + pad), min(height, block.bbox_y + block.bbox_h + pad)
    ring = gray[y0:y1, x0:x1].copy()
    ix0, iy0 = block.bbox_x - x0, block.bbox_y - y0
    ring[iy0 : iy0 + block.bbox_h, ix0 : ix0 + block.bbox_w] = 0
    total = ring.size - block.bbox_w * block.bbox_h
    if total <= 0:
        return None
    return float((ring > 200).sum()) / float(total)


def refine_blocks(
    blocks: list[OCRBlockData],
    bubbles: list[BubbleRegion] | None = None,
    source_lang: str = "",
    image_size: tuple[int, int] | None = None,
    image=None,
) -> list[OCRBlockData]:
    """Filtre le bruit et fusionne les lignes bulle par bulle."""
    gray = _to_gray(image)
    cleaned = [b for b in blocks if not _is_junk(b)]
    cleaned = _dedupe(cleaned)
    if not cleaned:
        return []

    bubbles = bubbles or []
    by_bubble: dict[int, list[OCRBlockData]] = {}
    outside: list[OCRBlockData] = []
    for block in cleaned:
        owner = None
        for idx, region in enumerate(bubbles):
            if region.contains_center(block):
                owner = idx
                break
        if owner is None:
            outside.append(block)
        else:
            by_bubble.setdefault(owner, []).append(block)

    results = [_merge(group, source_lang) for group in by_bubble.values()]

    page_h = image_size[1] if image_size else None
    page_w = image_size[0] if image_size else None
    for block in _geometric_group(outside, source_lang):
        if block.confidence < MIN_OUTSIDE_CONFIDENCE:
            continue
        if len(block.text.strip()) < 2:
            continue
        if page_h:
            cy = block.bbox_y + block.bbox_h / 2
            cx = block.bbox_x + block.bbox_w / 2
            # Chrome des captures source : compteur d'épisode tout en
            # bas, bouton « App… » de l'application de lecture en bas
            # à droite. Ni l'un ni l'autre n'est du texte de l'œuvre.
            if cy > 0.94 * page_h:
                continue
            if (
                page_w
                and cx > 0.6 * page_w
                and cy > 0.8 * page_h
                and block.text.strip().lower().startswith("app")
            ):
                continue
        light = _light_ring_fraction(gray, block)
        if light is not None:
            # Barre de statut du téléphone en tout haut de ces captures
            # (texte blanc sur bande noire) : ce n'est pas du manhwa.
            if page_h and block.bbox_y < 0.045 * page_h and light < 0.20:
                continue
            # Hors bulle accepté : fond clair (bulle manquée), fond
            # sombre (narration blanche sur noir, texte sur dessin
            # sombre) ou lecture très confiante sur fond texturé.
            # Seul le fond texturé incertain à confiance moyenne est jeté.
            if 0.25 <= light < 0.55 and block.confidence < 0.75:
                continue
        results.append(block)

    return _reading_order(results)
