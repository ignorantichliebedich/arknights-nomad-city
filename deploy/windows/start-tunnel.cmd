@echo off
setlocal
cd /d "%~dp0"
if exist "cloudflared.exe" (
  ".\cloudflared.exe" tunnel --url http://127.0.0.1:3000
) else (
  cloudflared tunnel --url http://127.0.0.1:3000
)
if errorlevel 1 pause
