@echo off
REM ============================================================
REM Birdies Bay Controller Watchdog (single check per run)
REM Called hidden by watchdog.vbs every minute from Task Scheduler
REM ("Birdies Bay Controller Watchdog Silent"). The task is created
REM by the installer and re-verified by the app on every launch.
REM Do NOT add a loop - Task Scheduler handles the repeat.
REM ============================================================
setlocal enabledelayedexpansion
set "PROCESS_NAME=Birdies Bay Controller.exe"
set "APP_PATH="

REM Resolve the exe at runtime - never hardcode a Windows username.
if exist "%LOCALAPPDATA%\Programs\birdies-bay-controller\%PROCESS_NAME%" set "APP_PATH=%LOCALAPPDATA%\Programs\birdies-bay-controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%LOCALAPPDATA%\Programs\Birdies Bay Controller\%PROCESS_NAME%" set "APP_PATH=%LOCALAPPDATA%\Programs\Birdies Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles%\Birdies Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles%\Birdies Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles(x86)%\Birdies Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles(x86)%\Birdies Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%~dp0..\%PROCESS_NAME%" set "APP_PATH=%~dp0..\%PROCESS_NAME%"
if not defined APP_PATH (
  for /d %%U in ("%SystemDrive%\Users\*") do (
    if not defined APP_PATH if exist "%%~fU\AppData\Local\Programs\birdies-bay-controller\%PROCESS_NAME%" set "APP_PATH=%%~fU\AppData\Local\Programs\birdies-bay-controller\%PROCESS_NAME%"
  )
)

tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>NUL | find /I "%PROCESS_NAME%" >NUL
if %ERRORLEVEL% EQU 0 goto :eof

if defined APP_PATH start "" "%APP_PATH%" --hidden
