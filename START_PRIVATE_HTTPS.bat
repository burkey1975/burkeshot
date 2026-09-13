@echo off
setlocal
cd /d "%~dp0"
title BURKESHOT V4 - PRIVATE HTTPS

echo =====================================================
echo BURKESHOT V4 - PRIVATE HTTPS IPHONE TEST
echo =====================================================
echo.

set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto missingpython

%PY% -c "import av, cv2, fastapi, multipart, numpy, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Installing BurkeShot Python requirements...
  %PY% -m pip install --user -r requirements.txt
  if errorlevel 1 goto failed
)

where ngrok >nul 2>nul
if errorlevel 1 (
  echo ngrok is not installed.
  echo Installing ngrok from Microsoft Store using winget...
  winget install ngrok -s msstore
  if errorlevel 1 goto ngrokmanual
)

echo.
set /p BURKESHOT_PRIVATE_USER=Choose username [burkeshot]: 
if "%BURKESHOT_PRIVATE_USER%"=="" set "BURKESHOT_PRIVATE_USER=burkeshot"

powershell -NoProfile -Command "$p=Read-Host 'Choose password' -AsSecureString; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}" > "%TEMP%\burkeshot_pwd.txt"
set /p BURKESHOT_PRIVATE_PASSWORD=<"%TEMP%\burkeshot_pwd.txt"
del "%TEMP%\burkeshot_pwd.txt" >nul 2>nul
if "%BURKESHOT_PRIVATE_PASSWORD%"=="" (
  echo Password cannot be blank.
  pause
  exit /b 1
)

echo.
echo Starting BurkeShot private server...
start "BURKESHOT PRIVATE SERVER" cmd /k "set BURKESHOT_PRIVATE_USER=%BURKESHOT_PRIVATE_USER%&& set BURKESHOT_PRIVATE_PASSWORD=%BURKESHOT_PRIVATE_PASSWORD%&& %PY% private_tunnel.py"

timeout /t 3 /nobreak >nul

echo.
echo Starting ngrok HTTPS tunnel...
echo If ngrok asks you to add an authtoken, run:
echo   ngrok config add-authtoken YOUR_TOKEN
echo Then run this file again.
echo.
ngrok http 8811
exit /b

:missingpython
echo Python 3.11 or newer is required.
pause
exit /b 1

:failed
echo Python dependency installation failed.
pause
exit /b 1

:ngrokmanual
echo.
echo Automatic ngrok installation failed.
echo Install it from https://ngrok.com/download/windows
pause
exit /b 1
