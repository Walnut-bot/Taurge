from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    # Consentements explicites, non pré-cochés côté client.
    accepted_terms: bool = False
    age_confirmed: bool = False
    newsletter_opt_in: bool = False


class DeleteAccountRequest(BaseModel):
    confirm_email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProjectRoleResponse(BaseModel):
    project_id: str
    project_name: str
    role: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    avatar_content_type: str | None = None
    banner_content_type: str | None = None
    default_content_type: str = "manga"
    default_source_lang: str = "ja"
    default_target_lang: str = "fr"
    project_roles: list[ProjectRoleResponse] = Field(default_factory=list)
    plan: str = "free"
    credits_remaining: int = 30
    credits_limit: int = 30
    newsletter_opt_in: bool = False


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    default_content_type: Literal["manga", "manhwa", "manhua", "webtoon", "comic", "autre"] | None = None
    default_source_lang: Literal["ja", "ko", "zh", "en", "es", "pt", "fr", "de"] | None = None
    default_target_lang: Literal["ja", "ko", "zh", "en", "es", "pt", "fr", "de"] | None = None