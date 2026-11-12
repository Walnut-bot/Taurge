# Taurge — Politique & Architecture de Sécurité (`SECURITY.md`)

## 1. Principes Directeurs de Sécurité
1. **Zero-Trust sur les fichiers entrants** : Les extensions et en-têtes `Content-Type` envoyés par le navigateur ne sont jamais crus sur parole.
2. **Isolation stricte par Projet (Tenant Isolation)** : Aucun fichier, page, bloc OCR ou export n'est accessible par URL publique statique. Chaque accès passe par une vérification JWT et un contrôle d'accès au projet (`require_project_access`).
3. **Validation financière exclusivement côté serveur** : Le frontend ne peut jamais créditer un compte ou valider un paiement ; seuls les webhooks signés (HMAC-SHA256) et idempotents créditent l'utilisateur.
4. **Fail-Closed** : En l'absence de clés secrètes de paiement ou en cas d'échec des moteurs IA, le système échoue proprement (HTTP `503` ou `502`) sans jamais simuler un faux succès.

---

## 2. Authentification & Protection des Comptes
- **Hachage des mots de passe** : Utilisation de `bcrypt` avec sel aléatoire par mot de passe (`app/core/security.py`).
- **Jetons d'accès (JWT)** : Signés en `HS256` avec `JWT_SECRET` (minimum 32 caractères aléatoires exigés en production).
- **Rate-Limiting persistant sur le Login** :
  - Stocké en base de données dans la table `login_attempts` (partagé entre tous les workers/instances).
  - Bloque temporairement (HTTP `429 Too Many Requests`) après **5 tentatives échouées en 15 minutes** sur une adresse email.
- **Suppression RGPD & Droit à l'oubli** :
  - `DELETE /auth/me` supprime l'utilisateur, ses projets, ses fichiers sur le stockage (local ou S3) et ses données associées en cascade.

---

## 3. Contrôle d'Accès (RBAC) & Isolation des Données
- Toutes les routes manipulant un projet, une page, un bloc OCR, une traduction ou un export appellent `require_project_access(session, project_id, current_user)` (`app/projects/access.py`).
- **Niveaux d'autorisation** :
  - `owner` : Propriétaire du projet. Seul autorisé à supprimer/renommer le projet et à inviter ou révoquer des membres (`require_project_owner`).
  - Membres d'équipe (`translator`, `cleaner`, `typesetter`, `proofreader`) : Accès lecture/écriture aux pages, OCR, traductions, glossaire, nettoyage et exports du projet auquel ils ont été explicitement invités.
- **Protection des fichiers stockés** :
  - Les images (`GET /pages/{id}/image`, `GET /pages/{id}/thumbnail`, `GET /pages/{id}/cleaned-image`) et les exports (`GET /exports/{id}/download`) sont servis par l'API après validation du token JWT et de l'accès au projet parent.

---

## 4. Protection Contre les Fichiers Malveillants & Bombes de Décompression

### 4.1 Validation par Magic Bytes (`app/projects/file_validation.py`)
Lors de l'import (`POST /projects/{id}/upload`), le système inspecte les premiers octets réels du flux :
- **PDF** : Signature `%PDF-`
- **PNG** : Signature `\x89PNG\r\n\x1a\n`
- **JPEG** : Signature `\xff\xd8\xff`
- **WEBP** : Signature `RIFF....WEBP`
- **ZIP / CBZ** : Signature `PK\x03\x04`

Tout fichier dont la signature binaire ne correspond pas aux formats autorisés est immédiatement rejeté avec HTTP `415 Unsupported Media Type`.

### 4.2 Protection Contre les Images Malveillantes (Decompression Bombs)
- Pour les avatars, bannières et pages extraites, Pillow (`Image.MAX_IMAGE_PIXELS`) et les vérifications de dimensions empêchent l'ouverture d'images conçues pour saturer la RAM par décompression.
- Les images de profil sont systématiquement ré-encodées et nettoyées de leurs métadonnées EXIF potentiellement dangereuses.

### 4.3 Protection Contre les Archives Malveillantes (ZIP / CBZ Bombs & Path Traversal)
Lors de l'extraction d'une archive `.zip` ou `.cbz` :
1. **Path Traversal (`Zip Slip`)** : Les chemins contenant `..`, commençant par `/` ou `\`, ou contenant des caractères de lecteur (`:`) sont ignorés/rejetés. Seul le nom de base normalisé est traité.
2. **Quota de fichiers par archive** : Maximum **500 images** extraites par archive pour éviter les attaques par déni de service d'inodes/base de données.
3. **Quota de taille décompressée (Anti-Zip Bomb)** :
   - La taille cumulée décompressée est vérifiée en flux continu pendant la lecture par blocs.
   - Si la taille totale décompressée dépasse la limite de sécurité (`MAX_ARCHIVE_UNCOMPRESSED_MB`, ex. 500 Mo) ou si une entrée individuelle dépasse la limite par image, l'extraction est immédiatement interrompue et nettoyée.
4. **Validation interne par Magic Bytes** : Chaque image extraite de l'archive `.zip`/`.cbz` subit elle-même une vérification de ses *magic bytes* (`PNG`, `JPG`, `WEBP`) avant d'être enregistrée comme page.

---

## 5. Sécurité des Paiements & Webhooks
- **Aucune donnée bancaire stockée** : Les numéros de carte et identifiants Mobile Money sont saisis uniquement sur le *Hosted Checkout* de **FedaPay** ou **Paddle**.
- **Vérification cryptographique des Webhooks** :
  - `POST /billing/webhooks/fedapay` et `POST /billing/webhooks/paddle` vérifient la signature **HMAC-SHA256** de la charge utile brute (`raw body`) ainsi que la fraîcheur du timestamp (protection contre les attaques par rejeu / *replay attacks*, fenêtre de 300 secondes).
- **Idempotence atomique** :
  - La table `payment_transactions` garantit qu'un même événement webhook envoyé plusieurs fois par le prestataire ne crédite le compte qu'une seule et unique fois (`status == "paid"`).

---

## 6. Bonnes Pratiques de Déploiement Production
- Toujours définir `JWT_SECRET` avec une clé aléatoire forte (`openssl rand -hex 32`).
- Configurer `CORS_ORIGINS` avec le domaine exact du frontend (ne jamais laisser `*` en production).
- Ne jamais commiter de fichier `.env` ou de base locale `taurge.db` dans Git (bloqués par `.gitignore`).
