"""Internationalisation des messages d'erreur de l'API (Section 43).

Le frontend envoie sa langue d'interface dans l'en-tête `Accept-Language`
(voir `apps/web/lib/api.ts`). Ce module :

1. négocie la locale (`fr` par défaut, `en` supporté) en respectant les
   poids `q` de l'en-tête ;
2. traduit les `detail` des `HTTPException` — les routeurs écrivent leurs
   messages en français, le gestionnaire d'exceptions de `app.main`
   appelle `translate_detail` pour répondre en anglais si besoin.

Ajouter une langue = ajouter une entrée dans `SUPPORTED_LOCALES` et
compléter `EN_TRANSLATIONS` (ou un futur dictionnaire par locale).
"""

from __future__ import annotations

import re

from fastapi import Request

SUPPORTED_LOCALES = ("fr", "en")
DEFAULT_LOCALE = "fr"


def parse_accept_language(header: str | None) -> str:
    """Négocie la locale depuis `Accept-Language` (ex : `en-US,en;q=0.9,fr;q=0.8`)."""
    if not header:
        return DEFAULT_LOCALE

    ranked: list[tuple[str, float]] = []
    for part in header.split(","):
        tag, _, params = part.strip().partition(";")
        quality = 1.0
        for param in params.split(";"):
            param = param.strip()
            if param.startswith("q="):
                try:
                    quality = float(param[2:])
                except ValueError:
                    quality = 0.0
        ranked.append((tag.strip().lower(), quality))

    ranked.sort(key=lambda item: item[1], reverse=True)
    for tag, quality in ranked:
        if quality <= 0:
            continue
        primary = tag.split("-")[0]
        if primary in SUPPORTED_LOCALES:
            return primary
        if tag == "*":
            return DEFAULT_LOCALE
    return DEFAULT_LOCALE


def get_locale(request: Request) -> str:
    """Locale négociée pour la requête (posée par le middleware, sinon recalculée)."""
    locale = getattr(request.state, "locale", None)
    if locale in SUPPORTED_LOCALES:
        return locale
    return parse_accept_language(request.headers.get("accept-language"))


async def locale_dependency(request: Request) -> str:
    """Dépendance FastAPI : `locale: str = Depends(locale_dependency)`."""
    return get_locale(request)


# ---------------------------------------------------------------------------
# Catalogue FR → EN des messages existants des routeurs.
# Les messages français restent la source : aucun routeur n'a à changer.
# ---------------------------------------------------------------------------

