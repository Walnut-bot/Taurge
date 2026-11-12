"""Validation du type de fichier par son contenu réel, pas par son
extension. Une extension ".png" ne prouve rien — on vérifie les
premiers octets du fichier (magic bytes).

Formats acceptés : PDF, images (PNG, JPG, WEBP) et archives (ZIP, CBZ).
"""

IMAGE_SIGNATURES: dict[str, bytes] = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpg": b"\xff\xd8\xff",
}

SIGNATURES: dict[str, bytes] = {
    "pdf": b"%PDF",
    **IMAGE_SIGNATURES,
    "zip": b"PK\x03\x04",
}

# WEBP a un en-tête un peu particulier : "RIFF" puis 4 octets de
# taille, puis "WEBP".
WEBP_RIFF = b"RIFF"
WEBP_MARKER = b"WEBP"


def detect_image_type(content: bytes) -> str | None:
    """Retourne 'png', 'jpg', 'webp' ou None si non reconnu comme image."""
    for file_type, signature in IMAGE_SIGNATURES.items():
        if content.startswith(signature):
            return file_type
    if content[:4] == WEBP_RIFF and content[8:12] == WEBP_MARKER:
        return "webp"
    return None


def detect_file_type(content: bytes, filename: str | None = None) -> str | None:
    """Retourne 'pdf', 'png', 'jpg', 'webp', 'zip', 'cbz' ou None si non reconnu."""
    img_type = detect_image_type(content)
    if img_type:
        return img_type
    if content.startswith(SIGNATURES["pdf"]):
        return "pdf"
    if content.startswith(SIGNATURES["zip"]):
        if filename and filename.lower().endswith(".cbz"):
            return "cbz"
        return "zip"
    return None
