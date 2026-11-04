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
