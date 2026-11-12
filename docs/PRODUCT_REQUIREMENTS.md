# Taurge — Product Requirements Document (PRD)

## 1. Vision du Produit
Taurge est un **workspace centralisé de localisation assistée par IA pour le contenu illustré** (Manga, Manhwa, Manhua, Webtoon, Comics).

Le produit remplace la chaîne d'outils fragmentée traditionnelle (extracteur d'archive → OCR séparé → tableur de traduction → Photoshop/GIMP cleaning → typesetting → ré-archivage) par un pipeline intégré de bout en bout :

```text
IMPORT → CONVERSION / SLICING → OCR → TRADUCTION CONTEXTUELLE → GLOSSAIRE & MÉMOIRE → CLEANING / INPAINTING → LETTERING / SFX → QUALITY CONTROL → COLLABORATION → EXPORT
```

### Ce que Taurge N'EST PAS
- **Pas un lecteur de mangas public** ni un catalogue d'œuvres piratées.
- **Aucun scraping automatique** depuis des sites tiers.
- L'utilisateur importe uniquement des fichiers dont il détient les droits ou autorisations d'exploitation (consentement explicite horodaté en base).

---

## 2. Profils Utilisateurs Cibles (Personas)

| Persona | Besoins Principaux | Fonctionnalités Clés |
| :--- | :--- | :--- |
| **1. Traducteur Indépendant** | Gagner du temps sur les tâches répétitives (extraction, détourage, pré-traduction) tout en gardant le contrôle créatif. | Import PDF/Images/ZIP/CBZ, OCR auto + ajout manuel de bulles, traduction IA avec glossaire, auto-clean, lettering rapide, export PDF/CBZ/ZIP. |
| **2. Groupe de Traduction** | Coordonner une équipe (traducteur, cleaner, typesetter, relecteur) sur un chapitre sans s'échanger des fichiers lourds. | Rôles par projet (`owner`, `translator`, `cleaner`, `typesetter`, `proofreader`), statuts de page (`todo` → `ready`), glossaire partagé, contrôle qualité (QC Curtain, AI QC). |
| **3. Studio de Localisation / Éditeur** | Gérer des volumes importants, garantir la cohérence terminologique sur plusieurs tomes et suivre les coûts IA. | Projets multiples, glossaire global inter-projets, stockage S3 isolé, journal de consommation (`UsageLedger`), facturation par packs/abonnements. |
| **4. Auteur Indépendant** | Localiser sa propre œuvre (ex. FR → EN, ES, PT, JA) vers une audience internationale. | Interface multilingue (FR/EN), support des formats Webtoon (découpage vertical intelligent) et Manga/BD paginés. |

---

## 3. Exigences Fonctionnelles par Module

