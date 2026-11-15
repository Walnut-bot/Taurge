"""Service crédits Taurge — source unique de vérité de la comptabilité et facturation IA.

Règles d'or économiques :
1. Distinction stricte des 3 poches :
   - `monthly_credits_remaining` : crédits mensuels d'abonnement (périssables à l'échéance du cycle).
   - `purchased_credits_remaining` : crédits achetés en packs supplémentaires (ne périment JAMAIS).
   - `reserved_credits` : crédits temporairement gelés pendant le traitement IA pour prévenir la double dépense.
2. Priorité de débit : les crédits mensuels sont débités en priorité ; les crédits achetés ne sont entamés
   que lorsque les crédits mensuels sont épuisés.
3. Réservation atomique (two-phase commit) :
   - `reserve_credits` : gèle le montant sous transaction atomique.
   - `settle_reservation` : valide le débit final après succès et enregistre l'audit dans `UsageLedger`.
   - `release_reservation` : libère la réservation en cas d'échec, sans aucun débit définitif.
4. Barème officiel centralisé dans `tariffs.py`.
5. 100 crédits offerts à l'inscription sur le plan Free (100 crédits/mois).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text as sa_text, update as sa_update
from sqlmodel import Session, select

from app.billing.tariffs import (
    CREDIT_PACKS,
    PROVIDER_COSTS,
    SUBSCRIPTION_PLANS,
    TariffConfig,
)
from app.models.subscription import Subscription, UsageLedger

logger = logging.getLogger(__name__)

SIGNUP_FREE_CREDITS = 100


def get_or_create_subscription(
    session: Session,
    user_id: uuid.UUID,
    initial_credits: int = SIGNUP_FREE_CREDITS,
) -> Subscription:
    """Récupère l'abonnement de l'utilisateur ou initialise le forfait Free avec ses quotas."""
    sub = session.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    now = datetime.now(timezone.utc)

    if not sub:
        cycle_end = now + timedelta(days=30)
        sub = Subscription(
            user_id=user_id,
            plan="free",
            status="active",
            credits_remaining=initial_credits,
            credits_limit=initial_credits,
            monthly_credits_remaining=initial_credits,
            monthly_credits_limit=initial_credits,
            purchased_credits_remaining=0,
            reserved_credits=0,
            current_period_end=cycle_end,
            created_at=now,
            updated_at=now,
        )
        session.add(sub)
        session.commit()
        session.refresh(sub)
    else:
        # Vérification automatique de renouvellement du cycle mensuel si l'échéance est passée
        if sub.current_period_end and sub.current_period_end < now:
            check_and_renew_subscription(session, sub)

    return sub


def check_and_renew_subscription(session: Session, sub: Subscription) -> Subscription:
    """Renouvelle le cycle mensuel de l'abonnement.

    - Les crédits mensuels non consommés expirent et sont réinitialisés au quota du forfait.
    - Les crédits achetés sont STRICTEMENT CONSERVÉS intacts.
    - La date de fin de cycle est prolongée de 30 jours.
    """
    plan_info = SUBSCRIPTION_PLANS.get(sub.plan.lower(), SUBSCRIPTION_PLANS["free"])
    quota = int(plan_info["monthly_credits"])
    now = datetime.now(timezone.utc)

    sub.monthly_credits_remaining = quota
    sub.monthly_credits_limit = quota
    sub.reserved_credits = 0
    sub.credits_remaining = sub.monthly_credits_remaining + sub.purchased_credits_remaining
    sub.credits_limit = sub.monthly_credits_limit + sub.purchased_credits_remaining
    sub.current_period_end = now + timedelta(days=30)
    sub.updated_at = now

    session.add(sub)
    session.add(
        UsageLedger(
            user_id=sub.user_id,
            action_type="renewal",
            amount=-quota,
            origin="monthly",
            status="completed",
            description=f"Renouvellement mensuel forfait {sub.plan.upper()} (+{quota} crédits mensuels)",
            created_at=now,
        )
    )
    session.commit()
    session.refresh(sub)
    logger.info("Abonnement renouvelé pour user %s (plan %s, quota %d)", sub.user_id, sub.plan, quota)
    return sub


def get_balance_summary(session: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """Retourne la situation comptable détaillée de l'utilisateur."""
    sub = get_or_create_subscription(session, user_id)
    available = max(
        0,
        (sub.monthly_credits_remaining + sub.purchased_credits_remaining) - sub.reserved_credits,
    )
    return {
        "plan": sub.plan,
        "status": sub.status,
        "available_credits": available,
        "total_available": available,
        "monthly_credits_remaining": sub.monthly_credits_remaining,
        "monthly_remaining": sub.monthly_credits_remaining,
        "monthly_credits_limit": sub.monthly_credits_limit,
        "purchased_credits_remaining": sub.purchased_credits_remaining,
        "purchased_remaining": sub.purchased_credits_remaining,
        "reserved_credits": sub.reserved_credits,
        "reserved": sub.reserved_credits,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        # Rétrocompatibilité
        "credits_remaining": available,
        "credits_limit": sub.monthly_credits_limit + sub.purchased_credits_remaining,
    }


