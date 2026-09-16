@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:4173
  npx --yes serve . -l 4173
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:4173
  python -m http.server 4173
  exit /b
)
echo Abra o arquivo index.html no Chrome ou Edge.
pause
