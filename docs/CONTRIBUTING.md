# Guide de Contribution — Taurge (`CONTRIBUTING.md`)

Bienvenue sur le dépôt de **Taurge**, la plateforme SaaS de localisation assistée par IA pour mangas, manhwas, webtoons et comics.

---

## 1. Principes d'Ingénierie Non-Négociables
1. **Qualité du produit > Vitesse > Quantité** : Ne poussez jamais une fausse implémentation ou un *mock* silencieux qui prétend fonctionner. Si un service externe est indisponible, retournez une erreur claire et documentée.
2. **Respect des originaux** : Aucune fonctionnalité ne doit écraser le fichier source ou l'image originale d'une page (`pages.storage_key`).
3. **Isolation et Sécurité** : Toute nouvelle route accédant aux données d'un projet doit impérativement vérifier les droits de l'utilisateur via `require_project_access` ou `require_project_owner`.
4. **Internationalisation (i18n)** : Aucun texte visible par l'utilisateur ne doit être codé en dur dans un composant React. Ajoutez systématiquement les clés dans `apps/web/messages/fr.json` et `apps/web/messages/en.json`.

---

## 2. Prérequis & Installation Locale

### Prérequis
- **Python 3.11+**
- **Node.js 20+** et `npm`
- *(Optionnel)* **Tesseract OCR** installé sur le système pour le repli OCR local, **Ollama** pour la traduction LLM locale, **Docker & Docker Compose** pour PostgreSQL/Redis.

### Démarrage Rapide Backend (`apps/api`)
```bash
cd apps/api
python -m venv .venv
# Windows : .venv\Scripts\activate | Linux/macOS : source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Démarrage Rapide Frontend (`apps/web`)
```bash
cd apps/web
npm install
npm run dev
```

---

## 3. Standards de Code & Architecture

### Backend (`apps/api`)
- **Modèles & Migrations** : Tout ajout ou modification de modèle SQLModel dans `app/models/` doit être accompagné d'une migration Alembic idempotente dans `apps/api/alembic/versions/` et d'une mise à jour de `docs/DATABASE.md`.
- **Services découplés** :
  - Les moteurs IA passent par `app/ocr/`, `app/translation/`, `app/projects/cleaning.py`.
  - Le stockage fichier passe exclusivement par `get_storage()` (`app/storage/`).
  - Les tâches lourdes passent par le système de jobs (`app/jobs/`).

### Frontend (`apps/web`)
- **Typage strict** : `npm run typecheck` (`tsc --noEmit`) doit passer avec 0 erreur.
- **Accessibilité** : Les boutons d'action, outils du canvas et modales doivent supporter la navigation clavier (`Escape`, `Ctrl+Z`, `Ctrl+Shift+Z`, attributs `aria-label`).

---

## 4. Tests & Validation avant chaque Commit / Pull Request

Une fonctionnalité n'est terminée que lorsque toute la suite de vérification passe sans erreur :

### 1. Tests Backend (Pytest)
```bash
cd apps/api
pytest -q
```

### 2. Vérifications Frontend (TypeScript, Lint & Tests unitaires)
```bash
cd apps/web
npm run typecheck
npm run lint
npm test
```

### 3. Mise à jour de la Documentation
Si votre changement modifie l'architecture, le schéma de base de données ou l'état de la roadmap, mettez à jour :
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/ROADMAP.md`
