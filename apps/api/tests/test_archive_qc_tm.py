"""Tests unitaires et d'intégration pour :
1. Import & extraction sécurisée d'archives ZIP et CBZ (tri naturel + anti-path-traversal)
2. AI Quality Control (AI QC) par page et par projet
3. Recherche dans la Mémoire de Traduction (Translation Memory)
4. Export ZIP incluant le manifeste portable metadata.json
"""

import io
import json
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session

from app.core.db import engine
from app.main import app
from app.models.glossary import GlossaryEntry
from app.models.ocr_block import OCRBlock
from app.models.translation import Translation


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client: TestClient, label: str) -> dict:
    email = f"{label}-{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    created = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "accepted_terms": True,
            "age_confirmed": True,
            "newsletter_opt_in": False,
        },
    )
    assert created.status_code == 201, created.text
    token = client.post("/auth/login", json={"email": email, "password": password})
    assert token.status_code == 200, token.text
    headers = {"Authorization": f"Bearer {token.json()['access_token']}"}
    me = client.get("/auth/me", headers=headers)
    return {"id": me.json()["id"], "email": email, "headers": headers}


def _create_project(client: TestClient, headers: dict, name: str = "Test Archive & QC") -> str:
    resp = client.post(
        "/projects",
        headers=headers,
        json={
            "name": name,
            "source_lang": "ja",
            "target_lang": "fr",
            "content_type": "manga",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _png_bytes(width: int = 80, height: int = 120, color=(20, 100, 180)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _build_cbz_archive() -> bytes:
    """Crée une archive CBZ avec page_2.png et page_10.png + un fichier XML ignoré."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("page_10.png", _png_bytes(100, 150))
        zf.writestr("page_2.png", _png_bytes(60, 90))
        zf.writestr("ComicInfo.xml", b"<ComicInfo><Title>Test</Title></ComicInfo>")
    return buf.getvalue()


def test_upload_and_extract_cbz_and_zip_archives(client: TestClient):
    owner = _register_and_login(client, "cbz-owner")
    project_id = _create_project(client, owner["headers"])

    # 1. Upload et extraction synchrone d'un fichier .cbz
    cbz_data = _build_cbz_archive()
    upload = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("chapter_01.cbz", cbz_data, "application/vnd.comicbook+zip")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["file_type"] == "cbz"

    extracted = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract",
        headers=owner["headers"],
    )
    assert extracted.status_code == 201, extracted.text
    pages = extracted.json()
    assert len(pages) == 2
    # Vérifie le tri naturel : page_2.png (60x90) avant page_10.png (100x150)
    assert pages[0]["width"] == 60 and pages[0]["height"] == 90
    assert pages[1]["width"] == 100 and pages[1]["height"] == 150

    # 2. Upload et extraction via Job d'arrière-plan d'un fichier .zip
    project_id_2 = _create_project(client, owner["headers"], "Projet ZIP Job")
    upload_zip = client.post(
        f"/projects/{project_id_2}/upload",
        headers=owner["headers"],
        files={"file": ("pages.zip", cbz_data, "application/zip")},
    )
    assert upload_zip.status_code == 201, upload_zip.text
    assert upload_zip.json()["file_type"] == "zip"

    started = client.post(
        f"/jobs/projects/{project_id_2}/files/{upload_zip.json()['id']}/start-extraction",
        headers=owner["headers"],
    )
    assert started.status_code == 202, started.text
    import time
    job_id = started.json()["job_id"]
    for _ in range(30):
        job = client.get(f"/jobs/{job_id}", headers=owner["headers"])
        assert job.status_code == 200
        if job.json()["status"] not in ("pending", "running"):
            break
        time.sleep(0.1)
    assert job.json()["status"] == "completed", job.json()


def test_malicious_path_traversal_archive_is_rejected(client: TestClient):
    owner = _register_and_login(client, "malicious-zip")
    project_id = _create_project(client, owner["headers"])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("../../evil.png", _png_bytes())

    upload = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("traversal.zip", buf.getvalue(), "application/zip")},
    )
    assert upload.status_code == 201
    extract_resp = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract",
        headers=owner["headers"],
    )
    assert extract_resp.status_code == 400
    assert "chemin interdit" in extract_resp.text.lower()


def test_ai_qc_and_translation_memory_and_portable_zip_export(client: TestClient):
    owner = _register_and_login(client, "qc-tm-owner")
    project_id = _create_project(client, owner["headers"], "Solo Leveling FR")

    # Upload 1 page PNG
    upload = client.post(
        f"/projects/{project_id}/upload",
        headers=owner["headers"],
        files={"file": ("page1.png", _png_bytes(400, 600), "image/png")},
    )
    assert upload.status_code == 201
    extracted = client.post(
        f"/projects/{project_id}/files/{upload.json()['id']}/extract",
        headers=owner["headers"],
    )
    assert extracted.status_code == 201
    page_id = uuid.UUID(extracted.json()[0]["id"])

    # Ajout d'un terme verrouillé au glossaire + 3 blocs OCR avec divers cas QC
    with Session(engine) as session:
        session.add(
            GlossaryEntry(
                project_id=uuid.UUID(project_id),
                category="character",
                source_term="Shadow Monarch",
                target_term="Monarque des Ombres",
                is_locked=True,
            )
        )
        # Bloc 1 : traduit mais viole le glossaire verrouillé + faible confiance OCR
        b1 = OCRBlock(
            page_id=page_id,
            text="I am the Shadow Monarch!",
            bbox_x=20,
            bbox_y=20,
            bbox_w=120,
            bbox_h=60,
            confidence=0.55,
            provider="tesseract",
            bubble_type="B",
        )
        # Bloc 2 : non traduit
        b2 = OCRBlock(
            page_id=page_id,
            text="起きろ",
            bbox_x=40,
            bbox_y=120,
            bbox_w=80,
            bbox_h=50,
            confidence=0.95,
            provider="manga-ocr",
            bubble_type="B",
        )
        # Bloc 3 : SFX avec style dialogue standard + traduction validée
        b3 = OCRBlock(
            page_id=page_id,
            text="ドゴォン",
            bbox_x=50,
            bbox_y=220,
            bbox_w=100,
            bbox_h=50,
            confidence=0.92,
            provider="manga-ocr",
            bubble_type="SFX",
            manhwa_style="dialogue",
        )
        session.add_all([b1, b2, b3])
        session.commit()
        session.refresh(b1)
        session.refresh(b3)

        session.add(
            Translation(
                ocr_block_id=b1.id,
                translated_text="Je suis le Roi de l'Ombre !",
                provider="ollama",
                edited_by_user=True,
            )
        )
        session.add(
            Translation(
                ocr_block_id=b3.id,
                translated_text="BOUM !",
                provider="ollama",
                edited_by_user=True,
            )
        )
        session.commit()

    # 1. Test AI QC sur la page
    qc_resp = client.get(
        f"/projects/{project_id}/pages/{page_id}/qc",
        headers=owner["headers"],
    )
    assert qc_resp.status_code == 200, qc_resp.text
    qc_data = qc_resp.json()
    codes = {issue["code"] for issue in qc_data["issues"]}
    assert "untranslated_block" in codes
    assert "glossary_mismatch" in codes
    assert "low_ocr_confidence" in codes
    assert "sfx_unstyled" in codes
    assert qc_data["error_count"] >= 2

    # 2. Test Translation Memory
    tm_resp = client.get(
        f"/projects/{project_id}/translation-memory",
        params={"q": "Shadow Monarch"},
        headers=owner["headers"],
    )
    assert tm_resp.status_code == 200, tm_resp.text
    matches = tm_resp.json()
    assert len(matches) >= 1
    assert matches[0]["translated_text"] == "Je suis le Roi de l'Ombre !"

    # 3. Test Export ZIP avec metadata.json
    export_resp = client.post(
        f"/projects/{project_id}/export?format=zip",
        headers=owner["headers"],
    )
    assert export_resp.status_code == 201, export_resp.text
    export_id = export_resp.json()["id"]

    dl_resp = client.get(f"/exports/{export_id}/download", headers=owner["headers"])
    assert dl_resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl_resp.content), "r") as zf:
        names = set(zf.namelist())
        assert "page_001.png" in names
        assert "metadata.json" in names
        manifest = json.loads(zf.read("metadata.json").decode("utf-8"))
        assert manifest["project"]["name"] == "Solo Leveling FR"
        assert len(manifest["glossary"]) == 1
        assert len(manifest["pages"]) == 1
        assert len(manifest["pages"][0]["blocks"]) == 3


def test_oval_bubble_cleaning_preserves_border_and_exterior_corners():
    """Vérifie que l'inpainting d'une bulle ovale posée sur un décor
    quadrillé (ex: porte en bois / grille manhwa) efface complètement le
    texte interne sans jamais effacer le liseré noir ni les coins du décor.
    """
    import cv2
    import numpy as np
    from app.projects.cleaning import clean_image

    # Fond décor marron avec grille sombre (simulant les boiseries autour de la bulle)
    h, w = 360, 420
    canvas = np.full((h, w, 3), (75, 130, 185), dtype=np.uint8)  # BGR marron/ocre
    for gx in range(0, w, 18):
        cv2.line(canvas, (gx, 0), (gx, h), (35, 65, 100), 2)
    for gy in range(0, h, 18):
        cv2.line(canvas, (0, gy), (w, gy), (35, 65, 100), 2)

    # Bulle ovale blanche avec liseré noir de 3 px
    center = (210, 180)
    axes = (130, 95)
    cv2.ellipse(canvas, center, axes, 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(canvas, center, axes, 0, 0, 360, (10, 10, 10), 3)

    # Sauvegarde d'une copie sans texte pour comparer le contour et l'extérieur
    expected_clean = canvas.copy()

    # Texte noir au centre de la bulle
    cv2.putText(canvas, "IT'S ALRIGHT", (125, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (15, 15, 15), 2)
    cv2.putText(canvas, "IT'S GOOD.", (140, 205), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (15, 15, 15), 2)

    ok, encoded = cv2.imencode(".png", canvas)
    assert ok
    # Même si la boîte OCR englobe tout le rectangle de la bulle ovale
    # (y compris le contour noir courbé et les 4 coins de décor marron),
    # seuls les glyphes internes doivent être effacés.
    cleaned_bytes = clean_image(encoded.tobytes(), [(80, 85, 260, 190)])
    cleaned = cv2.imdecode(np.frombuffer(cleaned_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert cleaned is not None

    # 1. Le texte au cœur de la bulle doit être intégralement effacé (blanc > 235)
    text_zone = cleaned[148:212, 122:295]
    assert float(text_zone.min()) > 235, f"Il reste des traces de texte: min={text_zone.min()}"

    # 2. Les coins extérieurs (dans le rectangle englobant de la bulle mais hors de l'ovale)
    # doivent rester strictement identiques au décor d'origine.
    corner_patch_orig = expected_clean[235:270, 85:120]
    corner_patch_clean = cleaned[235:270, 85:120]
    assert np.array_equal(corner_patch_orig, corner_patch_clean), (
        "Le décor dans les coins autour de la bulle ovale a été altéré par l'inpainting !"
    )

    # 3. Test d'un cartouche à gros lettrage très épais (type « NOAH SIMYANG »)
    # qui laissait auparavant des taches noires au centre des jambages épais.
    box_canvas = np.full((320, 520, 3), (80, 110, 150), dtype=np.uint8)
    # Cartouche rectangulaire bicolore (bande claire en haut + blanc pur en bas) avec cadre noir
    box_canvas[30:110, 40:480] = (242, 243, 248)
    box_canvas[110:280, 40:480] = (255, 255, 255)
    cv2.rectangle(box_canvas, (40, 30), (480, 280), (10, 10, 10), 3)
    cv2.putText(box_canvas, "CHAIRMAN", (145, 95), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (12, 12, 12), 3)
    cv2.putText(box_canvas, "NOAH", (110, 225), cv2.FONT_HERSHEY_SIMPLEX, 2.6, (10, 10, 10), 16)

    ok2, enc2 = cv2.imencode(".png", box_canvas)
    assert ok2
    cleaned_box_bytes = clean_image(enc2.tobytes(), [(60, 50, 400, 210)])
    cleaned_box = cv2.imdecode(np.frombuffer(cleaned_box_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert cleaned_box is not None
    # Aucune tache noire ne doit subsister à l'intérieur du cartouche
    interior = cleaned_box[45:265, 55:465]
    assert int(interior.min()) >= 235, f"Une tache noire subsiste dans le cartouche: min={interior.min()}"


def test_multiline_wide_bubble_with_letter_counters_merges_into_single_block():
    """Vérifie qu'une grande bulle Webtoon (85 % de la largeur de page)
    contenant 3 lignes empilées (« AND IT / WAS QUITE / TOUGH. ») et de
    grandes lettres à boucles internes (Q, O > 70x40 px) est fusionnée en
    UN SEUL bloc OCR et jamais découpée en 3.
    """
    import cv2
    import numpy as np
    from app.ocr.bubble_grouping import detect_bubble_regions, refine_blocks
    from app.ocr.provider import OCRBlockData

    h, w = 2800, 1240
    page = np.full((h, w, 3), 30, dtype=np.uint8)
    # Grande bulle circulaire/ovale couvrant ~85 % de la largeur (x=92..1146, y=98..1082)
    cv2.ellipse(page, (619, 590), (527, 492), 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(page, (619, 590), (527, 492), 0, 0, 360, (10, 10, 10), 4)
    # Simuler un trou blanc interne de 83x67 px dans la lettre Q de « WAS QUITE »
    cv2.rectangle(page, (595, 555), (695, 640), (10, 10, 10), -1)
    cv2.rectangle(page, (605, 564), (688, 631), (255, 255, 255), -1)

    bubbles = detect_bubble_regions(page)
    blocks = [
        OCRBlockData(text="AND IT", bbox_x=398, bbox_y=395, bbox_w=424, bbox_h=114, confidence=0.84, provider="paddleocr"),
        OCRBlockData(text="WAS QUITE", bbox_x=240, bbox_y=539, bbox_w=741, bbox_h=114, confidence=0.93, provider="paddleocr"),
        OCRBlockData(text="TOUGH.", bbox_x=373, bbox_y=686, bbox_w=501, bbox_h=116, confidence=0.96, provider="paddleocr"),
    ]
    refined = refine_blocks(blocks, bubbles=bubbles, source_lang="en", image_size=(w, h), image=page)
    assert len(refined) == 1, f"Attendu 1 seul bloc fusionné, obtenu {len(refined)}: {refined}"
    assert refined[0].text == "AND IT WAS QUITE TOUGH."


def test_japanese_vertical_boxes_and_bubbles_ignore_background_textures():
    """Vérifie que sur une page de manga japonais comportant des rideaux/draps
    texturés ainsi qu'un cadre rectangulaire (`carré`) et une bulle ovale (`bulle`),
    seuls le cadre et la bulle contenant du texte sont détectés, que le bruit hors
    bulle non japonais est rejeté et que l'ordre de lecture droite->gauche est respecté.
    """
    import cv2
    import numpy as np
    from app.ocr.bubble_grouping import detect_bubble_regions, refine_blocks
    from app.ocr.provider import OCRBlockData

    h, w = 1200, 900
    page = np.full((h, w, 3), 215, dtype=np.uint8)
    # Simuler un rideau clair rayé sans texte en haut à gauche (ne doit JAMAIS être pris pour une bulle)
    for x_line in range(80, 380, 14):
        cv2.line(page, (x_line, 40), (x_line, 420), (185, 185, 185), 2)

    # 1. Cadre rectangulaire de narration à droite (x=620..780, y=500..820)
    cv2.rectangle(page, (620, 500), (780, 820), (255, 255, 255), -1)
    cv2.rectangle(page, (620, 500), (780, 820), (15, 15, 15), 3)
    # Simuler de l'encre noire de glyphes verticaux à l'intérieur du cadre
    for y_glyph in range(540, 770, 34):
        cv2.rectangle(page, (685, y_glyph), (712, y_glyph + 24), (15, 15, 15), -1)

    # 2. Bulle ovale à gauche sur la même bande (x=140..300, y=520..800)
    cv2.ellipse(page, (220, 660), (80, 140), 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(page, (220, 660), (80, 140), 0, 0, 360, (15, 15, 15), 3)
    for y_glyph in range(580, 730, 34):
        cv2.rectangle(page, (206, y_glyph), (234, y_glyph + 24), (15, 15, 15), -1)

    bubbles = detect_bubble_regions(page)
    # Le rideau rayé ne doit pas être détecté ; seuls le cadre et la bulle doivent l'être
    assert len(bubbles) == 2

    raw_blocks = [
        # Faux positifs sur le rideau et le drap (sans caractères japonais ou hors bulle sur décor)
        OCRBlockData(text="Ji p*", bbox_x=200, bbox_y=150, bbox_w=60, bbox_h=30, confidence=0.72, provider="tesseract"),
        OCRBlockData(text="1u", bbox_x=310, bbox_y=360, bbox_w=40, bbox_h=25, confidence=0.71, provider="tesseract"),
        OCRBlockData(text="間 1", bbox_x=260, bbox_y=340, bbox_w=45, bbox_h=28, confidence=0.61, provider="tesseract"),
        # Vrai texte dans la bulle de gauche et le cadre de droite
        OCRBlockData(text="あれ俺か？", bbox_x=195, bbox_y=575, bbox_w=50, bbox_h=160, confidence=0.92, provider="tesseract"),
        OCRBlockData(text="なんだかスライムが", bbox_x=675, bbox_y=535, bbox_w=55, bbox_h=240, confidence=0.95, provider="tesseract"),
    ]
    refined = refine_blocks(raw_blocks, bubbles=bubbles, source_lang="ja", image_size=(w, h), image=page)
    assert [b.text for b in refined] == ["なんだかスライムが", "あれ俺か？"]




