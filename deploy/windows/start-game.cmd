@echo off
setlocal
cd /d "%~dp0"
node launcher.mjs %*
if errorlevel 1 pause
