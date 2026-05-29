$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root ".venv\Scripts\python.exe"
$backend = Join-Path $root "backend\main.py"

if (-not (Test-Path $python)) {
    Write-Error "Environnement virtuel introuvable. Creez-le : python -m venv .venv"
}

# Liberer le port 8000 si un ancien serveur tourne encore
$procIds = (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
foreach ($procId in $procIds) {
    if ($procId) {
        Write-Host "Ancien serveur arrete (PID $procId, port 8000)..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}
if ($procIds) { Start-Sleep -Seconds 1 }

Write-Host "Demarrage du backend LegalTech..."
& $python $backend
