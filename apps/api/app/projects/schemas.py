from datetime import datetime
from typing import Any
from pydantic import BaseModel, model_validator


class ProjectCreate(BaseModel):
    name: str
    source_lang: str
    target_lang: str
    content_type: str


class ProjectUpdate(BaseModel):
    name: str


class SourceFileResponse(BaseModel):
    id: str
    original_filename: str
    file_type: str
    size_bytes: int
    created_at: datetime


class TranslationResponse(BaseModel):
    id: str
    translated_text: str
    provider: str
    edited_by_user: bool


class OCRBlockResponse(BaseModel):
    id: str
    text: str
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    confidence: float
    provider: str
    bubble_type: str = "B"
    manhwa_style: str = "dialogue"
    rotation_angle: int = 0
    font_size_scale: float = 1.0
    text_color: str = "#0d0d0d"
    stroke_color: str = "#ffffff"
    stroke_width: int = 2
    translation: TranslationResponse | None = None

    @model_validator(mode="before")
    @classmethod
    def _coalesce_null_styles(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        defaults = {
            "bubble_type": "B",
            "manhwa_style": "dialogue",
            "rotation_angle": 0,
            "font_size_scale": 1.0,
            "text_color": "#0d0d0d",
            "stroke_color": "#ffffff",
            "stroke_width": 2,
        }
        cleaned = dict(data)
        for key, default_val in defaults.items():
            if cleaned.get(key) is None:
                cleaned[key] = default_val
        return cleaned


class PageResponse(BaseModel):
    id: str
    source_file_id: str
    page_number: int
    width: int | None
    height: int | None
    created_at: datetime
    ocr_blocks: list[OCRBlockResponse] = []
    cleaned_at: datetime | None = None
    # Champ additif (compatible frontend actuel qui l'ignore) :
    # URL de la miniature, servie par GET /pages/{id}/thumbnail.
    thumbnail_url: str | None = None
    watermark: str | None = None
    workflow_status: str | None = None


class WatermarkPayload(BaseModel):
    watermark: str | None = None  # JSON string or None to remove
    scope: str = "single"  # "single" or "all"
    page_id: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    source_lang: str
    target_lang: str
    content_type: str
    created_at: datetime


class ExportResponse(BaseModel):
    id: str
    format: str
    created_at: datetime


class ProjectDetailResponse(ProjectResponse):
    files: list[SourceFileResponse] = []
    pages: list[PageResponse] = []
    exports: list[ExportResponse] = []


class BatchProcessResponse(BaseModel):
    processed_pages: int
    ocr_blocks_count: int
    translations_count: int
    cleaned_pages_count: int


class QCIssueResponse(BaseModel):
    severity: str  # "error" | "warning" | "suggestion"
    code: str
    page_id: str
    page_number: int
    ocr_block_id: str | None = None
    message: str
    suggestion: str | None = None


class QCReportResponse(BaseModel):
    project_id: str
    error_count: int
    warning_count: int
    suggestion_count: int
    issues: list[QCIssueResponse] = []


class TranslationMemoryMatchResponse(BaseModel):
    source_text: str
    translated_text: str
    similarity: float
    edited_by_user: bool
    project_id: str
    project_name: str


