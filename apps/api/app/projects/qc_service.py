"""Module AI Quality Control (AI QC) & Mémoire de Traduction (Translation Memory).

Implémente les sections 12 et 20 du cahier des charges :
- Audit automatique des pages/projets (ERROR, WARNING, SUGGESTION) :
  - Texte non traduit ou manquant
  - Violation des termes verrouillés du glossaire
  - Risque de dépassement de bulle (ratio longueur / surface de la bbox)
  - Confiance OCR douteuse (< 70%)
  - SFX non stylisé
  - Typographie française (espaces doubles, guillemets)
- Recherche dans la Mémoire de Traduction (segments déjà traduits et validés
  dans le projet ou les projets de l'utilisateur avec score de similarité).
"""

from __future__ import annotations

import difflib
import re
import uuid
from sqlmodel import Session, select

from app.models.glossary import GlossaryEntry
from app.models.ocr_block import OCRBlock
from app.models.page import Page, page_display_order
from app.models.project import Project
from app.models.subscription import ProjectMember
from app.models.translation import Translation
from app.models.user import User
from app.projects.access import get_owned_page, get_owned_project
from app.projects.schemas import (
    QCIssueResponse,
    QCReportResponse,
    TranslationMemoryMatchResponse,
)


def _audit_page_blocks(
    project: Project,
    page: Page,
    blocks: list[OCRBlock],
    translations_by_block: dict[uuid.UUID, Translation],
    glossary_entries: list[GlossaryEntry],
) -> list[QCIssueResponse]:
    issues: list[QCIssueResponse] = []
    locked_glossary = [g for g in glossary_entries if g.is_locked and g.source_term.strip()]

    for block in blocks:
        source_text = (block.text or "").strip()
        trans = translations_by_block.get(block.id)
        translated_text = (trans.translated_text if trans else "").strip()

        # 1. ERROR : Bloc non traduit
        if not translated_text:
            issues.append(
                QCIssueResponse(
                    severity="error",
                    code="untranslated_block",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message=f"Bulle non traduite : « {source_text[:60]} »",
                    suggestion="Lancez la traduction IA ou saisissez une traduction manuellement.",
                )
            )
            continue

        # 2. ERROR : Traduction identique au texte source (hors onomatopée courte / ponctuation)
        if (
            project.source_lang != project.target_lang
            and len(source_text) > 3
            and translated_text.lower() == source_text.lower()
            and block.bubble_type != "SFX"
        ):
            issues.append(
                QCIssueResponse(
                    severity="error",
                    code="untranslated_text",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message=f"Le texte semble non traduit (identique à l'original) : « {source_text[:50]} »",
                    suggestion="Vérifiez et traduisez ce segment dans la langue cible.",
                )
            )

        # 3. ERROR : Incohérence avec un terme verrouillé du glossaire
        for g in locked_glossary:
            if g.source_term.lower() in source_text.lower():
                if g.target_term.lower() not in translated_text.lower():
                    issues.append(
                        QCIssueResponse(
                            severity="error",
                            code="glossary_mismatch",
                            page_id=str(page.id),
                            page_number=page.page_number,
                            ocr_block_id=str(block.id),
                            message=(
                                f"Terme verrouillé du glossaire non respecté : "
                                f"« {g.source_term} » doit être traduit par « {g.target_term} »."
                            ),
                            suggestion=f"Utilisez « {g.target_term} » dans la traduction.",
                        )
                    )

        # 4. WARNING : Risque de dépassement de la bulle
        area = max(1, block.bbox_w * block.bbox_h)
        scale = max(0.5, float(getattr(block, "font_size_scale", 1.0) or 1.0))
        # Estimation : ~140 pixels carrés par caractère à échelle 1.0
        comfortable_max_chars = max(8, int(area / (140.0 * scale * scale)))
        if len(translated_text) > comfortable_max_chars and len(translated_text) > 15:
            issues.append(
                QCIssueResponse(
                    severity="warning",
                    code="bubble_overflow_risk",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message=(
                        f"Le texte traduit ({len(translated_text)} car.) risque de dépasser "
                        f"de la bulle ({block.bbox_w}×{block.bbox_h}px)."
                    ),
                    suggestion="Raccourcissez la formulation, réduisez l'échelle de police ou agrandissez le cadre.",
                )
            )

        # 5. WARNING : Confiance OCR faible
        if block.confidence < 0.70:
            issues.append(
                QCIssueResponse(
                    severity="warning",
                    code="low_ocr_confidence",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message=f"Confiance OCR faible ({int(block.confidence * 100)}%) sur « {source_text[:45]} ».",
                    suggestion="Vérifiez le texte source sur l'image originale (maintenez C).",
                )
            )

        # 6. SUGGESTION : SFX non stylisé
        if block.bubble_type == "SFX" and getattr(block, "manhwa_style", "dialogue") == "dialogue":
            issues.append(
                QCIssueResponse(
                    severity="suggestion",
                    code="sfx_unstyled",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message="Ce bloc est marqué comme SFX (onomatopée) mais utilise le style Dialogue standard.",
                    suggestion="Appliquez le style « SFX » ou « Cri » dans l'inspecteur typographique.",
                )
            )

        # 7. SUGGESTION : Typographie française (espaces doubles)
        if project.target_lang == "fr" and "  " in translated_text:
            cleaned_suggestion = re.sub(r"\s{2,}", " ", translated_text)
            issues.append(
                QCIssueResponse(
                    severity="suggestion",
                    code="french_typography",
                    page_id=str(page.id),
                    page_number=page.page_number,
                    ocr_block_id=str(block.id),
                    message="Espaces multiples détectés dans la traduction française.",
                    suggestion=cleaned_suggestion,
                )
            )

    return issues


