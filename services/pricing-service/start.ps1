$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $workspace
try {
    & node (Join-Path $workspace 'node_modules/tsx/dist/cli.mjs') (Join-Path $PSScriptRoot 'server.ts')
    if ($LASTEXITCODE -ne 0) { throw "定价服务退出码：$LASTEXITCODE" }
} finally { Pop-Location }
