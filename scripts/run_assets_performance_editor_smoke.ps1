param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Wrath of the Mind Lords",
  [string]$ExePath = "F:\Realmz - Providence\src-tauri\target\release\realmz-providence.exe",
  [string]$RunRoot = "",
  [int]$DetailClicks = 3,
  [int]$MaxAssetsOpenMs = 5000,
  [int]$MaxDetailMs = 2500,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "editor_smoke_lib.ps1")

if (-not (Test-Path -LiteralPath $SourceScenarioDir)) {
  throw "Source scenario not found: $SourceScenarioDir"
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Providence release exe not found: $ExePath"
}

if (-not $RunRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\assets-performance-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "WrathAssets.providence"

$script = @{
  version = 1
  mode = "asset-performance"
  name = "assets-performance-editor-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Wrath Assets Performance Smoke"
  projectDir = $projectDir
  detailClicks = $DetailClicks
}

$script | ConvertTo-Json -Depth 12 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath
$exitCode = if ($process -and $process.ExitCode -ne $null) { [int]$process.ExitCode } else { 1 }

if (-not (Test-Path -LiteralPath $resultPath)) {
  throw "Providence did not write an asset performance smoke result: $resultPath"
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
$ok = [bool]$result.ok
$budgetFailures = @()

$maps = [int]$result.counts.maps
$assetCards = [int]$result.counts.assetCards
$openDetailButtons = [int]$result.counts.openDetailButtons
$assetsOpenMs = [int]$result.timings.assetsOpenMs

if ($maps -le 0) {
  $budgetFailures += "import produced no maps"
}
if ($assetCards -le 0) {
  $budgetFailures += "Assets rendered no asset cards"
}
if ($DetailClicks -gt 0 -and @($result.probes).Count -le 0) {
  $budgetFailures += "Assets detail probes did not run"
}
$requiredResourceProbes = @(
  "Scenario picture selected preview",
  "Scenario icon selected preview",
  "Scenario sound selected preview",
  "Reference picture selected preview",
  "Reference icon selected preview",
  "Reference sound selected preview"
)
$probeLabels = @($result.probes | ForEach-Object { [string]$_.label })
foreach ($requiredProbe in $requiredResourceProbes) {
  if (-not ($probeLabels -contains $requiredProbe)) {
    $budgetFailures += "Assets resource probe did not run: $requiredProbe"
  }
}
if ($MaxAssetsOpenMs -gt 0 -and $assetsOpenMs -gt $MaxAssetsOpenMs) {
  $budgetFailures += "Assets open took ${assetsOpenMs}ms > ${MaxAssetsOpenMs}ms"
}

foreach ($probe in @($result.probes)) {
  $duration = [int]$probe.durationMs
  if (-not [bool]$probe.ok) {
    $budgetFailures += "$($probe.label) failed: $($probe.detail)"
  } elseif ($MaxDetailMs -gt 0 -and $duration -gt $MaxDetailMs) {
    $budgetFailures += "$($probe.label) took ${duration}ms > ${MaxDetailMs}ms"
  }
}

Write-Host "Assets performance editor smoke: ok=$ok root=$RunRoot"
Write-Host "  import=$($result.timings.importMs)ms assetsOpen=$assetsOpenMs ms total=$($result.timings.totalMs)ms"
Write-Host "  maps=$maps projectAssets=$($result.counts.projectAssets) icons=$($result.counts.icons) pictures=$($result.counts.pictures) sounds=$($result.counts.sounds) cards=$assetCards details=$openDetailButtons"
foreach ($probe in @($result.probes)) {
  Write-Host "  $($probe.label): ok=$($probe.ok) duration=$($probe.durationMs)ms detail=$($probe.detail)"
}

if (-not $ok -or $budgetFailures.Count -gt 0) {
  foreach ($failure in $budgetFailures) {
    Write-Host "Failure: $failure"
  }
  if ($result.error) {
    Write-Host "Error: $($result.error)"
  }
}

if (-not $KeepArtifacts -and $ok -and $budgetFailures.Count -eq 0) {
  Remove-Item -LiteralPath $RunRoot -Recurse -Force
}

if ($exitCode -ne 0 -or -not $ok -or $budgetFailures.Count -gt 0) {
  exit 1
}
exit 0
