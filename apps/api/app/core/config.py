import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class Settings:
    """Configuration centralisée de l'API Taurge."""

    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./taurge.db")
    environment: str = os.getenv("ENVIRONMENT", "development")

    # Origines CORS autorisées (séparées par des virgules) : en
    # production, mettre le domaine Vercel, ex.
    # CORS_ORIGINS=https://taurge.vercel.app,https://www.taurge.app
    cors_origins: str = os.getenv("CORS_ORIGINS", "")

    # Sécurité JWT
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 jours
    # Anti force-brute sur /auth/login : échecs max par email avant blocage temporaire
    login_max_failed_attempts: int = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", "5"))
    login_block_window_minutes: int = int(os.getenv("LOGIN_BLOCK_WINDOW_MINUTES", "15"))

    # Stockage fichiers
    storage_path: str = os.getenv("STORAGE_PATH", "./storage_data")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))

    # Dossier des polices de lettrage embarquées
    fonts_dir: Path = Path(__file__).resolve().parent.parent / "assets" / "fonts"

    # Traduction : Ollama local (prioritaire) + DeepL Free (fallback)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    ollama_timeout_seconds: int = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
    # Budget accordé à Ollama quand DeepL est disponible en repli : passé
    # ce délai, on bascule au lieu d'attendre la fin du timeout Ollama.
    ollama_budget_with_fallback_seconds: int = int(
        os.getenv("OLLAMA_BUDGET_WITH_FALLBACK_SECONDS", "30")
    )
    deepl_api_key: str | None = os.getenv("DEEPL_API_KEY")
    deepl_api_base_url: str = os.getenv(
        "DEEPL_API_BASE_URL", "https://api-free.deepl.com"
    )
    deepl_timeout_seconds: int = int(os.getenv("DEEPL_TIMEOUT_SECONDS", "30"))

    # Paiements (mode test tant que les clés sandbox ne sont pas fournies :
    # sans clé, les endpoints de checkout répondent 503, aucun appel sortant)
    public_app_url: str = os.getenv("PUBLIC_APP_URL", "http://localhost:3000")
    fedapay_secret_key: str | None = os.getenv("FEDAPAY_SECRET_KEY_TEST") or os.getenv("FEDAPAY_SECRET_KEY")
    fedapay_webhook_secret: str | None = os.getenv("FEDAPAY_WEBHOOK_SECRET")
    fedapay_api_base_url: str = os.getenv("FEDAPAY_API_BASE_URL", "https://sandbox-api.fedapay.com/v1")
    # Montants FedaPay en XOF entier, à définir par pack (aucun taux de
    # conversion EUR→XOF n'est inventé côté code).
    fedapay_amount_xof_discovery: int | None = int(os.getenv("FEDAPAY_AMOUNT_XOF_DISCOVERY", "0")) or None
    fedapay_amount_xof_regular: int | None = int(os.getenv("FEDAPAY_AMOUNT_XOF_REGULAR", "0")) or None
    fedapay_amount_xof_studio: int | None = int(os.getenv("FEDAPAY_AMOUNT_XOF_STUDIO", "0")) or None
    paddle_api_key: str | None = os.getenv("PADDLE_API_KEY")
    paddle_webhook_secret: str | None = os.getenv("PADDLE_WEBHOOK_SECRET")
    paddle_api_base_url: str = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")
    paddle_price_id_discovery: str | None = os.getenv("PADDLE_PRICE_ID_DISCOVERY")
    paddle_price_id_regular: str | None = os.getenv("PADDLE_PRICE_ID_REGULAR")
    paddle_price_id_studio: str | None = os.getenv("PADDLE_PRICE_ID_STUDIO")

    def __init__(self):
        # Avertissement en cas de clé par défaut
        if self.environment == "production" and self.secret_key == "dev-secret-change-me":
            logger.critical("ATTENTION : SECRET_KEY par défaut utilisée en production !")
            sys.exit(1)


settings = Settings()