@echo off
setlocal
rem Local development on http://localhost:7070 using the existing AI settings.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org.
  exit /b 1
)

if not exist node_modules (
  call npm install --include=dev --no-audit --no-fund
  if errorlevel 1 exit /b 1
)

rem Prefer this project's .env, otherwise use the existing parent-folder .env.
set "DOTENV_CONFIG_PATH=%~dp0.env"
if not exist "%DOTENV_CONFIG_PATH%" if exist "%~dp0..\.env" set "DOTENV_CONFIG_PATH=%~dp0..\.env"
set "NODE_ENV=development"
set "PORT=7070"
set "DB_READONLY="

node -r dotenv/config server.js
endlocal