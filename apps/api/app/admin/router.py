"""Routeur d'Administration Système (`/admin` — Section 34 du cahier des charges).

Accessible uniquement aux administrateurs (`user.is_admin == True` ou email
figurant dans `ADMIN_EMAILS`). Toutes les attributions de crédits sont
auditées dans `UsageLedger`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.billing.credit_service import get_or_create_subscription
from app.core.config import settings
from app.core.db import get_session
from app.models.job import Job
from app.models.page import Page
from app.models.payment import PaymentTransaction
from app.models.project import Project
from app.models.subscription import Subscription, UsageLedger
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    admin_set = {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }
    if not getattr(current_user, "is_admin", False) and current_user.email.lower() not in admin_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs.",
        )
    return current_user


class AdminStatsResponse(BaseModel):
    users_count: int
    projects_count: int
    pages_count: int
    active_jobs_count: int
    failed_jobs_count: int
    total_credits_used: int
    paid_transactions_count: int


class AdminUserItem(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    is_admin: bool
    plan: str
    credits_remaining: int
    projects_count: int
    created_at: datetime


class AdminCreditGrantRequest(BaseModel):
    delta: int = Field(..., description="Nombre de crédits à ajouter (ou retirer si négatif)")
    reason: str = Field(default="Ajustement administrateur", max_length=255)


class AdminJobItem(BaseModel):
    id: str
    project_id: str
    user_id: str | None = None
    job_type: str
    status: str
    progress_percent: int
    message: str
    error_message: str | None = None
    created_at: datetime


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    users_count = len(session.exec(select(User)).all())
    projects_count = len(session.exec(select(Project)).all())
    pages_count = len(session.exec(select(Page)).all())
    jobs = session.exec(select(Job)).all()
    active_jobs_count = sum(1 for j in jobs if j.status in ("pending", "running"))
    failed_jobs_count = sum(1 for j in jobs if j.status == "failed")
    ledgers = session.exec(select(UsageLedger)).all()
    total_credits_used = sum(
        l.amount for l in ledgers if l.action_type in ("ocr", "translate", "clean", "batch") and l.amount > 0
    )
    paid_tx = session.exec(
        select(PaymentTransaction).where(PaymentTransaction.status == "paid")
    ).all()

    return AdminStatsResponse(
        users_count=users_count,
        projects_count=projects_count,
        pages_count=pages_count,
        active_jobs_count=active_jobs_count,
        failed_jobs_count=failed_jobs_count,
        total_credits_used=total_credits_used,
        paid_transactions_count=len(paid_tx),
    )


@router.get("/users", response_model=list[AdminUserItem])
def list_admin_users(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    projects = session.exec(select(Project)).all()
    subs = {s.user_id: s for s in session.exec(select(Subscription)).all()}

    proj_count_by_owner: dict[uuid.UUID, int] = {}
    for p in projects:
        proj_count_by_owner[p.owner_id] = proj_count_by_owner.get(p.owner_id, 0) + 1

    admin_set = {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }

    items: list[AdminUserItem] = []
    for u in users:
        sub = subs.get(u.id)
        items.append(
            AdminUserItem(
                id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                is_admin=bool(getattr(u, "is_admin", False)) or (u.email.lower() in admin_set),
                plan=sub.plan if sub else "free",
                credits_remaining=sub.credits_remaining if sub else 0,
                projects_count=proj_count_by_owner.get(u.id, 0),
                created_at=u.created_at,
            )
        )
    return items


@router.post("/users/{user_id}/credits", response_model=AdminUserItem)
def grant_user_credits(
    user_id: uuid.UUID,
    payload: AdminCreditGrantRequest,
    admin_user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )
    if payload.delta == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le montant de crédits doit être non nul.",
        )

    sub = get_or_create_subscription(session, target_user.id)
    sub.credits_remaining = max(0, sub.credits_remaining + payload.delta)
    if payload.delta > 0 and sub.credits_remaining > sub.credits_limit:
        sub.credits_limit = sub.credits_remaining
    session.add(sub)

    # Trace d'audit dans UsageLedger (Section 34)
    session.add(
        UsageLedger(
            user_id=target_user.id,
            project_id=None,
            action_type="admin_grant",
            amount=payload.delta,
            description=f"[Admin {admin_user.email}] {payload.reason.strip()}",
        )
    )
    session.commit()
    session.refresh(sub)

    proj_count = len(
        session.exec(select(Project).where(Project.owner_id == target_user.id)).all()
    )
    admin_set = {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }
    return AdminUserItem(
        id=str(target_user.id),
        email=target_user.email,
        display_name=target_user.display_name,
        is_admin=bool(getattr(target_user, "is_admin", False)) or (target_user.email.lower() in admin_set),
        plan=sub.plan,
        credits_remaining=sub.credits_remaining,
        projects_count=proj_count,
        created_at=target_user.created_at,
    )


@router.get("/jobs", response_model=list[AdminJobItem])
def list_admin_jobs(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    jobs = session.exec(select(Job).order_by(Job.created_at.desc()).limit(50)).all()
    return [
        AdminJobItem(
            id=str(j.id),
            project_id=str(j.project_id),
            user_id=str(j.user_id) if j.user_id else None,
            job_type=j.job_type,
            status=j.status,
            progress_percent=j.progress_percent,
            message=j.message,
            error_message=j.error_message,
            created_at=j.created_at,
        )
        for j in jobs
    ]
