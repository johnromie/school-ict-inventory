@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 >nul
set "PHP_EXE="
for /f "delims=" %%p in ('where php 2^>nul') do (
  if not defined PHP_EXE set "PHP_EXE=%%p"
)
if not defined PHP_EXE (
  echo PHP is not installed or not in PATH.
  echo Install PHP then run this file again.
  pause
  exit /b 1
)
for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'} ^| Select-Object -First 1 -ExpandProperty IPAddress)"') do set "LAN_IP=%%i"
echo Starting server on: 0.0.0.0:8000
if defined LAN_IP (
  echo This PC URL: http://localhost:8000
  echo Other devices URL: http://%LAN_IP%:8000
) else (
  echo This PC URL: http://localhost:8000
  echo For other devices use this PC's LAN IP: http://YOUR-IP:8000
)
start "SchoolInventoryServer" cmd /k ""%PHP_EXE%" -S 0.0.0.0:8000 -t "%~dp0""
timeout /t 1 >nul
start "" "http://localhost:8000"
