param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ExePath = "F:\Realmz - Providence\src-tauri\target\release\realmz-providence.exe",
  [string]$RunRoot = "",
  [int]$MaxTabMs = 10000,
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
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\primary-workflow-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "Tutorial-PrimaryWorkflow.providence"

$script = @{
  version = 1
  mode = "primary-workflow"
  name = "primary-workflow-editor-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Tutorial Primary Workflow Smoke"
  projectDir = $projectDir
  tabs = @("maps", "scripts", "text", "encounters", "combat", "economy", "assets", "linter", "export")
}

$script | ConvertTo-Json -Depth 12 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath
$exitCode = if ($process -and $process.ExitCode -ne $null) { [int]$process.ExitCode } else { 1 }

if (-not (Test-Path -LiteralPath $resultPath)) {
  throw "Providence did not write a primary workflow smoke result: $resultPath"
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
$ok = [bool]$result.ok
$budgetFailures = @()

foreach ($probe in @($result.probes)) {
  $duration = [int]$probe.durationMs
  if (-not [bool]$probe.ok) {
    $budgetFailures += "$($probe.label) failed: $($probe.detail)"
  } elseif ($MaxTabMs -gt 0 -and $duration -gt $MaxTabMs) {
    $budgetFailures += "$($probe.label) took ${duration}ms > ${MaxTabMs}ms"
  }
}

Write-Host "Primary workflow editor smoke: ok=$ok root=$RunRoot"
Write-Host "  import=$($result.timings.importMs)ms total=$($result.timings.totalMs)ms"
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
