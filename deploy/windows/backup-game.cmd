@echo off
setlocal
cd /d "%~dp0"
node tools/backup.ts
pause
