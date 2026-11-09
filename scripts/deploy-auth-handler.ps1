$ErrorActionPreference = 'Stop'
$authDeployProject = 'trading-dashboard-480711'
$authDeployRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$authDeployToken = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google Cloud authentication failed.' }
$authDeployHeaders = @{Authorization="Bearer $authDeployToken"; 'x-goog-user-project'=$authDeployProject}
$authDeployApi = 'https://firebasehosting.googleapis.com/v1beta1/'
$authDeploySite = 'sites/' + $authDeployProject
$authDeployPrevious = Invoke-RestMethod -Uri ($authDeployApi + $authDeploySite + '/releases?pageSize=1') -Headers $authDeployHeaders
if (@($authDeployPrevious.releases | Where-Object version).Count) { throw 'Site already has a release. Review its contents before replacing it.' }
$authDeployFiles = @{}
$authDeployBytes = @{}
foreach ($authDeployFile in @('auth-action.html','auth-action.js','auth-action.css')) {
  $authDeployRaw = [IO.File]::ReadAllBytes((Join-Path $authDeployRoot ('auth-hosting/' + $authDeployFile)))
  $authDeployMemory = [IO.MemoryStream]::new()
  $authDeployGzip = [IO.Compression.GZipStream]::new($authDeployMemory, [IO.Compression.CompressionLevel]::Optimal, $true)
  $authDeployGzip.Write($authDeployRaw,0,$authDeployRaw.Length); $authDeployGzip.Dispose()
  $authDeployCompressed = $authDeployMemory.ToArray(); $authDeployMemory.Dispose()
  $authDeployHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($authDeployCompressed)).ToLowerInvariant()
  $authDeployFiles['/' + $authDeployFile] = $authDeployHash
  $authDeployBytes[$authDeployHash] = $authDeployCompressed
}
$authDeployCsp = "default-src 'none'; script-src 'self' https://www.gstatic.com; style-src 'self'; connect-src https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
$authDeployConfig = @{config=@{headers=@(@{glob='**';headers=@{'Cache-Control'='no-store';'Referrer-Policy'='no-referrer';'X-Content-Type-Options'='nosniff';'Content-Security-Policy'=$authDeployCsp}})}} | ConvertTo-Json -Depth 10
$authDeployVersion = Invoke-RestMethod -Method Post -Uri ($authDeployApi + $authDeploySite + '/versions') -Headers $authDeployHeaders -ContentType 'application/json' -Body $authDeployConfig
$authDeployPopulation = Invoke-RestMethod -Method Post -Uri ($authDeployApi + $authDeployVersion.name + ':populateFiles') -Headers $authDeployHeaders -ContentType 'application/json' -Body (@{files=$authDeployFiles} | ConvertTo-Json -Depth 5)
foreach ($authDeployRequired in $authDeployPopulation.uploadRequiredHashes) {
  Invoke-RestMethod -Method Post -Uri ($authDeployPopulation.uploadUrl + '/' + $authDeployRequired) -Headers $authDeployHeaders -ContentType 'application/octet-stream' -Body $authDeployBytes[$authDeployRequired] | Out-Null
}
Invoke-RestMethod -Method Patch -Uri ($authDeployApi + $authDeployVersion.name + '?updateMask=status') -Headers $authDeployHeaders -ContentType 'application/json' -Body '{"status":"FINALIZED"}' | Out-Null
$authDeployRelease = Invoke-RestMethod -Method Post -Uri ($authDeployApi + $authDeploySite + '/releases?versionName=' + $authDeployVersion.name) -Headers $authDeployHeaders -ContentType 'application/json' -Body '{}'
Write-Output ('Published authentication handler: ' + $authDeployRelease.name)
