# THIRD EYE - Push to GitHub Script
$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Pushing THIRD EYE to GitHub Repository" -ForegroundColor Cyan
Write-Host "       https://github.com/adityas-god/THIRD_EYE" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[1/4] Purging old git history containing contaminated commit..." -ForegroundColor Yellow
if (Test-Path ".git") {
    Remove-Item -Recurse -Force ".git"
}

Write-Host "`n[2/4] Initializing fresh, clean Git repository..." -ForegroundColor Yellow
git init
git branch -M main
git remote add origin https://github.com/adityas-god/THIRD_EYE.git

Write-Host "`n[3/4] Staging clean workspace files (.gitignore protects .env and node_modules)..." -ForegroundColor Yellow
git add .

Write-Host "`n[4/4] Creating clean commit and force-pushing to GitHub..." -ForegroundColor Yellow
git commit -m "feat: THIRD EYE - AI-Native Terminal Workspace with Electron, Vite & PTY microservices"
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " SUCCESS: Pushed clean project to GitHub!" -ForegroundColor Green
    Write-Host " https://github.com/adityas-god/THIRD_EYE" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "`n--------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "If GitHub still asks to allow the secret, open this URL:" -ForegroundColor Yellow
    Write-Host "https://github.com/adityas-god/THIRD_EYE/security/secret-scanning/unblock-secret/3KWe5OTCuDLCsvMxKSkQsbSD5gq" -ForegroundColor Cyan
    Write-Host "Click 'Allow secret' then run push_to_github.ps1 again." -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------" -ForegroundColor Yellow
}
