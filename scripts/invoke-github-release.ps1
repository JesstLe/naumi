param(
  [Parameter(Mandatory)][ValidateSet('Build','Fetch')][string]$Mode,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit,
  [string]$WorkflowRef='main',
  [switch]$Offline,
  [string]$ReleaseTag,
  [string]$Directory
)
# Reuse this repository's existing Git Credential Manager identity in memory.
# No new PAT, auth-store change, output of credentials, or server credential copy.
$ErrorActionPreference='Stop'
$taskRepoRoot=Split-Path -Parent $PSScriptRoot
$taskPreviousToken=$env:GH_TOKEN
$taskCredentialLines=$null
$taskCredentialPassword=$null
try {
  $taskCredentialLines=@('protocol=https','host=github.com','path=JesstLe/naumi.git','') |
    git -C $taskRepoRoot -c credential.interactive=false credential fill
  if($LASTEXITCODE -ne 0){throw 'Existing repository credential unavailable; use the signed-in GitHub workflow page.'}
  $taskCredentialPassword=($taskCredentialLines | Where-Object { $_.StartsWith('password=') }) -replace '^password=',''
  if(-not $taskCredentialPassword){throw 'No existing repository credential.'}
  $env:GH_TOKEN=$taskCredentialPassword
  if($Mode -eq 'Build') {
    if($WorkflowRef -notmatch '^[A-Za-z0-9/_-]+$'){throw 'Invalid workflow branch/ref.'}
    $taskOfflineValue=if($Offline){'true'}else{'false'}
    & gh workflow run docker.yml --repo JesstLe/naumi --ref $WorkflowRef -f "source_commit=$SourceCommit" -f build_all=true -f "offline_bundle=$taskOfflineValue"
  } else {
    if(-not $ReleaseTag -or -not $Directory){throw 'Fetch requires ReleaseTag and a new empty Directory.'}
    $taskArgs=@((Join-Path $PSScriptRoot 'github-release-manifest.py'),'fetch','--tag',$ReleaseTag,'--expected-sha',$SourceCommit,'--directory',$Directory)
    if($Offline){$taskArgs+='--offline'}
    & python @taskArgs
  }
  if($LASTEXITCODE -ne 0){throw "GitHub release operation failed: $LASTEXITCODE"}
} finally {
  $env:GH_TOKEN=$taskPreviousToken
  $taskCredentialLines=$null
  $taskCredentialPassword=$null
}
