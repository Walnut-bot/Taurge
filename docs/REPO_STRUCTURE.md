# TAURGE — Arborescence du repo

> Document synchronisé avec le code (état MVP 1).

```
taurge/
├── apps/
│   ├── web/                    # Next.js frontend (App Router)
│   │   ├── app/
│   │   │   ├── page.tsx                 # landing
│   │   │   ├── login/ / register/
│   │   │   ├── dashboard/               # liste des projets
│   │   │   ├── profile/ / settings/
│   │   │   └── projects/
│   │   │       ├── new/                 # création de projet
│   │   │       └── [id]/page.tsx        # workspace projet
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
│       │   ├── main.py                 # 10 routers, CORS, /health
│       │   ├── core/                   # config, db, sécurité
│       │   ├── models/                 # SQLModel (voir docs/DATABASE.md)
│       │   ├── auth/                   # JWT + profil utilisateur
│       │   ├── projects/               # projets, upload, extraction,
│       │   │                           # cleaning, glossaire, membres
│       │   ├── pages/ / ocr_blocks/ / translations/
│       │   ├── jobs/                   # extraction + batch en arrière-plan
│       │   ├── exports/ / billing/     # téléchargement, crédits
│       │   ├── ocr/providers/          # tesseract
│       │   ├── translation/providers/  # composite : gemini → google → argos
│       │   └── storage/providers/      # local (S3 prévu)
│       ├── tests/                      # pytest (parcours nominal)
│       ├── alembic/                    # migrations DB (+ alembic.ini)
│       ├── requirements.txt / requirements-dev.txt
│       └── Dockerfile / run_windows.bat
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MVP_SCOPE.md            # archivé (MVP-0 dépassé)
│   ├── DATABASE.md
│   ├── ROADMAP.md              # périmètre actuel (MVP 1 Test)
│   └── REPO_STRUCTURE.md
│
├── .github/workflows/ci.yml    # pytest + typecheck
├── docker-compose.yml          # postgres + api + web (optionnel)
├── LANCER_TAURGE.bat / AJOUTER_EXCLUSION_DEFENDER.bat
└── README.md
```

Pas de monorepo tooling complexe (Turborepo, Nx...) — deux
dossiers `apps/web` et `apps/api` suffisent tant qu'il n'y a pas de code
partagé entre les deux à factoriser.
