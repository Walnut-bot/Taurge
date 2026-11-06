from io import BytesIO
import threading
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from sqlmodel import Session, select

from app.auth.dependencies import get_current_user
from app.auth.schemas import (
    DeleteAccountRequest,
    LoginRequest,
    ProfileUpdate,
    ProjectRoleResponse,
    RegisterRequest,
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
from app.models.translation import Translation
from app.models.user import User
from app.storage.dependencies import storage_provider

router = APIRouter(prefix="/auth", tags=["auth"])

# Anti force-brute : échecs récents par email (en mémoire, l'API tourne
# en une seule instance — même hypothèse que fail_orphaned_jobs).
_failed_logins: dict[str, list[float]] = {}
_failed_logins_lock = threading.Lock()


def _recent_failed_logins(email: str) -> list[float]:
    cutoff = time.monotonic() - settings.login_block_window_minutes * 60
    with _failed_logins_lock:
        recent = [t for t in _failed_logins.get(email, []) if t > cutoff]
        _failed_logins[email] = recent
        return recent


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
    if len(_recent_failed_logins(email)) >= settings.login_max_failed_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives de connexion. Réessayez dans quelques minutes.",
        )
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        with _failed_logins_lock:
            _failed_logins.setdefault(email, []).append(time.monotonic())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )
    with _failed_logins_lock:
        _failed_logins.pop(email, None)
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
        if field != "display_name"
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
    from app.projects.router import _delete_project_cascade

    projects = session.exec(select(Project).where(Project.owner_id == user_id)).all()
    for project in projects:
        _delete_project_cascade(project, session, storage_provider)
        session.delete(project)
    for member in session.exec(select(ProjectMember).where(ProjectMember.user_id == user_id)).all():
        session.delete(member)
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