def run_page_qc(
    project_id: uuid.UUID,
    page_id: uuid.UUID,
    current_user: User,
    session: Session,
) -> QCReportResponse:
    project = get_owned_project(session, project_id, current_user.id)
    page = get_owned_page(session, project_id, page_id, current_user.id)

    blocks = session.exec(select(OCRBlock).where(OCRBlock.page_id == page.id)).all()
    block_ids = [b.id for b in blocks]
    translations_by_block: dict[uuid.UUID, Translation] = {}
    if block_ids:
        translations = session.exec(
            select(Translation).where(Translation.ocr_block_id.in_(block_ids))
        ).all()
        translations_by_block = {t.ocr_block_id: t for t in translations}

    glossary_entries = session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all()

    issues = _audit_page_blocks(
        project, page, blocks, translations_by_block, glossary_entries
    )
    return _build_qc_report(project.id, issues)


def run_project_qc(
    project_id: uuid.UUID,
    current_user: User,
    session: Session,
) -> QCReportResponse:
    project = get_owned_project(session, project_id, current_user.id)
    pages = session.exec(
        select(Page).where(Page.project_id == project.id).order_by(*page_display_order())
    ).all()
    page_ids = [p.id for p in pages]
    if not page_ids:
        return _build_qc_report(project.id, [])

    blocks = session.exec(select(OCRBlock).where(OCRBlock.page_id.in_(page_ids))).all()
    blocks_by_page: dict[uuid.UUID, list[OCRBlock]] = {}
    for b in blocks:
        blocks_by_page.setdefault(b.page_id, []).append(b)

    block_ids = [b.id for b in blocks]
    translations_by_block: dict[uuid.UUID, Translation] = {}
    if block_ids:
        translations = session.exec(
            select(Translation).where(Translation.ocr_block_id.in_(block_ids))
        ).all()
        translations_by_block = {t.ocr_block_id: t for t in translations}

    glossary_entries = session.exec(
        select(GlossaryEntry).where(GlossaryEntry.project_id == project.id)
    ).all()

    all_issues: list[QCIssueResponse] = []
    for page in pages:
        all_issues.extend(
            _audit_page_blocks(
                project,
                page,
                blocks_by_page.get(page.id, []),
                translations_by_block,
                glossary_entries,
            )
        )
    return _build_qc_report(project.id, all_issues)


