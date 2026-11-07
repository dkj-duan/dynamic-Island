@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

for /f %%v in ('node -p "require('./package.json').version" 2^>nul') do set CURRENT=%%v
if "%CURRENT%"=="" set CURRENT=0.1.0

echo Current version: %CURRENT%
set /p VERSION=Version to package (Enter = %CURRENT%): 
if "%VERSION%"=="" set VERSION=%CURRENT%

node scripts\build-installer.mjs %VERSION%
pause
