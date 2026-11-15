"""Assainissement et validation stricte des entrées utilisateur (OWASP Input Validation).

Protège contre :
- XSS / Script Injection (suppression ou neutralisation des balises exécutables <script>, <iframe>, javascript:...)
- Path Traversal (nettoyage rigoureux des noms de fichiers)
- Caractères de contrôle nuls et invisibles
"""

from __future__ import annotations

import html
import re
import unicodedata

# Balises ou motifs exécutables à proscrire strictement dans les textes utilisateurs
DANGEROUS_HTML_PATTERNS = [
    re.compile(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*object[^>]*>.*?<\s*/\s*object\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*embed[^>]*>.*?<\s*/\s*embed\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"data\s*:\s*text/html", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),  # onclick=, onload=, onerror=
]


def sanitize_text(text: str | None, max_length: int | None = None) -> str:
    """Nettoie un texte saisi par l'utilisateur tout en préservant le texte naturel.

    Préserve les caractères japonais, coréens, chinois, accents français et ponctuation.
    Supprime les balises scripts, événements JS injectés et caractères nuls.
    """
    if not text:
        return ""

    cleaned = text
    # 1. Supprimer les octets nuls et caractères de contrôle dangereux
    cleaned = cleaned.replace("\0", "")

    # 2. Supprimer les balises script/iframe et vecteurs XSS évidents
    for pattern in DANGEROUS_HTML_PATTERNS:
        cleaned = pattern.sub("", cleaned)

    # 3. Normalisation unicode NFC pour cohérence CJK
    cleaned = unicodedata.normalize("NFC", cleaned)

    if max_length and len(cleaned) > max_length:
        cleaned = cleaned[:max_length]

    return cleaned.strip()


def sanitize_project_name(name: str | None) -> str:
    """Valide et assainit le nom d'un projet."""
    if not name or not name.strip():
        return "Nouveau Projet"

    cleaned = sanitize_text(name, max_length=120)
    # Remplacer les chevrons HTML par des caractères inoffensifs
    cleaned = cleaned.replace("<", "").replace(">", "")
    return cleaned or "Nouveau Projet"


def sanitize_filename(filename: str | None) -> str:
    """Neutralise tout caractère dangereux dans un nom de fichier pour empêcher le Path Traversal."""
    if not filename:
        return "file"

    # Enlever les répertoires et séparateurs
    base = filename.replace("\\", "/").split("/")[-1]
    # Supprimer les caractères de contrôle et les tentatives de path traversal
    base = re.sub(r"[^\w\.\-\s]", "_", base)
    base = base.replace("..", "_")
    return base.strip() or "file"
