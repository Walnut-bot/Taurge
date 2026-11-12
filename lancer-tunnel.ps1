# Taurge : API locale (PC) + tunnel Cloudflare -> frontend Vercel.
#
# Le frontend https://taurge.vercel.app ne peut pas joindre directement
# le FastAPI local du PC (http://localhost:8000, derriere la box/pare-feu). Ce script :
#   1. lance l'API locale (fenetre separee, run_windows.bat) ;
#   2. attend qu'elle reponde sur /health ;
#   3. ouvre un tunnel Cloudflare gratuit (URL https://*.trycloudflare.com) ;
#   4. verifie de bout en bout que le tunnel repond 200 sur /health ;
#   5. ouvre le site Vercel avec ?api=<url-du-tunnel> : le navigateur
#      memorise cette URL (localStorage) pour les visites et requetes.
#
# L'URL du tunnel change a chaque lancement : relance ce lanceur a
# chaque session de travail, et ne partage pas l'URL.

$ErrorActionPreference = 'Stop'

# Resolution fiable du dossier racine
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $root) { $root = (Get-Location).Path }

$apiDir = Join-Path $root 'apps\api'
$toolsDir = Join-Path $root 'tools'
$cloudflared = Join-Path $toolsDir 'cloudflared.exe'
$logFile = Join-Path $toolsDir 'tunnel.log'
$siteUrl = 'https://taurge.vercel.app/fr/dashboard'

# Activer TLS 1.2+ pour securiser les requetes HTTPS sortantes
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

Write-Host ''
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host '  TAURGE - API Locale (PC) + Tunnel Cloudflare -> Vercel' -ForegroundColor Yellow
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Verification de l'API locale
$apiUp = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
    $apiUp = $r.StatusCode -eq 200
} catch { $apiUp = $false }

if ($apiUp) {
    Write-Host '[1/3] API locale deja active sur http://127.0.0.1:8000' -ForegroundColor Green
} else {
    Write-Host '[1/3] Lancement de l''API FastAPI (nouvelle fenetre)...' -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$apiDir`" && run_windows.bat" -WindowStyle Normal
    Write-Host '      Attente du demarrage de l''API...' -NoNewline

    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        Write-Host '.' -NoNewline
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $apiUp = $true; break }
        } catch { }
    }
    Write-Host ''
    if (-not $apiUp) {
        Write-Host '[ERREUR] L''API ne repond pas sur http://127.0.0.1:8000 apres 5 minutes.' -ForegroundColor Red
        Write-Host 'Consulte la fenetre "Taurge Backend API" pour identifier l''erreur, puis relance.' -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host '      API FastAPI prete et fonctionnelle (200 OK).' -ForegroundColor Green
}

# 2. Verification de cloudflared
if (-not (Test-Path $cloudflared)) {
    Write-Host '[2/3] Telechargement de cloudflared (tunnel Cloudflare, initialisation unique)...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $toolsDir | Out-Null
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared -TimeoutSec 300
    Write-Host '      cloudflared telecharge avec succes.' -ForegroundColor Green
} else {
    Write-Host '[2/3] Outil Cloudflared present.' -ForegroundColor Green
}

# 3. Arret de tout ancien processus cloudflared orphelin pour liberer le fichier de log et le port
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

# 4. Lancement du tunnel
Write-Host '[3/3] Creation du tunnel Cloudflare securise...' -ForegroundColor Cyan
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:8000', '--no-autoupdate', "--logfile=`"$logFile`"" -WindowStyle Minimized -PassThru

$tunnelUrl = $null
$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
    Start-Sleep -Seconds 2
    if ($tunnel.HasExited) {
        Write-Host "[ERREUR] Le tunnel Cloudflare s'est arrete prematurement (code $($tunnel.ExitCode))." -ForegroundColor Red
        if (Test-Path $logFile) {
            Write-Host 'Derniers logs :' -ForegroundColor Yellow
            Get-Content $logFile -Tail 15 | Write-Host
        }
        pause
        exit 1
    }
    if (Test-Path $logFile) {
        $match = Select-String -Path $logFile -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($match) { $tunnelUrl = $match.Matches[0].Value.Trim() }
    }
}

if (-not $tunnelUrl) {
    Write-Host '[ERREUR] Le tunnel n''a pas fourni d''URL en 2 minutes (verifie la connexion internet).' -ForegroundColor Red
    if (Test-Path $logFile) {
        Write-Host 'Logs disponibles dans : ' $logFile -ForegroundColor Yellow
        Get-Content $logFile -Tail 20 | Write-Host
    }
    pause
    exit 1
}

# 5. Verification de bout en bout du tunnel
Write-Host "      URL detectee : $tunnelUrl" -ForegroundColor Cyan
Write-Host '      Verification de la connexion via le tunnel...' -NoNewline
$ok = $false
foreach ($i in 1..25) {
    try {
        $r = Invoke-WebRequest -Uri "$tunnelUrl/health" -TimeoutSec 10 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 2
    }
}
Write-Host ''
if (-not $ok) {
    Write-Host "[ATTENTION] Le tunnel repond avec latence. L'API est en cours de routage." -ForegroundColor Yellow
} else {
    Write-Host "      Tunnel valide et operational : $tunnelUrl/health -> 200 OK" -ForegroundColor Green
}

# 6. Ouverture du site Vercel avec le parametre ?api=
$openUrl = "$siteUrl`?api=$([uri]::EscapeDataString($tunnelUrl))"

try {
    Set-Clipboard -Value $openUrl -ErrorAction SilentlyContinue
} catch { }

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Green
Write-Host '  TAURGE EST EN LIGNE ET PRET A ETRE UTILISE !' -ForegroundColor Yellow
Write-Host '========================================================================' -ForegroundColor Green
Write-Host "  Backend Local    : http://127.0.0.1:8000"
Write-Host "  Tunnel Securise  : $tunnelUrl"
Write-Host "  Application Web  : $openUrl"
Write-Host ''
Write-Host '  [NOTE] L''URL complete a ete copiee dans le presse-papiers.' -ForegroundColor Cyan
Write-Host '  [IMPORTANT] Laisse cette fenetre et celle de l''API ouvertes pendant' -ForegroundColor Magenta
Write-Host '              toute ta session de travail sur Taurge.' -ForegroundColor Magenta
Write-Host '========================================================================' -ForegroundColor Green
Write-Host ''

Start-Process $openUrl

Write-Host "Pour fermer le tunnel et quitter proprement, appuie sur [Entree] ou [Q]..." -ForegroundColor Yellow

try {
    while ($true) {
        if ($tunnel.HasExited) {
            Write-Host "`n[AVERTISSEMENT] Le processus Cloudflare s'est termine." -ForegroundColor Red
            break
        }
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq [ConsoleKey]::Enter -or $key.Key -eq [ConsoleKey]::Q -or $key.Key -eq [ConsoleKey]::Escape) {
                break
            }
        }
        Start-Sleep -Milliseconds 400
    }
} finally {
    Write-Host 'Arret propre du tunnel Cloudflare...' -ForegroundColor Gray
    if ($tunnel -and -not $tunnel.HasExited) {
        Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Tunnel arrete. A bientot sur Taurge !' -ForegroundColor Green
}
