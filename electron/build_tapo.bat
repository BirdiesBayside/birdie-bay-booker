@echo off
REM Build tapo_control.py into a standalone .exe using PyInstaller
REM This .exe includes Python runtime - no separate Python install needed

echo Installing PyInstaller...
py -m pip install pyinstaller --quiet

echo Building tapo_control.exe...
py -m PyInstaller --onefile --distpath . --workpath build_temp --specpath build_temp --clean --noconfirm tapo_control.py

echo Cleaning up build files...
rmdir /s /q build_temp 2>nul

echo Done! tapo_control.exe created.
pause
