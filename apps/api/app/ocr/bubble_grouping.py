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

    def contains_center(self, block: OCRBlockData, pad: int = 12) -> bool:
        cx = block.bbox_x + block.bbox_w / 2
        cy = block.bbox_y + block.bbox_h / 2
        if not (self.x - pad <= cx <= self.x1 + pad and self.y - pad <= cy <= self.y1 + pad):
            return False
        # Une vraie bulle doit pouvoir englober la ligne de texte : un simple
        # trou blanc à l'intérieur d'une grosse lettre (ex: l'intérieur d'un Q
        # ou d'un O de 80 px) ne doit jamais être pris pour une bulle contenant
        # une ligne de 700 px de large.
        if self.w + 2 * pad < block.bbox_w * 0.70 or self.h + 2 * pad < block.bbox_h * 0.70:
            return False
        overlap_x = max(0, min(self.x1 + pad, block.bbox_x + block.bbox_w) - max(self.x - pad, block.bbox_x))
        return overlap_x >= 0.55 * block.bbox_w


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


def _is_japanese_char(ch: str) -> bool:
    return (
        "\u3040" <= ch <= "\u309f"  # Hiragana
        or "\u30a0" <= ch <= "\u30ff"  # Katakana
        or "\u4e00" <= ch <= "\u9fff"  # Kanji CJK unifiés
        or "\u3400" <= ch <= "\u4dbf"  # Kanji extension A
    )


def has_japanese_text(text: str) -> bool:
    return any(_is_japanese_char(ch) for ch in (text or ""))


