@echo off
rem soundtube - lancer l agent dans une console (essai ou depannage). Service normal : tache planifiee soundtube-node.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js introuvable : lancez install-windows.ps1 & pause & exit /b 1)
node agent.mjs %*
pause
