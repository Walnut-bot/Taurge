# TAURGE — Arborescence du repo

> Document synchronisé avec le code (état MVP 1).

```
taurge/
├── apps/
│   ├── web/                    # Next.js frontend (App Router)
│   │   ├── app/
│   │   │   └── [locale]/                # routes localisées (App Router)
│   │   │       ├── page.tsx             # landing
│   │   │       ├── login/ / register/
│   │   │       ├── dashboard/           # liste des projets
│   │   │       ├── profile/ / settings/ / billing/ / glossary/ / legal/
│   │   │       └── projects/
│   │   │           ├── page.tsx / new/  # liste / création de projet
│   │   │           └── [id]/page.tsx    # workspace projet
│   │   ├── components/
│   │   │   ├── workspace/      # éditeur : canvas, blocs, glossaire, équipe…
│   │   │   ├── ui/             # primitives (button, field, marker-text)
│   │   │   ├── brand/ / landing/
│   │   │   └── app-header, auth-form, dashboard-view, …
│   │   ├── lib/                # client API, hooks SWR, types, démo
│   │   ├── next.config.mjs / tsconfig.json / tailwind.config.ts
│   │   ├── vercel.json / Dockerfile / run_windows.bat
│   │   └── package.json
│   │
│   └── api/                    # FastAPI backend
│       ├── app/
│       │   ├── main.py                 # 12 routers, CORS, /health, lifespan (init DB + worker jobs)
│       │   ├── core/                   # config, db (Alembic sync), sécurité, i18n
│       │   ├── models/                 # SQLModel (voir docs/DATABASE.md)
│       │   ├── auth/                   # JWT + profil utilisateur
│       │   ├── projects/               # projets, upload, extraction,
│       │   │                           # cleaning, glossaire, membres, miniatures
│       │   ├── pages/ / ocr_blocks/ / translations/
│       │   ├── jobs/                   # file DB-backed (worker thread) + exécution + SSE
│       │   ├── exports/ / billing/     # téléchargement, crédits, paiements (FedaPay/Paddle)
│       │   ├── ocr/                    # OCRService : ja→MangaOCR, sinon PaddleOCR, repli Tesseract
│       │   │   └── providers/          # manga_ocr / paddle_ocr / tesseract
│       │   ├── translation/            # TranslationService : Ollama → repli DeepL
│       │   │   └── providers/          # ollama / deepl
│       │   └── storage/                # StorageProvider : local (défaut) ou S3 optionnel
│       │       └── providers/          # local / s3 (boto3 optionnel)
│       ├── tests/                      # pytest (dont replis OCR/traduction, jobs persistants)
│       ├── alembic/                    # migrations DB (+ alembic.ini)
│       ├── requirements.txt            # base légère (repli Tesseract seul)
│       ├── requirements-ocr.txt        # OPTIONNEL : PaddleOCR + MangaOCR
│       ├── requirements-s3.txt         # OPTIONNEL : boto3 (STORAGE_PROVIDER=s3)
│       ├── requirements-dev.txt        # pytest (inclut requirements.txt)
│       └── Dockerfile / run_windows.bat  # Dockerfile : --build-arg INSTALL_OCR=true pour l'OCR lourd
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MVP_SCOPE.md            # archivé (MVP-0 dépassé)
│   ├── DATABASE.md
│   ├── ROADMAP.md              # périmètre actuel (MVP 1 Test)
│   └── REPO_STRUCTURE.md
│
├── .github/workflows/ci.yml    # API : pytest ; Web : typecheck + lint + test (npm ci)
├── docker-compose.yml          # postgres + api + web (optionnel, non requis en local)
├── LANCER_TAURGE.bat / LANCER_TAURGE_TUNNEL.bat / lancer-tunnel.ps1
├── AJOUTER_EXCLUSION_DEFENDER.bat
└── README.md                   # lancement, config, tests, migrations — voir aussi l'avertissement .env/taurge.db
```

Pas de monorepo tooling complexe (Turborepo, Nx...) — deux
dossiers `apps/web` et `apps/api` suffisent tant qu'il n'y a pas de code
partagé entre les deux à factoriser.
