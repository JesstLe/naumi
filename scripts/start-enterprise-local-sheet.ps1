param([Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if((Resolve-Path -LiteralPath $root).Path -ne 'E:\Workspace\naumi-enterprise-workflow-20261016'){throw 'LOCAL_WORKTREE_MISMATCH'}
$out=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not $out.StartsWith('E:\Workspace\naumi\output\enterprise-sheet-crud-g58-20261019\',[StringComparison]::OrdinalIgnoreCase)){throw 'EVIDENCE_DIRECTORY_MISMATCH'}
New-Item -ItemType Directory -Force -Path $out | Out-Null
$config=Join-Path $root 'data/enterprise-sheet-workspace/connection.json'
if(-not (Test-Path -LiteralPath $config)){throw 'LOCAL_COPY_NOT_PREPARED'}
$node=(Get-Command node).Source
foreach($port in @(18482,18494)){
 $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
 if($listeners.Count -gt 1){throw 'AMBIGUOUS_LISTENER'}
 if($listeners.Count){
  if($listeners[0].LocalAddress -ne '127.0.0.1'){throw 'NONLOCAL_LISTENER'}
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
  $pattern=if($port -eq 18482){'scripts[/\\]serve-enterprise-product\.mjs 18482 18491'}else{'services[/\\]enterprise-workflow[/\\]tools[/\\]import-local\.ts serve data[/\\]enterprise-(local-import|sheet-workspace)'}
  if($p.ExecutablePath -ne $node -or $p.CommandLine -notmatch $pattern){throw 'LOCAL_PROCESS_IDENTITY_CHANGED'}
 }
}
# Both identities have been checked before either is stopped. No server/SSH command.
foreach($port in @(18482,18494)){
 $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
 if($listeners.Count){Stop-Process -Id $listeners[0].OwningProcess;Wait-Process -Id $listeners[0].OwningProcess -Timeout 10 -ErrorAction SilentlyContinue}
}
$api=Start-Process -FilePath $node -ArgumentList @('--import','tsx','services/enterprise-workflow/tools/import-local.ts','serve','data/enterprise-sheet-workspace') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $out 'data.stdout.log') -RedirectStandardError (Join-Path $out 'data.stderr.log') -PassThru
$web=Start-Process -FilePath $node -ArgumentList @('scripts/serve-enterprise-product.mjs','18482','18491','data/enterprise-sheet-workspace/connection.json') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $out 'web.stdout.log') -RedirectStandardError (Join-Path $out 'web.stderr.log') -PassThru
$ready=$false
for($i=0;$i -lt 30;$i++){
 try{
  $null=Invoke-WebRequest 'http://127.0.0.1:18482/api/enterprise/imports?action=session' -SessionVariable sheetSession -TimeoutSec 2
  $r=Invoke-RestMethod 'http://127.0.0.1:18482/api/enterprise/imports?action=context' -WebSession $sheetSession -TimeoutSec 2
  if(@($r.batches).Count -gt 0){$source=$r.batches[0].sourceHash;$sheet=Invoke-RestMethod "http://127.0.0.1:18482/api/enterprise/imports?action=worksheet&source=$source" -WebSession $sheetSession -TimeoutSec 3;if(@($sheet.document.rows).Count -eq 364){$ready=$true;break}}
 }catch{}
 Start-Sleep -Milliseconds 200
}
if(-not $ready){throw 'LOCAL_SHEET_NOT_READY'}
@{productPid=$web.Id;dataPid=$api.Id;port=18482;sourceRows=@($sheet.document.rows).Count;worksheetVersion=$sheet.version;independentLocalDatabase=$true;productionConnections=0}|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $out 'LOCAL_READY.json')
Write-Output 'LOCAL_SHEET_ENTRY_READY: port=18482 rows=364 independent_local_database=1 original_source_writes=0 production_connections=0'
