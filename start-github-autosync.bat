@echo off
cd /d "%~dp0"
set "HOOK_FILE=%~dp0render-deploy-hook.url"
set "HOOK_URL="
if exist "%HOOK_FILE%" (
  set /p HOOK_URL=<"%HOOK_FILE%"
)
if defined HOOK_URL (
  start "GitHubAutoSync" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autosync-github.ps1" -RenderDeployHookUrl "%HOOK_URL%"
  echo GitHub autosync started with Render deploy hook fallback.
) else (
  start "GitHubAutoSync" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autosync-github.ps1"
  echo GitHub autosync started (no deploy hook configured).
  echo To enable deploy hook fallback, create: render-deploy-hook.url
)
