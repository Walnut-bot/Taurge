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
  - Storage Service (local ; S3 prévu derrière la même interface)
  - Pipeline Dispatcher (Extraction PDF, OCR, Traduction, Clean)
  - Export Engine (ZIP, CBZ, PDF + métadonnées JSON)
  - Billing & Metering (crédits ; providers de paiement prévus)

              |                               |
              v                               v

SQLite (dev) / PostgreSQL (prod)    Stockage fichiers local
via SQLModel                        (flux authentifiés JWT)
```

---

## 3. Découpage Modulaire des Services Backend

1. **Auth Service** : Inscription, login JWT, rôles par projet (owner + équipe : translator, cleaner, typesetter, proofreader), profil et préférences.
2. **Project & File Service** : Upload PDF/Images (validation par magic bytes, limite 50 Mo, pas de chunk upload), extraction des pages (PyMuPDF, 150 DPI).
3. **OCR Engine** : Interface `OCRProvider` (implémentation : Tesseract, raffinement MangaOCR optionnel), boîtes englobantes en pixels (`bbox_x, bbox_y, bbox_w, bbox_h`).
4. **Translation Service** : Interface `TranslationProvider` ; chaîne composite Gemini → Google → Argos local, glossaire (termes verrouillés) injecté en batch. Pas de mémoire de traduction ni de fiches personnages.
5. **Inpainting / Cleaning Service** : Remplissage médian pour fonds unis + OpenCV Telea pour zones complexes, LaMa ONNX optionnel. L'original n'est jamais écrasé (table `cleaned_pages`).
6. **Export Service** : Rendu du texte traduit dans les bulles (typesetting) puis assemblage ZIP / CBZ / PDF + métadonnées JSON.
7. **Billing & Metering** : Crédits + journal (`UsageLedger`), 402 si solde insuffisant, recharge simulée. Providers de paiement (FedaPay, Stripe) et webhooks : prévus.

---

## 4. Stratégie de Stockage

Arborescence réelle sous `STORAGE_PATH` (local uniquement, S3 prévu) :
```
storage_data/
├── originals/{project_id}/   # fichiers bruts déposés par l'utilisateur
├── pages/{project_id}/        # pages extraites (PNG)
├── cleaned/{project_id}/      # pages nettoyées (inpainting)
├── exports/{project_id}/      # archives et documents finaux
└── profiles/{user_id}/        # avatar et bannière
```

Les accès aux fichiers se font via des endpoints authentifiés (JWT),
jamais par URL publique ou signée.

---

## 5. File d'attente et Résilience des Jobs

- Chaque tâche lourde (OCR d'un volume entier, inpainting d'un chapitre) génère un enregistrement `Job` avec statut (`pending`, `running`, `completed`, `failed`, `cancelled`) et progression (`current_page`, `total_pages`, `progress_percent`, `message`), annulable à tout moment.
- En batch, une page en erreur est journalisée sans bloquer les suivantes ; chaque page peut être retraitée individuellement (endpoints OCR / traduction / nettoyage par page).