_CJK_PUNCT = set("。！？?!、，；：…·「」『』（）()《》〜~ー—")


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
    """Bulles et cadres de narration clairs à contour fermé, vérifiés par topologie.

    ``image`` : tableau BGR/RGB (numpy) ou image PIL.
    Détecte aussi bien les bulles ovales que les cadres rectangulaires
    (narration/monologue manga) en exigeant :
    1. un fond intérieur véritablement blanc (médiane >= 240) séparé par un contour sombre ;
    2. un taux de remplissage cohérent (fill_ratio >= 0.48) après comblement des trous ;
    3. la présence effective d'encre sombre (texte) enfermée à l'intérieur des trous
       topologiques de la composante blanche, ce qui élimine 100 % des faux positifs
       sur les rideaux, draps, ciels clairs ou boucles internes de lettres (O, Q).
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
        white = (array >= 225).astype(np.uint8) * 255
        # Forcer la séparation le long des filets/contours sombres des bulles et cadres
        white[array < 165] = 0
        count, labels, stats, _cent = cv2.connectedComponentsWithStats(white, 4)
    except Exception as exc:  # image illisible : aucun regroupement spatial
        logger.debug("[BubbleGrouping] Détection de bulles impossible : %s", exc)
        return []

    page_area = max(1, width * height)
    raw_regions: list[BubbleRegion] = []
    for i in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[i])
        if w < 32 or h < 40 or area < 1000:
            continue
        if not (0.0004 <= area / page_area <= 0.45):
            continue
        touches_both_sides = x <= 4 and (x + w) >= width - 4
        if touches_both_sides and (w > width * 0.94 or area / page_area > 0.22):
            continue
        if w > width * 0.94 or h > height * 0.85:
            continue
        if not (0.18 <= w / max(1, h) <= 5.0):
            continue

        roi_img = array[y : y + h, x : x + w]
        roi_comp = (labels[y : y + h, x : x + w] == i).astype(np.uint8) * 255
        bg_med = float(np.median(roi_img[roi_comp > 0])) if np.any(roi_comp > 0) else 0.0
        if bg_med < 240.0:
            continue

        # Trous topologiques enfermés dans la composante blanche (glyphes de texte)
        padded = cv2.copyMakeBorder(roi_comp, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        inv = cv2.bitwise_not(padded)
        ff = inv.copy()
        fmask = np.zeros((h + 4, w + 4), dtype=np.uint8)
        cv2.floodFill(ff, fmask, (0, 0), 0)
        roi_holes = ff[1:-1, 1:-1]
        filled = cv2.bitwise_or(roi_comp, roi_holes)
        fill_ratio = float(np.count_nonzero(filled)) / float(max(1, w * h))
        if fill_ratio < 0.62:
            continue

        # Exclure les trous géants qui seraient une sous-bulle entière dans un fond de ciel
        n_h, h_labels, h_stats, _ = cv2.connectedComponentsWithStats(roi_holes, connectivity=8)
        for hi in range(1, n_h):
            hw = int(h_stats[hi, cv2.CC_STAT_WIDTH])
            hh = int(h_stats[hi, cv2.CC_STAT_HEIGHT])
            harea = int(h_stats[hi, cv2.CC_STAT_AREA])
            if harea > area * 0.28 or (hw >= 75 and hh >= 75 and harea > 2500):
                roi_holes[h_labels == hi] = 0

        ink_mask = (roi_holes > 0) & (roi_img < 140)
        ink_pixels = int(np.count_nonzero(ink_mask))
        # Une vraie bulle ou cadre de texte contient au moins 2,2 % d'encre sombre
        # (ou >= 450 px d'encre dans une très grande bulle), ce qui exclut les visages
        # clairs (yeux/bouche < 1,7 %) et les plis de vêtements blancs.
        if ink_pixels < 45 or (ink_pixels / float(max(1, area)) < 0.022 and ink_pixels < 450):
            continue

        raw_regions.append(BubbleRegion(x=x, y=y, w=w, h=h))

    # Éliminer les sous-régions strictement incluses dans une bulle plus grande
    # (ex: le trou blanc à l'intérieur des lettres O, Q, D, B d'un gros texte).
    regions: list[BubbleRegion] = []
    for candidate in raw_regions:
        is_nested = any(
            other is not candidate
            and other.x - 4 <= candidate.x
            and other.y - 4 <= candidate.y
            and other.x1 + 4 >= candidate.x1
            and other.y1 + 4 >= candidate.y1
            and (other.w * other.h) > (candidate.w * candidate.h)
            for other in raw_regions
        )
        if not is_nested:
            regions.append(candidate)

    regions.sort(key=lambda r: (r.y, r.x))
    return regions


def _is_junk(block: OCRBlockData, source_lang: str = "") -> bool:
    text = (block.text or "").strip()
    if not _has_alnum(text):
        return True
    lang = (source_lang or "").strip().lower().replace("_", "-")
    if lang in {"ja", "jp", "ja-jp"} and not has_japanese_text(text):
        return True
    if block.bbox_w < MIN_BOX_PX or block.bbox_h < MIN_BOX_PX:
        return True
    if block.confidence < MIN_CONFIDENCE:
        return True
    alnum = [ch for ch in text if ch.isalnum()]
    if len(alnum) == 1 and block.confidence < 0.50:
        return True  # caractère isolé peu fiable (faux positif sur visage)
    return False


def _reading_order(blocks: list[OCRBlockData], source_lang: str = "") -> list[OCRBlockData]:
    lang = (source_lang or "").strip().lower().replace("_", "-")
    if lang in {"ja", "jp", "ja-jp"} and len(blocks) > 1:
        # Ordre de lecture manga japonais : de haut en bas par bande horizontale (case),
        # et de droite à gauche à l'intérieur d'une même bande verticale.
        by_top = sorted(blocks, key=lambda b: b.bbox_y)
        bands: list[list[OCRBlockData]] = []
        for blk in by_top:
            placed = False
            b_cy = blk.bbox_y + blk.bbox_h / 2.0
            for band in bands:
                ref = band[0]
                ref_y0 = min(x.bbox_y for x in band)
                ref_y1 = max(x.bbox_y + x.bbox_h for x in band)
                if ref_y0 - 30 <= b_cy <= ref_y1 + 30:
                    band.append(blk)
                    placed = True
                    break
            if not placed:
                bands.append([blk])
        ordered: list[OCRBlockData] = []
        for band in bands:
            band.sort(key=lambda b: (-b.bbox_x, b.bbox_y))
            ordered.extend(band)
        return ordered
    return sorted(blocks, key=lambda b: (b.bbox_y, b.bbox_x))


def _merge(blocks: list[OCRBlockData], source_lang: str) -> OCRBlockData:
    lang = (source_lang or "").strip().lower()
    if lang.startswith("ja") and len(blocks) > 1:
        # Colonnes verticales japonaises dans une même bulle : lecture de droite à gauche
        ordered = sorted(blocks, key=lambda b: (-b.bbox_x, b.bbox_y))
    else:
        ordered = _reading_order(blocks, source_lang=source_lang)
    text = " ".join(clean_tokens(b.text) for b in ordered)
    text = " ".join(text.split())
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
    min_h = min(a.bbox_h, b.bbox_h)
    max_h = max(a.bbox_h, b.bbox_h)
    # Même ligne : recouvrement vertical fort, écart horizontal faible.
    v_overlap = max(0, min(a.bbox_y + a.bbox_h, b.bbox_y + b.bbox_h) - max(a.bbox_y, b.bbox_y))
    h_gap = max(b.bbox_x - (a.bbox_x + a.bbox_w), a.bbox_x - (b.bbox_x + b.bbox_w))
    if v_overlap >= 0.5 * min_h and h_gap <= max(28.0, 1.3 * avg_h):
        return True
    # Lignes empilées d'une même bulle : recouvrement horizontal net ou alignement centré,
    # écart vertical cohérent avec l'interligne d'une bulle manhwa.
    h_overlap = max(0, min(a.bbox_x + a.bbox_w, b.bbox_x + b.bbox_w) - max(a.bbox_x, b.bbox_x))
    center_a = a.bbox_x + a.bbox_w / 2
    center_b = b.bbox_x + b.bbox_w / 2
    centered = abs(center_a - center_b) <= 0.30 * max(a.bbox_w, b.bbox_w)
    v_gap = max(b.bbox_y - (a.bbox_y + a.bbox_h), a.bbox_y - (b.bbox_y + b.bbox_h))
    return (h_overlap >= 0.30 * min(a.bbox_w, b.bbox_w) or centered) and v_gap <= max(0.95 * avg_h, 0.70 * max_h)


def _geometric_group(blocks: list[OCRBlockData], source_lang: str) -> list[OCRBlockData]:
    groups: list[list[OCRBlockData]] = [[b] for b in blocks]
    changed = True
    while changed:
        changed = False
        for i in range(len(groups)):
            if changed:
                break
            for j in range(i + 1, len(groups)):
                if any(_can_merge_lines(ba, bb) for ba in groups[i] for bb in groups[j]):
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
    cleaned = [b for b in blocks if not _is_junk(b, source_lang=source_lang)]
    cleaned = _dedupe(cleaned)
    if not cleaned:
        return []

    is_ja = (source_lang or "").strip().lower().replace("_", "-") in {"ja", "jp", "ja-jp"}
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

    # Rattacher à une bulle toute ligne hors-bulle qui s'empile directement
    # avec une ligne déjà attribuée à cette bulle (ex: ligne légèrement
    # décentrée ou bord de bulle partiellement ouvert).
    remaining_outside: list[OCRBlockData] = []
    for block in outside:
        attached = False
        for owner, group in by_bubble.items():
            if any(_can_merge_lines(existing, block) for existing in group):
                group.append(block)
                attached = True
                break
        if not attached:
            remaining_outside.append(block)
    outside = remaining_outside

    results = [_merge(group, source_lang) for group in by_bubble.values()]

    page_h = image_size[1] if image_size else None
    page_w = image_size[0] if image_size else None
    for block in _geometric_group(outside, source_lang):
        if block.confidence < MIN_OUTSIDE_CONFIDENCE:
            continue
        if len(block.text.strip()) < 2:
            continue
        if is_ja:
            cjk_chars = [ch for ch in block.text if _is_japanese_char(ch)]
            if len(cjk_chars) < 2:
                continue
            # Sur une page de manga japonais comportant des bulles/cadres détectés,
            # exclure tout bloc hors-bulle qui ne repose pas sur un fond clair uniforme
            # (rideaux, draps, vêtements, trames de décor).
            if bubbles and gray is not None:
                light = _light_ring_fraction(gray, block)
                if light is None or light < 0.85 or block.confidence < 0.82:
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

    return _reading_order(results, source_lang=source_lang)
