# Taurge - Master Architecture Document

> Document synchronisé avec le code (état MVP 1). Les mentions « prévu »
> désignent un travail futur explicite, tout le reste est implémenté.

## 1. Vision & Principes Directeurs
Taurge est un **workspace SaaS professionnel de localisation assistée par IA pour le contenu illustré** (Manga, Manhwa, Manhua, Webtoon, Comics).

Principes fondamentaux :
1. **L'humain a le contrôle absolu** : L'IA propose, l'humain valide ou corrige.
2. **Non-destructivité des sources** : Les originaux et les calques de modifications restent isolés et préservés.
3. **Architecture découplée & provider-agnostique** : OCR, Traduction, Stockage et Cleaning sont branchés derrière des interfaces (`OCRProvider`, `TranslationProvider`, `StorageProvider`), interchangeables sans toucher le reste du pipeline.
4. **Traitement asynchrone pour les opérations lourdes** : Découpage des chapitres/volumes en pages et jobs d'arrière-plan.
5. **Portabilité et conformité** : L'utilisateur apporte ses fichiers autorisés ; exports complets sans dépendance propriétaire.

---

## 2. Architecture Globale du Système

```
FRONTEND (Next.js, App Router)
  - Workspace interactif (Canvas, sélection de blocs, zoom/pan)
  - Dashboard de projets, Wizard d'import & pipelines
  - Authentification, rôles & crédits

              | REST + SSE
              v

BACKEND (FastAPI)
  - Auth & RBAC (JWT, bcrypt, rôles par projet : owner + équipe)
  - Project & Page Management (métadonnées, hiérarchie)
  - Storage Service (local par défaut ; S3-compatible optionnel)
  - Pipeline Dispatcher (Extraction PDF, OCR, Traduction, Clean)
  - Export Engine (ZIP, CBZ, PDF + métadonnées JSON)
  - Billing & Metering (crédits débités ; FedaPay / Paddle en mode test)

              |                               |
              v                               v

SQLite (dev) / PostgreSQL (prod)    Stockage fichiers local ou S3
via SQLModel + Alembic              (flux authentifiés JWT)
```

---

## 3. Découpage Modulaire des Services Backend

1. **Auth Service** : Inscription, login JWT, rôles par projet (owner + équipe : translator, cleaner, typesetter, proofreader), profil et préférences.
2. **Project & File Service** : Upload PDF/Images (validation par magic bytes, limite 50 Mo, pas de chunk upload), extraction des pages (PyMuPDF, 150 DPI).
3. **OCR Engine** : Interface `OCRProvider`, orchestrée par `OCRService` (`app/ocr/ocr_service.py`) : japonais (`ja`) → MangaOCR, toute autre langue → PaddleOCR, et repli automatique sur Tesseract si le moteur principal est indisponible sur la machine (une seule tentative du moteur cassé par processus). Sortie regroupée par bulle (`app/ocr/bubble_grouping.py`), boîtes englobantes en pixels (`bbox_x, bbox_y, bbox_w, bbox_h`), budget par page borné (`OCR_TIMEOUT_SECONDS`, défaut 240 s). PaddleOCR et MangaOCR sont des dépendances **optionnelles** (`apps/api/requirements-ocr.txt`, ou `docker build --build-arg INSTALL_OCR=true`) : sans elles, l'API tourne et Tesseract assure seul l'OCR.
4. **Translation Service** : Interface `TranslationProvider` ; chaîne réelle Ollama (local, prioritaire, glossaire injecté dans le prompt, budget borné quand DeepL est disponible) → repli DeepL API Free. Le fournisseur ayant réellement traduit est journalisé en base (`Translation.provider` : `ollama` ou `deepl`). Si les deux moteurs échouent, erreur explicite : jamais de texte source renvoyé comme traduction. Pas de mémoire de traduction ni de fiches personnages.
5. **Inpainting / Cleaning Service** : Masque limité aux glyphes du texte, reconstruction par OpenCV Telea, LaMa ONNX optionnel si le modèle est présent. L'original n'est jamais écrasé (table `cleaned_pages`).
6. **Export Service** : Rendu du texte traduit dans les bulles (typesetting) puis assemblage ZIP / CBZ / PDF + métadonnées JSON.
7. **Billing & Metering** : Crédits **réellement débités** après succès (1 crédit par action IA et par page : OCR, traduction, nettoyage), vérification préalable du solde (402 si insuffisant), journal `UsageLedger`. Recharge uniquement via webhooks de paiement signés (FedaPay, Paddle ; mode test/sandbox tant que les clés ne sont pas fournies, checkout en 503 sans clé).

---

## 4. Stratégie de Stockage

Stockage derrière l'interface `StorageProvider`
(`app/storage/`) : **local par défaut** (`STORAGE_PROVIDER=local`,
racine `STORAGE_PATH`), **S3-compatible optionnel**
(`STORAGE_PROVIDER=s3` + `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX` ; boto3 via
`apps/api/requirements-s3.txt`, jamais requis en local). Les clés sont
les mêmes dans les deux modes :

```
{STORAGE_PATH ou bucket}/
├── originals/{project_id}/    # fichiers bruts déposés par l'utilisateur
├── pages/{project_id}/         # pages extraites (PNG)
├── cleaned/{project_id}/       # pages nettoyées (inpainting)
├── thumbnails/{project_id}/   # miniatures de pages (PNG, générées à la demande/extraction)
└── exports/{project_id}/       # archives et documents finaux
```

Les accès aux fichiers se font via des endpoints authentifiés (JWT),
jamais par URL publique ou signée.

---

## 5. File d'attente et Résilience des Jobs

- File **persistante adossée à la table `jobs`**, exécution **Celery + Redis** dès que le broker répond (`USE_CELERY=auto`, défaut) : l'aiguillage (`app/jobs/dispatch.py`) enfile les jobs `pending` (`batch_process`, `extract_pages`, `ocr_page`) vers le worker dédié (`celery -A app.jobs.celery_app worker`, tâches `app/jobs/tasks.py`). Sans Redis joignable, le worker thread intégré (`app/jobs/worker.py`, démarré par le lifespan) exécute les jobs lui-même : aucun prérequis externe pour lancer l'app. Au redémarrage, les jobs interrompus (`running`) sont repassés `pending` et repris (`recover_interrupted_jobs`), jamais marqués `failed` d'office. Claim atomique en base dans tous les modes : un job n'est exécuté qu'une fois, quel que soit le canal.
- Chaque tâche lourde génère un enregistrement `Job` avec statut (`pending`, `running`, `completed`, `failed`, `cancelled`) et progression (`current_page`, `total_pages`, `progress_percent`, `message`), annulable à tout moment, suivi côté client par polling et flux SSE (`GET /jobs/{id}/stream`).
- En batch, une page en erreur est journalisée sans bloquer les suivantes ; chaque page peut être retraitée individuellement (endpoints OCR / traduction / nettoyage par page).
- Schéma de base versionné par **Alembic** (`apps/api/alembic/versions/`, `alembic upgrade head`) ; au démarrage, `init_db()` conserve la compatibilité SQLite (`create_all` idempotent) puis synchronise `alembic_version`.
