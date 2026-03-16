@echo off
echo Skool Dumper Server
echo -------------------
echo Assicurati di avere Python, yt-dlp e ffmpeg installati.
echo I file verranno salvati in %USERPROFILE%\Desktop\SkoolDump
echo.
python "%~dp0skool-server.py"
pause
