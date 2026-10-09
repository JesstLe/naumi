[CmdletBinding()]
param(
    [ValidateSet('Start', 'Verify', 'Stop')][string]$Mode = 'Start',
    [ValidateSet(13012, 13013)][int]$LocalPort = 13012,
    [string]$PrivateKeyPath = "$env:USERPROFILE\Downloads\_生图.pem",
    [Parameter(Mandatory = $true)][string]$ReceiptDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$hostTarget = 'root@120.27.162.85'
$forward = "127.0.0.1:${LocalPort}:127.0.0.1:13012"
$receiptRoot = [IO.Path]::GetFullPath($ReceiptDirectory)
$receipt = Join-Path $receiptRoot "tunnel-$LocalPort.json"

function Get-OwnedTunnel {
    if (!(Test-Path -LiteralPath $receipt -PathType Leaf)) { return $null }
    $state = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($state.target -ne $hostTarget -or $state.forward -ne $forward) { throw 'TUNNEL_RECEIPT_MISMATCH' }
    $p = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
    if (!$p) { return $null }
    $recordedStart = if ($state.startTimeUtc -is [DateTime]) { $state.startTimeUtc } else {
        [DateTime]::Parse([string]$state.startTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    }
    if ($p.ProcessName -ne 'ssh' -or $p.StartTime.ToUniversalTime().Ticks -ne $recordedStart.ToUniversalTime().Ticks) { throw 'TUNNEL_PID_REUSED' }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)"
    if (!$cim.CommandLine.Contains($hostTarget) -or !$cim.CommandLine.Contains($forward)) { throw 'TUNNEL_PROCESS_MISMATCH' }
    return $p
}

function Assert-TunnelHealth($p) {
    $listeners = @(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].OwningProcess -ne $p.Id) { throw 'TUNNEL_LISTENER_MISMATCH' }
    $http = & curl.exe --noproxy '*' -sS --connect-timeout 3 --max-time 10 -o NUL -w '%{http_code}' "http://127.0.0.1:$LocalPort/api/health"
    if ($LASTEXITCODE -ne 0 -or $http -ne '200') { throw 'TUNNEL_HEALTH_FAILED' }
    Write-Output "STAGING_TUNNEL=PASS LOCAL_ADDRESS=127.0.0.1 LOCAL_PORT=$LocalPort HEALTH=200 PID=$($p.Id)"
}

if ($Mode -eq 'Stop') {
    $p = Get-OwnedTunnel
    if ($p) { Stop-Process -Id $p.Id; $p.WaitForExit(10000) | Out-Null }
    if (@(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue).Count -ne 0) { throw 'TUNNEL_PORT_STILL_OWNED' }
    if (Test-Path -LiteralPath $receipt) { Remove-Item -LiteralPath $receipt }
    Write-Output "STAGING_TUNNEL=STOPPED LOCAL_PORT=$LocalPort SERVICES_CHANGED=0"
    exit 0
}

$existing = Get-OwnedTunnel
if ($existing) { Assert-TunnelHealth $existing; exit 0 }
if ($Mode -eq 'Verify') { throw 'TUNNEL_NOT_RUNNING' }
if (@(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue).Count -ne 0) { throw 'TUNNEL_PORT_ALREADY_USED' }

$source = (Resolve-Path -LiteralPath $PrivateKeyPath).Path
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$sourceAcl = (Get-Acl -LiteralPath $source).Sddl
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('naumi-staging-key-' + [Guid]::NewGuid().ToString('N'))
$key = Join-Path $tempRoot 'key.pem'
$started = $null
$ready = $false
try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $tempRoot /inheritance:r /grant:r "*${sid}:(OI)(CI)(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'TUNNEL_TEMP_ACL_FAILED' }
    Copy-Item -LiteralPath $source -Destination $key
    & icacls.exe $key /inheritance:r /grant:r "*${sid}:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'TUNNEL_KEY_ACL_FAILED' }
    $ssh = (Get-Command ssh.exe).Source
    $arguments = @('-i', ('"' + $key + '"'), '-N', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-L', $forward, $hostTarget)
    $started = Start-Process -FilePath $ssh -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $started.Refresh()
        if ($started.HasExited) { throw 'TUNNEL_SSH_EXITED' }
        $listeners = @(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    Assert-TunnelHealth $started
    [IO.Directory]::CreateDirectory($receiptRoot) | Out-Null
    $state = @{ target=$hostTarget; forward=$forward; processId=$started.Id; startTimeUtc=$started.StartTime.ToUniversalTime().ToString('o') }
    $state | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding utf8
    $ready = $true
} finally {
    if (!$ready -and $started) {
        $started.Refresh()
        if (!$started.HasExited) { Stop-Process -Id $started.Id }
    }
    if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key }
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot }
    if (Test-Path -LiteralPath $key) { throw 'TUNNEL_TEMP_KEY_REMAINS' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $sourceHash -or (Get-Acl -LiteralPath $source).Sddl -ne $sourceAcl) { throw 'TUNNEL_ORIGINAL_KEY_CHANGED' }
    Write-Output 'TEMP_KEY=ABSENT ORIGINAL_HASH=UNCHANGED ORIGINAL_ACL=UNCHANGED'
}
