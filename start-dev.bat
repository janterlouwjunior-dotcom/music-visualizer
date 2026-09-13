@echo off
title Music Theory Visualizer - Dev
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies, this only happens once...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed - see the error above.
    pause
    exit /b 1
  )
)

echo Starting Music Theory Visualizer in dev mode...
call npm run dev

if errorlevel 1 (
  echo.
  echo The app exited with an error - see above.
  pause
)
