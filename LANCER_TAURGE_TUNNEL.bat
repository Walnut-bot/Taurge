@echo off
cd /d "%~dp0"
title Taurge - API locale + tunnel Vercel
REM Mode actuel : frontend sur Vercel, backend FastAPI sur CE PC.
REM Ce lanceur demarre l'API locale, ouvre un tunnel Cloudflare
REM gratuit et ouvre le site Vercel branche sur ton API locale.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lancer-tunnel.ps1"
if errorlevel 1 (
    echo.
    echo ========================================================
    echo   [ERREUR] Une erreur est survenue dans le lanceur.
    echo   Consulte les messages ci-dessus pour plus d'infos.
    echo ========================================================
    echo.
    pause
)
