# deps.ps1 - checks dependencies for video-gen

$ok = $true

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "  [MISSING] bun - install from https://bun.sh" -ForegroundColor Red
    $ok = $false
} else {
    Write-Host "  [ok]  bun $(bun --version)" -ForegroundColor Green
}

$key = $env:OPENROUTER_API_KEY
if (-not $key) {
    $envFile = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "..") ".env"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -Raw
        if ($content -match 'OPENROUTER_API_KEY\s*=\s*(.+)') {
            $key = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $key) {
    Write-Host "  [MISSING] OPENROUTER_API_KEY - add to .env in repo root or set as env var" -ForegroundColor Red
    $ok = $false
} else {
    Write-Host "  [ok]  OPENROUTER_API_KEY is set" -ForegroundColor Green
}

if ($ok) {
    Write-Host "  [video-gen] all dependencies satisfied" -ForegroundColor Green
}