def get_credit_balance(user_id: uuid.UUID, session: Session) -> dict[str, Any]:
    """Alias pour get_balance_summary avec argument user_id en premier."""
    return get_balance_summary(session, user_id)


def renew_subscription_cycle(sub: Subscription, session: Session) -> Subscription:
    """Alias pour check_and_renew_subscription."""
    return check_and_renew_subscription(session, sub)


def estimate_operation_cost(
    action_type: str,
    *,
    source_chars: int | str = 0,
    engine: str = "standard",
    zones_count: int = 1,
    page_count: int = 1,
) -> dict[str, Any]:
    """Calcule l'estimation du coût en crédits avant de lancer une opération."""
    action = action_type.lower()
    norm_engine = (engine or "standard").lower()

    if action == "ocr":
        unit_cost = TariffConfig.OCR_PER_PAGE
        total_cost = unit_cost * max(1, page_count)
        engine_label = "MangaOCR" if norm_engine in ("manga", "manga_ocr", "mangaocr") else "PaddleOCR / Tesseract"
    elif action == "translate":
        engine_key = "deepl" if norm_engine in ("deepl", "deepl_api") else "ollama"
        unit_cost = TariffConfig.calculate_translation_cost(source_chars, engine=engine_key)
        total_cost = unit_cost * max(1, page_count if not source_chars else 1)
        engine_label = "DeepL Premium" if engine_key == "deepl" else "Ollama Local (Llama 3.1)"
    elif action == "clean":
        engine_key = "lama" if norm_engine in ("lama", "lama_onnx") else "opencv"
        unit_cost = TariffConfig.calculate_cleaning_cost(zones_count=zones_count, engine=engine_key)
        total_cost = unit_cost * max(1, page_count)
        engine_label = "LaMa ONNX" if engine_key == "lama" else "OpenCV (Telea/Topologique)"
    elif action == "batch":
        # Traitement complet d'un chapitre (OCR + Traduction + Clean par page)
        trans_cost = TariffConfig.calculate_translation_cost(source_chars or 1000, engine=norm_engine)
        clean_cost = TariffConfig.CLEAN_LAMA_BASE_PER_PAGE if "lama" in norm_engine else TariffConfig.CLEAN_OPENCV_PER_PAGE
        per_page = TariffConfig.OCR_PER_PAGE + trans_cost + clean_cost
        total_cost = per_page * max(1, page_count)
        engine_label = f"Lot complet ({max(1, page_count)} pages)"
    else:
        unit_cost = 1
        total_cost = unit_cost * max(1, page_count)
        engine_label = norm_engine

    return {
        "action_type": action,
        "engine": norm_engine,
        "engine_label": engine_label,
        "unit_cost": unit_cost,
        "total_cost": total_cost,
        "page_count": page_count,
    }


