# Taurge : API locale (PC) + tunnel Cloudflare -> frontend Vercel.
#
# Le frontend https://taurge.vercel.app ne peut pas joindre tout seul
# le FastAPI du PC (http://localhost:8000, derriere la box). Ce script :
#   1. lance l'API locale (fenetre separee, run_windows.bat) ;
#   2. attend qu'elle reponde sur /health ;
#   3. ouvre un tunnel Cloudflare gratuit (URL https://*.trycloudflare.com) ;
#   4. ouvre le site Vercel avec ?api=<url-du-tunnel> : le navigateur
#      memorise cette URL (localStorage) pour les visites suivantes.
#
# L'URL du tunnel change a chaque lancement : relance ce script a
# chaque session de travail, et ne partage pas l'URL (elle donne
# acces a ton API locale — l'authentification Taurge reste requise).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root 'apps\api'
$toolsDir = Join-Path $root 'tools'
$cloudflared = Join-Path $toolsDir 'cloudflared.exe'
$logFile = Join-Path $toolsDir 'tunnel.log'
$siteUrl = 'https://taurge.vercel.app/fr/dashboard'

Write-Host '========================================================'
Write-Host '  TAURGE - API locale + tunnel pour le site Vercel'
Write-Host '========================================================'

# 1. API deja en marche ?
$apiUp = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
    $apiUp = $r.StatusCode -eq 200
} catch { $apiUp = $false }

if ($apiUp) {
    Write-Host '[1/3] API locale deja en marche sur le port 8000.'
} else {
    Write-Host '[1/3] Lancement de l''API FastAPI (nouvelle fenetre)...'
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$apiDir`" && run_windows.bat" -WindowStyle Normal
    Write-Host '      Attente du demarrage (le premier lancement installe les dependances)...'
    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $apiUp = $true; break }
        } catch { }
    }
    if (-not $apiUp) {
        Write-Host '[ERREUR] L''API ne repond pas sur http://127.0.0.1:8000 apres 5 minutes.'
        Write-Host 'Regarde la fenetre de l''API pour l''erreur, puis relance ce script.'
        pause
        exit 1
    }
    Write-Host '      API prete.'
}

# 2. cloudflared
if (-not (Test-Path $cloudflared)) {
    Write-Host '[2/3] Telechargement de cloudflared (tunnel Cloudflare, une seule fois)...'
    New-Item -ItemType Directory -Force $toolsDir | Out-Null
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared -TimeoutSec 300
} else {
    Write-Host '[2/3] cloudflared present.'
}

# 3. Tunnel
Write-Host '[3/3] Ouverture du tunnel...'
if (Test-Path $logFile) { Remove-Item $logFile -Force }
# Le chemin du log contient des espaces : sans guillemets, cloudflared
# reçoit un argument tronqué, n'écrit aucun log et aucune URL n'est lue.
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:8000', '--no-autoupdate', "--logfile=`"$logFile`"" -WindowStyle Minimized -PassThru

$tunnelUrl = $null
$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
    Start-Sleep -Seconds 2
    if (Test-Path $logFile) {
        $match = Select-String -Path $logFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($match) { $tunnelUrl = $match.Matches[0].Value }
    }
}
if (-not $tunnelUrl) {
    Write-Host '[ERREUR] Le tunnel n''a pas fourni d''URL en 2 minutes (connexion Internet ?).'
    Write-Host "Log : $logFile"
    pause
    exit 1
}

# Verification de bout en bout : le tunnel doit repondre /health.
$ok = $false
foreach ($i in 1..25) {
    try {
        $r = Invoke-WebRequest -Uri "$tunnelUrl/health" -TimeoutSec 15 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) {
    Write-Host "[ATTENTION] Tunnel cree ($tunnelUrl) mais /health ne repond pas encore."
    Write-Host 'Le site peut mettre quelques secondes a joindre l''API.'
} else {
    Write-Host "      Tunnel verifie : $tunnelUrl/health -> 200"
}

$openUrl = "$siteUrl`?api=$([uri]::EscapeDataString($tunnelUrl))"
Write-Host ''
Write-Host '========================================================'
Write-Host "  Backend local expose sur : $tunnelUrl"
Write-Host "  Ouverture du site : $openUrl"
Write-Host '  Laisse la fenetre API et le tunnel ouverts pendant le travail.'
Write-Host '  Ne partage pas l''URL du tunnel.'
Write-Host '========================================================'
Start-Process $openUrl
pause
