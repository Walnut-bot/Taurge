"""Accès à un projet : propriétaire ou membre invité de l'équipe.

Point unique de vérité pour les routeurs qui manipulent le contenu
d'un projet (pages, blocs OCR, traductions, glossaire, exports, jobs).
Avant, chaque routeur refaisait son contrôle et plusieurs exigeaient
le propriétaire seul : un membre invité voyait le projet dans sa liste
mais recevait des 404 sur les images (« Image unavailable » côté web).

Les actions d'administration (inviter/retirer un membre, renommer,
supprimer le projet) restent réservées au propriétaire dans leurs
routeurs respectifs.
"""
import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.project import Project
from app.models.subscription import ProjectMember


def user_has_project_access(
    session: Session, project: Project | None, user_id: uuid.UUID
) -> bool:
    """Vrai si l'utilisateur possède le projet ou y est membre invité."""
    if project is None:
        return False
    if project.owner_id == user_id:
        return True
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user_id,
        )
    ).first()
    return member is not None


def get_accessible_project(
    session: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    detail: str = "Projet introuvable.",
) -> Project:
    """Renvoie le projet si l'utilisateur y a accès, sinon 404.

    Toujours 404, jamais 403 : on ne révèle pas qu'un projet
    appartenant à une autre équipe existe.
    """
    project = session.get(Project, project_id)
    if not user_has_project_access(session, project, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return project


# --- Source unique de vérité pour le contrôle d'accès projet -----------
# Tous les routeurs/services passent par ces helpers (ou par
# user_has_project_access ci-dessus). L'ancien ``_get_owned_project``
# de projects/router.py n'est plus qu'un alias de compatibilité qui
# délègue ici : aucune vérification owner/member n'est dupliquée.

def get_owned_project(
    session: Session, project_id: uuid.UUID, user_id: uuid.UUID
) -> Project:
    return get_accessible_project(session, project_id, user_id)


def get_owned_file(session: Session, project_id: uuid.UUID, file_id: uuid.UUID, user_id: uuid.UUID):
    from app.models.source_file import SourceFile

    get_accessible_project(session, project_id, user_id)
    source_file = session.get(SourceFile, file_id)
    if not source_file or source_file.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")
    return source_file


def get_owned_page(session: Session, project_id: uuid.UUID, page_id: uuid.UUID, user_id: uuid.UUID):
    from app.models.page import Page

    get_accessible_project(session, project_id, user_id)
    page = session.get(Page, page_id)
    if not page or page.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable.")
    return page
