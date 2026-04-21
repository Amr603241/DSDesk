@echo off
set "TMP_DIR=%TEMP%\DSDeskRuntime_%RANDOM%"
mkdir "%TMP_DIR%"
echo [✓] Extracting DSDesk Professional...
7za.exe x DSDesk_Source.zip -o"%TMP_DIR%" -y >nul
echo [✓] Launching...
start "" "%TMP_DIR%\DSDesk.exe"
exit
