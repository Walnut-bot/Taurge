from datetime import datetime, timedelta, timezone
from io import BytesIO
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.auth.schemas import (
    DeleteAccountRequest,
    LoginRequest,
    PasswordChangeRequest,
    ProfileUpdate,
    ProjectRoleResponse,
    RegisterRequest,
    SystemStatusResponse,
    TokenResponse,
    UserResponse,
)
from app.billing.credit_service import SIGNUP_FREE_CREDITS, get_or_create_subscription
from app.core.config import settings
from app.core.db import get_session
from app.core.security import create_access_token, hash_password, verify_password
from app.models.cleaned_page import CleanedPage
from app.models.export import Export
from app.models.glossary import GlossaryEntry
from app.models.job import Job
from app.models.ocr_block import OCRBlock
from app.models.page import Page
from app.models.payment import PaymentTransaction
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.subscription import ProjectMember, Subscription, UsageLedger
from app.models.login_attempt import LoginAttempt
from app.models.collaboration import PageComment, PageVersion
from app.models.translation import Translation
from app.models.user import User
from app.storage.dependencies import storage_provider

router = APIRouter(prefix="/auth", tags=["auth"])

# Anti force-brute persistant : échecs récents par email en base
# (table login_attempts), fenêtre glissante partagée entre instances
# et conservée après redémarrage.
def _window_cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(
        minutes=settings.login_block_window_minutes
    )


def _recent_failed_logins(session: Session, email: str) -> int:
    cutoff = _window_cutoff()
    attempts = session.exec(
        select(LoginAttempt).where(
            LoginAttempt.email == email,
            LoginAttempt.attempted_at >= cutoff,
        )
    ).all()
    # Purge opportuniste des tentatives hors fenêtre.
    expired = session.exec(
        select(LoginAttempt).where(
            LoginAttempt.email == email,
            LoginAttempt.attempted_at < cutoff,
        )
    ).all()
    for attempt in expired:
        session.delete(attempt)
    if expired:
        session.commit()
    return len(attempts)


def _record_failed_login(session: Session, email: str) -> None:
    session.add(LoginAttempt(email=email))
    session.commit()


def _clear_failed_logins(session: Session, email: str) -> None:
    for attempt in session.exec(
        select(LoginAttempt).where(LoginAttempt.email == email)
    ).all():
        session.delete(attempt)
    session.commit()


MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PROFILE_IMAGE_PIXELS = 25_000_000
PROFILE_IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}


def _profile_image_key(user_id: uuid.UUID, kind: str, content_type: str) -> str:
    extension = next(
        extension
        for _, (allowed_type, extension) in PROFILE_IMAGE_FORMATS.items()
        if allowed_type == content_type
    )
    return f"profiles/{user_id}/{kind}.{extension}"


def _get_user_response(user: User, session: Session) -> UserResponse:
    sub = get_or_create_subscription(session, user.id)
    projects = session.exec(select(Project).where(Project.owner_id == user.id)).all()
    project_roles = [
        ProjectRoleResponse(
            project_id=str(project.id),
            project_name=project.name,
            role="owner",
        )
        for project in projects
    ]
    memberships = session.exec(
        select(ProjectMember).where(ProjectMember.user_id == user.id)
    ).all()
    for member in memberships:
        project = session.get(Project, member.project_id)
        if project:
            project_roles.append(
                ProjectRoleResponse(
                    project_id=str(project.id),
                    project_name=project.name,
                    role=member.role,
                )
            )

    admin_set = {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }
    is_admin = bool(getattr(user, "is_admin", False)) or (user.email.lower() in admin_set)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        avatar_content_type=user.avatar_content_type,
        banner_content_type=user.banner_content_type,
        default_content_type=user.default_content_type,
        default_source_lang=user.default_source_lang,
        default_target_lang=user.default_target_lang,
        project_roles=project_roles,
        plan=sub.plan,
        credits_remaining=sub.credits_remaining,
        credits_limit=sub.credits_limit,
        newsletter_opt_in=bool(user.newsletter_opt_in),
        is_admin=is_admin,
        created_at=user.created_at.isoformat() if getattr(user, "created_at", None) else None,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    if not payload.accepted_terms or not payload.age_confirmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Veuillez accepter les conditions d'utilisation et confirmer votre âge pour créer un compte.",
        )
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un compte existe déjà avec cet email.",
        )
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        terms_accepted_at=now,
        age_confirmed_at=now,
        newsletter_opt_in=payload.newsletter_opt_in,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Attribution de l'abonnement Découverte (10 crédits offerts)
    sub = Subscription(
        user_id=user.id,
        plan="free",
        credits_remaining=SIGNUP_FREE_CREDITS,
        credits_limit=SIGNUP_FREE_CREDITS,
    )
    session.add(sub)
    session.commit()

    return _get_user_response(user, session)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    email = payload.email.lower()
    if _recent_failed_logins(session, email) >= settings.login_max_failed_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives de connexion. Réessayez dans quelques minutes.",
        )
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        _record_failed_login(session, email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )
    _clear_failed_logins(session, email)
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return _get_user_response(current_user, session)


