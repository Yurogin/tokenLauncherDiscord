@echo off
setlocal
chcp 65001 >nul

REM ============================================================
REM  start-dev.bat - lance "npm run dev" en double-clic
REM  A poser a la RACINE du projet (a cote du package.json)
REM ============================================================

REM %~dp0 = dossier du .bat, /d = change aussi de lecteur si besoin
cd /d "%~dp0"

title Dev server - %~nx0  [%CD%]

REM --- Verification : package.json present ? -------------------
if not exist "package.json" (
    echo [ERREUR] Aucun package.json trouve dans :
    echo          %CD%
    echo.
    echo Place ce fichier .bat a la racine du projet.
    goto :fin
)

REM --- Verification : node / npm installes ? -------------------
where node >nul 2>&1 || (
    echo [ERREUR] Node.js est introuvable dans le PATH.
    echo Installe-le depuis https://nodejs.org puis rouvre une session.
    goto :fin
)

for /f "tokens=*" %%v in ('node -v') do set "NODEV=%%v"
echo ============================================================
echo  Projet : %CD%
echo  Node   : %NODEV%
echo ============================================================
echo.

REM --- Installation auto des dependances si absentes ------------
if not exist "node_modules" (
    echo [INFO] node_modules absent - installation des dependances...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERREUR] npm install a echoue.
        goto :fin
    )
    echo.
)

REM --- Lancement ------------------------------------------------
echo [INFO] Demarrage : npm run dev
echo [INFO] Ctrl+C pour arreter.
echo.

REM "call" est OBLIGATOIRE : npm est un .cmd, sans call le batch s'arrete ici
call npm run dev

set "CODE=%ERRORLEVEL%"
echo.
if "%CODE%"=="0" (
    echo [OK] Le serveur s'est arrete normalement.
) else (
    echo [ERREUR] Le serveur s'est arrete avec le code %CODE%.
)

:fin
echo.
echo ------------------------------------------------------------
echo Appuie sur une touche pour fermer cette fenetre...
pause >nul
endlocal
