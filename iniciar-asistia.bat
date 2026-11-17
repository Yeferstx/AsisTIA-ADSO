@echo off
title AsistIA SENA
echo ==========================================
echo    AsistIA SENA - Ficha 3237831
echo ==========================================
echo.
echo Antes de seguir revisa que:
echo  1. La zona wifi del celular este prendida
echo  2. La maqueta este conectada (cargador 5V y USB del ESP32)
echo.
pause

echo Prendiendo el servidor (bot de Telegram y pagina)...
start "SERVIDOR AsistIA" cmd /k "cd /d %~dp0servidor && npm run start:dev"

echo Esperando a que arranque el servidor...
timeout /t 15 /nobreak > nul

echo Prendiendo la camara...
start "CAMARA AsistIA" cmd /k "cd /d %~dp0reconocimiento && venv\Scripts\python.exe reconocer.py"

echo Abriendo la pagina...
start http://localhost:3000

echo.
echo Listo. No cierres las ventanas SERVIDOR AsistIA ni CAMARA AsistIA.
pause