@router.patch("/me/profile", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    updates = payload.model_dump(exclude_unset=True)
    if any(
        value is None
        for field, value in updates.items()
        if field not in {"display_name", "newsletter_opt_in"}
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Les préférences de projet ne peuvent pas être vides.",
        )
    if (
        "default_source_lang" in updates
        and "default_target_lang" not in updates
        and updates["default_source_lang"] == current_user.default_target_lang
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les langues source et cible doivent être différentes.",
        )
    if (
        "default_target_lang" in updates
        and "default_source_lang" not in updates
        and updates["default_target_lang"] == current_user.default_source_lang
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les langues source et cible doivent être différentes.",
        )
    source_lang = updates.get("default_source_lang", current_user.default_source_lang)
    target_lang = updates.get("default_target_lang", current_user.default_target_lang)
    if source_lang == target_lang:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les langues source et cible doivent être différentes.",
        )

    for field, value in updates.items():
        if field == "display_name" and value is not None:
            value = value.strip() or None
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return _get_user_response(current_user, session)


@router.put("/me/profile/{kind}", response_model=UserResponse)
async def upload_profile_image(
    kind: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if kind not in {"avatar", "banner"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Type d’image introuvable.")
    content = await file.read(MAX_PROFILE_IMAGE_BYTES + 1)
    if len(content) > MAX_PROFILE_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="L’image doit faire 8 Mo maximum.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le fichier est vide.")

    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
        with Image.open(BytesIO(content)) as image:
            image_format = image.format
            if image.width * image.height > MAX_PROFILE_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Les dimensions de l’image sont trop grandes.",
                )
            if image_format not in PROFILE_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Formats acceptés : JPEG, PNG et WebP.",
                )
            content_type, _ = PROFILE_IMAGE_FORMATS[image_format]
            normalized = BytesIO()
            image.save(normalized, format=image_format)
            image_bytes = normalized.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier sélectionné n’est pas une image valide.",
        ) from exc

    previous_type = getattr(current_user, f"{kind}_content_type")
    storage_provider.save(
        _profile_image_key(current_user.id, kind, content_type),
        image_bytes,
    )
    setattr(current_user, f"{kind}_content_type", content_type)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    if previous_type and previous_type != content_type:
        old_key = _profile_image_key(current_user.id, kind, previous_type)
        storage_provider.delete(old_key)
    return _get_user_response(current_user, session)


