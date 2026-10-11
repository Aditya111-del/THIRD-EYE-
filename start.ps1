# THIRD EYE - PowerShell Launcher
$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "              THIRD EYE - AI Terminal Workspace" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Check root dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[1/3] Installing root dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host ""
    Write-Host "[2/3] Rebuilding native PTY modules for Electron..." -ForegroundColor Yellow
    npm run rebuild
    Write-Host ""
}

# Check frontend dependencies
if (-not (Test-Path "Frontend\guide-build-main\node_modules")) {
    Write-Host "[3/3] Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location "Frontend\guide-build-main"
    npm install
    Pop-Location
    Write-Host ""
}

Write-Host "Starting THIRD EYE (Frontend + Electron)..." -ForegroundColor Green
Write-Host ""
npm run dev
