@echo off
rem Serve the offline fact sources on 127.0.0.1:8090 (see start-kiwix.sh).
setlocal
set HERE=%~dp0
if "%KIWIX_DIR%"=="" set KIWIX_DIR=%HERE%..\..\..\local-tools\kiwix-tools
if "%OFFLINE_DIR%"=="" set OFFLINE_DIR=%HERE%..\..\..\offline-sources
if "%KIWIX_PORT%"=="" set KIWIX_PORT=8090
rem Bare file names from inside the folder: a folder in a book name breaks /content/ routes.
rem Only files download.sh verified ("OK <file>" in download.log).
cd /d "%OFFLINE_DIR%"
set FILES=
for %%f in (*.zim) do findstr /x /c:"OK %%f" download.log >nul && call set FILES=%%FILES%% "%%f"
"%KIWIX_DIR%\kiwix-serve.exe" --address=127.0.0.1 --port=%KIWIX_PORT% --threads=4 -z %FILES%
