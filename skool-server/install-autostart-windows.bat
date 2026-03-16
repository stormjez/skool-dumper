@echo off
echo Registrazione avvio automatico Skool Dumper...

set SCRIPT_PATH=%~dp0skool-server.py
set PYTHON_PATH=python

schtasks /create /tn "SkoolDumperServer" /tr "\"%PYTHON_PATH%\" \"%SCRIPT_PATH%\"" /sc onlogon /rl highest /f

if %errorlevel% == 0 (
    echo OK - Il server si avviera automaticamente al login.
    echo Per avviarlo subito: esegui start-windows.bat
) else (
    echo Errore nella registrazione. Esegui questo file come Amministratore.
)
pause
