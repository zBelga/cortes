@echo off
echo ========================================
echo  ClipForge - Instalando dependencias
echo ========================================

echo.
echo [1/4] Ativando pnpm via corepack...
corepack enable
corepack prepare pnpm@9 --activate
if errorlevel 1 (
  echo Corepack falhou. Tentando npm install -g pnpm...
  npm install -g pnpm@9
)

echo.
echo [2/4] Instalando yt-dlp...
winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo winget falhou. Baixando yt-dlp manualmente...
  powershell -Command "Invoke-WebRequest -Uri https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -OutFile '%ProgramFiles%\yt-dlp\yt-dlp.exe'"
)

echo.
echo [3/4] Instalando dependencias do projeto (pnpm install)...
cd /d "%~dp0"
call pnpm install

echo.
echo [4/4] Gerando cliente Prisma...
cd /d "%~dp0backend"
call pnpm exec prisma generate

echo.
echo ========================================
echo  Tudo pronto!
echo ========================================
pause
