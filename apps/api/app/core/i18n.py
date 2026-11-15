"""Internationalisation des messages d'erreur et de statut de l'API (Section 43).

Le frontend envoie sa langue d'interface dans l'en-tête `Accept-Language`
(voir `apps/web/lib/api.ts`). Ce module :

1. négocie la locale (`fr` par défaut, `en` supporté) en respectant les
   poids `q` de l'en-tête ;
2. traduit les `detail` des `HTTPException` ainsi que les messages de statut
   de tâches (`Job.message`), les descriptions du journal de crédits et les
   réponses JSON — les routeurs et services écrivent leurs messages en
   français, `translate_detail` répond en anglais lorsque `locale == "en"`.

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


def _normalize_apostrophes(text: str) -> str:
    return text.replace("\u2019", "'")


# ---------------------------------------------------------------------------
# Catalogue FR → EN des messages statiques des routeurs, services et jobs.
# ---------------------------------------------------------------------------

EN_TRANSLATIONS: dict[str, str] = {
    # Entités & ressources
    "Projet introuvable.": "Project not found.",
    "Le nom du projet ne peut pas être vide.": "The project name cannot be empty.",
    "Page introuvable.": "Page not found.",
    "Page ou projet introuvable.": "Page or project not found.",
    "Fichier introuvable.": "File not found.",
    "Le fichier source est introuvable.": "Source file not found.",
    "Bloc introuvable.": "Block not found.",
    "Traduction introuvable.": "Translation not found.",
    "Export introuvable.": "Export not found.",
    "Entrée introuvable.": "Entry not found.",
    "Membre introuvable.": "Member not found.",
    "Tâche introuvable.": "Job not found.",
    "Tâche introuvable": "Job not found",
    "Utilisateur introuvable.": "User not found.",
    "Commentaire introuvable.": "Comment not found.",
    "Version introuvable.": "Version not found.",
    # Authentification, profil & sécurité
    "Token invalide ou expiré.": "Invalid or expired token.",
    "Un compte existe déjà avec cet email.": "An account already exists with this email.",
    "Email ou mot de passe incorrect.": "Incorrect email or password.",
    "Veuillez accepter les conditions d'utilisation et confirmer votre âge pour créer un compte.": "Please accept the terms of service and confirm your age to create an account.",
    "Trop de tentatives de connexion. Réessayez dans quelques minutes.": "Too many login attempts. Please try again in a few minutes.",
    "L'e-mail de confirmation ne correspond pas à votre compte.": "The confirmation email does not match your account.",
    "Votre mot de passe actuel est incorrect.": "Your current password is incorrect.",
    "Le nouveau mot de passe doit être différent de l'actuel.": "The new password must be different from the current password.",
    "Votre mot de passe a été modifié avec succès.": "Your password has been updated successfully.",
    "Les préférences de projet ne peuvent pas être vides.": "Project preferences cannot be empty.",
    "Les langues source et cible doivent être différentes.": "Source and target languages must be different.",
    "Type d'image introuvable.": "Image type not found.",
    "L'image doit faire 8 Mo maximum.": "The image must be 8 MB at most.",
    "Le fichier est vide.": "The file is empty.",
    "Les dimensions de l'image sont trop grandes.": "The image dimensions are too large.",
    "Formats acceptés : JPEG, PNG et WebP.": "Accepted formats: JPEG, PNG and WebP.",
    "Le fichier sélectionné n'est pas une image valide.": "The selected file is not a valid image.",
    "Aucune image de profil.": "No profile image.",
    "L'image de profil est indisponible.": "The profile image is unavailable.",
    # Projets, membres, collaboration & versions
    "Le fichier d'export généré n'est plus présent sur le disque.": "The generated export file is no longer on disk.",
    "Seul le propriétaire du projet peut inviter des membres.": "Only the project owner can invite members.",
    "L'utilisateur est déjà le propriétaire du projet.": "This user is already the project owner.",
    "Cet utilisateur fait déjà partie de l'équipe.": "This user is already part of the team.",
    "Action réservée au propriétaire.": "Action restricted to the owner.",
    "Seul le créateur du projet peut gérer l'équipe.": "Only the project creator can manage the team.",
    "Le créateur du projet fait déjà partie de l'équipe.": "The project creator is already part of the team.",
    "Cet utilisateur fait déjà partie de l'équipe du projet.": "This user is already part of the project team.",
    "Le commentaire ne peut pas être vide.": "The comment cannot be empty.",
    "Seul l'auteur du commentaire ou le propriétaire du projet peut le supprimer.": "Only the comment author or the project owner can delete it.",
    "Snapshot de version invalide.": "Invalid version snapshot.",
    # Pages, extraction, OCR, traduction & nettoyage
    "Cette page n'a pas encore été nettoyée.": "This page has not been cleaned yet.",
    "Ce fichier a déjà été extrait en pages.": "This file has already been extracted into pages.",
    "Une extraction est déjà en cours pour ce projet.": "An extraction is already running for this project.",
    "La liste doit contenir exactement toutes les pages du projet, sans doublon.": "The list must contain exactly all pages of the project, without duplicates.",
    "Aucun texte détecté sur cette page — lance d'abord l'OCR.": "No text detected on this page — run OCR first.",
    "Tous les blocs de cette page sont déjà traduits.": "All blocks on this page are already translated.",
    "Aucune page extraite dans ce projet.": "No extracted page in this project.",
    "Le PDF ne contient aucune page.": "The PDF contains no pages.",
    "Archive rejetée : taille décompressée maximale dépassée (protection anti zip-bomb).": "Archive rejected: maximum uncompressed size exceeded (zip-bomb protection).",
    "Archive ZIP/CBZ corrompue ou invalide.": "Corrupted or invalid ZIP/CBZ archive.",
    "Aucune image valide (PNG, JPG, WEBP) n'a été trouvée dans l'archive.": "No valid image (PNG, JPG, WEBP) was found in the archive.",
    "Aucune page n'a pu être extraite de l'archive.": "No page could be extracted from the archive.",
    "Aucune page n'a pu etre extraite de l'archive.": "No page could be extracted from the archive.",
    "Aucune page n'a pu être extraite de l'image.": "No page could be extracted from the image.",
    "Aucune page n'a pu etre extraite de l'image.": "No page could be extracted from the image.",
    "Session LaMa non disponible.": "LaMa session unavailable.",
    "Image illisible — format non supporté par OpenCV.": "Unreadable image — format not supported by OpenCV.",
    "Échec de l'encodage de l'image nettoyée.": "Failed to encode cleaned image.",
    "Image illisible par OpenCV.": "Image unreadable by OpenCV.",
    "Tesseract introuvable : installez Tesseract-OCR ou définissez la variable d'environnement TESSERACT_CMD.": "Tesseract not found: install Tesseract-OCR or set the TESSERACT_CMD environment variable.",
    "pytesseract n'est pas installé : `pip install pytesseract` (inclus dans requirements.txt).": "pytesseract is not installed: `pip install pytesseract` (included in requirements.txt).",
    "Traduction impossible — aucun moteur n'a répondu.": "Translation failed — no engine responded.",
    "DEEPL_API_KEY non configurée — DeepLProvider indisponible.": "DEEPL_API_KEY not configured — DeepLProvider unavailable.",
    "DeepL — réponse JSON inattendue (pas de translations).": "DeepL — unexpected JSON response (missing translations).",
    "DeepL — aucune traduction renvoyée.": "DeepL — no translation returned.",
    "Ollama — réponse JSON inattendue (pas de message.content).": "Ollama — unexpected JSON response (missing message.content).",
    "Ollama — aucune traduction renvoyée.": "Ollama — no translation returned.",
    # Tâches d'arrière-plan (Jobs)
    "En attente de démarrage...": "Waiting to start...",
    "Démarrage de la tâche...": "Starting job...",
    "Traitement du chapitre lancé en arrière-plan.": "Chapter batch processing started in the background.",
    "Extraction en attente…": "Extraction queued…",
    "Extraction lancée en arrière-plan.": "Extraction started in the background.",
    "OCR déjà en cours pour cette page.": "OCR is already running for this page.",
    "OCR en attente…": "OCR queued…",
    "OCR lancé en arrière-plan.": "OCR started in the background.",
    "Tâche interrompue par l'utilisateur.": "Job cancelled by user.",
    "Traitement arrêté.": "Processing stopped.",
    "Traitement interrompu (redémarrage du serveur). Relancez l'opération.": "Processing interrupted (server restart). Please run the operation again.",
    "Reprise du traitement après redémarrage…": "Resuming processing after restart…",
    "Préparation de l'extraction…": "Preparing extraction…",
    "Extraction de l'archive ZIP/CBZ…": "Extracting ZIP/CBZ archive…",
    "Initialisation du traitement...": "Initializing batch processing...",
    "Aucune page à traiter.": "No pages to process.",
    "Crédits insuffisants — tâche interrompue. Rechargez puis relancez.": "Insufficient credits — job interrupted. Please top up and try again.",
    "Chargement du moteur OCR (premier lancement plus long)…": "Loading OCR engine (first run may take longer)…",
    # Facturation, paiements & administration
    "Recharge de crédits": "Credit top-up",
    "Le nombre de crédits à ajouter doit être positif.": "The number of credits to add must be positive.",
    "Pack inconnu.": "Unknown credit pack.",
    "Passerelle inconnue.": "Unknown payment provider.",
    "La passerelle de paiement est injoignable.": "The payment gateway is unreachable.",
    "FedaPay non configuré (FEDAPAY_SECRET_KEY_TEST absente).": "FedaPay is not configured (missing FEDAPAY_SECRET_KEY_TEST).",
    "FedaPay n'a pas renvoyé d'URL de paiement.": "FedaPay did not return a checkout URL.",
    "Paddle non configuré (PADDLE_API_KEY absente).": "Paddle is not configured (missing PADDLE_API_KEY).",
    "Paddle n'a pas renvoyé d'URL de paiement (lien de paiement par défaut requis).": "Paddle did not return a checkout URL (default payment link required).",
    "Webhook non configuré (secret absent).": "Webhook not configured (missing secret).",
    "Signature webhook invalide.": "Invalid webhook signature.",
    "Charge utile webhook illisible.": "Unreadable webhook payload.",
    "Accès réservé aux administrateurs.": "Access restricted to administrators.",
    "Le montant de crédits doit être non nul.": "The credit amount must be non-zero.",
    "Ajustement administrateur": "Administrator adjustment",
    "Bonus administrateur": "Admin bonus",
}

_NORMALIZED_EN_TRANSLATIONS: dict[str, str] = {
    _normalize_apostrophes(k): v for k, v in EN_TRANSLATIONS.items()
}


def _translate_disk_label(label: str) -> str:
    norm = _normalize_apostrophes(label.strip())
    if norm == "Le fichier":
        return "The file"
    if norm == "Le fichier source":
        return "The source file"
    m = re.match(r"^L'image de la page (?P<num>\d+)$", norm)
    if m:
        return f"Page {m.group('num')} image"
    return label


# Messages dynamiques (f-strings) : préfixe français → modèle anglais.
_DYNAMIC_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"^Fichier trop volumineux \(max (?P<max>.+) Mo\)\.$"),
        "File too large (max {max} MB).",
    ),
    (
        re.compile(r"^Format de fichier non reconnu ou non supporté .*$", re.DOTALL),
        "Unrecognized or unsupported file format (PDF, PNG, JPG, WEBP, ZIP, CBZ only).",
    ),
    (
        re.compile(r"^Aucune page à exporter.*$", re.DOTALL),
        "No page to export — import and extract at least one page first.",
    ),
    (
        re.compile(r"^(?P<label>.+) est introuvable sur le disque .*$", re.DOTALL),
        "{label} is missing on disk (file moved or purged).",
    ),
    (re.compile(r"^Échec de l['\u2019]OCR : (?P<error>.*)$", re.DOTALL), "OCR failed: {error}"),
    (re.compile(r"^Échec de la traduction : (?P<error>.*)$", re.DOTALL), "Translation failed: {error}"),
    (re.compile(r"^Échec traduction : (?P<error>.*)$", re.DOTALL), "Translation failed: {error}"),
    (re.compile(r"^Échec du nettoyage : (?P<error>.*)$", re.DOTALL), "Cleaning failed: {error}"),
    (re.compile(r"^Échec de l['\u2019]extraction : (?P<error>.*)$", re.DOTALL), "Extraction failed: {error}"),
    (
        re.compile(r"^Crédits insuffisants \((?P<remaining>\d+) restants, (?P<amount>\d+) requis\)\. .*$", re.DOTALL),
        "Insufficient credits ({remaining} remaining, {amount} required). Please top up your balance.",
    ),
    (
        re.compile(r"^Aucun utilisateur inscrit avec l['\u2019]email (?P<email>.+)\.$"),
        "No registered user with the email {email}.",
    ),
    (
        re.compile(r"^Aucun utilisateur n['\u2019]est inscrit avec l['\u2019]email ['\u2019](?P<email>.+)['\u2019]\.$"),
        "No registered user with the email '{email}'.",
    ),
    # Archives & extraction
    (
        re.compile(r"^Fichier interne ['\u2019](?P<filename>.+)['\u2019] trop volumineux dans l['\u2019]archive \(max (?P<max>\d+) Mo\)\.$"),
        "Internal file '{filename}' is too large in the archive (max {max} MB).",
    ),
    (
        re.compile(r"^Fichier interne ['\u2019](?P<filename>.+)['\u2019] dépasse la limite autorisée \(protection anti zip-bomb\)\.$"),
        "Internal file '{filename}' exceeds the allowed limit (zip-bomb protection).",
    ),
    (
        re.compile(r"^Archive rejetée : chemin interdit détecté \(['\u2019](?P<filename>.+)['\u2019]\)\.$"),
        "Archive rejected: forbidden path detected ('{filename}').",
    ),
    (
        re.compile(r"^Archive rejetée : trop de fichiers \((?P<count>\d+) > (?P<max>\d+)\)\.$"),
        "Archive rejected: too many files ({count} > {max}).",
    ),
    (
        re.compile(r"^Nombre maximal de pages extraites dépassé \((?P<max>\d+)\)\.$"),
        "Maximum number of extracted pages exceeded ({max}).",
    ),
    # Progression des jobs
    (
        re.compile(r"^Extraction de (?P<total>\d+) pages[…\.]+$"),
        "Extracting {total} pages…",
    ),
    (
        re.compile(r"^Extraction de la page (?P<current>\d+)/(?P<total>\d+)[…\.]+$"),
        "Extracting page {current}/{total}…",
    ),
    (
        re.compile(r"^Extraction de la page (?P<index>\d+) depuis l['\u2019]archive[…\.]+$"),
        "Extracting page {index} from archive…",
    ),
    (
        re.compile(r"^Pr[eé]paration de (?P<total>\d+) page\(s\)[…\.]+$"),
        "Preparing {total} page(s)…",
    ),
    (
        re.compile(r"^Pr[eé]paration de la page (?P<current>\d+)/(?P<total>\d+)[…\.]+$"),
        "Preparing page {current}/{total}…",
    ),
    (
        re.compile(r"^Extraction terminée : (?P<total>\d+) page\(s\)\.$"),
        "Extraction completed: {total} page(s).",
    ),
    (
        re.compile(r"^Traitement de la page (?P<current>\d+)/(?P<total>\d+)[…\.]+$"),
        "Processing page {current}/{total}...",
    ),
    (
        re.compile(r"^Chapitre terminé avec succès \((?P<total>\d+) pages\) !$"),
        "Chapter completed successfully ({total} pages)!",
    ),
    (
        re.compile(r"^OCR terminé : (?P<count>\d+) bloc\(s\) détecté\(s\)\.$"),
        "OCR completed: {count} block(s) detected.",
    ),
    # Moteurs OCR
    (
        re.compile(
            r"^Aucun moteur OCR disponible sur cette machine\. Moteur principal \((?P<primary>[^)]+)\) : (?P<primary_exc>.*) Repli Tesseract : (?P<fallback_exc>.*)$",
            re.DOTALL,
        ),
        "No OCR engine available on this machine. Primary engine ({primary}): {primary_exc} Tesseract fallback: {fallback_exc}",
    ),
    (
        re.compile(r"^OCR interrompu après (?P<seconds>\d+) s : .*$", re.DOTALL),
        "OCR timed out after {seconds}s: page too heavy or engine still loading. Please try again — the engine stays loaded in memory after the first run.",
    ),
    (
        re.compile(r"^manga-ocr indisponible sur cette machine \((?P<error>.*)\) : .*$", re.DOTALL),
        "manga-ocr is unavailable on this machine ({error}): `pip install -r requirements-ocr.txt`, or Tesseract fallback (jpn).",
    ),
    (
        re.compile(r"^manga-ocr n['\u2019]a pas pu charger son modèle sur cette machine \((?P<error>.*)\) — .*$", re.DOTALL),
        "manga-ocr could not load its model on this machine ({error}) — falling back to Tesseract.",
    ),
    (
        re.compile(r"^PaddleOCR indisponible sur cette machine \(bibliothèque native libpaddle non chargée : (?P<error>.*)\)\. .*$", re.DOTALL),
        "PaddleOCR is unavailable on this machine (native library libpaddle not loaded: {error}). Common cause: PaddlePaddle compiled with AVX on a CPU without AVX — falling back to Tesseract.",
    ),
    # Moteurs de traduction (Ollama / DeepL)
    (
        re.compile(r"^Ollama : (?P<got>\d+) traduction\(s\) reçue\(s\), (?P<expected>\d+) attendue\(s\)\.$"),
        "Ollama: {got} translation(s) received, {expected} expected.",
    ),
    (
        re.compile(r"^Traduction impossible — Ollama et DeepL ont échoué : (?P<error>.*)$", re.DOTALL),
        "Translation failed — both Ollama and DeepL failed: {error}",
    ),
    (
        re.compile(r"^Traduction impossible — DeepL : (?P<got>\d+) traduction\(s\) reçue\(s\), (?P<expected>\d+) attendue\(s\)\.$"),
        "Translation failed — DeepL: {got} translation(s) received, {expected} expected.",
    ),
    (
        re.compile(r"^DeepL : (?P<got>\d+) traduction\(s\) reçue\(s\), (?P<expected>\d+) attendue\(s\)\.$"),
        "DeepL: {got} translation(s) received, {expected} expected.",
    ),
    (
        re.compile(r"^DeepL — délai dépassé : (?P<error>.*)$", re.DOTALL),
        "DeepL — request timed out: {error}",
    ),
    (
        re.compile(r"^DeepL — erreur HTTP (?P<code>\d+) : (?P<text>.*)$", re.DOTALL),
        "DeepL — HTTP error {code}: {text}",
    ),
    (
        re.compile(r"^DeepL — API injoignable \((?P<url>[^)]+)\) : (?P<error>.*)$", re.DOTALL),
        "DeepL — API unreachable ({url}): {error}",
    ),
    (
        re.compile(r"^Ollama — délai dépassé \((?P<url>[^)]+)\) : (?P<error>.*)$", re.DOTALL),
        "Ollama — request timed out ({url}): {error}",
    ),
    (
        re.compile(r"^Ollama — erreur HTTP (?P<code>\d+) : (?P<text>.*)$", re.DOTALL),
        "Ollama — HTTP error {code}: {text}",
    ),
    (
        re.compile(r"^Ollama — instance injoignable \((?P<url>[^)]+)\) : (?P<error>.*)$", re.DOTALL),
        "Ollama — instance unreachable ({url}): {error}",
    ),
    # Facturation & journal de crédits
    (
        re.compile(r"^Consommation (?P<action>.+) \(-(?P<amount>\d+) crédits\)$"),
        "Credit usage: {action} (-{amount} credits)",
    ),
    (
        re.compile(r"^Recharge de solde \(\+(?P<amount>\d+) crédits\)$"),
        "Balance top-up (+{amount} credits)",
    ),
    (
        re.compile(r"^(?P<amount>\d+) crédits ajoutés avec succès !$"),
        "{amount} credits added successfully!",
    ),
    (
        re.compile(r"^Montant XOF non configuré pour le pack (?P<pack>.+) \(FEDAPAY_AMOUNT_XOF_\*\)\.$"),
        "XOF amount not configured for pack {pack} (FEDAPAY_AMOUNT_XOF_*).",
    ),
    (
        re.compile(r"^Prix Paddle non configuré pour le pack (?P<pack>.+) \(PADDLE_PRICE_ID_\*\)\.$"),
        "Paddle price not configured for pack {pack} (PADDLE_PRICE_ID_*).",
    ),
    (
        re.compile(r"^Achat (?P<provider>.+) — pack (?P<pack>.+) \(\+(?P<credits>\d+) crédits\)$"),
        "{provider} purchase — {pack} pack (+{credits} credits)",
    ),
    (
        re.compile(r"^\[Admin (?P<email>[^\]]+)\] (?P<reason>.*)$"),
        "[Admin {email}] {reason}",
    ),
]


def translate_detail(detail: object, locale: str) -> object:
    """Traduit un `detail` ou message vers `locale` (`fr` = inchangé)."""
    if locale == DEFAULT_LOCALE or not isinstance(detail, str):
        return detail
    if locale == "en":
        if detail in EN_TRANSLATIONS:
            return EN_TRANSLATIONS[detail]
        norm = _normalize_apostrophes(detail)
        if norm in _NORMALIZED_EN_TRANSLATIONS:
            return _NORMALIZED_EN_TRANSLATIONS[norm]
        for pattern, template in _DYNAMIC_PATTERNS:
            match = pattern.match(detail)
            if match:
                groups = dict(match.groupdict())
                if "label" in groups:
                    groups["label"] = _translate_disk_label(groups["label"])
                for nested_key in ("error", "primary_exc", "fallback_exc", "reason"):
                    if nested_key in groups and groups[nested_key]:
                        groups[nested_key] = str(translate_detail(groups[nested_key], locale))
                return template.format(**groups)
    return detail
