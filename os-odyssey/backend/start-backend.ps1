$ErrorActionPreference = 'Stop'

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendDir

$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    $pythonArgs = $null

    if ($launcher) {
        foreach ($version in @('3.11', '3.12')) {
            & $launcher.Source "-$version" --version *> $null
            if ($LASTEXITCODE -eq 0) {
                $pythonArgs = @("-$version")
                break
            }
        }
    }

    if ($null -eq $pythonArgs) {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if ($python) {
            $versionText = & $python.Source --version 2>&1
            if ($versionText -match 'Python 3\.(11|12)\.') {
                $pythonArgs = @()
                $launcher = $python
            }
        }
    }

    if ($null -eq $pythonArgs) {
        throw 'Python 3.11 or 3.12 is required. Install one, then run this script again.'
    }

    Write-Host 'Creating the backend virtual environment (.venv)...' -ForegroundColor Cyan
    if ($launcher.Name -eq 'py.exe' -or $launcher.Name -eq 'py') {
        & $launcher.Source @pythonArgs -m venv .venv
    } else {
        & $launcher.Source -m venv .venv
    }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the backend virtual environment.' }
}

$requirements = Join-Path $backendDir 'requirements.txt'
$marker = Join-Path $backendDir '.venv\.requirements.sha256'
$requirementsHash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
$installedHash = if (Test-Path $marker) { (Get-Content -LiteralPath $marker -Raw).Trim() } else { '' }

if ($installedHash -ne $requirementsHash) {
    Write-Host 'Installing backend requirements...' -ForegroundColor Cyan
    & $venvPython -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and retry.' }
    Set-Content -LiteralPath $marker -Value $requirementsHash -NoNewline
}

Write-Host 'Starting OS Odyssey API at http://localhost:4000 ...' -ForegroundColor Green
& $venvPython server.py
exit $LASTEXITCODE
