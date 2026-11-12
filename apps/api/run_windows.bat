@echo off
cd /d "%~dp0"
title Taurge Backend API (FastAPI) - Port 8000
REM Lance le backend Taurge sans Docker. Double-clique sur ce fichier,
REM ou execute-le depuis une invite de commande ouverte dans ce dossier.
REM
REM IMPORTANT : utilise specifiquement Python 3.12 via le "py launcher"
REM de Windows, meme si une version plus recente (3.13, 3.14...) est
REM aussi installee sur la machine. Certaines librairies du projet
REM (PyMuPDF, OpenCV, PaddleOCR) n'ont pas encore de version
REM prete a l'emploi pour les Python tres recents, ce qui fait planter
REM l'installation. Python 3.12 doit etre installe au prealable.

if not exist venv (
    echo Creation de l'environnement Python virtuel avec Python 3.12...
    py -3.12 -m venv venv
    if errorlevel 1 (
        echo.
        echo ERREUR : Python 3.12 introuvable via "py -3.12".
        echo Installe-le depuis python.org/downloads ^(page des versions,
        echo chercher 3.12.x specifiquement^), puis relance ce script.
        echo.
        pause
        exit /b 1
    )
)

call "%~dp0venv\Scripts\activate.bat"

echo Verification et mise a jour des dependances...
pip install -r requirements.txt

REM Load the local .env file if present (API keys, never committed - see .gitignore).
REM Values already defined in the environment keep priority over .env.
if exist .env (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
        if not "%%B"=="" if not defined %%A set "%%A=%%~B"
    )
    echo Local .env file loaded.
)

REM Detection automatique de Tesseract s'il est installe par defaut
if not defined TESSERACT_CMD (
    if exist "C:\Program Files\Tesseract-OCR\tesseract.exe" (
        set "TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
)

set DATABASE_URL=sqlite:///./taurge.db
set STORAGE_PATH=./storage_data
set ENVIRONMENT=development
set PYTHONPATH=.

REM Traduction : Ollama local prioritaire (aucune cle requise), repli
REM DeepL si DEEPL_API_KEY est definie dans .env. Sans aucun des deux,
REM la traduction echoue avec une erreur explicite (pas de faux traduit).
if not defined DEEPL_API_KEY (
    echo INFO: DEEPL_API_KEY non definie - traduction via Ollama local uniquement ^(repli DeepL inactif^).
)

echo.
echo ========================================================
echo   Backend Taurge FastAPI pret sur http://localhost:8000
echo   Documentation Swagger : http://localhost:8000/docs
echo   (Ctrl+C pour arreter)
echo ========================================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
