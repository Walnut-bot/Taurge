# Taurge — Architecture IA, OCR, Traduction & Inpainting (`AI_ARCHITECTURE.md`)

## 1. Philosophie d'Ingénierie IA
1. **Découplage total (Provider-Agnostic)** : Aucun contrôleur HTTP n'appelle directement un modèle IA. Tous les traitements passent par des services orchestrateurs (`OCRService`, `TranslationService`, `CleaningService`, `QualityControlService`) adossés à des interfaces abstraites.
2. **Chaînes de repli résilientes (Fallback Chains)** : Si un moteur lourd ou distant échoue ou dépasse son budget de temps (*timeout*), le service bascule automatiquement sur un moteur de secours sans faire planter le chapitre entier.
3. **Zéro Faux Positif (No Silent Mock)** : Si tous les fournisseurs d'une chaîne échouent, le système lève une erreur explicite (`RuntimeError`) et ne facture aucun crédit. Il ne renvoie jamais le texte original en faisant croire qu'il a été traduit.
4. **Traçabilité & Comptabilité** : Chaque bloc OCR et chaque traduction enregistre en base le nom exact du fournisseur ayant produit le résultat (`provider = "manga-ocr" | "paddleocr" | "tesseract" | "ollama" | "deepl"`).

---

## 2. Pipeline OCR & Détection de Bulles (`app/ocr/`)

### 2.1 Architecture `OCRProvider`
```text
OCRService (app/ocr/ocr_service.py)
 ├── Langue == 'ja'  ──► MangaOCRProvider (spécialisé vertical/horizontal manga japonais)
 ├── Autres langues  ──► PaddleOCRProvider (ko, zh, en, fr, es, pt, de...)
 └── Repli auto      ──► TesseractOCRProvider + OpenCV Bubble Rereading
```

### 2.2 Regroupement en Bulles & Re-lecture (`app/ocr/bubble_grouping.py`)
1. **Détection des contours de bulles** : Analyse morphologique OpenCV pour identifier les régions claires fermées correspondant aux bulles de dialogue.
2. **Fusion des lignes OCR** : Les lignes de texte détectées à l'intérieur d'une même bulle ou proches verticalement/horizontalement sont fusionnées dans l'ordre naturel de lecture (de droite à gauche pour le manga japonais, de gauche à droite pour le manhwa/webtoon/comics).
3. **Classification des blocs** :
   - `B` : Bulle standard
   - `DB` : Double bulle reliée (`//`)
   - `C` : Cadre de narration / Caption
   - `HB` : Texte hors-bulle flottant sur le dessin
   - `SFX` : Onomatopée / Effet sonore

---

## 3. Pipeline de Traduction Contextuelle & Glossaire (`app/translation/`)

### 3.1 Architecture `TranslationProvider`
```text
TranslationService (app/translation/translation_service.py)
 ├── 1. Pré-traitement : Remplacement/Protection des termes verrouillés du Glossaire
 ├── 2. Moteur Principal : OllamaProvider (LLM local, ex. llama3.1:8b en mode JSON)
 │      └── Budget borné (30s si DeepL est configuré, 120s sinon)
 ├── 3. Moteur de Repli : DeepLProvider (API REST DeepL Free/Pro)
 └── 4. Post-traitement : Application stricte des termes verrouillés (is_locked=True)
```

### 3.2 Traduction par Lot avec Contexte de Page (`translate_batch_with_meta`)
Contrairement à une traduction phrase par phrase isolée, `TranslationService` envoie **toutes les bulles d'une page en une seule requête structurée** au LLM :
- Le modèle reçoit la liste ordonnée des répliques de la page, ce qui lui permet de déterminer le genre des interlocuteurs, le registre (tutoiement/vouvoiement) et la continuité dramatique.
- Les entrées du **Glossaire du projet** (`character`, `location`, `term`, `sfx`) sont injectées directement dans le *system prompt* pour imposer la terminologie officielle du projet.

---

## 4. Pipeline de Cleaning & Inpainting (`app/projects/cleaning.py`)

L'objectif du nettoyage est d'effacer le texte original tout en préservant **100 % des contours de bulles et de la trame artistique**.

```text
Page Originale (intacte)
  │
  ▼
Extraction du masque de glyphes (_text_glyph_mask)
  ├── Estimation du fond local par filtre médian dans chaque bbox OCR
  ├── Isolation des composantes connexes correspondant aux traits d'encre du texte
  └── Dilatation douce (3x3) uniquement sur les caractères
  │
  ▼
Reconstruction du fond (Inpainting)
  ├── Mode Standard : OpenCV Telea (cv2.INPAINT_TELEA) sur le masque de glyphes
  └── Mode Avancé (si models/lama-manga.onnx présent) : LaMa ONNX Inpainting
  │
  ▼
Sauvegarde dans cleaned/{project_id}/{page_id}.png (table cleaned_pages)
```

---

## 5. Moteur de Contrôle Qualité IA — AI Quality Control (`AI QC`)

Après l'OCR et la traduction, le module d'audit qualité analyse chaque page et chaque bulle pour remonter trois niveaux d'alerte :
- **`ERROR`** :
  - Bulle détectée mais traduction vide ou identique au texte source non-latin.
  - Terme verrouillé du glossaire (`is_locked=True`) présent dans le texte source mais absent ou mal orthographié dans la traduction.
- **`WARNING`** :
  - Risque de dépassement de bulle (ratio longueur du texte traduit / surface en pixels de la `bbox` trop élevé).
  - Confiance OCR faible (`confidence < 0.70`) nécessitant une vérification humaine du texte source.
- **`SUGGESTION`** :
  - SFX (onomatopée) détecté mais non stylisé ou utilisant encore la police de dialogue par défaut.
  - Ponctuation typographique française améliorable (espaces doubles, guillemets).
