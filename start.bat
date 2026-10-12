@echo off
title Starting THIRD EYE IDE...
echo ========================================================
echo               THIRD EYE - AI Terminal Workspace
echo ========================================================
echo.

cd /d "%~dp0"

:: Check if root node_modules exists
if not exist "node_modules" (
    echo [1/2] Installing root dependencies...
    call npm install
    echo.
)

:: Check if frontend node_modules exists
if not exist "Frontend\guide-build-main\node_modules" (
    echo [2/2] Installing frontend dependencies...
    cd Frontend\guide-build-main
    call npm install
    cd ..\..
    echo.
)

echo Cleaning up any stale Electron instances...
taskkill /F /IM electron.exe >nul 2>&1

echo Starting THIRD EYE (AI + PTY + Frontend + Electron)...
echo.
call npm run dev:full

pause
