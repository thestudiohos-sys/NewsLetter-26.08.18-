@echo off
setlocal EnableExtensions

title H.O.S Newsletter
for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
set "HOS_UI_URL=http://127.0.0.1:4173"

echo.
echo ==================================================
echo   H.O.S Newsletter
echo ==================================================
echo.

if not exist "%PROJECT_DIR%\package.json" (
  echo [ERROR] Project was not found:
  echo         %PROJECT_DIR%
  goto :error
)

cd /d "%PROJECT_DIR%" || (
  echo [ERROR] Could not open the project directory.
  goto :error
)

where.exe node >nul 2>&1 || (
  echo [ERROR] Node.js was not found.
  echo         Install Node.js and try again.
  goto :error
)

where.exe npm >nul 2>&1 || (
  echo [ERROR] npm was not found.
  echo         Check the Node.js and npm installation.
  goto :error
)

echo [OK] Node.js
node --version
echo [OK] npm
call npm --version
echo.

where.exe curl.exe >nul 2>&1
if not errorlevel 1 (
  curl.exe --silent --fail --max-time 2 "%HOS_UI_URL%" >nul 2>&1
  if not errorlevel 1 goto :already_running
)

echo [INFO] Starting the UI server.
echo [INFO] The default browser will open when the server is ready.
echo [INFO] To stop the server, press Ctrl+C in this window.
echo.

start "" powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -Command "$url='%HOS_UI_URL%'; for ($i=0; $i -lt 30; $i++) { try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { Start-Process $url; exit 0 } } catch {} Start-Sleep -Seconds 1 }; exit 1"

call npm run playground:smartstore-ui
set "SERVER_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%SERVER_EXIT_CODE%"=="0" (
  echo [ERROR] The UI server exited with code %SERVER_EXIT_CODE%.
  goto :error
)

echo [INFO] The UI server has stopped.
goto :pause_and_exit

:already_running
echo [INFO] The UI server is already running.
echo [INFO] Opening the existing server in the default browser.
start "" "%HOS_UI_URL%"
timeout /t 3 /nobreak >nul
exit /b 0

:error
echo.
echo Review the error above, then press any key to close this window.
pause >nul
exit /b 1

:pause_and_exit
echo Press any key to close this window.
pause >nul
exit /b 0
