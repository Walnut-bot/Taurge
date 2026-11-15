@echo off
cd /d "%~dp0"
title Taurge - Deploiement Gratuit sur Hugging Face Spaces (16 Go RAM)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployer-hf.ps1"
pause
