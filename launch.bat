@echo off
set "targetDir=%TEMP%\DSDeskPro"
if not exist "%targetDir%" mkdir "%targetDir%"

echo Loading DSDesk Pro Elite...
powershell -Command "$zip = 'bundle_v1.8.zip'; if (Test-Path $zip) { Expand-Archive -Path $zip -DestinationPath '%targetDir%' -Force }"

echo Launching DSDesk...
cd /d "%targetDir%"
start "" "DSDesk.exe"
exit
