$ErrorActionPreference = 'Stop'
# Compile the local rules source using the existing project. Never create a ruleset or release.
$analyticsRulesProject = 'trading-dashboard-480711'
$analyticsRulesRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$analyticsRulesSource = [IO.File]::ReadAllText((Join-Path $analyticsRulesRoot 'firestore.rules'))
$analyticsRulesToken = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$analyticsRulesHeaders = @{Authorization="Bearer $analyticsRulesToken"; 'x-goog-user-project'=$analyticsRulesProject}
$analyticsRulesBody = @{source=@{files=@(@{name='firestore.rules';content=$analyticsRulesSource})}} | ConvertTo-Json -Depth 10
$analyticsRulesResult = Invoke-RestMethod -Method Post -Uri ('https://firebaserules.googleapis.com/v1/projects/' + $analyticsRulesProject + ':test') -Headers $analyticsRulesHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($analyticsRulesBody))
$analyticsRulesErrors = @($analyticsRulesResult.issues | Where-Object severity -eq 'ERROR')
if ($analyticsRulesErrors.Count) { throw ($analyticsRulesErrors | ConvertTo-Json -Depth 10) }
Write-Output 'Firestore rules compilation passed. No rules deployed.'
