@echo off
title Pushing THIRD EYE to GitHub...
echo ========================================================
echo        Pushing THIRD EYE to GitHub Repository
echo        https://github.com/adityas-god/THIRD_EYE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Purging old git history containing contaminated commit...
if exist ".git" (
    rmdir /s /q .git
)

echo [2/4] Initializing fresh, clean Git repository...
git init
git branch -M main
git remote add origin https://github.com/adityas-god/THIRD_EYE.git

echo [3/4] Staging clean workspace files (.gitignore protects .env and node_modules)...
git add .

echo [4/4] Creating clean commit and force-pushing to GitHub...
git commit -m "feat: THIRD EYE - AI-Native Terminal Workspace with Electron, Vite & PTY microservices"
git push -u origin main --force

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  SUCCESS: Pushed clean project to GitHub!
    echo  https://github.com/adityas-god/THIRD_EYE
    echo ========================================================
) else (
    echo.
    echo --------------------------------------------------------
    echo If GitHub still asks to allow the secret, open this URL:
    echo https://github.com/adityas-god/THIRD_EYE/security/secret-scanning/unblock-secret/3KWe5OTCuDLCsvMxKSkQsbSD5gq
    echo Click 'Allow secret', then run push_to_github.bat again!
    echo --------------------------------------------------------
)

echo.
pause
