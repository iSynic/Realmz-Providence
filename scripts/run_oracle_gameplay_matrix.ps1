param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ScenarioName = "Providence Oracle Tutorial",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 180,
  [int]$ClassicTimeoutSeconds = 120,
  [switch]$SkipBuild,
  [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "oracle_smoke_lib.ps1")

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$fixtureNames = @(
  "tutorial-gameplay-start",
  "tutorial-gameplay-move",
  "tutorial-gameplay-trigger",
  "tutorial-gameplay-save-load",
  "missing-staged-character",
  "trigger-not-fired",
  "save-load-restore-mismatch"
)

$started = Get-Date
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\gameplay-matrix-$stamp"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot
$batchPath = Join-Path $RunRoot "providence-harness-batch.json"

if (-not $SkipBuild) {
  Invoke-OracleBuild -RepoRoot $repoRoot
}

$sourceScenario = (Resolve-Path -LiteralPath $SourceScenarioDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $sourceScenario "Scenario"))) {
  throw "Source scenario is missing its Scenario resource file: $sourceScenario"
}

$preparedRuns = @()
$batchRuns = @()
foreach ($fixtureName in $fixtureNames) {
  $fixtureDefinition = Get-OracleGameplayFixtureDefinition -Fixture $fixtureName
  $fixtureRoot = Resolve-OrCreateDirectory (Join-Path $RunRoot $fixtureName)
  $paths = New-OracleRunPaths -RunRoot $fixtureRoot -ScenarioName $ScenarioName
  Initialize-OracleRunPaths -Paths $paths
  Write-OracleHarnessScript `
    -FixtureDefinition $fixtureDefinition `
    -SourceScenario $sourceScenario `
    -ScenarioName $ScenarioName `
    -Paths $paths
  Write-OracleGameplayScript -FixtureDefinition $fixtureDefinition -Paths $paths | Out-Null

  $preparedRuns += [pscustomobject]@{
    FixtureDefinition = $fixtureDefinition
    RunRoot = $fixtureRoot
    Paths = $paths
  }
  $batchRuns += [ordered]@{
    fixture = $fixtureName
    scriptPath = $paths.ScriptPath
    resultPath = $paths.ResultPath
  }
}

$batch = [ordered]@{
  version = 1
  name = "Providence oracle gameplay matrix"
  runs = $batchRuns
}
$batch | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $batchPath -Encoding utf8

Write-Host "Running Providence harness batch for $($preparedRuns.Count) gameplay fixtures..."
Start-OracleProvidenceHarness `
  -RepoRoot $repoRoot `
  -RunRoot $RunRoot `
  -BatchPath $batchPath `
  -ResultPaths @($preparedRuns | ForEach-Object { $_.Paths.ResultPath }) `
  -TimeoutSeconds $ProvidenceTimeoutSeconds `
  -KeepRunning:$KeepRunning

$results = @()
foreach ($prepared in $preparedRuns) {
  $fixtureName = $prepared.FixtureDefinition.Name
  Write-Host "Completing oracle gameplay fixture: $fixtureName"
  $summary = Complete-OracleFixtureAfterProvidence `
    -FixtureDefinition $prepared.FixtureDefinition `
    -Stamp $stamp `
    -RunRoot $prepared.RunRoot `
    -ScenarioName $ScenarioName `
    -SourceScenario $sourceScenario `
    -OracleRoot $OracleRoot `
    -ClassicExePath $ClassicExePath `
    -Paths $prepared.Paths `
    -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
    -ProvidenceMode "batch" `
    -KeepRunning:$KeepRunning

  $results += [pscustomobject]@{
    Fixture = $fixtureName
    ExpectedOk = [bool]$summary.expectedOk
    ObservedOk = [bool]$summary.observedOk
    MatchedExpectation = [bool]$summary.matchedExpectation
    Stage = $summary.stage
    Error = $summary.error
    Summary = $prepared.Paths.SummaryPath
  }
}

$finished = Get-Date
$allMatched = ($results | Where-Object { -not $_.MatchedExpectation }).Count -eq 0
$matrixSummary = [ordered]@{
  ok = [bool]$allMatched
  timestamp = $stamp
  runRoot = $RunRoot
  providenceMode = "batch"
  providenceLaunches = 1
  durationSeconds = [math]::Round(($finished - $started).TotalSeconds, 3)
  batchPath = $batchPath
  fixtures = $results
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$results | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
Write-Host "Gameplay matrix summary: $matrixSummaryPath"
if (-not $allMatched) {
  exit 1
}
exit 0
