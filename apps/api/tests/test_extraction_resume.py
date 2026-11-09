"""Reprise d'extraction après crash : un job interrompu en pleine
extraction laisse des pages partielles en base. Sa reprise (worker DB,
statut repassé `pending`) doit terminer l'extraction au lieu d'échouer
sur « Ce fichier a déjà été extrait en pages. », sans page en double.
"""
import uuid

import fitz
from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.jobs.execution import _run_extraction_in_background
from app.models.job import Job
from app.models.page import Page
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User
from app.storage.dependencies import storage_provider


def _pdf_bytes(pages: int = 3) -> bytes:
    doc = fitz.open()
    for index in range(pages):
        page = doc.new_page(width=300, height=420)
        page.insert_text((40, 60), f"Page {index + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def test_extraction_resume_replaces_partial_pages():
    init_db()
    project_id = uuid.uuid4()
    source_id = uuid.uuid4()
    job_id = uuid.uuid4()
    user_id = uuid.uuid4()
    source_key = f"originals/{project_id}/resume.pdf"
    partial_key = f"pages/{project_id}/partial.png"
    storage_provider.save(source_key, _pdf_bytes(3))
    storage_provider.save(partial_key, b"page-partielle")

    with Session(engine) as session:
        session.add(User(id=user_id, email=f"resume-{uuid.uuid4().hex[:8]}@example.com",
                         password_hash="x"))
        session.add(Project(id=project_id, owner_id=user_id, name="Reprise",
                            source_lang="ja", target_lang="fr", content_type="manga"))
        session.add(SourceFile(id=source_id, project_id=project_id,
                               storage_key=source_key, original_filename="resume.pdf",
                               file_type="pdf", size_bytes=10))
        session.add(Job(id=job_id, project_id=project_id, user_id=user_id,
                        source_file_id=source_id, job_type="extract_pages",
                        status="pending"))
        # Page partielle laissée par le crash (extraction interrompue).
        session.add(Page(project_id=project_id, source_file_id=source_id,
                         page_number=1, storage_key=partial_key, width=10, height=10))
        session.commit()

    _run_extraction_in_background(job_id, source_id)

    with Session(engine) as session:
        job = session.get(Job, job_id)
        assert job is not None and job.status == "completed", (
            job.status if job else None, job.error_message if job else None)
        pages = session.exec(
            select(Page).where(Page.source_file_id == source_id)
            .order_by(Page.page_number)
        ).all()
        assert [p.page_number for p in pages] == [1, 2, 3]
        assert all(p.storage_key != partial_key for p in pages)
    assert not storage_provider.exists(partial_key)
