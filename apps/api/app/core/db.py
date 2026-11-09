import logging
from pathlib import Path

from sqlalchemy import inspect
from sqlmodel import SQLModel, Session, create_engine
from app.core.config import settings

logger = logging.getLogger(__name__)

# Render/Neon fournissent souvent l'ancien schéma postgres:// que
# SQLAlchemy 2 n'accepte plus : on le normalise en postgresql://.
_database_url = settings.database_url
if _database_url.startswith("postgres://"):
    _database_url = "postgresql://" + _database_url[len("postgres://"):]

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
    """Initialise la base en gardant les bases SQLite existantes.

    Alembic est la source de vérité du schéma versionné
    (voir `alembic/versions/`). Pour ne pas casser un `taurge.db`
    existant créé avant Alembic, `create_all` reste le bootstrap
    idempotent (il ne crée que les tables absentes, jamais d'ALTER
    ad-hoc), puis l'état Alembic est synchronisé :
    - base déjà versionnée -> `alembic upgrade head` ;
    - base non versionnée (créée par create_all) -> `stamp head`.

    Mise à jour manuelle d'une base existante :
        cd apps/api && alembic upgrade head
    """
    import app.models  # Enregistre tous les modèles dans SQLModel.metadata

    SQLModel.metadata.create_all(engine)
    _sync_alembic_state()


def _sync_alembic_state() -> None:
    """Aligne `alembic_version` sans ALTER manuel (best effort)."""
    try:
        from alembic import command
        from alembic.config import Config

        ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
        if not ini_path.exists():
            return
        cfg = Config(str(ini_path))
        cfg.set_main_option("script_location", str(ini_path.parent / "alembic"))
        cfg.set_main_option("sqlalchemy.url", _database_url)
        versioned = inspect(engine).has_table("alembic_version")
        if versioned:
            command.upgrade(cfg, "head")
        else:
            # Schéma déjà au niveau des modèles via create_all :
            # on enregistre simplement la révision courante.
            command.stamp(cfg, "head")
    except Exception:
        # Ne jamais empêcher le démarrage pour un souci de versioning :
        # le schéma déclaratif (create_all) reste fonctionnel.
        logger.warning("Synchronisation Alembic impossible.", exc_info=True)


def get_session():
    with Session(engine) as session:
        yield session
