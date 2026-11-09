# Taurge — AI Localization Studio for Illustrated Content

Taurge is a workspace for localizing illustrated content (manga, manhwa,
manhua, webtoon, comics): import a chapter, extract pages, run OCR, get an
AI first-draft translation, proofread bubble by bubble, clean the bubbles
and export. See `docs/` for the MVP scope, full architecture and roadmap.

No Docker required for local development: the project runs natively with
SQLite by default (a single `taurge.db` file, no server to install).
PostgreSQL stays available via `DATABASE_URL` if ever needed again.

**Current deployment shape:** the frontend lives on Vercel
(https://taurge.vercel.app) and the FastAPI backend runs **locally on
the owner's PC** — there is no hosted backend anymore. Double-click
`LANCER_TAURGE_TUNNEL.bat` at the repo root: it starts the local API,
opens a free Cloudflare tunnel to it, and opens the Vercel site
already pointed at that tunnel (`?api=…`, remembered by the browser).
The tunnel URL changes at every launch, so use the launcher for each
working session, and do not share the tunnel URL.

> [!WARNING]
> **Ne jamais partager le dossier du projet tel quel.** Il contient
> `apps/api/.env` (clés API, `SECRET_KEY`) et `apps/api/taurge.db`
> (comptes, projets, données utilisateur), ainsi que `storage_data/`
> (fichiers déposés). Ces fichiers sont couverts par `.gitignore`
> (`*.log`, `*.db`, `.env`, `storage_data/`), mais un zip ou un copier-
> coller du dossier les emporterait quand même. **Si ce dossier a déjà
> été partagé, fais tourner toutes les clés** (`SECRET_KEY`,
> `DEEPL_API_KEY`, clés de paiement dans `.env`) et change les mots de
> passe concernés : considère les anciennes clés comme compromises.

## Features

- Account → project → upload (PDF/image) → page extraction → OCR
  (MangaOCR pour `ja`, sinon PaddleOCR, avec repli automatique sur
  Tesseract — voir « Dépendances OCR optionnelles ») → translation
  (Ollama local prioritaire, repli DeepL) → manual proofreading
  (OCR text and translation) → automatic cleaning (inpainting) →
  export (ZIP + JSON).
- Account menu with profile management (name, picture, banner, per-project
  roles) and creation preferences for upcoming projects (content type and
  language pair).
- PDF extraction runs in the background with progress tracking.
- The frontend uses system fallback fonts so it also works when Google
  Fonts is unreachable.

## Prerequisites (one-time setup)

1. **Python 3.12** — python.org/downloads ("Add python.exe to PATH").
   Taurge specifically needs 3.12: some libraries (PyMuPDF, OpenCV) have
   no ready-made builds for newer Pythons yet.
2. **Node.js LTS** — nodejs.org
3. **Tesseract-OCR** — github.com/UB-Mannheim/tesseract/wiki (tick English,
   French, Japanese, Korean, Chinese, Spanish, Portuguese and German under
   "Additional language data"). C'est le moteur OCR de repli : sans les
   moteurs lourds optionnels ci-dessous, il assure l'OCR à lui seul.
4. **Ollama** (traduction, optionnel mais prioritaire quand il tourne) —
   ollama.com, puis `ollama pull llama3.1:8b` (modèle par défaut,
   `OLLAMA_MODEL`). Sans Ollama, la traduction bascule sur DeepL si
   `DEEPL_API_KEY` est configurée ; sans aucun des deux, elle échoue
   avec une erreur explicite (jamais de texte source déguisé en
   traduction).

### Dépendances OCR optionnelles

Les moteurs lourds ne font **pas** partie de `requirements.txt` :
l'API et les tests tournent sans eux, avec repli Tesseract automatique.

```bash
cd apps/api
pip install -r requirements-ocr.txt   # PaddleOCR (hors ja) + MangaOCR (ja)
# ou, en Docker : docker build --build-arg INSTALL_OCR=true ./apps/api
```

Le stockage S3 est lui aussi optionnel (`STORAGE_PROVIDER=s3`) :
`pip install -r requirements-s3.txt` (boto3). Le stockage local reste
le défaut.

## Run the Project

### Windows (double-click scripts)

1. Double-click `apps\api\run_windows.bat` → wait for
   "Application startup complete" (API on http://localhost:8000,
   docs on http://localhost:8000/docs).
2. In a **separate** window, double-click `apps\web\run_windows.bat`
   (frontend on http://localhost:3000).
3. Open http://localhost:3000

Both black windows must stay open while you use the app. Close them
(Ctrl+C) when you are done. The scripts create the Python venv, install
dependencies and set the required environment variables automatically.

If Tesseract is not found automatically, open `apps\api\run_windows.bat`
in Notepad and uncomment (remove the `REM`) from:
```
set TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```
adjusting the path to your installation.

### Mac/Linux (manual)

```bash
# Backend (terminal 1)
cd apps/api
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000

# Frontend (terminal 2)
cd apps/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./taurge.db` | Database (PostgreSQL URL for prod) |
| `STORAGE_PATH` | `./storage_data` | Uploaded files and rendered pages (local provider) |
| `STORAGE_PROVIDER` | `local` | `local` or `s3` (S3-compatible, boto3 optionnel : `requirements-s3.txt`) |
| `S3_BUCKET` / `S3_ENDPOINT_URL` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PREFIX` | — | Réglages du provider S3 (si `STORAGE_PROVIDER=s3`) |
| `MAX_UPLOAD_SIZE_MB` | `50` | Upload size limit |
| `TESSERACT_CMD` | auto-detected | Path to the Tesseract binary |
| `OCR_TIMEOUT_SECONDS` | `240` | Budget OCR max par page (secondes) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Instance Ollama (traduction prioritaire) |
| `OLLAMA_MODEL` | `llama3.1:8b` | Modèle Ollama de traduction |
| `OLLAMA_TIMEOUT_SECONDS` | `120` | Timeout d'un appel Ollama |
| `OLLAMA_BUDGET_WITH_FALLBACK_SECONDS` | `30` | Budget Ollama avant repli DeepL (si DeepL dispo) |
| `DEEPL_API_KEY` | — | Clé DeepL API Free (repli traduction, se termine par `:fx`) |
| `DEEPL_API_BASE_URL` | `https://api-free.deepl.com` | Endpoint DeepL |
| `USE_CELERY` | `auto` | File de tâches : `auto` (Celery si Redis répond, sinon worker intégré), `true`, `false` |
| `REDIS_URL` / `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Broker Redis de Celery |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for the frontend |

Copie `apps/api/.env.example` vers `apps/api/.env` et remplis les clés
localement. `.env`, `taurge.db`, `*.log` et `storage_data/` sont ignorés
par Git (voir l'avertissement en haut de ce fichier).

## Tests

```bash
# Backend (from apps/api, venv activated)
pip install -r requirements-dev.txt
pytest tests -q

# Frontend (from apps/web)
npm run typecheck
npm run lint
npm test
```

## File de tâches (Celery + Redis, optionnel)

Sans Redis, l'API exécute les jobs avec son worker intégré : rien à
installer. Avec un Redis joignable (`REDIS_URL`, défaut
`redis://localhost:6379/0`), les jobs partent automatiquement dans
Celery. Pour lancer le worker dédié, depuis `apps/api` (venv activé) :

```bash
docker run -d --name taurge-redis -p 6379:6379 redis:7-alpine
celery -A app.jobs.celery_app worker --pool=solo -l info
```

(`--pool=solo` sous Windows ; pool par défaut sous Linux/Docker —
`docker compose up` démarre `redis` et `worker` avec le reste.)

## Migrations (Alembic)

```bash
# Depuis apps/api, venv activé
alembic upgrade head
```

Alembic est la source de vérité du schéma versionné
(`apps/api/alembic/versions/`). Au démarrage, `init_db()` garde la
compatibilité avec les bases SQLite existantes (`create_all`
idempotent) puis synchronise `alembic_version` (`upgrade head` si la
base est versionnée, `stamp head` sinon) : la commande ci-dessus sert
à mettre une base existante à jour hors démarrage, pas à initialiser
une base neuve.

## Repo Structure

See `docs/REPO_STRUCTURE.md`. `docker-compose.yml` remains available for
later (deployment, team environments) but solo development is simpler
without it.

## Roadmap

See `docs/ROADMAP.md` for what comes next (visual lettering, glossary...).
