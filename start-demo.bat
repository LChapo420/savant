@echo off
rem Double-click to run the app on http://localhost:6767 WITH three demo learners,
rem so the scorecard and the profile pages have something to show.
rem Safe to run again: the demo learners are only created once.
rem
rem The admin panel at /admin is deliberately not among them. It is limited to
rem the addresses in ADMIN_EMAILS and 404s for everyone else, and seeding an
rem address into that list to make a demo tidier would leave the door open in
rem the app itself. Sign in as an ADMIN_EMAILS account to see it.
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

set NODE_ENV=development
node scripts\seed-demo.js
call start.bat
