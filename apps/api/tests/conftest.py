"""Configuration pytest : base SQLite jetable et chemins d'import.

Les variables d'environnement doivent être posées avant l'import de
`app.core.config` (les réglages et le moteur SQL sont créés à l'import).
"""
import os
import sys
import tempfile
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

_db_path = Path(tempfile.mkdtemp(prefix="taurge-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path.as_posix()}"
os.environ["ENVIRONMENT"] = "development"
os.environ["SECRET_KEY"] = "test-secret-key"
