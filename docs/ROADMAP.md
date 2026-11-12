# Taurge - Roadmap & Scope MVP

> Document synchronisé avec le code (état MVP 1). Les cases cochées sont
> implémentées et vérifiées ; les cases vides sont le travail restant.

## 1. Périmètre Actuel (MVP 1 Test)

### Ce qui est déjà opérationnel :
- [x] Inscription et authentification avec token JWT.
- [x] Création d'un projet avec sélection des langues source / cible et type de contenu.
- [x] Importation de fichiers (PDF, Images individuelles, Archives ZIP / CBZ avec protection anti-Zip Bomb et Path Traversal).
- [x] Extraction automatique des pages depuis un PDF (PyMuPDF) ou une archive ZIP/CBZ (tri naturel).
- [x] Exécution de l'OCR (MangaOCR pour `ja`, PaddleOCR sinon, repli Tesseract automatique ; moteurs lourds optionnels via `requirements-ocr.txt`).
- [x] Traduction automatique (Ollama local prioritaire → repli DeepL API Free ; fournisseur réel journalisé en base).
- [x] Édition et correction manuelle du texte détecté et du texte traduit + Mémoire de Traduction (`Translation Memory`) par similarité.
- [x] Nettoyage automatique des bulles (inpainting).
- [x] Visualisation des pages (originale vs nettoyée) et des blocs englobants.
- [x] Canvas de lettering interactif : texte traduit positionné sur l'image, déplacement/redimensionnement/création de bulles, édition inline, styles typographiques, historique Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`).
- [x] Glossaire par projet (termes verrouillés injectés dans la traduction par lot) + AI Quality Control (`AI QC` : détection d'erreurs, dépassements de bulle et violations du glossaire).
- [x] Équipe par projet (rôles translator/cleaner/typesetter/proofreader) + statut workflow par page.
- [x] Jobs asynchrones **persistants en base** (table `jobs` + worker thread, reprise au redémarrage) avec progression, annulation et flux SSE.
- [x] Export de projet en ZIP / CBZ / PDF (texte traduit incrusté) + métadonnées JSON.
- [x] Crédits réellement débités après succès (1/action/page), solde vérifié (402), journal ; recharge uniquement par webhooks signés (FedaPay/Paddle en mode test).
- [x] Stockage local par défaut, S3-compatible optionnel (`STORAGE_PROVIDER=s3`, boto3 optionnel) ; miniatures de pages générées (extraction ou à la demande).
- [x] Migrations Alembic versionnées (`alembic upgrade head`, synchronisation au démarrage).

---

## 2. Roadmap d'implémentation par Phases

### Phase 1 : Consolidation & Interface du Workspace — TERMINÉE
- [x] Composant visuel de lettering (canvas interactif maison).
- [x] Rendu du texte traduit directement positionné sur l'image nettoyée.
- [x] Sélection des styles typographiques (dialogue, cri, système, pensée, SFX).

### Phase 2 : Glossaire & Mémoire de Traduction
- [x] Détection et injection automatique des termes verrouillés dans la traduction par lot.
- [x] Recherche dans la Mémoire de Traduction (`GET /projects/{id}/translation-memory`) et suggestions en un clic dans l'éditeur.
- [x] Alertes de cohérence de nom, bulles non traduites et dépassements de bulles (Quality Control IA — `GET /projects/{id}/pages/{page_id}/qc`).
- [ ] Gestion avancée des fiches relationnelles (matrice de tutoiement/vouvoiement entre personnages).

### Phase 3 : Gestion Avancée des Fichiers & Performance
- [ ] Upload fragmenté (chunked upload / resumable) pour les volumes de plusieurs centaines de Mo.
- [x] Génération de miniatures (thumbnails) pour soulager le navigateur.
- [x] Export direct au format PDF assemblé en plus des formats ZIP/CBZ.
- [ ] Broker de jobs externe (Redis/Celery) pour le multi-instance à fort volume (aujourd'hui : file DB + worker thread, une exécution lourde à la fois par processus).

### Phase 4 : Monétisation & Facturation Locale
- [x] Base : abonnements, solde de crédits, journal de consommation.
- [x] Prélèvement réel des crédits sur les actions (OCR, traduction, nettoyage, batch).
- [x] Passerelles FedaPay (Mobile Money/cartes) et Paddle intégrées en mode test/sandbox (checkout 503 sans clé, crédit uniquement par webhook signé).
- [ ] Passage en production des paiements (clés réelles, montants XOF par pack) et gestion complète des abonnements (Free, Creator, Studio).
