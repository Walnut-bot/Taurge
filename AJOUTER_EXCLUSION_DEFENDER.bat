@echo off
:: Ce script doit etre execute en ADMINISTRATEUR
:: Clic-droit -> "Executer en tant qu'administrateur"

echo ========================================================
echo   TAURGE - Exclusion Windows Defender (Performances)
echo ========================================================
echo.
echo Ce script ajoute le dossier Python virtuel (venv) de Taurge
echo aux exclusions de Windows Defender.
echo.
echo Sans cette exclusion, Windows Defender analyse chaque fichier
echo Python compile (.pyd, .dll) a chaque demarrage, ce qui rend
echo le backend 10x plus lent (90 secondes au lieu de 5).
echo.

set ROOT_DIR=%~dp0
set VENV_DIR=%ROOT_DIR%apps\api\venv
set WEB_DIR=%ROOT_DIR%apps\web\node_modules

echo Ajout de l'exclusion pour : %VENV_DIR%
powershell -Command "Add-MpPreference -ExclusionPath '%VENV_DIR%'"
if errorlevel 1 (
    echo [ERREUR] Impossible d'ajouter l'exclusion. Relancez en ADMINISTRATEUR.
    pause
    exit /b 1
)
echo [OK] Exclusion venv ajoutee.

echo.
echo Ajout de l'exclusion pour : %WEB_DIR%
powershell -Command "Add-MpPreference -ExclusionPath '%WEB_DIR%'"
echo [OK] Exclusion node_modules ajoutee.

echo.
echo ========================================================
echo  SUCCES ! Le backend Taurge va maintenant demarrer
echo  en 3-5 secondes au lieu de 90 secondes.
echo  
echo  Vous pouvez maintenant lancer LANCER_TAURGE.bat
echo ========================================================
echo.
pause
