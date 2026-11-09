param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$robotsDeployRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$robotsDeployConfig = Get-Content -LiteralPath (Join-Path $robotsDeployRoot 'site.config.json') -Raw | ConvertFrom-Json
$robotsDeployBase = [uri]$robotsDeployConfig.siteUrl
if ($robotsDeployBase.Host -ne 'kingdom2765-bot.github.io') { throw 'This helper is only for the current GitHub Pages host.' }
$robotsDeployContent = "User-agent: OAI-SearchBot`nAllow: /`n`nUser-agent: *`nAllow: /`n`nSitemap: $($robotsDeployBase.AbsoluteUri)sitemap.xml`n"
[IO.File]::WriteAllText((Join-Path $robotsDeployRoot 'deployment/host-root/robots.txt'), $robotsDeployContent)
# Reuse the existing GitHub sign-in; never print or persist credentials.
$env:GCM_INTERACTIVE = 'Never'
$robotsDeployCredentialText = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
if ($LASTEXITCODE -ne 0) { throw 'No saved GitHub credential is available. Sign in to GitHub before deploying.' }
$robotsDeployCredential = @{}
foreach ($robotsDeployLine in $robotsDeployCredentialText) {
  if ($robotsDeployLine -match '^([^=]+)=(.*)$') { $robotsDeployCredential[$Matches[1]] = $Matches[2] }
}
if (!$robotsDeployCredential.password) { throw 'GitHub authentication is unavailable.' }
$robotsDeployHeaders = @{ Authorization = ('Bearer ' + $robotsDeployCredential.password); Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
function Invoke-RobotsGitHub([string]$Path, [string]$Method = 'GET', $Payload = $null) {
  $robotsRequest = @{ Uri = ('https://api.github.com' + $Path); Method = $Method; Headers = $robotsDeployHeaders; SkipHttpErrorCheck = $true }
  if ($null -ne $Payload) { $robotsRequest.ContentType = 'application/json; charset=utf-8'; $robotsRequest.Body = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 8)) }
  $robotsResponse = Invoke-WebRequest @robotsRequest
  $robotsValue = if ($robotsResponse.Content) { $robotsResponse.Content | ConvertFrom-Json } else { $null }
  return @{ Status = [int]$robotsResponse.StatusCode; Data = $robotsValue }
}
$robotsDeployUser = Invoke-RobotsGitHub '/user'
if ($robotsDeployUser.Status -ne 200 -or $robotsDeployUser.Data.login -ne 'kingdom2765-bot') { throw 'Expected GitHub account kingdom2765-bot.' }
$robotsDeployRepository = '/repos/kingdom2765-bot/kingdom2765-bot.github.io'
$robotsDeployRepo = Invoke-RobotsGitHub $robotsDeployRepository
if (!$Apply) { Write-Output "Root robots deployment ready. Repository status: $($robotsDeployRepo.Status). No remote changes made."; exit }
if ($robotsDeployRepo.Status -eq 404) {
  $robotsDeployRepo = Invoke-RobotsGitHub '/user/repos' 'POST' @{ name = 'kingdom2765-bot.github.io'; description = 'Host-level crawler policy for GitHub Pages'; private = $false; auto_init = $true }
  if ($robotsDeployRepo.Status -ne 201) { throw "Root repository creation failed (HTTP $($robotsDeployRepo.Status))." }
} elseif ($robotsDeployRepo.Status -ne 200) { throw "Root repository read failed (HTTP $($robotsDeployRepo.Status))." }
$robotsDeployBranch = $robotsDeployRepo.Data.default_branch
$robotsDeployExisting = Invoke-RobotsGitHub ($robotsDeployRepository + '/contents/robots.txt')
if ($robotsDeployExisting.Status -eq 404) {
  $robotsDeployWrite = Invoke-RobotsGitHub ($robotsDeployRepository + '/contents/robots.txt') 'PUT' @{ message = 'Publish host-level crawler policy and Shine Clean sitemap'; branch = $robotsDeployBranch; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($robotsDeployContent)) }
  if ($robotsDeployWrite.Status -ne 201) { throw "robots.txt creation failed (HTTP $($robotsDeployWrite.Status))." }
} elseif ($robotsDeployExisting.Status -eq 200) {
  $robotsDeployOld = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($robotsDeployExisting.Data.content -replace '\s', '')))
  if ($robotsDeployOld.Trim() -ne $robotsDeployContent.Trim()) { throw 'Existing root robots.txt differs. Review existing policies before changing it.' }
} else { throw "robots.txt read failed (HTTP $($robotsDeployExisting.Status))." }
$robotsDeployPages = Invoke-RobotsGitHub ($robotsDeployRepository + '/pages')
if ($robotsDeployPages.Status -eq 404) {
  $robotsDeployPages = Invoke-RobotsGitHub ($robotsDeployRepository + '/pages') 'POST' @{ source = @{ branch = $robotsDeployBranch; path = '/' } }
  if ($robotsDeployPages.Status -ne 201) { throw "Pages setup failed (HTTP $($robotsDeployPages.Status)). robots.txt is saved in the root repository." }
} elseif ($robotsDeployPages.Status -ne 200) { throw "Pages status read failed (HTTP $($robotsDeployPages.Status))." }
Write-Output 'Root crawler policy saved. Check https://kingdom2765-bot.github.io/robots.txt after GitHub Pages finishes publishing.'
