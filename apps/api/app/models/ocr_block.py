import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class OCRBlock(SQLModel, table=True):
    __tablename__ = "ocr_blocks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    page_id: uuid.UUID = Field(foreign_key="pages.id", index=True)
    text: str
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    confidence: float
    provider: str
    bubble_type: str = Field(default="B")

    # Propriétés typographiques Manhwa (compatibles SQLite grâce à nullable=True)
    manhwa_style: str = Field(default="dialogue", nullable=True)
    rotation_angle: int = Field(default=0, nullable=True)
    font_size_scale: float = Field(default=1.0, nullable=True)
    text_color: str = Field(default="#0d0d0d", nullable=True)
    stroke_color: str = Field(default="#ffffff", nullable=True)
    stroke_width: int = Field(default=2, nullable=True)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )