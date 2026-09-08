@echo off
setlocal
cd /d "%~dp0"
title BURKESHOT Camera Engine Installer
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
 echo Python 3.11+ is required. Install Python and tick Add Python to PATH.
 pause
 exit /b 1
)
echo Installing OpenCV and NumPy for iPhone video analysis...
%PY% -m pip install --user opencv-python-headless numpy
if errorlevel 1 (
 echo Installation failed. Check your internet connection and Python setup.
 pause
 exit /b 1
)
echo.
echo Camera engine installed successfully.
pause
