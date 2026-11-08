param()
$ErrorActionPreference = 'Stop'
$firebaseProject = 'trading-dashboard-480711'
$firebaseRoot = 'projects/' + $firebaseProject + '/databases/(default)/documents'
$firebaseToken = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$firebaseHeaders = @{Authorization="Bearer $firebaseToken"; 'x-goog-user-project'=$firebaseProject}
$firebaseTargets = @('assets','master_data','settings')
$firebaseQueue = [System.Collections.Generic.Queue[string]]::new()
foreach ($firebaseTarget in $firebaseTargets) { $firebaseQueue.Enqueue($firebaseTarget) }
$firebaseDocuments = [System.Collections.Generic.List[object]]::new()
$firebaseInventory = [System.Collections.Generic.List[object]]::new()
$firebaseStarted = [DateTime]::UtcNow.ToString('o')
while ($firebaseQueue.Count -gt 0) {
  $firebaseCollection = $firebaseQueue.Dequeue()
  $firebasePageToken = ''
  $firebaseCount = 0
  do {
    $firebaseUri = "https://firestore.googleapis.com/v1/$firebaseRoot/$($firebaseCollection)?pageSize=100&showMissing=true"
    if ($firebasePageToken) { $firebaseUri += '&pageToken=' + [uri]::EscapeDataString($firebasePageToken) }
    $firebasePage = Invoke-RestMethod -Uri $firebaseUri -Headers $firebaseHeaders
    foreach ($firebaseDocument in $firebasePage.documents) {
      $firebaseDocuments.Add($firebaseDocument)
      if ($firebaseDocument.createTime) { $firebaseCount++ }
      $firebaseChildPageToken = ''
      do {
        $firebaseChildBody = @{pageSize=100}
        if ($firebaseChildPageToken) { $firebaseChildBody.pageToken = $firebaseChildPageToken }
        $firebaseChildren = Invoke-RestMethod -Method Post -Uri ('https://firestore.googleapis.com/v1/' + $firebaseDocument.name + ':listCollectionIds') -Headers $firebaseHeaders -ContentType 'application/json' -Body ($firebaseChildBody | ConvertTo-Json)
        foreach ($firebaseChild in $firebaseChildren.collectionIds) {
          $firebaseRelative = $firebaseDocument.name.Substring($firebaseRoot.Length + 1)
          $firebaseQueue.Enqueue($firebaseRelative + '/' + $firebaseChild)
        }
        $firebaseChildPageToken = $firebaseChildren.nextPageToken
      } while ($firebaseChildPageToken)
    }
    $firebasePageToken = $firebasePage.nextPageToken
  } while ($firebasePageToken)
  $firebaseInventory.Add([PSCustomObject]@{collection=$firebaseCollection; documents=$firebaseCount})
}
$firebaseBackupDir = Join-Path $PSScriptRoot ('../backups/firebase/legacy-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $firebaseBackupDir -Force | Out-Null
$firebaseBackupFile = Join-Path $firebaseBackupDir 'firestore-documents.json'
@{projectId=$firebaseProject; database='(default)'; startedAt=$firebaseStarted; completedAt=[DateTime]::UtcNow.ToString('o'); targets=$firebaseTargets; collections=@($firebaseInventory.ToArray()); documents=@($firebaseDocuments.ToArray())} | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $firebaseBackupFile -Encoding utf8
$firebaseChecksum = (Get-FileHash -LiteralPath $firebaseBackupFile -Algorithm SHA256).Hash
$firebaseSummary = @{projectId=$firebaseProject; file=(Resolve-Path -LiteralPath $firebaseBackupFile).Path; sha256=$firebaseChecksum; collections=@($firebaseInventory.ToArray()); documentCount=@($firebaseDocuments | Where-Object createTime).Count}
$firebaseSummary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $firebaseBackupDir 'inventory.json') -Encoding utf8
$firebaseSummary | ConvertTo-Json -Depth 10
