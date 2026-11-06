from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine
from app.core.config import settings

# Render/Neon fournissent souvent l'ancien schéma postgres:// que
# SQLAlchemy 2 n'accepte plus : on le normalise en postgresql://.
_database_url = settings.database_url
if _database_url.startswith("postgres://"):
    _database_url = "postgresql://" + _database_url[len("postgres://"):]

# Configuration de connexion adaptée au driver (SQLite multi-thread ou PostgreSQL pool)
connect_args = (
    {"check_same_thread": False, "timeout": 30}
    if _database_url.startswith("sqlite")
    else {}
)

engine = create_engine(
    _database_url,
    echo=False,
    connect_args=connect_args,
    pool_pre_ping=True,
)


def init_db() -> None:
    """Initialise le schéma déclaratif de la base de données."""
    import app.models  # Enregistre tous les modèles dans SQLModel.metadata
    SQLModel.metadata.create_all(engine)
    _ensure_user_profile_columns()
    _ensure_user_consent_columns()
    _ensure_page_sort_order_column()
    _ensure_job_page_id_column()


def _ensure_user_profile_columns() -> None:
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("users")
    }
    additions = {
        "display_name": "VARCHAR",
        "avatar_content_type": "VARCHAR",
        "banner_content_type": "VARCHAR",
        "default_content_type": "VARCHAR NOT NULL DEFAULT 'manga'",
        "default_source_lang": "VARCHAR NOT NULL DEFAULT 'ja'",
        "default_target_lang": "VARCHAR NOT NULL DEFAULT 'fr'",
    }
    with engine.begin() as connection:
        for name, definition in additions.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))


def _ensure_user_consent_columns() -> None:
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("users")
    }
    additions = {
        "terms_accepted_at": "TIMESTAMP",
        "age_confirmed_at": "TIMESTAMP",
        "newsletter_opt_in": "BOOLEAN NOT NULL DEFAULT 0",
    }
    with engine.begin() as connection:
        for name, definition in additions.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))


def _ensure_page_sort_order_column() -> None:
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("pages")
    }
    if "sort_order" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE pages ADD COLUMN sort_order INTEGER"))


def _ensure_job_page_id_column() -> None:
    # create_all ne rajoute pas de colonne aux tables existantes
    # (base de production déjà créée sans jobs.page_id).
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("jobs")
    }
    if "page_id" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE jobs ADD COLUMN page_id UUID"))


def get_session():
    with Session(engine) as session:
        yield session