@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 >nul
set "NODE_EXE="
for /f "delims=" %%p in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%p"
)
if not defined NODE_EXE (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
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
start "SchoolInventoryServer" cmd /k "npm start"
timeout /t 1 >nul
start "" "http://localhost:8000"
