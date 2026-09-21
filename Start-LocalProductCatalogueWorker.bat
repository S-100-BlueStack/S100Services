@echo off
setlocal

rem This BAT file is intended to be placed in the repository root.
set "SCRIPT=%~dp0src\ProductCatalogueAPI\scripts\Manage-LocalProductCatalogueWorker.ps1"

if not exist "%SCRIPT%" (
    echo ERROR: Could not find the worker script:
    echo %SCRIPT%
    pause
    exit /b 1
)

echo Starting the local Product Catalogue worker...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo Worker exited with code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
