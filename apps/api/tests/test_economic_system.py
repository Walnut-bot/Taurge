"""Tests complets du nouveau système économique, de facturation et de consommation IA de Taurge."""

import math
import uuid
import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.billing.tariffs import TariffConfig, SUBSCRIPTION_PLANS, CREDIT_PACKS
from app.billing.credit_service import (
    add_credits,
    deduct_credits,
    ensure_credits,
    get_credit_balance,
    reserve_credits,
    release_reservation,
    settle_reservation,
    renew_subscription_cycle,
)
from app.billing.deepl_quota_service import (
    check_deepl_quota_available,
    record_deepl_usage,
    get_or_create_deepl_usage,
    set_deepl_monthly_limit,
)
from app.models.subscription import Subscription, UsageLedger, GlobalApiUsage
from app.models.user import User


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Crée une base SQLite mémoire pour les tests unitaires de facturation."""
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        yield session


def test_tariffs_calculation_rules():
    """Vérifie le barème exact et les règles d'arrondi au millier supérieur."""
    # OCR
    assert TariffConfig.OCR_STANDARD == 1

    # Traduction Ollama (1 crédit / 1000 caractères source, arrondi supérieur)
    assert TariffConfig.get_translation_cost("ollama", 500) == 1
    assert TariffConfig.get_translation_cost("ollama", 1000) == 1
    assert TariffConfig.get_translation_cost("ollama", 1001) == 2
    assert TariffConfig.get_translation_cost("ollama", 1500) == 2
    assert TariffConfig.get_translation_cost("ollama", 3000) == 3

    # Traduction DeepL (4 crédits / 1000 caractères source, arrondi supérieur)
    assert TariffConfig.get_translation_cost("deepl", 500) == 4
    assert TariffConfig.get_translation_cost("deepl", 1000) == 4
    assert TariffConfig.get_translation_cost("deepl", 1001) == 8
    assert TariffConfig.get_translation_cost("deepl", 1500) == 8
    assert TariffConfig.get_translation_cost("deepl", 3000) == 12

    # Nettoyage OpenCV (1 crédit)
    assert TariffConfig.get_cleaning_cost("opencv", 1) == 1
    assert TariffConfig.get_cleaning_cost("opencv", 10) == 1

    # Nettoyage LaMa ONNX (2 crédits jusqu'à 5 zones, +1 par tranche de 5 supplémentaires)
    assert TariffConfig.get_cleaning_cost("lama", 1) == 2
    assert TariffConfig.get_cleaning_cost("lama", 5) == 2
    assert TariffConfig.get_cleaning_cost("lama_onnx", 6) == 3
    assert TariffConfig.get_cleaning_cost("lama", 10) == 3
    assert TariffConfig.get_cleaning_cost("lama", 11) == 4

    # Traitements combinés
    cost_batch_ollama = (
        TariffConfig.OCR_STANDARD
        + TariffConfig.get_translation_cost("ollama", 500)
        + TariffConfig.get_cleaning_cost("lama", 3)
    )
    assert cost_batch_ollama == 1 + 1 + 2  # = 4 crédits

    cost_batch_deepl = (
        TariffConfig.OCR_STANDARD
        + TariffConfig.get_translation_cost("deepl", 500)
        + TariffConfig.get_cleaning_cost("lama", 3)
    )
    assert cost_batch_deepl == 1 + 4 + 2  # = 7 crédits

    # Test de l'estimateur d'opération
    from app.billing.credit_service import estimate_operation_cost
    est_deepl = estimate_operation_cost("translate", source_chars=59, engine="deepl")
    assert est_deepl["total_cost"] == 4
    est_ollama = estimate_operation_cost("translate", source_chars=59, engine="ollama")
    assert est_ollama["total_cost"] == 1
    est_lama = estimate_operation_cost("clean", zones_count=4, engine="lama")
    assert est_lama["total_cost"] == 2
    est_opencv = estimate_operation_cost("clean", engine="opencv")
    assert est_opencv["total_cost"] == 1


