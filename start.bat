@echo off
rem Double-click to run the app on http://localhost:6767
rem Installs dependencies on first run and creates .env from .env.example.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example. Put your OPENROUTER_API_KEY and MIMO_API_KEY in it to turn the AI on.
)

rem A machine-wide NODE_ENV=production would make the server demand a
rem production SESSION_SECRET and refuse to start, so this run is pinned to
rem development, on port 6767.
set NODE_ENV=development
set PORT=6767

start "" cmd /c "timeout /t 3 >nul & start http://localhost:6767"
node server.js
pause