def ensure_credits(user_id: uuid.UUID, amount: int, session: Session) -> None:
    """Vérifie le solde disponible sans réserver. Lève HTTP 402 si insuffisant."""
    sub = get_or_create_subscription(session, user_id)
    available = max(
        0,
        (sub.monthly_credits_remaining + sub.purchased_credits_remaining) - sub.reserved_credits,
    )
    if available < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Tu as atteint ton quota disponible ({available} crédits disponibles, {amount} requis). "
                f"Recharge des crédits supplémentaires ou passe à un forfait supérieur pour continuer."
            ),
        )


def reserve_credits(
    user_id: uuid.UUID,
    amount: int,
    action_type: str,
    session: Session,
    *,
    project_id: uuid.UUID | None = None,
    page_id: uuid.UUID | None = None,
    engine_used: str | None = None,
    source_chars_count: int | None = None,
    correlation_id: str | None = None,
) -> uuid.UUID:
    """Phase 1 : Réservation atomique des crédits avant le traitement IA.

    Gèle `amount` crédits dans `reserved_credits`.
    Empêche les attaques par concurrence ou requêtes simultanées.
    """
    if amount <= 0:
        return uuid.uuid4()

    sub = get_or_create_subscription(session, user_id)
    available = max(
        0,
        (sub.monthly_credits_remaining + sub.purchased_credits_remaining) - sub.reserved_credits,
    )
    if available < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Tu as atteint ton quota disponible ({available} crédits disponibles, {amount} requis). "
                f"Recharge des crédits supplémentaires ou passe à un forfait supérieur pour continuer."
            ),
        )

    # Réservation atomique
    sub.reserved_credits += amount
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    # Entrée en statut 'reserved' dans le ledger pour auditabilité
    reservation_tx = str(uuid.uuid4())
    session.add(
        UsageLedger(
            transaction_id=reservation_tx,
            user_id=user_id,
            project_id=project_id,
            page_id=page_id,
            action_type=action_type,
            amount=amount,
            engine_used=engine_used,
            source_chars_count=source_chars_count,
            origin="monthly" if sub.monthly_credits_remaining >= amount else "purchased",
            status="reserved",
            correlation_id=correlation_id or reservation_tx,
            description=f"Réservation {action_type} ({amount} crédits)",
        )
    )
    session.commit()
    session.refresh(sub)
    return uuid.UUID(reservation_tx)


