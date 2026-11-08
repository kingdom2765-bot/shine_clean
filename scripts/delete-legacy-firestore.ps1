param(
  [Parameter(Mandatory=$true)][string]$InventoryPath,
  [Parameter(Mandatory=$true)][string]$ConfirmProject
)
$ErrorActionPreference = 'Stop'
$firebaseProject = 'trading-dashboard-480711'
if ($ConfirmProject -ne $firebaseProject) { throw 'Project confirmation does not match.' }
$firebaseWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$firebaseBackupRoot = [IO.Path]::GetFullPath((Join-Path $firebaseWorkspace 'backups/firebase')) + [IO.Path]::DirectorySeparatorChar
$firebaseInventoryPath = (Resolve-Path -LiteralPath $InventoryPath).Path
if (-not $firebaseInventoryPath.StartsWith($firebaseBackupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Inventory must be inside this workspace backup directory.' }
$firebaseInventory = Get-Content -LiteralPath $firebaseInventoryPath -Raw | ConvertFrom-Json -DateKind String
$firebaseBackupFile = (Resolve-Path -LiteralPath $firebaseInventory.file).Path
if (-not $firebaseBackupFile.StartsWith($firebaseBackupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path is outside the expected directory.' }
if ((Get-FileHash -LiteralPath $firebaseBackupFile -Algorithm SHA256).Hash -ne $firebaseInventory.sha256) { throw 'Backup checksum verification failed.' }
$firebaseBackup = Get-Content -LiteralPath $firebaseBackupFile -Raw | ConvertFrom-Json -DateKind String
if ($firebaseBackup.projectId -ne $firebaseProject -or $firebaseBackup.database -ne '(default)') { throw 'Backup belongs to another database.' }
$firebasePrefix = 'projects/' + $firebaseProject + '/databases/(default)/documents/'
$firebaseDocuments = @($firebaseBackup.documents | Where-Object createTime)
if ($firebaseDocuments.Count -ne $firebaseInventory.documentCount -or $firebaseDocuments.Count -ne 38) { throw 'Unexpected deletion count; inspect a fresh backup first.' }
$firebaseWrites = foreach ($firebaseDocument in $firebaseDocuments) {
  if (-not $firebaseDocument.name.StartsWith($firebasePrefix, [StringComparison]::Ordinal)) { throw 'Document project does not match.' }
  $firebaseRelative = $firebaseDocument.name.Substring($firebasePrefix.Length)
  if (($firebaseRelative.Split('/')[0]) -notin @('assets','master_data','settings')) { throw 'Document outside approved legacy collections.' }
  if (-not $firebaseDocument.updateTime) { throw 'Missing update-time precondition.' }
  @{delete=$firebaseDocument.name; currentDocument=@{updateTime=$firebaseDocument.updateTime}}
}
$firebaseToken = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$firebaseHeaders = @{Authorization="Bearer $firebaseToken"; 'x-goog-user-project'=$firebaseProject}
$firebasePendingWrites = foreach ($firebaseWrite in $firebaseWrites) {
  try {
    $firebaseLiveResponse = Invoke-WebRequest -Uri ('https://firestore.googleapis.com/v1/' + $firebaseWrite.delete) -Headers $firebaseHeaders
    $firebaseLiveDocument = $firebaseLiveResponse.Content | ConvertFrom-Json -DateKind String
    if ($firebaseLiveDocument.updateTime -ne $firebaseWrite.currentDocument.updateTime) { throw 'Document changed since backup; create a new backup before deletion.' }
    $firebaseWrite
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { continue }
    throw
  }
}
if (@($firebasePendingWrites).Count -eq 0) {
  Write-Output 'All backed-up legacy documents are already absent. Nothing deleted.'
  exit 0
}
$firebaseBody = @{writes=@($firebasePendingWrites)} | ConvertTo-Json -Depth 10
$firebaseResult = Invoke-RestMethod -Method Post -Uri ('https://firestore.googleapis.com/v1/' + $firebasePrefix.TrimEnd('/') + ':commit') -Headers $firebaseHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($firebaseBody))
Write-Output ('Deleted legacy documents: ' + @($firebasePendingWrites).Count)
Write-Output ('Commit time: ' + $firebaseResult.commitTime)