### 3.1 Authentification, Profil & Conformité Légale
- **Implémenté** :
  - Inscription (`POST /auth/register`) et connexion JWT (`POST /auth/login`) avec hachage `bcrypt` et protection anti-brute-force persistée (`login_attempts`).
  - Consentement obligatoire aux CGU, confirmation d'âge et confirmation des droits d'auteur lors de l'import.
  - Gestion complète du profil (nom d'affichage, avatar, bannière, langues source/cible par défaut) et suppression de compte RGPD en cascade (`DELETE /auth/me`).
  - Rôles par projet (`owner`, `translator`, `cleaner`, `typesetter`, `proofreader`).
- **Prévu (Phase Scale)** :
  - OAuth Google, vérification d'email transactionnelle, réinitialisation de mot de passe par lien signé, permissions granulaires par rôle sur chaque action d'édition.

### 3.2 Import, Conversion & Découpage Intelligent
- **Implémenté** :
  - Import de fichiers `PDF`, `PNG`, `JPG`, `WEBP`, `ZIP` et `CBZ` avec validation stricte des *magic bytes* et protection contre les *ZIP bombs* / *path traversal*.
  - Extraction PDF page par page en streaming mémoire (PyMuPDF à 150 DPI).
  - **Smart Webtoon Slicing** : détection automatique des bandes verticales de Webtoon (`hauteur >= 3500px`, `ratio >= 2.2`) et découpage dans les gouttières à faible variance sans couper les bulles.
  - Génération automatique de miniatures (`thumbnails`) et réordonnancement des pages par glisser-déposer.
- **Prévu (Phase Scale)** :
  - Upload multipart/resumable pour archives de plusieurs Go et support du format `EPUB`.

### 3.3 OCR Spécialisé Contenu Illustré
- **Implémenté** :
  - Architecture `OCRProvider` découplée :
    - Japonais (`ja`) → **MangaOCR**
    - Coréen, Chinois, Anglais, Français, Espagnol, etc. → **PaddleOCR**
    - Repli automatique sans crash vers **Tesseract** (avec re-lecture rapprochée des bulles) si les dépendances lourdes ne sont pas installées.
  - Regroupement intelligent des lignes en bulles cohérentes (`bubble_grouping.py`).
  - Catégorisation des blocs : `B` (Bulle), `DB` (Double bulle), `C` (Narration/Cadre), `HB` (Texte flottant hors-bulle), `SFX` (Onomatopée).
  - Ajout manuel de zone OCR à la souris (`+ Bubble`) avec détection et traduction instantanées.

### 3.4 Traduction IA Contextuelle, Glossaire & Mémoire
- **Implémenté** :
  - Architecture `TranslationProvider` avec chaîne **Ollama** (modèle LLM local avec prompt spécialisé localisation manga + toutes les bulles de la page en contexte) → repli automatique vers **DeepL API**.
  - **Glossaire par projet et vue globale** : termes catégorisés (`character`, `location`, `term`, `sfx`), verrouillables (`is_locked`), injectés dans le prompt IA et vérifiés après traduction.
  - **Contrôle Qualité IA (AI QC)** : détection des bulles non traduites, incohérences avec les termes verrouillés du glossaire, dépassements probables de bulle et OCR à faible confiance (`ERROR`, `WARNING`, `SUGGESTION`).

### 3.5 Cleaning / Inpainting & Éditeur Visuel de Lettering
- **Implémenté** :
  - **Non-destructivité absolue** : l'image source originale (`pages.storage_key`) n'est jamais modifiée ; l'image nettoyée est stockée séparément (`cleaned_pages`).
  - Masquage intelligent des glyphes de texte (préserve les contours des bulles et le dessin) suivi d'un inpainting **OpenCV Telea** ou **LaMa ONNX**.
  - **Canvas interactif** : zoom/pan fluide, déplacement et redimensionnement des bulles, historique **Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`)**, rideau de comparaison Avant/Après (**QC Curtain**), touche raccourci `C` pour inspecter l'original.
  - **5 Presets Typographiques** (`dialogue`, `scream`, `system`, `thought`, `sfx`), échelle de taille, couleur de texte, couleur/épaisseur de contour, rotation (`-30°` à `+30°`).

### 3.6 Export Multi-Formats
- **Implémenté** :
  - Rendu haute définition des traductions mises en page sur les planches nettoyées (auto-fit typographique + césure en losange `wrap_text_diamond`).
  - Formats d'export : **PDF**, **CBZ**, **ZIP** (planches + `metadata.json` portable) et script de traduction `.txt`.

---

## 4. Critères d'Acceptation Globaux (Definition of Done)
Une fonctionnalité de Taurge n'est considérée comme terminée que si :
1. Elle ne contient aucun mock silencieux (toute erreur IA ou paiement renvoie un statut explicite).
2. Elle préserve l'intégrité des fichiers originaux de l'utilisateur.
3. Elle respecte l'isolation multi-tenant (vérification systématique de `project_id` et de l'appartenance à l'équipe du projet).
4. Elle est couverte par des tests automatisés (`pytest` côté backend, tests unitaires/typecheck côté frontend).
5. La documentation technique correspondante dans `docs/` est synchronisée.
