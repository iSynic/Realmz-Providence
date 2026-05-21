param(
  [string]$CorpusRoot = "",
  [string]$Scenario = "",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 1800,
  [int]$ClassicTimeoutSeconds = 120,
  [int]$MaxScenarios = 0,
  [switch]$ListScenarios,
  [switch]$SkipBuild,
  [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "oracle_smoke_lib.ps1")

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$baseline = Read-OracleCorpusBaseline -RepoRoot $repoRoot
if ([string]::IsNullOrWhiteSpace($CorpusRoot)) {
  $CorpusRoot = [string]$baseline.corpusRootDefault
}
$corpusRootResolved = Assert-OracleCorpusRootSafe -CorpusRoot $CorpusRoot -OracleRoot $OracleRoot
$entries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved -Scenario $Scenario -MaxScenarios $MaxScenarios

if ($ListScenarios) {
  $entries | Select-Object Name, Exists, @{Name = "ExpectedOk"; Expression = { [bool]$_.Baseline.expectedOk } }, @{Name = "ExpectedStage"; Expression = { [string]$_.Baseline.expectedStage } }, @{Name = "VisualGate"; Expression = { [bool]$_.Baseline.visualGate } } | Format-Table -AutoSize
  exit 0
}

if ($entries.Count -eq 0) {
  throw "No corpus scenarios selected."
}
foreach ($entry in $entries) {
  if (-not $entry.Exists) {
    throw "Corpus scenario is missing its Scenario resource file: $($entry.SourcePath)"
  }
}

$started = Get-Date
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\corpus-matrix-$stamp"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot
$batchPath = Join-Path $RunRoot "providence-harness-batch.json"

if (-not $SkipBuild) {
  Invoke-OracleBuild -RepoRoot $repoRoot
}

$preparedRuns = @()
$batchRuns = @()
foreach ($entry in $entries) {
  $scenarioName = [string]$entry.Name
  $fixtureDefinition = New-OracleCorpusFixtureDefinition -ScenarioName $scenarioName -BaselineEntry $entry.Baseline
  $fixtureDefinition.ClassicArgs.SupportScenarioPath = Join-Path $corpusRootResolved "City of Bywater"
  $sourceScenario = (Resolve-Path -LiteralPath $entry.SourcePath).Path
  $fixtureRoot = Resolve-OrCreateDirectory (Join-Path $RunRoot (ConvertTo-OracleSafeName -Name $scenarioName))
  $paths = New-OracleRunPaths -RunRoot $fixtureRoot -ScenarioName $scenarioName
  Initialize-OracleRunPaths -Paths $paths
  Write-OracleHarnessScript -FixtureDefinition $fixtureDefinition -SourceScenario $sourceScenario -ScenarioName $scenarioName -Paths $paths
  Write-OracleGameplayScript -FixtureDefinition $fixtureDefinition -Paths $paths | Out-Null

  $preparedRuns += [pscustomobject]@{
    ScenarioName = $scenarioName
    SourceScenario = $sourceScenario
    FixtureDefinition = $fixtureDefinition
    RunRoot = $fixtureRoot
    Paths = $paths
  }
  $batchRuns += [ordered]@{
    fixture = $scenarioName
    scriptPath = $paths.ScriptPath
    resultPath = $paths.ResultPath
  }
}

$batch = [ordered]@{
  version = 1
  name = "Providence oracle corpus matrix"
  runs = $batchRuns
}
$batch | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $batchPath -Encoding utf8

Write-Host "Running Providence harness batch for $($preparedRuns.Count) corpus scenarios..."
Start-OracleProvidenceHarness `
  -RepoRoot $repoRoot `
  -RunRoot $RunRoot `
  -BatchPath $batchPath `
  -ResultPaths @($preparedRuns | ForEach-Object { $_.Paths.ResultPath }) `
  -TimeoutSeconds $ProvidenceTimeoutSeconds `
  -KeepRunning:$KeepRunning

$results = @()
foreach ($prepared in $preparedRuns) {
  $scenarioName = $prepared.ScenarioName
  Write-Host "Completing oracle corpus scenario: $scenarioName"
  $summary = Complete-OracleFixtureAfterProvidence `
    -FixtureDefinition $prepared.FixtureDefinition `
    -Stamp $stamp `
    -RunRoot $prepared.RunRoot `
    -ScenarioName $scenarioName `
    -SourceScenario $prepared.SourceScenario `
    -OracleRoot $OracleRoot `
    -ClassicExePath $ClassicExePath `
    -Paths $prepared.Paths `
    -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
    -ProvidenceMode "batch" `
    -KeepRunning:$KeepRunning

  $results += [pscustomobject]@{
    Fixture = $scenarioName
    Scenario = $scenarioName
    ExpectedOk = [bool]$summary.expectedOk
    ObservedOk = [bool]$summary.observedOk
    MatchedExpectation = [bool]$summary.matchedExpectation
    Stage = $summary.stage
    Error = $summary.error
    VisualGate = [bool]$prepared.FixtureDefinition.Corpus.visualGate
    Summary = $prepared.Paths.SummaryPath
  }
}

$finished = Get-Date
$allMatched = ($results | Where-Object { -not $_.MatchedExpectation }).Count -eq 0
$matrixSummary = [ordered]@{
  ok = [bool]$allMatched
  matrixKind = "corpus"
  timestamp = $stamp
  runRoot = $RunRoot
  corpusRoot = $corpusRootResolved
  scenarioCount = $results.Count
  baselineVersion = [int]$baseline.version
  visualGatedCount = @($results | Where-Object { $_.VisualGate }).Count
  providenceMode = "batch"
  providenceLaunches = 1
  durationSeconds = [math]::Round(($finished - $started).TotalSeconds, 3)
  batchPath = $batchPath
  fixtures = $results
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$results | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
Write-Host "Corpus matrix summary: $matrixSummaryPath"

if (-not $allMatched) {
  exit 1
}
exit 0
