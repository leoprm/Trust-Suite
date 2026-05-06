@echo off
echo Iniciando servidores para Trust Lite...
start cmd /k "cd backend && npm run dev"
start cmd /k "cd frontend && npm run dev"
echo Servidores iniciados en segundo plano.
pause
