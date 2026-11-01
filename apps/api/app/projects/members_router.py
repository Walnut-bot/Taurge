import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.core.db import get_session
from app.models.page import Page
from app.models.project import Project
from app.models.subscription import ProjectMember
from app.models.user import User

router = APIRouter(prefix="/projects/{project_id}", tags=["project-members"])


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = "translator"  # 'translator', 'cleaner', 'typesetter', 'proofreader'


class MemberUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    role: str
    joined_at: datetime


class PageStatusUpdate(BaseModel):
    workflow_status: str  # 'raw', 'cleaned', 'translated', 'typeset', 'ready'


def _check_project_owner_or_member(project_id: uuid.UUID, user_id: uuid.UUID, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    
    if project.owner_id == user_id:
        return project

    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    ).first()

    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projet introuvable.")
    return project


@router.get("/members", response_model=list[MemberResponse])
def list_members(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _check_project_owner_or_member(project_id, current_user.id, session)

    members_list: list[MemberResponse] = []

    # 1. Ajouter le Propriétaire
    owner = session.get(User, project.owner_id)
    if owner:
        members_list.append(
            MemberResponse(
                id=str(project.owner_id),
                user_id=str(project.owner_id),
                email=owner.email,
                role="owner",
                joined_at=project.created_at,
            )
        )

    # 2. Ajouter les membres de l'équipe
    records = session.exec(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    ).all()

    for r in records:
        u = session.get(User, r.user_id)
        if u:
            members_list.append(
                MemberResponse(
                    id=str(r.id),
                    user_id=str(u.id),
                    email=u.email,
                    role=r.role,
                    joined_at=r.created_at,
                )
            )

    return members_list


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    project_id: uuid.UUID,
    payload: MemberInvite,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le propriétaire du projet peut inviter des membres.",
        )

    target_user = session.exec(select(User).where(User.email == payload.email)).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Aucun utilisateur inscrit avec l'email {payload.email}.",
        )

    if target_user.id == project.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'utilisateur est déjà le propriétaire du projet.",
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
            detail="Cet utilisateur fait déjà partie de l'équipe.",
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
        id=str(member.id),
        user_id=str(target_user.id),
        email=target_user.email,
        role=member.role,
        joined_at=member.created_at,
    )


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Action réservée au propriétaire.")

    member = session.get(ProjectMember, member_id)
    if not member or member.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membre introuvable.")

    session.delete(member)
    session.commit()
    return None


@router.patch("/pages/{page_id}/workflow-status")
def update_page_workflow_status(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    payload: PageStatusUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Met à jour l'étape de validation scanlation d'une planche."""
    _check_project_owner_or_member(project_id, current_user.id, session)
    page = session.get(Page, page_id)
    if not page or page.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page introuvable.")

    page.workflow_status = payload.workflow_status
    session.add(page)
    session.commit()
    session.refresh(page)

    return {"page_id": str(page.id), "workflow_status": page.workflow_status}