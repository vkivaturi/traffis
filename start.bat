@echo off
setlocal enabledelayedexpansion

title Traffis Launcher

:: Determine project root directory
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

:: Resolve SUMO_HOME on Windows if not already set
if not defined SUMO_HOME (
    if exist "C:\Program Files (x86)\Eclipse\Sumo" (
        set "SUMO_HOME=C:\Program Files (x86)\Eclipse\Sumo"
    ) else if exist "C:\Program Files\Eclipse\Sumo" (
        set "SUMO_HOME=C:\Program Files\Eclipse\Sumo"
    ) else if exist "%LOCALAPPDATA%\Programs\Eclipse\Sumo" (
        set "SUMO_HOME=%LOCALAPPDATA%\Programs\Eclipse\Sumo"
    )
)

if defined SUMO_HOME (
    set "PATH=%SUMO_HOME%\bin;%PATH%"
)

echo ==================================================
echo     TRAFFIS: Real-Time SUMO Traffic Simulation    
echo ==================================================
if defined SUMO_HOME (
    echo SUMO_HOME: %SUMO_HOME%
) else (
    echo [WARNING] SUMO_HOME is not set. Ensure SUMO is in your system PATH.
)

:: Locate Python executable (check virtual environment first)
set "PYTHON_EXE="
if exist "%PROJECT_ROOT%\backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%\backend\.venv\Scripts\python.exe"
) else if exist "%PROJECT_ROOT%\backend\.venv\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%\backend\.venv\python.exe"
) else (
    where python >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_EXE=python"
    ) else (
        where py >nul 2>&1
        if not errorlevel 1 (
            set "PYTHON_EXE=py -3"
        )
    )
)

if not defined PYTHON_EXE (
    echo [ERROR] Python not found! Please ensure Python 3.12+ is installed or backend\.venv is configured.
    pause
    exit /b 1
)

:: 1. Compile SUMO Networks if missing
set "REBUILD_NETWORKS=0"
if not exist "%PROJECT_ROOT%\backend\sumo_config\road.net.xml" set "REBUILD_NETWORKS=1"
if not exist "%PROJECT_ROOT%\backend\sumo_config\scenarios\three_way_intersection\intersection.net.xml" set "REBUILD_NETWORKS=1"
if not exist "%PROJECT_ROOT%\backend\sumo_config\scenarios\four_way_intersection\intersection.net.xml" set "REBUILD_NETWORKS=1"
if not exist "%PROJECT_ROOT%\backend\sumo_config\scenarios\gnt_circle\gnt_circle.net.xml" set "REBUILD_NETWORKS=1"
if not exist "%PROJECT_ROOT%\backend\sumo_config\scenarios\gnt_circle_with_traffic_lights\gnt_circle_with_traffic_lights.net.xml" set "REBUILD_NETWORKS=1"
if not exist "%PROJECT_ROOT%\backend\sumo_config\scenarios\nallagandla_junction\nallagandla_junction.net.xml" set "REBUILD_NETWORKS=1"

if "%REBUILD_NETWORKS%"=="1" (
    echo Compiling scenario road networks with netconvert...
    "%PYTHON_EXE%" "%PROJECT_ROOT%\backend\sumo_config\build_network.py"
    if errorlevel 1 (
        echo [ERROR] Failed to compile SUMO road networks.
        pause
        exit /b 1
    )
)

:: 2. Launch FastAPI Backend
echo Starting FastAPI Backend on http://127.0.0.1:8000...
start "Traffis Backend" /D "%PROJECT_ROOT%\backend" "%PYTHON_EXE%" run.py

:: Wait for backend to initialize
timeout /t 2 /nobreak >nul

:: 3. Launch Vite Frontend
echo Starting Vite Frontend on http://127.0.0.1:5173...
start "Traffis Frontend" /D "%PROJECT_ROOT%\frontend" cmd /c "npm run dev -- --host 0.0.0.0 --port 5173"

echo.
echo Traffis is running!
echo   Frontend:    http://localhost:5173
echo   Backend API: http://127.0.0.1:8000
echo   WebSocket:   ws://127.0.0.1:8000/ws
echo.
echo Press any key in this window to stop all Traffis servers...
pause >nul

echo.
echo Stopping Traffis backend, frontend, and SUMO processes...
taskkill /FI "WINDOWTITLE eq Traffis Backend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq Traffis Frontend*" /F /T >nul 2>&1
taskkill /IM sumo.exe /F >nul 2>&1
echo Traffis stopped successfully.
