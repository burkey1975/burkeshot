@echo off
setlocal
cd /d "%~dp0"
title BURKESHOT V12 - TIMESTAMP CALIBRATED
echo BURKESHOT V12 - TIMESTAMP CALIBRATED VIDEO
echo Keep this window open. V12 normally uses port 8811.
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto missing
%PY% -c "import av, cv2, fastapi, multipart, numpy, uvicorn" >nul 2>nul
if errorlevel 1 (
  %PY% -m pip install --user -r requirements.txt
  if errorlevel 1 goto failed
)
set BURKESHOT_PORT=8811
%PY% server.py --open
pause
exit /b
:missing
echo Install Python 3.11 or newer and enable Add Python to PATH.
pause
exit /b 1
:failed
echo Camera dependency installation failed. Run INSTALL_CAMERA_ENGINE.bat.
pause
exit /b 1
