@echo off
setlocal
cd /d "%~dp0"
title BURKESHOT Coach Engine Installer
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
 echo Python 3.11+ is required. Install Python and tick Add Python to PATH.
 pause
 exit /b 1
)
echo Installing MediaPipe for BURKESHOT Coach 33-point pose tracking...
%PY% -m pip install --user mediapipe
if errorlevel 1 (
 echo.
 echo MediaPipe could not be installed for this Python version.
 echo BURKESHOT Coach will still run in motion-only mode.
 echo If needed, install Python 3.11 or 3.12 and run this installer again.
 pause
 exit /b 1
)
echo.
echo Coach engine installed successfully.
pause
