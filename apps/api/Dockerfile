FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000

# Installation des dépendances système et polices typographiques.
# Tesseract + packs de langues : c'est le moteur OCR de repli (et le
# seul utilisable si Paddle ne démarre pas) — sans le binaire système,
# pytesseract ne sert à rien en production.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    fontconfig \
    fonts-liberation \
    fonts-dejavu-core \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    tesseract-ocr-kor \
    tesseract-ocr-chi-sim \
    tesseract-ocr-chi-tra \
    tesseract-ocr-jpn \
    tesseract-ocr-spa \
    tesseract-ocr-por \
    tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code source et assets
COPY . .

# Dossier local de stockage
RUN mkdir -p /app/storage_data /app/app/assets/fonts

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
