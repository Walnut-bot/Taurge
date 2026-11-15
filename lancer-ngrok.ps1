# Taurge : Mise en ligne URL HTTPS Fixe via le SDK Python officiel Ngrok (sans ngrok.exe -> 0 blocage Windows Defender)
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$apiDir = Join-Path $root 'apps\api'
$toolsDir = Join-Path $root 'tools'
$venvPython = Join-Path $apiDir 'venv\Scripts\python.exe'
$configFile = Join-Path $toolsDir 'ngrok-config.json'
$runnerPy = Join-Path $toolsDir 'run_ngrok_sdk.py'

New-Item -ItemType Directory -Force $toolsDir | Out-Null

# Nettoyage de tout ancien zip/exe bloque par Windows Defender
Remove-Item (Join-Path $toolsDir 'ngrok.zip') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $toolsDir 'ngrok.exe') -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  TAURGE - Mise en ligne URL FIXE (SDK Python Ngrok - Zero Antivirus)' -ForegroundColor Yellow
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Verification du SDK Python ngrok dans le venv
Write-Host '[1/3] Verification du module Python Ngrok officiel...' -ForegroundColor Cyan
& $venvPython -c "import ngrok" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '      Installation du module Python ngrok...' -ForegroundColor Cyan
    & $venvPython -m pip install ngrok --quiet
}
Write-Host '      Module Python Ngrok pret (aucun fichier .exe requis).' -ForegroundColor Green

# 2. Configuration du token et du domaine fixe gratuit
$token = ''
$domain = ''
if (Test-Path $configFile) {
    try {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $token = $cfg.token
        $domain = $cfg.domain
    } catch { }
}

if (-not $token) {
    Write-Host ''
    Write-Host '--- CONFIGURATION INITIALE (UNE SEULE FOIS, 0 CARTE BANCAIRE) ---' -ForegroundColor Yellow
    Write-Host '1. Connecte-toi avec GitHub sur : https://dashboard.ngrok.com/signup'
    Write-Host '2. Copie ton Authtoken sur     : https://dashboard.ngrok.com/get-started/your-authtoken'
    Write-Host '3. (Optionnel) Domaine fixe sur: https://dashboard.ngrok.com/domains'
    Write-Host ''
    $token = (Read-Host 'Colle ton Authtoken Ngrok').Trim()
    $domain = (Read-Host 'Colle ton Domaine fixe Ngrok (ou appuie sur Entree pour automatique)').Trim()
    $domain = $domain -replace '^https?://', '' -replace '/+$', ''

    @{ token = $token; domain = $domain } | ConvertTo-Json | Set-Content -Path $configFile -Encoding UTF8
}

# 3. Verification / demarrage de FastAPI sur le port 8000
$apiUp = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
    $apiUp = $r.StatusCode -eq 200
} catch { $apiUp = $false }

if (-not $apiUp) {
    Write-Host '[2/3] Demarrage de FastAPI (port 8000)...' -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$apiDir`" && run_windows.bat" -WindowStyle Normal
    Write-Host '      Attente du demarrage de FastAPI...' -NoNewline
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        Write-Host '.' -NoNewline
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $apiUp = $true; break }
        } catch { }
    }
    Write-Host ''
} else {
    Write-Host '[2/3] API FastAPI deja active sur http://127.0.0.1:8000 (200 OK).' -ForegroundColor Green
}

# 4. Ecriture et lancement du pont Python Ngrok
$pyCode = @'
import json
import sys
import time
import webbrowser
from urllib.parse import quote
import ngrok

cfg_path = sys.argv[1]
with open(cfg_path, "r", encoding="utf-8-sig") as f:
    cfg = json.load(f)

token = cfg.get("token", "").strip()
domain = cfg.get("domain", "").strip()

kwargs = {"authtoken": token}
if domain:
    kwargs["domain"] = domain

print("[3/3] Ouverture du tunnel HTTPS Ngrok...")
try:
    listener = ngrok.forward("http://127.0.0.1:8000", **kwargs)
except Exception as e:
    print(f"\n[ERREUR NGROK] {e}")
    print("Si ton token ou domaine est invalide, supprime tools/ngrok-config.json et relance.")
    sys.exit(1)

public_url = listener.url()
vercel_url = f"https://taurge.vercel.app/fr/dashboard?api={quote(public_url, safe='')}"

print("\n========================================================================")
print("  TON BACKEND TAURGE EST EN LIGNE !")
print("========================================================================")
print(f"  URL Backend HTTPS (pour NEXT_PUBLIC_API_URL sur Vercel) :\n  {public_url}\n")
print(f"  Lien direct pour tes testeurs :\n  {vercel_url}")
print("========================================================================")
print("\nLaisse cette fenetre ouverte tant que tes testeurs utilisent Taurge.")
print("Appuie sur Ctrl+C pour arreter.\n")

webbrowser.open(vercel_url)

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nArret du tunnel Ngrok.")
'@

Set-Content -Path $runnerPy -Value $pyCode -Encoding UTF8
& $venvPython $runnerPy $configFile
