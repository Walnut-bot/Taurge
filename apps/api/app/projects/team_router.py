import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.core.db import get_session
from app.models.project import Project
from app.models.subscription import ProjectMember
from app.models.user import User

router = APIRouter(prefix="/projects/{project_id}/members", tags=["team"])


class MemberAddRequest(BaseModel):
    email: EmailStr
    role: str = "translator"  # 'translator', 'cleaner', 'typesetter', 'proofreader'


class MemberRoleUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    role: str
    created_at: datetime


def _check_project_owner(project_id: uuid.UUID, current_user: User, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Seul le créateur du projet peut gérer l'équipe.",
        )
    return project


@router.get("", response_model=list[MemberResponse])
def list_members(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    # Vérification d'accès : propriétaire OU membre
    is_member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    ).first()

    if project.owner_id != current_user.id and not is_member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")

    members = session.exec(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    ).all()

    result = []
    # Toujours inclure le propriétaire en premier
    owner = session.get(User, project.owner_id)
    if owner:
        result.append(
            MemberResponse(
                id=project.id,
                project_id=project.id,
                user_id=owner.id,
                email=owner.email,
                role="owner",
                created_at=project.created_at,
            )
        )

    for m in members:
        u = session.get(User, m.user_id)
        if u and u.id != project.owner_id:
            result.append(
                MemberResponse(
                    id=m.id,
                    project_id=m.project_id,
                    user_id=u.id,
                    email=u.email,
                    role=m.role,
                    created_at=m.created_at,
                )
            )

    return result


@router.post("", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: uuid.UUID,
    payload: MemberAddRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _check_project_owner(project_id, current_user, session)

    target_user = session.exec(select(User).where(User.email == payload.email)).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Aucun utilisateur n'est inscrit avec l'email '{payload.email}'.",
        )

    if target_user.id == project.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le créateur du projet fait déjà partie de l'équipe.",
        )

    existing = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user.id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet utilisateur fait déjà partie de l'équipe du projet.",
        )

    member = ProjectMember(
        project_id=project_id,
        user_id=target_user.id,
        role=payload.role,
    )
    session.add(member)
    session.commit()
    session.refresh(member)

    return MemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=target_user.id,
        email=target_user.email,
        role=member.role,
        created_at=member.created_at,
    )


@router.patch("/{member_id}", response_model=MemberResponse)
def update_member_role(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _check_project_owner(project_id, current_user, session)

    member = session.get(ProjectMember, member_id)
    if not member or member.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membre introuvable.")

    member.role = payload.role
    session.add(member)
    session.commit()
    session.refresh(member)

    user = session.get(User, member.user_id)
    return MemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        email=user.email if user else "",
        role=member.role,
        created_at=member.created_at,
    )


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _check_project_owner(project_id, current_user, session)

    member = session.get(ProjectMember, member_id)
    if not member or member.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membre introuvable.")

    session.delete(member)
    session.commit()
    return None