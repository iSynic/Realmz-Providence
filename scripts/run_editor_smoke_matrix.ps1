param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ExePath = "F:\Realmz - Providence\src-tauri\target\release\realmz-providence.exe",
  [string]$RunRoot = "",
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourceScenarioDir)) {
  throw "Source scenario not found: $SourceScenarioDir"
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Providence release exe not found: $ExePath"
}

if (-not $RunRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\matrix-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$fixtures = @(
  @{
    name = "maps-authoring"
    script = Join-Path $PSScriptRoot "run_maps_authoring_editor_smoke.ps1"
    runRoot = Join-Path $RunRoot "maps-authoring"
  },
  @{
    name = "scripts-v2"
    script = Join-Path $PSScriptRoot "run_scripts_v2_editor_smoke.ps1"
    runRoot = Join-Path $RunRoot "scripts-v2"
  },
  @{
    name = "scripts-v2-diagnostics"
    script = Join-Path $PSScriptRoot "run_scripts_v2_diagnostics_smoke.ps1"
    runRoot = Join-Path $RunRoot "scripts-v2-diagnostics"
  },
  @{
    name = "text-assets"
    script = Join-Path $PSScriptRoot "run_text_assets_editor_smoke.ps1"
    runRoot = Join-Path $RunRoot "text-assets"
  }
)

$started = Get-Date
$results = @()
$allOk = $true

foreach ($fixture in $fixtures) {
  Write-Host "Editor smoke matrix: running $($fixture.name)..."
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $fixture.script,
    "-SourceScenarioDir", $SourceScenarioDir,
    "-ExePath", $ExePath,
    "-RunRoot", $fixture.runRoot,
    "-KeepArtifacts"
  )
  & powershell @args
  $exitCode = $LASTEXITCODE
  $resultPath = Join-Path $fixture.runRoot "providence-result.json"
  $result = $null
  if (Test-Path -LiteralPath $resultPath) {
    $result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
  }
  $ok = $exitCode -eq 0 -and $result -and [bool]$result.ok
  if (-not $ok) {
    $allOk = $false
  }
  $results += [pscustomobject]@{
    fixture = $fixture.name
    ok = $ok
    exitCode = $exitCode
    resultPath = $resultPath
    runRoot = $fixture.runRoot
    commandsApplied = if ($result) { $result.commandsApplied } else { $null }
    validationErrors = if ($result -and $result.validation) { $result.validation.errors.Count } else { $null }
    validationWarnings = if ($result -and $result.validation) { $result.validation.warnings.Count } else { $null }
    error = if ($result) { $result.error } else { "result file missing" }
  }
}

$duration = [Math]::Round(((Get-Date) - $started).TotalSeconds, 3)
$summary = [pscustomobject]@{
  ok = $allOk
  matrixKind = "editor"
  durationSeconds = $duration
  runRoot = $RunRoot
  fixtures = $results
}
$summaryPath = Join-Path $RunRoot "editor-smoke-matrix-summary.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding UTF8

Write-Host "Editor smoke matrix: ok=$allOk durationSeconds=$duration root=$RunRoot"
if (-not $KeepArtifacts -and $allOk) {
  Remove-Item -LiteralPath $RunRoot -Recurse -Force
}

if (-not $allOk) {
  exit 1
}
exit 0
