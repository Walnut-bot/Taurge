# Taurge : API locale (PC) -> frontend Vercel (connexion locale directe + tunnel optionnel).
#
# Architecture :
#   1. Sur CE PC : le navigateur (https://taurge.vercel.app) joint DIRECTEMENT
#      http://127.0.0.1:8000 grace a CORS + Private Network Access (19 ms,
#      aucun delai DNS, l'URL http://127.0.0.1:8000 ne change jamais).
#   2. Depuis un autre appareil (telephone / autre PC) : un tunnel Cloudflare
#      secondaire est ouvert en tache de fond et affiche dans la console.

$ErrorActionPreference = 'Stop'

# Resolution fiable du dossier racine
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $root) { $root = (Get-Location).Path }

$apiDir = Join-Path $root 'apps\api'
$toolsDir = Join-Path $root 'tools'
$cloudflared = Join-Path $toolsDir 'cloudflared.exe'
$logFile = Join-Path $toolsDir 'tunnel.log'
$siteUrl = 'https://taurge.vercel.app/fr/dashboard'
$localApiUrl = 'http://127.0.0.1:8000'

# Activer TLS 1.2+ pour securiser les requetes HTTPS sortantes
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  TAURGE - Backend Local (PC) -> Frontend Vercel (Connexion Directe)' -ForegroundColor Yellow
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Verification / demarrage de l'API locale
$apiUp = $false
try {
    $r = Invoke-WebRequest -Uri "$localApiUrl/health" -TimeoutSec 3 -UseBasicParsing
    $apiUp = $r.StatusCode -eq 200
} catch { $apiUp = $false }

if ($apiUp) {
    Write-Host "[1/2] API locale deja active sur $localApiUrl (200 OK)." -ForegroundColor Green
} else {
    Write-Host '[1/2] Lancement de l''API FastAPI (nouvelle fenetre)...' -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$apiDir`" && run_windows.bat" -WindowStyle Normal
    Write-Host '      Attente du demarrage de l''API...' -NoNewline

    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        Write-Host '.' -NoNewline
        try {
            $r = Invoke-WebRequest -Uri "$localApiUrl/health" -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $apiUp = $true; break }
        } catch { }
    }
    Write-Host ''
    if (-not $apiUp) {
        Write-Host "[ERREUR] L'API ne repond pas sur $localApiUrl apres 5 minutes." -ForegroundColor Red
        Write-Host 'Consulte la fenetre "Taurge Backend API" pour identifier l''erreur, puis relance.' -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host '      API FastAPI prete et fonctionnelle (200 OK).' -ForegroundColor Green
}

# 2. Ouverture immediate du site Vercel connecte en direct a http://127.0.0.1:8000 sur ce PC
#    Cela remplace toute ancienne URL *.trycloudflare.com expiree dans le navigateur (localStorage)
#    par http://127.0.0.1:8000 qui est permanente et instantanee (0 delai DNS).
$localOpenUrl = "$siteUrl`?api=$([uri]::EscapeDataString($localApiUrl))"

try {
    Set-Clipboard -Value $localOpenUrl -ErrorAction SilentlyContinue
} catch { }

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Green
Write-Host '  TAURGE EST EN LIGNE SUR CE PC (CONNEXION DIRECTE INSTANTANEE) !' -ForegroundColor Yellow
Write-Host '========================================================================' -ForegroundColor Green
Write-Host "  Backend Local (PC) : $localApiUrl"
Write-Host "  Application Web    : $localOpenUrl"
Write-Host ''
Write-Host '  [OK] Le navigateur de ce PC est branche directement sur 127.0.0.1:8000.' -ForegroundColor Green
Write-Host '       Cette adresse est permanente et ne change jamais.' -ForegroundColor Green
Write-Host '========================================================================' -ForegroundColor Green
Write-Host ''

Start-Process $localOpenUrl

# 3. Tunnel Cloudflare secondaire en tache de fond (uniquement si acces depuis un autre appareil)
if (-not (Test-Path $cloudflared)) {
    Write-Host '[2/2] Telechargement de cloudflared (optionnel, pour acces distant)...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $toolsDir | Out-Null
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared -TimeoutSec 300
}

Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

if (Test-Path $logFile) {
    try {
        Remove-Item $logFile -Force -ErrorAction Stop
    } catch {
        Start-Sleep -Seconds 1
        Remove-Item $logFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host '[2/2] Demarrage du tunnel Cloudflare secondaire (HTTP/2)...' -ForegroundColor Cyan
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', $localApiUrl, '--protocol', 'http2', '--no-autoupdate', "--logfile=`"$logFile`"" -WindowStyle Minimized -PassThru

$tunnelUrl = $null
$tunnelRegistered = $false
$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline -and (-not $tunnelUrl -or -not $tunnelRegistered)) {
    Start-Sleep -Seconds 2
    if ($tunnel.HasExited) { break }
    if (Test-Path $logFile) {
        if (-not $tunnelUrl) {
            $match = Select-String -Path $logFile -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($match) { $tunnelUrl = $match.Matches[0].Value.Trim() }
        }
        if (-not $tunnelRegistered) {
            $reg = Select-String -Path $logFile -Pattern 'Registered tunnel connection' -SimpleMatch | Select-Object -First 1
            if ($reg) { $tunnelRegistered = $true }
        }
    }
}

if ($tunnelUrl) {
    # Attendre 4 secondes apres l'enregistrement avant toute requete DNS pour eviter
    # que la box Internet (192.168.x.1) ne mette en cache un NXDOMAIN pendant 5 minutes.
    Start-Sleep -Seconds 4
    try { ipconfig /flushdns | Out-Null } catch { }
    $remoteOpenUrl = "$siteUrl`?api=$([uri]::EscapeDataString($tunnelUrl))"
    Write-Host "      Tunnel distant actif (autre appareil uniquement) : $remoteOpenUrl" -ForegroundColor Gray
}

Write-Host ''
Write-Host '  [IMPORTANT] Laisse la fenetre "Taurge Backend API" ouverte pendant' -ForegroundColor Magenta
Write-Host '              toute ta session de travail sur Taurge.' -ForegroundColor Magenta
Write-Host "  Pour fermer cette fenetre proprement, appuie sur [Entree] ou [Q]..." -ForegroundColor Yellow

try {
    while (-not $tunnel.HasExited) {
        Start-Sleep -Milliseconds 500

        $shouldExit = $false
        try {
            if ($Host.UI.RawUI.KeyAvailable) {
                $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                if ($key.VirtualKeyCode -in 13, 81, 27) {
                    $shouldExit = $true
                }
            }
        } catch {
            try {
                if ([Console]::KeyAvailable) {
                    $key = [Console]::ReadKey($true)
                    if ($key.Key -in @([ConsoleKey]::Enter, [ConsoleKey]::Q, [ConsoleKey]::Escape)) {
                        $shouldExit = $true
                    }
                }
            } catch {
                # Entree redirigee ou non interactive : on garde le processus actif
            }
        }

        if ($shouldExit) {
            Write-Host "`nArret demande par l'utilisateur." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host 'Arret propre du tunnel secondaire...' -ForegroundColor Gray
    if ($tunnel -and -not $tunnel.HasExited) {
        Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'A bientot sur Taurge !' -ForegroundColor Green
}