def settle_reservation(*args, **kwargs) -> int:
    """Phase 2 : Validation du débit final après succès de l'opération IA.

    Supporte :
    1) settle_reservation(reservation_id: uuid.UUID, session: Session, ...)
    2) settle_reservation(user_id: uuid.UUID, reservation_id: uuid.UUID, amount: int, action_type: str, session: Session, ...)
    """
    if len(args) >= 2 and isinstance(args[1], Session):
        reservation_id = args[0]
        session = args[1]
        user_id = kwargs.get("user_id")
        amount = kwargs.get("amount")
        action_type = kwargs.get("action_type")
    elif len(args) >= 5:
        user_id = args[0]
        reservation_id = args[1]
        amount = args[2]
        action_type = args[3]
        session = args[4]
    else:
        reservation_id = kwargs.get("reservation_id") or (args[0] if args else None)
        session = kwargs.get("session") or (args[1] if len(args) > 1 else None)
        user_id = kwargs.get("user_id")
        amount = kwargs.get("amount")
        action_type = kwargs.get("action_type")

    tx_str = str(reservation_id)
    existing_ledger = session.exec(
        select(UsageLedger).where(UsageLedger.transaction_id == tx_str)
    ).first()

    if existing_ledger:
        user_id = user_id or existing_ledger.user_id
        amount = amount if amount is not None else existing_ledger.amount
        action_type = action_type or existing_ledger.action_type

    if user_id is None or amount is None:
        raise ValueError(f"Impossible de résoudre la réservation {reservation_id}")

    sub = get_or_create_subscription(session, user_id)

    # Libère la réservation
    sub.reserved_credits = max(0, sub.reserved_credits - amount)

    # Répartition du débit : mensuel d'abord, puis purchased
    monthly_debit = min(sub.monthly_credits_remaining, amount)
    purchased_debit = amount - monthly_debit

    sub.monthly_credits_remaining -= monthly_debit
    sub.purchased_credits_remaining -= purchased_debit
    sub.credits_remaining = sub.monthly_credits_remaining + sub.purchased_credits_remaining
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    origin = "monthly" if purchased_debit == 0 else ("purchased" if monthly_debit == 0 else "mixed")
    engine_used = kwargs.get("engine_used") or (existing_ledger.engine_used if existing_ledger else None)
    source_chars_count = kwargs.get("source_chars_count") or (existing_ledger.source_chars_count if existing_ledger else None)
    project_id = kwargs.get("project_id") or (existing_ledger.project_id if existing_ledger else None)
    page_id = kwargs.get("page_id") or (existing_ledger.page_id if existing_ledger else None)

    # Calcul du coût fournisseur pour calcul de rentabilité
    cost_actual = kwargs.get("cost_provider_actual", 0.0)
    if not cost_actual and engine_used and "deepl" in engine_used.lower() and source_chars_count:
        cost_actual = source_chars_count * PROVIDER_COSTS["deepl"]["eur_per_char"]

    desc = kwargs.get("description") or f"Consommation {action_type} (-{amount} crédits, moteur: {engine_used or 'standard'})"
    if existing_ledger:
        existing_ledger.status = "completed"
        existing_ledger.origin = origin
        existing_ledger.cost_provider_actual = cost_actual
        existing_ledger.description = desc
        existing_ledger.engine_used = engine_used
        existing_ledger.source_chars_count = source_chars_count
        session.add(existing_ledger)
    else:
        session.add(
            UsageLedger(
                transaction_id=tx_str,
                user_id=user_id,
                project_id=project_id,
                page_id=page_id,
                action_type=action_type,
                amount=amount,
                engine_used=engine_used,
                source_chars_count=source_chars_count,
                cost_provider_actual=cost_actual,
                origin=origin,
                status="completed",
                correlation_id=tx_str,
                description=desc,
            )
        )

    session.commit()
    session.refresh(sub)
    return sub.credits_remaining


def release_reservation(*args, **kwargs) -> None:
    """Annule et libère la réservation en cas d'échec technique (aucun crédit débité).

    Supporte :
    1) release_reservation(reservation_id: uuid.UUID, session: Session, reason="...")
    2) release_reservation(user_id: uuid.UUID, reservation_id: uuid.UUID, amount: int, session: Session, reason="...")
    """
    if len(args) >= 2 and isinstance(args[1], Session):
        reservation_id = args[0]
        session = args[1]
        user_id = kwargs.get("user_id")
        amount = kwargs.get("amount")
    elif len(args) >= 4:
        user_id = args[0]
        reservation_id = args[1]
        amount = args[2]
        session = args[3]
    else:
        reservation_id = kwargs.get("reservation_id") or (args[0] if args else None)
        session = kwargs.get("session") or (args[1] if len(args) > 1 else None)
        user_id = kwargs.get("user_id")
        amount = kwargs.get("amount")

    reason = kwargs.get("reason", "Échec opération")
    tx_str = str(reservation_id)
    ledger = session.exec(
        select(UsageLedger).where(UsageLedger.transaction_id == tx_str)
    ).first()

    if ledger:
        user_id = user_id or ledger.user_id
        amount = amount if amount is not None else ledger.amount
        ledger.status = "failed"
        ledger.description = f"Réservation annulée : {reason}"
        session.add(ledger)

    if user_id and amount is not None:
        sub = get_or_create_subscription(session, user_id)
        sub.reserved_credits = max(0, sub.reserved_credits - amount)
        sub.updated_at = datetime.now(timezone.utc)
        session.add(sub)

    session.commit()
    logger.info("Réservation %s libérée (raison: %s)", reservation_id, reason)


