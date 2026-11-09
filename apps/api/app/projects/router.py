"""Routeur mince des projets : validation HTTP + appels de service.

La logique métier vit dans project_service / page_service /
export_service. Les routes, schémas et codes HTTP sont inchangés.
"""
import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth.dependencies import get_current_user
from app.core.db import get_session
from app.models.user import User
from app.ocr.dependencies import get_ocr_provider
from app.ocr.provider import OCRProvider
from app.projects import export_service, page_service, project_service
from app.projects.access import get_owned_project as _get_owned_project_impl
from app.projects.schemas import (
    BatchProcessResponse, ExportResponse, OCRBlockResponse, PageResponse,
    ProjectCreate, ProjectDetailResponse, ProjectResponse, ProjectUpdate,
    SourceFileResponse, TranslationResponse,
)
from app.storage.dependencies import get_storage_provider
from app.storage.provider import StorageProvider
from app.translation.dependencies import get_translation_provider
from app.translation.provider import TranslationProvider

router = APIRouter(prefix="/projects", tags=["projects"])


# Compat : anciens imports (auth/router, tests). Délègue à access.py,
# source unique de vérité du contrôle d'accès.
def _get_owned_project(project_id: uuid.UUID, current_user: User, session: Session):
    return _get_owned_project_impl(session, project_id, current_user.id)


def _get_owned_file(project_id, file_id, current_user, session):
    from app.projects.access import get_owned_file
    return get_owned_file(session, project_id, file_id, current_user.id)


def _get_owned_page(project_id, page_id, current_user, session):
    from app.projects.access import get_owned_page
    return get_owned_page(session, project_id, page_id, current_user.id)


def _read_storage_or_404(storage, key, label="Le fichier"):
    return project_service._read_storage_or_404(storage, key, label)


# Compat : app.auth.router importe ce nom depuis ce module.
_delete_project_cascade = project_service.delete_project_cascade


class PagesReorder(BaseModel):
    page_ids: list[uuid.UUID]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return project_service.create_project(payload, current_user, session)


@router.get("", response_model=list[ProjectResponse])
def list_projects(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return project_service.list_projects(current_user, session)


@router.patch("/{project_id}", response_model=ProjectResponse)
def rename_project(project_id: uuid.UUID, payload: ProjectUpdate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return project_service.rename_project(project_id, payload, current_user, session)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(project_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return project_service.get_project_detail(project_id, current_user, session)


@router.patch("/{project_id}/pages/reorder")
def reorder_project_pages(project_id: uuid.UUID, payload: PagesReorder, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return project_service.reorder_project_pages(project_id, payload, current_user, session)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider)):
    return project_service.delete_project_record(project_id, current_user, session, storage)


@router.post("/{project_id}/upload", response_model=SourceFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(project_id: uuid.UUID, file: UploadFile, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider)):
    return await project_service.upload_file(project_id, file, current_user, session, storage)


@router.post("/{project_id}/files/{file_id}/extract", response_model=list[PageResponse], status_code=status.HTTP_201_CREATED)
def extract_pages(project_id: uuid.UUID, file_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider)):
    return page_service.extract_pages(project_id, file_id, current_user, session, storage)


@router.post("/{project_id}/pages/{page_id}/ocr", response_model=list[OCRBlockResponse], status_code=status.HTTP_201_CREATED)
async def run_ocr(project_id: uuid.UUID, page_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider), ocr: OCRProvider = Depends(get_ocr_provider)):
    return await page_service.run_ocr(project_id, page_id, current_user, session, storage, ocr)


@router.post("/{project_id}/pages/{page_id}/translate", response_model=list[TranslationResponse], status_code=status.HTTP_201_CREATED)
async def translate_page(project_id: uuid.UUID, page_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), translator: TranslationProvider = Depends(get_translation_provider)):
    return await page_service.translate_page(project_id, page_id, current_user, session, translator)


@router.post("/{project_id}/export", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
def export_project(project_id: uuid.UUID, format: str | None = Query(None), current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider)):
    return export_service.export_project(project_id, format, current_user, session, storage)


@router.post("/{project_id}/pages/{page_id}/clean", response_model=PageResponse, status_code=status.HTTP_201_CREATED)
def clean_page(project_id: uuid.UUID, page_id: uuid.UUID, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider)):
    return page_service.clean_page(project_id, page_id, current_user, session, storage)


@router.post("/{project_id}/batch-process", response_model=BatchProcessResponse, status_code=status.HTTP_200_OK)
async def batch_process_project(project_id: uuid.UUID, include_ocr: bool = True, include_translate: bool = True, include_clean: bool = True, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider), ocr: OCRProvider = Depends(get_ocr_provider), translator: TranslationProvider = Depends(get_translation_provider)):
    return await page_service.batch_process_project(project_id, include_ocr, include_translate, include_clean, current_user, session, storage, ocr, translator)


@router.post("/{project_id}/pages/{page_id}/process-full", response_model=PageResponse, status_code=status.HTTP_200_OK)
async def process_page_full(project_id: uuid.UUID, page_id: uuid.UUID, include_ocr: bool = True, include_translate: bool = True, include_clean: bool = True, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), storage: StorageProvider = Depends(get_storage_provider), ocr: OCRProvider = Depends(get_ocr_provider), translator: TranslationProvider = Depends(get_translation_provider)):
    return await page_service.process_page_full(project_id, page_id, include_ocr, include_translate, include_clean, current_user, session, storage, ocr, translator)