def test_credit_priority_consumption(db_session: Session):
    """Vérifie la priorité de consommation : Mensuel d'abord, puis Acheté."""
    user = User(email="author@example.com", password_hash="pw", is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Initialisation avec 100 crédits mensuels et 50 crédits achetés
    sub = Subscription(
        user_id=user.id,
        plan_id="creator",
        monthly_credits_remaining=100,
        monthly_credits_limit=100,
        purchased_credits_remaining=50,
        reserved_credits=0,
    )
    db_session.add(sub)
    db_session.commit()

    # 1. Vérification solde initial
    balance = get_credit_balance(user.id, db_session)
    assert balance["total_available"] == 150
    assert balance["monthly_remaining"] == 100
    assert balance["purchased_remaining"] == 50

    # 2. Débit de 40 crédits : doit être prélevé entièrement sur le mensuel
    deduct_credits(user.id, 40, "ocr", db_session)
    db_session.refresh(sub)
    assert sub.monthly_credits_remaining == 60
    assert sub.purchased_credits_remaining == 50

    # 3. Débit de 80 crédits : 60 mensuels consommés, 20 achetés consommés
    deduct_credits(user.id, 80, "translate", db_session)
    db_session.refresh(sub)
    assert sub.monthly_credits_remaining == 0
    assert sub.purchased_credits_remaining == 30

    # 4. Solde restant total = 30
    balance_after = get_credit_balance(user.id, db_session)
    assert balance_after["total_available"] == 30

    # 5. Tentative de débit de 50 crédits (alors qu'il n'en reste que 30) -> doit lever 402
    with pytest.raises(HTTPException) as exc_info:
        deduct_credits(user.id, 50, "clean", db_session)
    assert exc_info.value.status_code == 402


def test_two_phase_reservation_and_rollback(db_session: Session):
    """Vérifie le cycle Réservation -> Annulation (aucun débit) ou Validation."""
    user = User(email="test_res@example.com", password_hash="pw", is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    sub = Subscription(
        user_id=user.id,
        plan_id="creator",
        monthly_credits_remaining=100,
        monthly_credits_limit=100,
        purchased_credits_remaining=0,
        reserved_credits=0,
    )
    db_session.add(sub)
    db_session.commit()

    # A. Réservation puis échec (Rollback)
    res_id = reserve_credits(user.id, 10, "ocr", db_session)
    db_session.refresh(sub)
    assert sub.reserved_credits == 10
    # Le solde disponible doit être de 90
    assert get_credit_balance(user.id, db_session)["total_available"] == 90

    # Échec de l'opération : libération
    release_reservation(res_id, db_session)
    db_session.refresh(sub)
    assert sub.reserved_credits == 0
    assert sub.monthly_credits_remaining == 100
    assert get_credit_balance(user.id, db_session)["total_available"] == 100

    # B. Réservation puis succès (Settle)
    res_id_2 = reserve_credits(user.id, 4, "translate", db_session)
    db_session.refresh(sub)
    assert sub.reserved_credits == 4

    settle_reservation(
        res_id_2,
        db_session,
        engine_used="deepl",
        source_chars_count=950,
        cost_provider_actual=0.019,
    )
    db_session.refresh(sub)
    assert sub.reserved_credits == 0
    assert sub.monthly_credits_remaining == 96

    # Vérification du ledger : traçabilité complète des deux opérations
    ledger_entries = db_session.exec(
        select(UsageLedger).where(UsageLedger.user_id == user.id)
    ).all()
    assert len(ledger_entries) == 2
    completed = [l for l in ledger_entries if l.status == "completed"]
    assert len(completed) == 1
    assert completed[0].amount == 4
    assert completed[0].engine_used == "deepl"
    assert completed[0].source_chars_count == 950


def test_subscription_renewal_preserves_purchased_credits(db_session: Session):
    """Vérifie que le renouvellement mensuel réinitialise le quota mensuel mais préserve les packs achetés."""
    user = User(email="renewal@example.com", password_hash="pw", is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    sub = Subscription(
        user_id=user.id,
        plan="creator",
        monthly_credits_remaining=15,
        monthly_credits_limit=500,
        purchased_credits_remaining=350,
        reserved_credits=0,
    )
    db_session.add(sub)
    db_session.commit()

    # Renouvellement mensuel
    renew_subscription_cycle(sub, db_session)
    db_session.refresh(sub)

    # Les 15 crédits mensuels restants sont réinitialisés au quota du plan (500)
    assert sub.monthly_credits_remaining == 500
    # Les 350 crédits de packs achetés sont strictement conservés
    assert sub.purchased_credits_remaining == 350
    assert sub.reserved_credits == 0


def test_deepl_global_quota_limiting(db_session: Session):
    """Vérifie le respect du contingent mensuel DeepL avec blocage automatique."""
    # Définition d'un contingent de 1 000 caractères pour le test
    usage = set_deepl_monthly_limit(db_session, 1000)
    assert usage.chars_limit == 1000

    # 1. Vérification que 800 caractères passent
    check_deepl_quota_available(db_session, 800)
    record_deepl_usage(db_session, 800)

    db_session.refresh(usage)
    assert usage.chars_used == 800
    assert usage.chars_remaining == 200

    # 2. Une requête de 300 caractères dépasse le contingent (reste 200) -> 503
    with pytest.raises(HTTPException) as exc_info:
        check_deepl_quota_available(db_session, 300)
    assert exc_info.value.status_code == 503
    assert "contingent mensuel" in exc_info.value.detail.lower()


def test_pack_purchase_and_audit_ledger(db_session: Session):
    """Vérifie l'achat d'un pack de crédits et sa traçabilité complète dans le registre."""
    user = User(email="pack_buyer@example.com", password_hash="pw", is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    sub = Subscription(
        user_id=user.id,
        plan="free",
        monthly_credits_remaining=100,
        monthly_credits_limit=100,
        purchased_credits_remaining=0,
        reserved_credits=0,
    )
    db_session.add(sub)
    db_session.commit()

    # Achat d'un pack Pro (1 000 crédits)
    from app.billing.credit_service import add_purchased_credits
    add_purchased_credits(user.id, 1000, db_session, description="Pack Pro 1000 crédits (FedaPay)")

    db_session.refresh(sub)
    assert sub.monthly_credits_remaining == 100
    assert sub.purchased_credits_remaining == 1000
    assert get_credit_balance(user.id, db_session)["total_available"] == 1100

    # Vérification du livre d'audit
    ledger = db_session.exec(
        select(UsageLedger).where(UsageLedger.user_id == user.id, UsageLedger.action_type == "recharge")
    ).first()
    assert ledger is not None
    assert ledger.amount == -1000  # Entrée positive de crédits (crédit pour l'utilisateur)
    assert ledger.status == "completed"


def test_engine_suspension_control():
    """Vérifie l'activation et la suspension dynamique d'un moteur par l'administrateur."""
    assert TariffConfig.is_engine_enabled("deepl") is True

    # Suspension de DeepL
    TariffConfig.set_engine_status("deepl", False)
    assert TariffConfig.is_engine_enabled("deepl") is False

    # Réactivation
    TariffConfig.set_engine_status("deepl", True)
    assert TariffConfig.is_engine_enabled("deepl") is True


def test_admin_manual_grant_with_mandatory_reason(db_session: Session):
    """Vérifie l'attribution manuelle par l'administrateur avec motif obligatoire et audit."""
    user = User(email="bonus_user@example.com", password_hash="pw", is_active=True)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    sub = Subscription(
        user_id=user.id,
        plan="creator",
        monthly_credits_remaining=50,
        monthly_credits_limit=500,
        purchased_credits_remaining=0,
    )
    db_session.add(sub)
    db_session.commit()

    # Débit ou crédit avec motif obligatoire
    from app.billing.credit_service import add_purchased_credits
    reason = "Geste commercial suite incident technique"
    add_purchased_credits(user.id, 50, db_session, description=f"Ajustement admin : {reason}")

    db_session.refresh(sub)
    assert sub.purchased_credits_remaining == 50

    ledger = db_session.exec(
        select(UsageLedger).where(UsageLedger.user_id == user.id)
    ).first()
    assert ledger is not None
    assert reason in ledger.description
