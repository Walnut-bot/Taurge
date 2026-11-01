# Taurge - Spécifications de la Base de Données

> Document synchronisé avec les modèles SQLModel (`apps/api/app/models/`).
> Toute évolution du schéma passe par ces modèles : ce fichier doit être
> mis à jour en même temps.

## 1. Schéma Relationnel

Le système utilise SQLModel (SQLite en développement, PostgreSQL en
production) avec clés primaires UUID.

### Conventions

- `id` UUID v4 partout ; `created_at` UTC partout.
- Pas de table `workspaces` : un projet appartient à un `owner` et s'ouvre
  à une équipe via `project_members` (décision assumée, plus simple que la
  spec initiale).
- Statuts des jobs en minuscules (`pending`, `running`, ...).
- Les images ne sont jamais écrasées : `pages.storage_key` garde
  l'original, `cleaned_pages` et `exports` stockent les dérivés.

### Modèles

```sql
-- Utilisateurs & Authentification
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    display_name VARCHAR,
    avatar_content_type VARCHAR,
    banner_content_type VARCHAR,
    default_content_type VARCHAR DEFAULT 'manga',
    default_source_lang VARCHAR DEFAULT 'ja',
    default_target_lang VARCHAR DEFAULT 'fr',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projets de localisation (appartiennent à un owner, pas à un workspace)
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES users(id),
    name VARCHAR NOT NULL,
    content_type VARCHAR NOT NULL, -- manga, manhwa, manhua, webtoon, comic, autre
    source_lang VARCHAR NOT NULL,
    target_lang VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Membres d'équipe par projet
CREATE TABLE project_members (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    role VARCHAR DEFAULT 'translator', -- owner, translator, cleaner, typesetter, proofreader
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fichiers sources importés (PDF, Images)
CREATE TABLE source_files (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    storage_key VARCHAR NOT NULL,
    original_filename VARCHAR NOT NULL,
    file_type VARCHAR NOT NULL, -- pdf, png, jpg, webp
    size_bytes INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pages individuelles
CREATE TABLE pages (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source_file_id UUID REFERENCES source_files(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    storage_key VARCHAR NOT NULL,
    width INT,
    height INT,
    workflow_status VARCHAR DEFAULT 'todo', -- todo, raw, cleaned, translated, typeset, ready
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blocs détectés par OCR (coordonnées en pixels entiers)
CREATE TABLE ocr_blocks (
    id UUID PRIMARY KEY,
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    bbox_x INT NOT NULL,
    bbox_y INT NOT NULL,
    bbox_w INT NOT NULL,
    bbox_h INT NOT NULL,
    confidence FLOAT NOT NULL,
    provider VARCHAR NOT NULL, -- tesseract
    bubble_type VARCHAR DEFAULT 'B',
    manhwa_style VARCHAR DEFAULT 'dialogue',
    rotation_angle INT DEFAULT 0,
    font_size_scale FLOAT DEFAULT 1.0,
    text_color VARCHAR DEFAULT '#0d0d0d',
    stroke_color VARCHAR DEFAULT '#ffffff',
    stroke_width INT DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Traductions associées aux blocs OCR (1:1)
CREATE TABLE translations (
    id UUID PRIMARY KEY,
    ocr_block_id UUID UNIQUE REFERENCES ocr_blocks(id) ON DELETE CASCADE,
    translated_text TEXT NOT NULL,
    provider VARCHAR NOT NULL, -- ex. gemini, google, argos
    edited_by_user BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pages nettoyées (inpainting) — 1:1 avec pages, l'original est préservé
CREATE TABLE cleaned_pages (
    id UUID PRIMARY KEY,
    page_id UUID UNIQUE REFERENCES pages(id) ON DELETE CASCADE,
    storage_key VARCHAR NOT NULL,
    method VARCHAR DEFAULT 'auto_inpaint',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exports générés
CREATE TABLE exports (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    format VARCHAR NOT NULL, -- ex. zip, cbz, pdf
    storage_key VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Glossaire (termes verrouillés injectés dans la traduction)
CREATE TABLE glossary_entries (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category VARCHAR DEFAULT 'character', -- character, location, term, sfx
    source_term VARCHAR NOT NULL,
    target_term VARCHAR NOT NULL,
    is_locked BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Suivi des traitements (Jobs asynchrones)
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    job_type VARCHAR DEFAULT 'batch_process', -- batch_process, extract_pages, export
    status VARCHAR DEFAULT 'pending', -- pending, running, completed, failed, cancelled
    current_page INT DEFAULT 0,
    total_pages INT DEFAULT 0,
    progress_percent INT DEFAULT 0,
    message VARCHAR DEFAULT 'En attente de démarrage...',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Abonnements & crédits
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES users(id),
    plan VARCHAR DEFAULT 'free', -- free, creator, studio
    status VARCHAR DEFAULT 'active', -- active, canceled, past_due
    credits_remaining INT DEFAULT 30,
    credits_limit INT DEFAULT 30,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Journal de consommation des crédits
CREATE TABLE usage_ledgers (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    action_type VARCHAR NOT NULL, -- ocr, translate, clean, batch, recharge
    amount INT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2. Migrations

Le dossier `apps/api/alembic/versions/` trace l'historique des évolutions.
Au démarrage, `init_db()` crée le schéma déclaratif et complète les
colonnes de profil manquantes sur les bases existantes.
