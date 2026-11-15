"""Routeur d'Administration Système (`/admin` — Section 34 du cahier des charges).

Accessible uniquement aux administrateurs (`user.is_admin == True` ou email
figurant dans `ADMIN_EMAILS`). Toutes les attributions de crédits sont
auditées dans `UsageLedger`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.billing.credit_service import get_or_create_subscription
from app.billing.deepl_quota_service import (
    get_or_create_deepl_usage,
    set_deepl_monthly_limit,
)
from app.billing.tariffs import CREDIT_PACKS, SUBSCRIPTION_PLANS, TariffConfig
from app.core.config import settings
from app.core.db import get_session
from app.core.i18n import locale_dependency, translate_detail
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
    monthly_credits_remaining: int = 0
    purchased_credits_remaining: int = 0
    projects_count: int
    created_at: datetime


class AdminCreditGrantRequest(BaseModel):
    delta: int = Field(..., description="Nombre de crédits à ajouter (ou retirer si négatif)")
    reason: str = Field(default="Ajustement administrateur", max_length=255)


class AdminDeeplLimitRequest(BaseModel):
    chars_limit: int = Field(..., ge=10_000, description="Nouveau contingent mensuel DeepL")


class AdminTariffUpdateRequest(BaseModel):
    ocr_per_page: int | None = Field(None, ge=1)
    translate_ollama_per_1k_chars: int | None = Field(None, ge=1)
    translate_deepl_per_1k_chars: int | None = Field(None, ge=1)
    clean_opencv_per_page: int | None = Field(None, ge=1)
    clean_lama_base_per_page: int | None = Field(None, ge=1)


class AdminEngineStatusRequest(BaseModel):
    engine: str = Field(..., description="Nom du moteur: ocr, ollama, deepl, opencv, lama")
    enabled: bool = Field(..., description="Activer ou suspendre temporairement le moteur")


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
        l.amount for l in ledgers if l.action_type in ("ocr", "translate", "clean", "batch") and l.amount > 0 and l.status == "completed"
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
        avail = sub.total_available if sub else 0
        items.append(
            AdminUserItem(
                id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                is_admin=bool(getattr(u, "is_admin", False)) or (u.email.lower() in admin_set),
                plan=sub.plan if sub else "free",
                credits_remaining=avail,
                monthly_credits_remaining=sub.monthly_credits_remaining if sub else 0,
                purchased_credits_remaining=sub.purchased_credits_remaining if sub else 0,
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
    # Les ajustements administrateurs positifs sont portés sur purchased_credits_remaining
    # pour ne pas être écrasés lors du renouvellement mensuel
    if payload.delta > 0:
        sub.purchased_credits_remaining += payload.delta
    else:
        # En cas de retrait
        sub.purchased_credits_remaining = max(0, sub.purchased_credits_remaining + payload.delta)
    sub.credits_remaining = sub.monthly_credits_remaining + sub.purchased_credits_remaining
    sub.credits_limit = max(sub.credits_limit, sub.credits_remaining)
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    # Trace d'audit dans UsageLedger (Section 34 & Partie 11)
    tx = str(uuid.uuid4())
    session.add(
        UsageLedger(
            transaction_id=tx,
            user_id=target_user.id,
            project_id=None,
            action_type="admin_grant",
            amount=payload.delta,
            origin="admin",
            status="completed",
            correlation_id=tx,
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
        credits_remaining=sub.total_available,
        monthly_credits_remaining=sub.monthly_credits_remaining,
        purchased_credits_remaining=sub.purchased_credits_remaining,
        projects_count=proj_count,
        created_at=target_user.created_at,
    )


@router.get("/deepl-quota")
def admin_get_deepl_quota(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Surveillance avancée du contingent global DeepL et répartition de consommation."""
    usage = get_or_create_deepl_usage(session)
    remaining = max(0, usage.chars_limit - usage.chars_used)
    pct = (usage.chars_used / usage.chars_limit * 100) if usage.chars_limit else 0.0

    # Top utilisateurs consommateurs de caractères DeepL
    ledgers = session.exec(
        select(UsageLedger).where(
            UsageLedger.action_type == "translate",
            UsageLedger.engine_used.ilike("%deepl%"),
            UsageLedger.status == "completed",
        )
    ).all()

    chars_by_user: dict[uuid.UUID, int] = {}
    for l in ledgers:
        chars_by_user[l.user_id] = chars_by_user.get(l.user_id, 0) + (l.source_chars_count or 0)

    top_users = []
    for uid, count in sorted(chars_by_user.items(), key=lambda x: x[1], reverse=True)[:5]:
        u = session.get(User, uid)
        if u:
            top_users.append({"user_id": str(uid), "email": u.email, "chars": count})

    return {
        "period_month": usage.period_month,
        "chars_used": usage.chars_used,
        "chars_limit": usage.chars_limit,
        "chars_remaining": remaining,
        "percent_used": round(pct, 1),
        "requests_count": usage.requests_count,
        "top_users": top_users,
    }