@router.get("/me/profile/{kind}")
def get_profile_image(
    kind: str,
    current_user: User = Depends(get_current_user),
):
    if kind not in {"avatar", "banner"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Type d’image introuvable.")
    content_type = getattr(current_user, f"{kind}_content_type")
    if not content_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune image de profil.")
    try:
        image = storage_provider.read(_profile_image_key(current_user.id, kind, content_type))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="L’image de profil est indisponible.",
        ) from exc
    return Response(
        content=image,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Droit à l'oubli (RGPD) : supprime le compte et toutes ses données.

    Exige de retaper l'e-mail du compte. Les fichiers stockés sont
    supprimés au mieux (best effort) avant les lignes de base.
    """
    if payload.confirm_email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'e-mail de confirmation ne correspond pas à votre compte.",
        )
    user_id = current_user.id
    # Cascade unique et testée (celle de DELETE /projects/{id}) :
    # la copie locale ici avait divergé — fichiers nettoyés/exports
    # non supprimés du disque et historique crédits non détaché,
    # ce qui fait échouer la suppression sur PostgreSQL.
    # Import différé : app.projects.router importe app.auth.
    from app.projects.project_service import delete_project_cascade as _delete_project_cascade

    projects = session.exec(select(Project).where(Project.owner_id == user_id)).all()
    for project in projects:
        _delete_project_cascade(project, session, storage_provider)
        session.delete(project)
    for member in session.exec(select(ProjectMember).where(ProjectMember.user_id == user_id)).all():
        session.delete(member)
    for comment in session.exec(select(PageComment).where(PageComment.author_id == user_id)).all():
        session.delete(comment)
    for version in session.exec(select(PageVersion).where(PageVersion.created_by_id == user_id)).all():
        session.delete(version)
    for job in session.exec(select(Job).where(Job.user_id == user_id)).all():
        session.delete(job)
    for ledger in session.exec(select(UsageLedger).where(UsageLedger.user_id == user_id)).all():
        session.delete(ledger)
    for payment in session.exec(
        select(PaymentTransaction).where(PaymentTransaction.user_id == user_id)
    ).all():
        session.delete(payment)
    sub = session.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    if sub:
        session.delete(sub)
    for kind in ("avatar", "banner"):
        content_type = getattr(current_user, f"{kind}_content_type")
        if content_type:
            storage_provider.delete(_profile_image_key(user_id, kind, content_type))
    session.delete(current_user)
    session.commit()
    return None


@router.delete("/me/profile/{kind}", response_model=UserResponse)
def delete_profile_image(
    kind: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if kind not in {"avatar", "banner"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Type d’image introuvable.")
    content_type = getattr(current_user, f"{kind}_content_type")
    if content_type:
        storage_provider.delete(_profile_image_key(current_user.id, kind, content_type))
        setattr(current_user, f"{kind}_content_type", None)
        session.add(current_user)
        session.commit()
        session.refresh(current_user)
    return _get_user_response(current_user, session)


@router.post("/me/password")
def change_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Votre mot de passe actuel est incorrect.",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nouveau mot de passe doit être différent de l'actuel.",
        )
    current_user.password_hash = hash_password(payload.new_password)
    session.add(current_user)
    session.commit()
    return {"status": "ok", "message": "Votre mot de passe a été modifié avec succès."}


@router.get("/me/export-data")
def export_personal_data(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Portabilité RGPD (Art. 20) : export JSON complet des données personnelles."""
    sub = get_or_create_subscription(session, current_user.id)
    projects = session.exec(select(Project).where(Project.owner_id == current_user.id)).all()
    project_items = []
    for proj in projects:
        pages_count = len(session.exec(select(Page).where(Page.project_id == proj.id)).all())
        gloss = session.exec(select(GlossaryEntry).where(GlossaryEntry.project_id == proj.id)).all()
        project_items.append(
            {
                "id": str(proj.id),
                "name": proj.name,
                "content_type": proj.content_type,
                "source_lang": proj.source_lang,
                "target_lang": proj.target_lang,
                "pages_count": pages_count,
                "glossary": [{"source_term": g.source_term, "target_term": g.target_term} for g in gloss],
                "created_at": proj.created_at.isoformat() if getattr(proj, "created_at", None) else None,
            }
        )
    ledgers = session.exec(
        select(UsageLedger).where(UsageLedger.user_id == current_user.id)
    ).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "display_name": current_user.display_name,
            "default_content_type": current_user.default_content_type,
            "default_source_lang": current_user.default_source_lang,
            "default_target_lang": current_user.default_target_lang,
            "newsletter_opt_in": bool(current_user.newsletter_opt_in),
            "terms_accepted_at": current_user.terms_accepted_at.isoformat() if current_user.terms_accepted_at else None,
            "age_confirmed_at": current_user.age_confirmed_at.isoformat() if current_user.age_confirmed_at else None,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "subscription": {
            "plan": sub.plan,
            "credits_remaining": sub.credits_remaining,
            "credits_limit": sub.credits_limit,
        },
        "projects": project_items,
        "usage_history": [
            {
                "id": str(entry.id),
                "action_type": entry.action_type,
                "amount": entry.amount,
                "description": entry.description,
                "created_at": entry.created_at.isoformat() if getattr(entry, "created_at", None) else None,
            }
            for entry in ledgers
        ],
    }


@router.get("/me/system-status", response_model=SystemStatusResponse)
def get_system_status(
    current_user: User = Depends(get_current_user),
):
    import importlib.util
    import os
    from app.ocr.providers.tesseract_provider import find_tesseract_binary

    manga_ok = importlib.util.find_spec("manga_ocr") is not None
    paddle_ok = importlib.util.find_spec("paddleocr") is not None
    tess_bin = find_tesseract_binary()
    tess_langs: list[str] = []
    if tess_bin:
        tess_dir = os.path.join(os.path.dirname(tess_bin), "tessdata")
        for code in ("jpn", "jpn_vert", "kor", "chi_sim", "chi_tra", "eng", "fra", "spa", "por", "deu"):
            if os.path.isfile(os.path.join(tess_dir, f"{code}.traineddata")):
                tess_langs.append(code)
    return SystemStatusResponse(
        manga_ocr_installed=manga_ok,
        paddle_ocr_installed=paddle_ok,
        tesseract_installed=tess_bin is not None,
        tesseract_langs=tess_langs,
        ollama_configured=bool(settings.ollama_base_url),
        ollama_model=settings.ollama_model,
        deepl_configured=bool(settings.deepl_api_key),
    )