def deduct_credits(
    user_id: uuid.UUID,
    amount: int,
    action_type: str,
    session: Session,
    *,
    project_id: uuid.UUID | None = None,
    page_id: uuid.UUID | None = None,
    engine_used: str | None = None,
    source_chars_count: int | None = None,
    description: str | None = None,
) -> int:
    """Débit direct atomique (combine réservation et validation immédiate).

    Utilisé pour la rétrocompatibilité parfaite avec le code existant.
    """
    res_id = reserve_credits(
        user_id,
        amount,
        action_type,
        session,
        project_id=project_id,
        page_id=page_id,
        engine_used=engine_used,
        source_chars_count=source_chars_count,
    )
    return settle_reservation(
        user_id,
        res_id,
        amount,
        action_type,
        session,
        project_id=project_id,
        page_id=page_id,
        engine_used=engine_used,
        source_chars_count=source_chars_count,
        description=description,
    )


def add_purchased_credits(
    user_id: uuid.UUID,
    amount: int,
    session: Session,
    *,
    description: str = "Achat de pack de crédits supplémentaires",
    provider: str = "manual",
    transaction_id: str | None = None,
) -> int:
    """Crédite la poche `purchased_credits_remaining` suite à un achat validé par webhook.

    Ces crédits NE SONT JAMAIS EFFACÉS lors des renouvellements d'abonnement mensuels.
    """
    if amount <= 0:
        raise ValueError("Le nombre de crédits achetés doit être supérieur à 0.")

    sub = get_or_create_subscription(session, user_id)
    sub.purchased_credits_remaining += amount
    sub.credits_remaining = sub.monthly_credits_remaining + sub.purchased_credits_remaining
    sub.credits_limit = sub.monthly_credits_limit + sub.purchased_credits_remaining
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    tx = transaction_id or str(uuid.uuid4())
    session.add(
        UsageLedger(
            transaction_id=tx,
            user_id=user_id,
            action_type="recharge",
            amount=-amount,  # Négatif car ajout au solde
            origin="purchased",
            status="completed",
            correlation_id=tx,
            description=description,
        )
    )
    session.commit()
    session.refresh(sub)
    return sub


# Rétrocompatibilité pour les imports existants
add_credits = add_purchased_credits
CREDIT_COSTS = {
    "ocr": TariffConfig.OCR_STANDARD,
    "translate": TariffConfig.TRANSLATE_OLLAMA_PER_1K_CHARS,
    "clean": TariffConfig.CLEAN_OPENCV_PER_PAGE,
}


def change_user_plan(session: Session, user_id: uuid.UUID, new_plan: str) -> Subscription:
    """Met à jour la formule d'abonnement de l'utilisateur."""
    plan_key = new_plan.lower()
    if plan_key not in SUBSCRIPTION_PLANS:
        raise ValueError(f"Plan inconnu: {new_plan}")

    plan_info = SUBSCRIPTION_PLANS[plan_key]
    quota = int(plan_info["monthly_credits"])
    now = datetime.now(timezone.utc)

    sub = get_or_create_subscription(session, user_id)
    sub.plan = plan_key
    sub.monthly_credits_remaining = quota
    sub.monthly_credits_limit = quota
    sub.credits_remaining = sub.monthly_credits_remaining + sub.purchased_credits_remaining
    sub.credits_limit = sub.monthly_credits_limit + sub.purchased_credits_remaining
    sub.current_period_end = now + timedelta(days=30)
    sub.updated_at = now

    session.add(sub)
    session.add(
        UsageLedger(
            user_id=user_id,
            action_type="plan_change",
            amount=0,
            origin="monthly",
            status="completed",
            description=f"Passage à la formule {new_plan.upper()} ({quota} crédits mensuels)",
        )
    )
    session.commit()
    session.refresh(sub)
    return sub


# Rétrocompatibilité pour les imports existants
add_credits = add_purchased_credits
CREDIT_COSTS = {
    "ocr": TariffConfig.OCR_PER_PAGE,
    "translate": TariffConfig.TRANSLATE_OLLAMA_PER_1K_CHARS,
    "clean": TariffConfig.CLEAN_OPENCV_PER_PAGE,
}