@router.post("/deepl-quota")
def admin_set_deepl_quota(
    payload: AdminDeeplLimitRequest,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Redéfinit le contingent mensuel global DeepL."""
    usage = set_deepl_monthly_limit(session, payload.chars_limit)
    return {
        "status": "success",
        "period_month": usage.period_month,
        "chars_limit": usage.chars_limit,
        "chars_used": usage.chars_used,
    }


@router.get("/profitability")
def admin_get_profitability(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Tableau de bord de rentabilité et calcul de marge brute (Partie 9)."""
    # 1. Revenus réels encaissés (transactions payées)
    paid_txs = session.exec(
        select(PaymentTransaction).where(PaymentTransaction.status == "paid")
    ).all()
    revenue_cents = sum(t.amount_cents for t in paid_txs)
    revenue_eur = revenue_cents / 100.0

    # 2. Coûts réels fournisseurs audités
    ledgers = session.exec(
        select(UsageLedger).where(UsageLedger.status == "completed")
    ).all()
    total_provider_cost = sum(l.cost_provider_actual or 0.0 for l in ledgers)

    # 3. Répartition des opérations par moteur
    engine_stats: dict[str, dict[str, Any]] = {}
    for l in ledgers:
        eng = l.engine_used or l.action_type
        if eng not in engine_stats:
            engine_stats[eng] = {"count": 0, "credits": 0, "provider_cost": 0.0}
        engine_stats[eng]["count"] += 1
        engine_stats[eng]["credits"] += max(0, l.amount)
        engine_stats[eng]["provider_cost"] += (l.cost_provider_actual or 0.0)

    # 4. Marge brute
    gross_margin = revenue_eur - total_provider_cost
    margin_percent = (gross_margin / revenue_eur * 100) if revenue_eur > 0 else 100.0

    return {
        "total_revenue_eur": round(revenue_eur, 2),
        "total_provider_cost_eur": round(total_provider_cost, 4),
        "gross_margin_eur": round(gross_margin, 2),
        "gross_margin_percent": round(margin_percent, 1),
        "engine_stats": engine_stats,
    }


@router.get("/pricing")
def admin_get_pricing(
    _admin: User = Depends(require_admin),
):
    """Barème des opérations, forfaits et packs de crédits en vigueur."""
    return {
        "tariffs": {
            "ocr_per_page": TariffConfig.OCR_PER_PAGE,
            "translate_ollama_per_1k_chars": TariffConfig.TRANSLATE_OLLAMA_PER_1K_CHARS,
            "translate_deepl_per_1k_chars": TariffConfig.TRANSLATE_DEEPL_PER_1K_CHARS,
            "clean_opencv_per_page": TariffConfig.CLEAN_OPENCV_PER_PAGE,
            "clean_lama_base_per_page": TariffConfig.CLEAN_LAMA_BASE_PER_PAGE,
        },
        "engine_status": TariffConfig.ENGINE_STATUS,
        "plans": SUBSCRIPTION_PLANS,
        "packs": CREDIT_PACKS,
    }


@router.post("/tariffs")
def admin_update_tariffs(
    payload: AdminTariffUpdateRequest,
    _admin: User = Depends(require_admin),
):
    """Modifie le barème centralisé des opérations IA."""
    if payload.ocr_per_page is not None:
        TariffConfig.OCR_PER_PAGE = payload.ocr_per_page
        TariffConfig.OCR_STANDARD = payload.ocr_per_page
    if payload.translate_ollama_per_1k_chars is not None:
        TariffConfig.TRANSLATE_OLLAMA_PER_1K_CHARS = payload.translate_ollama_per_1k_chars
    if payload.translate_deepl_per_1k_chars is not None:
        TariffConfig.TRANSLATE_DEEPL_PER_1K_CHARS = payload.translate_deepl_per_1k_chars
    if payload.clean_opencv_per_page is not None:
        TariffConfig.CLEAN_OPENCV_PER_PAGE = payload.clean_opencv_per_page
    if payload.clean_lama_base_per_page is not None:
        TariffConfig.CLEAN_LAMA_BASE_PER_PAGE = payload.clean_lama_base_per_page

    return {
        "status": "success",
        "tariffs": {
            "ocr_per_page": TariffConfig.OCR_PER_PAGE,
            "translate_ollama_per_1k_chars": TariffConfig.TRANSLATE_OLLAMA_PER_1K_CHARS,
            "translate_deepl_per_1k_chars": TariffConfig.TRANSLATE_DEEPL_PER_1K_CHARS,
            "clean_opencv_per_page": TariffConfig.CLEAN_OPENCV_PER_PAGE,
            "clean_lama_base_per_page": TariffConfig.CLEAN_LAMA_BASE_PER_PAGE,
        },
    }


@router.post("/engine-status")
def admin_set_engine_status(
    payload: AdminEngineStatusRequest,
    _admin: User = Depends(require_admin),
):
    """Active ou suspend temporairement un moteur IA."""
    TariffConfig.set_engine_status(payload.engine, payload.enabled)
    return {
        "status": "success",
        "engine": payload.engine,
        "enabled": TariffConfig.is_engine_enabled(payload.engine),
        "all_statuses": TariffConfig.ENGINE_STATUS,
    }


@router.get("/jobs", response_model=list[AdminJobItem])
def list_admin_jobs(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
    locale: str = Depends(locale_dependency),
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
            message=str(translate_detail(j.message, locale)) if j.message else "",
            error_message=str(translate_detail(j.error_message, locale)) if j.error_message else None,
            created_at=j.created_at,
        )
        for j in jobs
    ]
