# Deploiement automatique du backend Taurge (apps/api) sur Hugging Face Spaces (Docker - 16 Go RAM gratuits)
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$apiDir = Join-Path $root 'apps\api'

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  TAURGE - Deploiement Cloud Gratuit (Hugging Face Spaces - 16 Go RAM)' -ForegroundColor Yellow
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host ''

$hfUser = (Read-Host "1. Entre ton nom d'utilisateur Hugging Face (ex: Lysthene)").Trim()
$hfSpace = (Read-Host "2. Entre le nom de ton Space (par defaut: taurge-api)").Trim()
if (-not $hfSpace) { $hfSpace = 'taurge-api' }
$hfToken = (Read-Host "3. Colle ton Access Token Hugging Face (commence par hf_...)").Trim()

if (-not $hfUser -or -not $hfToken) {
    Write-Host '[ERREUR] Le nom d''utilisateur et le token hf_... sont requis.' -ForegroundColor Red
    exit 1
}

$tempDeployDir = Join-Path $env:TEMP "taurge_hf_deploy_$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Force -Path $tempDeployDir | Out-Null

Write-Host ''
Write-Host '[1/3] Preparation des fichiers du backend (apps/api)...' -ForegroundColor Cyan

# Copie propre du code backend (sans venv, ni cache, ni .env local)
$excludeDirs = @('venv', '.venv', '__pycache__', '.pytest_cache', 'storage_data')
Get-ChildItem -Path $apiDir -Force | Where-Object {
    $_.Name -notin $excludeDirs -and
    $_.Name -notlike 'pytest-of-*' -and
    $_.Name -notlike 'taurge-storage-*' -and
    $_.Name -notlike 'taurge-tests-*' -and
    $_.Name -notlike '*.db*' -and
    $_.Name -ne '.env'
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $tempDeployDir $_.Name) -Recurse -Force
}

Write-Host '[2/3] Initialisation du depot Git pour Hugging Face Spaces...' -ForegroundColor Cyan
Push-Location $tempDeployDir
try {
    git init -b main | Out-Null
    git config user.email "deploy@taurge.app"
    git config user.name "Taurge Deployer"
    git add -A
    git commit -m "Deploy Taurge Backend API to Hugging Face Spaces" | Out-Null

    $remoteUrl = "https://${hfUser}:${hfToken}@huggingface.co/spaces/${hfUser}/${hfSpace}"
    Write-Host '[3/3] Envoi du backend vers Hugging Face Spaces...' -ForegroundColor Cyan
    git push --force $remoteUrl main

    $publicApiUrl = ("https://{0}-{1}.hf.space" -f $hfUser.ToLower(), $hfSpace.ToLower()).Replace('_', '-')
    try { Set-Clipboard -Value $publicApiUrl } catch { }

    Write-Host ''
    Write-Host '========================================================================' -ForegroundColor Green
    Write-Host '  DEPLOIEMENT ENVOYE AVEC SUCCES SUR HUGGING FACE SPACES !' -ForegroundColor Yellow
    Write-Host '========================================================================' -ForegroundColor Green
    Write-Host "  Page du Space (build) : https://huggingface.co/spaces/$hfUser/$hfSpace"
    Write-Host "  URL API pour Vercel   : $publicApiUrl"
    Write-Host ''
    Write-Host '  [COPIE] L''URL de l''API a ete copiee dans ton presse-papiers (Ctrl+V).' -ForegroundColor Cyan
    Write-Host '  Colle-la dans NEXT_PUBLIC_API_URL sur Vercel puis fais Redeploy !' -ForegroundColor Yellow
    Write-Host '========================================================================' -ForegroundColor Green
} finally {
    Pop-Location
    Remove-Item -Path $tempDeployDir -Recurse -Force -ErrorAction SilentlyContinue
}