EN_TRANSLATIONS: dict[str, str] = {
    "Projet introuvable.": "Project not found.",
    "Le nom du projet ne peut pas \u00eatre vide.": "The project name cannot be empty.",
    "Page introuvable.": "Page not found.",
    "Fichier introuvable.": "File not found.",
    "Bloc introuvable.": "Block not found.",
    "Traduction introuvable.": "Translation not found.",
    "Export introuvable.": "Export not found.",
    "Entrée introuvable.": "Entry not found.",
    "Membre introuvable.": "Member not found.",
    "Tâche introuvable.": "Job not found.",
    "Utilisateur introuvable.": "User not found.",
    "Token invalide ou expiré.": "Invalid or expired token.",
    "Un compte existe déjà avec cet email.": "An account already exists with this email.",
    "Email ou mot de passe incorrect.": "Incorrect email or password.",
    "Les préférences de projet ne peuvent pas être vides.": "Project preferences cannot be empty.",
    "Les langues source et cible doivent être différentes.": "Source and target languages must be different.",
    "Type d’image introuvable.": "Image type not found.",
    "L’image doit faire 8 Mo maximum.": "The image must be 8 MB at most.",
    "Le fichier est vide.": "The file is empty.",
    "Les dimensions de l’image sont trop grandes.": "The image dimensions are too large.",
    "Formats acceptés : JPEG, PNG et WebP.": "Accepted formats: JPEG, PNG and WebP.",
    "Le fichier sélectionné n’est pas une image valide.": "The selected file is not a valid image.",
    "Aucune image de profil.": "No profile image.",
    "L’image de profil est indisponible.": "The profile image is unavailable.",
    "Le fichier d'export généré n'est plus présent sur le disque.": "The generated export file is no longer on disk.",
    "Seul le propriétaire du projet peut inviter des membres.": "Only the project owner can invite members.",
    "L'utilisateur est déjà le propriétaire du projet.": "This user is already the project owner.",
    "Cet utilisateur fait déjà partie de l'équipe.": "This user is already part of the team.",
    "Action réservée au propriétaire.": "Action restricted to the owner.",
    "Seul le créateur du projet peut gérer l'équipe.": "Only the project creator can manage the team.",
    "Le créateur du projet fait déjà partie de l'équipe.": "The project creator is already part of the team.",
    "Cet utilisateur fait déjà partie de l'équipe du projet.": "This user is already part of the project team.",
    "Cette page n'a pas encore été nettoyée.": "This page has not been cleaned yet.",
    "Ce fichier a déjà été extrait en pages.": "This file has already been extracted into pages.",
    "Une extraction est déjà en cours pour ce projet.": "An extraction is already running for this project.",
    "La liste doit contenir exactement toutes les pages du projet, sans doublon.": "The list must contain exactly all pages of the project, without duplicates.",
    "Ce fichier a déjà été extrait en pages.": "This file has already been extracted into pages.",
    "Aucun texte détecté sur cette page — lance d'abord l'OCR.": "No text detected on this page — run OCR first.",
    "Tous les blocs de cette page sont déjà traduits.": "All blocks on this page are already translated.",
    "Aucune page extraite dans ce projet.": "No extracted page in this project.",
}

# Messages dynamiques (f-strings) : préfixe français → modèle anglais.
_DYNAMIC_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"^Fichier trop volumineux \(max (?P<max>.+) Mo\)\.$"),
        "File too large (max {max} MB).",
    ),
    (
        re.compile(r"^Format de fichier non reconnu ou non supporté .*$", re.DOTALL),
        "Unrecognized or unsupported file format (PDF, PNG, JPG, WEBP only).",
    ),
    (
        re.compile(r"^Aucune page à exporter.*$", re.DOTALL),
        "No page to export — import and extract at least one page first.",
    ),
    (
        re.compile(r"^(?P<label>.+) est introuvable sur le disque .*$", re.DOTALL),
        "{label} is missing on disk (file moved or purged).",
    ),
    (re.compile(r"^Échec de l'OCR : (?P<error>.*)$", re.DOTALL), "OCR failed: {error}"),
    (re.compile(r"^Échec de la traduction : (?P<error>.*)$", re.DOTALL), "Translation failed: {error}"),
    (re.compile(r"^Échec traduction : (?P<error>.*)$", re.DOTALL), "Translation failed: {error}"),
    (re.compile(r"^Échec du nettoyage : (?P<error>.*)$", re.DOTALL), "Cleaning failed: {error}"),
    (
        re.compile(r"^Crédits insuffisants \((?P<remaining>\d+) restants, (?P<amount>\d+) requis\)\. .*$", re.DOTALL),
        "Insufficient credits ({remaining} remaining, {amount} required). Please top up your balance.",
    ),
    (
        re.compile(r"^Aucun utilisateur inscrit avec l'email (?P<email>.+)\.$"),
        "No registered user with the email {email}.",
    ),
    (
        re.compile(r"^Aucun utilisateur n'est inscrit avec l'email '(?P<email>.+)'\.$"),
        "No registered user with the email '{email}'.",
    ),
]


def translate_detail(detail: object, locale: str) -> object:
    """Traduit un `detail` d'HTTPException vers `locale` (fr = inchangé)."""
    if locale == DEFAULT_LOCALE or not isinstance(detail, str):
        return detail
    if locale == "en":
        if detail in EN_TRANSLATIONS:
            return EN_TRANSLATIONS[detail]
        for pattern, template in _DYNAMIC_PATTERNS:
            match = pattern.match(detail)
            if match:
                return template.format(**match.groupdict())
    return detail
