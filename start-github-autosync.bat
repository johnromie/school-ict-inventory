@echo off
cd /d "%~dp0"
start "GitHubAutoSync" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autosync-github.ps1"
echo GitHub autosync started.
