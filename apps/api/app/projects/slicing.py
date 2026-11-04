"""Module de découpage intelligent des Webtoons (Smart Webtoon Slicing).

Les webtoons et manhwas sont souvent publiés sous forme de très longues
bandes verticales continues (souvent 5 000 à 25 000 pixels de hauteur).

Ce module détecte automatiquement ces bandes et repère les 'gouttières'
(espaces blancs ou noirs neutres entre les cases) pour découper l'image
en pages ergonomiques (typiquement 2 000 à 2 500 px de haut) sans jamais
couper au milieu d'un dessin ou d'une bulle de dialogue.
"""

import io
import cv2
import numpy as np
from PIL import Image

# Hauteur cible idéale d'une page découpée (en pixels)
TARGET_SLICE_HEIGHT = 2200
# Hauteur minimale en dessous de laquelle on ne découpe pas
MIN_SLICE_HEIGHT = 1400
# Seuil de déclenchement : si la hauteur dépasse ce seuil et ratio > 2.0
TRIGGER_HEIGHT = 3500


def is_webtoon_strip(width: int, height: int) -> bool:
    """Détecte si une image a les proportions d'une longue bande webtoon."""
    if height < TRIGGER_HEIGHT:
        return False
    ratio = height / max(1, width)
    return ratio >= 2.2


def find_best_cut_point(
    gray: np.ndarray,
    search_start: int,
    search_end: int,
) -> int:
    """Trouve la meilleure ligne de coupe horizontale dans une zone donnée.
    
    Une bonne ligne de coupe est une rangée de pixels uniforme (gouttière
    inter-cases blanche ou noire) avec une variance de couleur minimale
    et peu de contours/détails.
    """
    height, width = gray.shape
    search_start = max(0, min(height - 1, search_start))
    search_end = max(search_start + 1, min(height, search_end))

    sub_region = gray[search_start:search_end, :]

    # 1. Variance horizontale de chaque ligne : une ligne uniforme a une variance très faible
    row_variances = np.var(sub_region, axis=1)

    # 2. Détection de contours (gradient vertical / horizontal)
    # Lignes sans contours = gouttières vierges
    sobel_y = cv2.Sobel(sub_region, cv2.CV_64F, 0, 1, ksize=3)
    edge_energy = np.mean(np.abs(sobel_y), axis=1)

    # Score combiné : on cherche le minimum d'énergie
    scores = row_variances + (edge_energy * 2.0)

    # Lissage gaussien pour privilégier le centre des larges gouttières
    kernel_size = 15
    if len(scores) >= kernel_size:
        kernel = cv2.getGaussianKernel(kernel_size, 3)
        smoothed_scores = cv2.filter2D(scores[:, np.newaxis], -1, kernel).ravel()
    else:
        smoothed_scores = scores

    best_local_idx = int(np.argmin(smoothed_scores))
    return search_start + best_local_idx


def iter_webtoon_slices(content: bytes):
    """Produit les tranches une par une : (png_bytes, width, height).

    L'image décodée complète doit vivre en mémoire (on y découpe),
    mais ni la copie niveaux de gris après le calcul des coupes, ni
    l'ensemble des tranches encodées ne sont conservés : chaque PNG
    est émis puis libéré. Sur une bande de 25 000 px, la version liste
    gardait toutes les pages encodées en RAM en plus de l'image —
    de quoi dépasser un plafond mémoire de 512 Mo.
    """
    # Décodage OpenCV
    nparr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        # Repli PIL si OpenCV échoue
        with Image.open(io.BytesIO(content)) as pil_img:
            image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    height, width = image.shape[:2]

    # Si ce n'est pas un webtoon géant, on conserve l'image telle quelle
    if not is_webtoon_strip(width, height):
        success, encoded = cv2.imencode(".png", image)
        yield (encoded.tobytes() if success else content, width, height)
        return

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    cut_points = [0]
    current_y = 0

    while current_y + TARGET_SLICE_HEIGHT < height:
        # Fenêtre de recherche de gouttière autour de la hauteur cible
        ideal_cut = current_y + TARGET_SLICE_HEIGHT
        search_min = current_y + MIN_SLICE_HEIGHT
        search_max = min(height, ideal_cut + 800)

        best_cut = find_best_cut_point(gray, search_min, search_max)
        cut_points.append(best_cut)
        current_y = best_cut

    # Dernier point de coupe = fin de l'image
    cut_points.append(height)

    # Les coupes sont connues : la copie niveaux de gris ne sert plus.
    del gray

    for i in range(len(cut_points) - 1):
        y0 = cut_points[i]
        y1 = cut_points[i + 1]

        # Ignorer les tranches minuscules aberrantes
        if y1 - y0 < 100:
            continue

        slice_bgr = image[y0:y1, :]
        slice_h, slice_w = slice_bgr.shape[:2]

        success, encoded = cv2.imencode(".png", slice_bgr)
        if success:
            yield (encoded.tobytes(), slice_w, slice_h)


def slice_webtoon_image(content: bytes) -> list[tuple[bytes, int, int]]:
    """Découpe une image webtoon géante en plusieurs tranches de hauteur raisonnable.

    Retourne une liste de tuples : (png_bytes, width, height)
    Si l'image n'est pas une bande webtoon, retourne une liste avec l'image unique.

    Conservé pour compatibilité ; préférer `iter_webtoon_slices` dès
    que les tranches peuvent être écrites au fil de l'eau (mémoire).
    """
    return list(iter_webtoon_slices(content))
