"""Utilitaire de vérification et de nettoyage de la base de données Taurge.
Permet d'identifier les pages dont les fichiers physiques n'existent plus sur le disque.
"""

import os
from pathlib import Path
from sqlmodel import Session, select
from app.core.db import engine
from app.models.project import Project
from app.models.page import Page
from app.models.cleaned_page import CleanedPage
from app.models.ocr_block import OCRBlock
from app.models.translation import Translation
from app.core.config import settings

def audit_storage():
    base_storage = Path(settings.storage_path).resolve()
    print(f"Dossier de stockage analysé : {base_storage}\n")

    with Session(engine) as session:
        projects = session.exec(select(Project)).all()
        if not projects:
            print("Aucun projet dans la base de données.")
            return

        for p in projects:
            pages = session.exec(select(Page).where(Page.project_id == p.id)).all()
            missing_count = 0
            for page in pages:
                file_path = base_storage / page.storage_key
                if not file_path.is_file():
                    missing_count += 1

            status_str = f"OK ({len(pages)} pages présentes)" if missing_count == 0 else f"ATTENTION : {missing_count}/{len(pages)} pages physiques manquantes sur le disque !"
            print(f"• Projet '{p.name}' (ID: {p.id}) : {status_str}")

if __name__ == "__main__":
    audit_storage()
