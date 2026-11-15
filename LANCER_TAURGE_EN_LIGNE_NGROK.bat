@echo off
cd /d "%~dp0"
title Taurge - Serveur en ligne URL Fixe (Ngrok Gratuit - Zero Carte)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lancer-ngrok.ps1"
pause