def _build_qc_report(
    project_id: uuid.UUID, issues: list[QCIssueResponse]
) -> QCReportResponse:
    return QCReportResponse(
        project_id=str(project_id),
        error_count=sum(1 for i in issues if i.severity == "error"),
        warning_count=sum(1 for i in issues if i.severity == "warning"),
        suggestion_count=sum(1 for i in issues if i.severity == "suggestion"),
        issues=issues,
    )


def search_translation_memory(
    project_id: uuid.UUID,
    query_text: str,
    current_user: User,
    session: Session,
    limit: int = 5,
    min_similarity: float = 0.55,
) -> list[TranslationMemoryMatchResponse]:
    """Recherche dans la Mémoire de Traduction (segments déjà traduits
    dans les projets accessibles à l'utilisateur avec les mêmes langues
    source et cible)."""
    project = get_owned_project(session, project_id, current_user.id)
    cleaned_query = (query_text or "").strip()
    if not cleaned_query:
        return []

    # Projets accessibles ayant le même couple source_lang -> target_lang
    owned_projects = session.exec(
        select(Project).where(
            Project.owner_id == current_user.id,
            Project.source_lang == project.source_lang,
            Project.target_lang == project.target_lang,
        )
    ).all()
    member_ids = [
        m.project_id
        for m in session.exec(
            select(ProjectMember).where(ProjectMember.user_id == current_user.id)
        ).all()
    ]
    shared_projects = (
        session.exec(
            select(Project).where(
                Project.id.in_(member_ids),
                Project.source_lang == project.source_lang,
                Project.target_lang == project.target_lang,
            )
        ).all()
        if member_ids
        else []
    )
    projects_by_id = {p.id: p for p in (owned_projects + shared_projects)}
    if not projects_by_id:
        return []

    pages = session.exec(
        select(Page).where(Page.project_id.in_(list(projects_by_id.keys())))
    ).all()
    if not pages:
        return []

    page_to_project = {p.id: projects_by_id[p.project_id] for p in pages if p.project_id in projects_by_id}
    blocks = session.exec(
        select(OCRBlock).where(OCRBlock.page_id.in_(list(page_to_project.keys())))
    ).all()
    if not blocks:
        return []

    block_by_id = {b.id: b for b in blocks}
    translations = session.exec(
        select(Translation).where(Translation.ocr_block_id.in_(list(block_by_id.keys())))
    ).all()

    seen_pairs: set[tuple[str, str]] = set()
    matches: list[TranslationMemoryMatchResponse] = []
    q_norm = cleaned_query.lower()

    for trans in translations:
        if not trans.translated_text or not trans.translated_text.strip():
            continue
        block = block_by_id.get(trans.ocr_block_id)
        if not block or not block.text or not block.text.strip():
            continue
        src = block.text.strip()
        tgt = trans.translated_text.strip()
        pair_key = (src.lower(), tgt.lower())
        if pair_key in seen_pairs:
            continue

        ratio = difflib.SequenceMatcher(None, q_norm, src.lower()).ratio()
        if q_norm in src.lower() or src.lower() in q_norm:
            ratio = max(ratio, 0.75)

        if ratio >= min_similarity:
            seen_pairs.add(pair_key)
            proj = page_to_project[block.page_id]
            matches.append(
                TranslationMemoryMatchResponse(
                    source_text=src,
                    translated_text=tgt,
                    similarity=round(ratio, 3),
                    edited_by_user=bool(trans.edited_by_user),
                    project_id=str(proj.id),
                    project_name=proj.name,
                )
            )

    # Priorité aux traductions validées manuellement et à la similarité la plus forte
    matches.sort(
        key=lambda m: (m.similarity >= 0.99, m.edited_by_user, m.similarity),
        reverse=True,
    )
    return matches[: max(1, min(limit, 20))]
