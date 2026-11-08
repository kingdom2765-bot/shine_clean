$ErrorActionPreference = 'Stop'
$firebaseRulesProject = 'trading-dashboard-480711'
$firebaseRulesRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$firebaseRulesSource = [IO.File]::ReadAllText((Join-Path $firebaseRulesRoot 'firestore.rules'))
$firebaseRulesToken = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$firebaseRulesHeaders = @{Authorization="Bearer $firebaseRulesToken"; 'x-goog-user-project'=$firebaseRulesProject}
$firebaseRulesApi = 'https://firebaserules.googleapis.com/v1/projects/' + $firebaseRulesProject
$firebaseRulesFiles = @{files=@(@{name='firestore.rules';content=$firebaseRulesSource})}
$firebaseRulesTestBody = @{source=$firebaseRulesFiles} | ConvertTo-Json -Depth 10
$firebaseRulesTest = Invoke-RestMethod -Method Post -Uri ($firebaseRulesApi + ':test') -Headers $firebaseRulesHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($firebaseRulesTestBody))
if (@($firebaseRulesTest.issues | Where-Object severity -eq 'ERROR').Count) { throw ($firebaseRulesTest.issues | ConvertTo-Json -Depth 10) }
$firebaseRulesPrevious = Invoke-RestMethod -Uri ($firebaseRulesApi + '/releases/cloud.firestore') -Headers $firebaseRulesHeaders
$firebaseRulesBackupDir = Join-Path $firebaseRulesRoot 'backups/firebase'
New-Item -ItemType Directory -Path $firebaseRulesBackupDir -Force | Out-Null
$firebaseRulesPrevious | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $firebaseRulesBackupDir ('release-before-admin-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'))
$firebaseRulesCreateBody = @{source=$firebaseRulesFiles} | ConvertTo-Json -Depth 10
$firebaseRulesCreated = Invoke-RestMethod -Method Post -Uri ($firebaseRulesApi + '/rulesets') -Headers $firebaseRulesHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($firebaseRulesCreateBody))
$firebaseRulesReleaseBody = @{release=@{name=('projects/' + $firebaseRulesProject + '/releases/cloud.firestore');rulesetName=$firebaseRulesCreated.name};updateMask='rulesetName'} | ConvertTo-Json -Depth 5
$firebaseRulesReleased = Invoke-RestMethod -Method Patch -Uri ($firebaseRulesApi + '/releases/cloud.firestore') -Headers $firebaseRulesHeaders -ContentType 'application/json' -Body $firebaseRulesReleaseBody
Write-Output ('Deployed ruleset: ' + $firebaseRulesReleased.rulesetName)
