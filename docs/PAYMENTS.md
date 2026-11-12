# Taurge — Architecture de Facturation, Crédits & Paiements (`PAYMENTS.md`)

## 1. Modèle Économique & Unité de Compte (Crédits IA)
Les traitements d'intelligence artificielle et de vision par ordinateur (OCR, Traduction LLM/DeepL, Inpainting) ont un coût serveur direct. Taurge utilise un système de **comptage à l'usage (Usage Metering)** couplé à des abonnements et des packs de crédits rechargeables.

### Règles de Débit (`app/billing/credit_service.py`)
- **Inscription gratuite** : Chaque nouvel utilisateur reçoit automatiquement **10 crédits gratuits** (`SIGNUP_FREE_CREDITS = 10`) pour tester l'ensemble du pipeline sur un premier chapitre court.
- **Coût par opération** :
  - `ocr` : **1 crédit** par page traitée
  - `translate` : **1 crédit** par page traduite
  - `clean` : **1 crédit** par page nettoyée (inpainting)
- **Principe de facturation équitable (Debit-After-Success)** :
  1. Avant de lancer l'opération, `require_credits()` vérifie que `credits_remaining >= cost`. Si le solde est insuffisant, l'API renvoie immédiatement **HTTP `402 Payment Required`** (ce qui ouvre la modale de recharge sur le frontend).
  2. Le traitement IA est exécuté.
  3. **Seulement si le traitement réussit**, `charge_credits()` déduit les crédits et écrit une ligne immuable dans la table `usage_ledgers` (`user_id`, `project_id`, `action_type`, `amount`, `description`, `created_at`). Si le moteur IA échoue, aucun crédit n'est débité.

---

## 2. Architecture des Passerelles de Paiement

```text
Frontend (Next.js)
   │  1. POST /billing/checkout { provider: "fedapay" | "paddle", pack_key: "discovery" | "regular" | "studio" }
   ▼
Backend (FastAPI — payments_router.py)
   │  2. Crée une ligne PaymentTransaction(status="pending") en base
   │  3. Appelle l'API du Provider (FedaPay ou Paddle) avec custom_data.taurge_tx_id
   │  4. Retourne { checkout_url, transaction_id } au Frontend
   ▼
Hosted Checkout du Provider (FedaPay Mobile Money / Cartes XOF ou Paddle EUR)
   │  5. L'utilisateur paie sur l'interface sécurisée du Provider
   ▼
Webhook Signé (POST /billing/webhooks/fedapay ou /billing/webhooks/paddle)
   │  6. Vérifie la signature HMAC-SHA256 sur le raw body + anti-replay timestamp
   │  7. Vérifie l'idempotence (si PaymentTransaction.status == "paid", ignore et répond 200)
   │  8. Passe PaymentTransaction.status = "paid", crédite Subscription.credits_remaining
   └──9. Enregistre une entrée "recharge" dans UsageLedger
```

---

## 3. Fournisseurs Supportés

### 3.1 FedaPay (Priorité Afrique Francophone / Bénin / UEMOA — XOF)
- **Implémentation** : `app/billing/fedapay_provider.py`
- **Moyens de paiement supportés** : MTN Mobile Money, Moov Money, Celtiis Cash, Cartes Visa / Mastercard.
- **Devise** : Franc CFA (`XOF`).
- **Configuration (`.env`)** :
  - `FEDAPAY_SECRET_KEY` (`sk_sandbox_...` ou `sk_live_...`)
  - `FEDAPAY_WEBHOOK_SECRET` (`wh_...`)
  - `FEDAPAY_ENVIRONMENT` (`sandbox` ou `live`)

### 3.2 Paddle (International / Europe — EUR)
- **Implémentation** : `app/billing/paddle_provider.py`
- **Moyens de paiement supportés** : Cartes internationales, PayPal, Apple Pay, Google Pay (Merchant of Record gérant la TVA internationale).
- **Devise** : Euro (`EUR`).
- **Configuration (`.env`)** :
  - `PADDLE_API_KEY`
  - `PADDLE_WEBHOOK_SECRET`
  - `PADDLE_ENVIRONMENT` (`sandbox` ou `production`)
  - `PADDLE_PRICE_DISCOVERY`, `PADDLE_PRICE_REGULAR`, `PADDLE_PRICE_STUDIO`

---

## 4. Grille des Packs de Crédits (`PACKS` dans `app/billing/packs.py`)

| Clé du Pack (`pack_key`) | Crédits Ajoutés | Prix International (`EUR`) | Prix Afrique Francophone (`XOF`) | Usage Typique |
| :--- | :---: | :---: | :---: | :--- |
| **`discovery`** | **100 crédits** | 5,00 € (500 cts) | 3 300 FCFA | ~1 à 2 chapitres complets (OCR + Trad + Clean) |
| **`regular`** | **300 crédits** | 12,00 € (1 200 cts) | 7 900 FCFA | ~5 chapitres complets |
| **`studio`** | **1 000 crédits** | 35,00 € (3 500 cts) | 23 000 FCFA | ~16 chapitres complets / 1 tome entier |

---

## 5. Sécurité & Idempotence Financière
- **Fail-Closed sans clés** : Si `FEDAPAY_SECRET_KEY` ou `PADDLE_API_KEY` n'est pas configuré sur le serveur, `POST /billing/checkout` retourne `503 Service Unavailable`. Aucun crédit gratuit ou fictif n'est accordé par l'endpoint de checkout.
- **Protection contre les Replay Attacks** : Les webhooks vérifient que l'horodatage (`t=...` dans l'en-tête de signature) date de moins de **5 minutes (300 secondes)** et comparent les digests HMAC avec `hmac.compare_digest` (temps constant).
