@echo off
title Trust Lite - Iniciando Sistema
color 0A
cls

echo.
echo  ████████╗██████╗ ██╗   ██╗███████╗████████╗    ██╗     ██╗████████╗███████╗
echo  ╚══██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝    ██║     ██║╚══██╔══╝██╔════╝
echo     ██║   ██████╔╝██║   ██║███████╗   ██║       ██║     ██║   ██║   █████╗
echo     ██║   ██╔══██╗██║   ██║╚════██║   ██║       ██║     ██║   ██║   ██╔══╝
echo     ██║   ██║  ██║╚██████╔╝███████║   ██║       ███████╗██║   ██║   ███████╗
echo     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝       ╚══════╝╚═╝   ╚═╝   ╚══════╝
echo.
echo  ============================================================
echo   Sistema de Colaboracion Comunitaria - Trust Lite v0.1
echo  ============================================================
echo.

:: Obtener la IP de red local (WiFi/LAN)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set NETWORK_IP=%%a
    goto :found_ip
)
:found_ip
:: Limpiar el espacio inicial de la IP
set NETWORK_IP=%NETWORK_IP: =%

echo  Detectando IP de red...
if "%NETWORK_IP%"=="" (
    echo  [!] No se detecto una IP de red WiFi/LAN.
    echo      El sistema solo estara disponible en este equipo.
    set NETWORK_IP=localhost
) else (
    echo  [OK] IP de red local: %NETWORK_IP%
)

echo.
echo  ============================================================
echo   Verificando requisitos...
echo  ============================================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no encontrado. Por favor instala Node.js desde:
    echo          https://nodejs.org
    pause
    exit /b 1
)
for /f %%v in ('node --version') do echo  [OK] Node.js %%v detectado

:: Verificar MySQL
mysql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] MySQL no detectado en PATH. Asegurate que el servidor MySQL este corriendo.
) else (
    for /f "tokens=*" %%v in ('mysql --version') do echo  [OK] %%v
)

echo.
echo  ============================================================
echo   Instalando dependencias (si es necesario)...
echo  ============================================================
echo.

:: Instalar dependencias del backend si no existen
if not exist "%~dp0backend\node_modules\" (
    echo  Instalando dependencias del Backend...
    cd /d "%~dp0backend"
    call npm install
) else (
    echo  [OK] Dependencias del Backend ya instaladas.
)

:: Instalar dependencias del frontend si no existen
if not exist "%~dp0frontend\node_modules\" (
    echo  Instalando dependencias del Frontend...
    cd /d "%~dp0frontend"
    call npm install
) else (
    echo  [OK] Dependencias del Frontend ya instaladas.
)

echo.
echo  ============================================================
echo   Iniciando servidores...
echo  ============================================================
echo.

:: Iniciar Backend en ventana separada
echo  Iniciando Backend (Puerto 3000)...
start "Trust Lite - BACKEND :3000" cmd /k "title Trust Lite - BACKEND :3000 & color 0B & cd /d "%~dp0backend" & echo. & echo  [BACKEND] Iniciando en puerto 3000... & echo. & npm run dev"

:: Esperar 3 segundos para que el backend arranque primero
timeout /t 3 /nobreak >nul

:: Iniciar Frontend en ventana separada
echo  Iniciando Frontend (Puerto 5173)...
start "Trust Lite - FRONTEND :5173" cmd /k "title Trust Lite - FRONTEND :5173 & color 09 & cd /d "%~dp0frontend" & echo. & echo  [FRONTEND] Iniciando en puerto 5173... & echo. & npm run dev"

:: Esperar que Vite arranque
timeout /t 4 /nobreak >nul

echo.
echo  ============================================================
echo   *** SISTEMA INICIADO CORRECTAMENTE ***
echo  ============================================================
echo.
echo   Acceso LOCAL  (este equipo):
echo     Frontend  ^>  http://localhost:5173
echo     Backend   ^>  http://localhost:3000
echo.
if not "%NETWORK_IP%"=="localhost" (
    echo   Acceso en RED WiFi/LAN (otros dispositivos):
    echo     Frontend  ^>  http://%NETWORK_IP%:5173
    echo     Backend   ^>  http://%NETWORK_IP%:3000
    echo.
)
echo   Abriendo en el navegador...
echo.
echo  ============================================================
echo   Cierra las ventanas de Backend y Frontend para detener.
echo   Puedes cerrar ESTA ventana de forma segura.
echo  ============================================================
echo.

:: Abrir el navegador automaticamente
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

pause
