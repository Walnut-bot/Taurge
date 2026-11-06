@echo off
title Taurge - API locale + tunnel Vercel
REM Mode actuel : frontend sur Vercel, backend FastAPI sur CE PC.
REM Ce lanceur demarre l'API locale, ouvre un tunnel Cloudflare
REM gratuit et ouvre le site Vercel branche sur ton API.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lancer-tunnel.ps1"
