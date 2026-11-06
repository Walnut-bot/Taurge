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

## Features

- Account → project → upload (PDF/image) → page extraction → OCR
  (Tesseract) → translation (contextual AI with local fallbacks) →
  manual proofreading (OCR text and translation) → automatic cleaning
  (inpainting) → export (ZIP + JSON).
- Account menu with profile management (name, picture, banner, per-project
  roles) and creation preferences for upcoming projects (content type and
  language pair).
- PDF extraction runs in the background with progress tracking.
- The frontend uses system fallback fonts so it also works when Google
  Fonts is unreachable.

## Prerequisites (one-time setup)

1. **Python 3.12** — python.org/downloads ("Add python.exe to PATH").
   Taurge specifically needs 3.12: some libraries (PyMuPDF, OpenCV, Argos
   Translate) have no ready-made builds for newer Pythons yet.
2. **Node.js LTS** — nodejs.org
3. **Tesseract-OCR** — github.com/UB-Mannheim/tesseract/wiki (tick English,
   French, Japanese, Korean, Chinese, Spanish, Portuguese and German under
   "Additional language data").

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
| `STORAGE_PATH` | `./storage_data` | Uploaded files and rendered pages |
| `MAX_UPLOAD_SIZE_MB` | `50` | Upload size limit |
| `TESSERACT_CMD` | auto-detected | Path to the Tesseract binary |
| `GEMINI_API_KEY` | — | Contextual AI translation |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for the frontend |

## Tests

```bash
# Backend (from apps/api, venv activated)
pytest -q

# Frontend typecheck (from apps/web)
npm run typecheck
```

## Repo Structure

See `docs/REPO_STRUCTURE.md`. `docker-compose.yml` remains available for
later (deployment, team environments) but solo development is simpler
without it.

## Roadmap

See `docs/ROADMAP.md` for what comes next (visual lettering, glossary...).
