# Taurge - Roadmap & Scope MVP

> Document synchronisé avec le code (état MVP 1). Les cases cochées sont
> implémentées et vérifiées ; les cases vides sont le travail restant.

## 1. Périmètre Actuel (MVP 1 Test)

### Ce qui est déjà opérationnel :
- [x] Inscription et authentification avec token JWT.
- [x] Création d'un projet avec sélection des langues source / cible et type de contenu.
- [x] Importation de fichiers (PDF, Images individuelles).
- [x] Extraction automatique des pages depuis un PDF (PyMuPDF).
- [x] Exécution de l'OCR (Tesseract OCR multilingue).
- [x] Traduction automatique (chaîne Gemini → Google → Argos local).
- [x] Édition et correction manuelle du texte détecté et du texte traduit.
- [x] Nettoyage automatique des bulles (inpainting).
- [x] Visualisation des pages (originale vs nettoyée) et des blocs englobants.
- [x] Canvas de lettering interactif : texte traduit positionné sur l'image, déplacement/redimensionnement/création de bulles, édition inline, styles typographiques.
- [x] Glossaire par projet (termes verrouillés injectés dans la traduction par lot).
- [x] Équipe par projet (rôles translator/cleaner/typesetter/proofreader) + statut workflow par page.
- [x] Jobs asynchrones avec progression, annulation et flux SSE.
- [x] Export de projet en ZIP / CBZ / PDF (texte traduit incrusté) + métadonnées JSON.
- [x] Base crédits : abonnement, solde, journal (non prélevés, recharge simulée).

---

## 2. Roadmap d'implémentation par Phases

### Phase 1 : Consolidation & Interface du Workspace — TERMINÉE
- [x] Composant visuel de lettering (canvas interactif maison).
- [x] Rendu du texte traduit directement positionné sur l'image nettoyée.
- [x] Sélection des styles typographiques (dialogue, cri, système, pensée, SFX).

### Phase 2 : Glossaire & Mémoire de Traduction
- [x] Détection et injection automatique des termes verrouillés dans la traduction par lot.
- [ ] Gestion des fiches personnages, lieux et techniques.
- [ ] Alertes de cohérence de nom (Quality Control IA).

### Phase 3 : Gestion Avancée des Fichiers & Performance
- [ ] Upload fragmenté (chunked upload / resumable) pour les volumes de plusieurs centaines de Mo.
- [ ] Génération de miniatures (thumbnails) pour soulager le navigateur.
- [x] Export direct au format PDF assemblé en plus des formats ZIP/CBZ.

### Phase 4 : Monétisation & Facturation Locale
- [x] Base : abonnements, solde de crédits, journal de consommation.
- [x] Prélèvement réel des crédits sur les actions (OCR, traduction, nettoyage, batch).
- [ ] Passerelle de paiement FedaPay (MTN Moov Mobile Money, Cartes locales) & Flutterwave.
- [ ] Webhooks idempotents et gestion des abonnements (Free, Creator, Studio).
