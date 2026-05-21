param(
  [string]$CorpusRoot = "",
  [string]$Scenario = "",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 1800,
  [int]$ClassicTimeoutSeconds = 120,
  [switch]$AllExpectedFailures,
  [switch]$SkipBuild,
  [switch]$KeepRunning,
  [ValidateSet("normal", "verbose")]
  [string]$TraceLevel = "normal"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "oracle_smoke_lib.ps1")

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$baseline = Read-OracleCorpusBaseline -RepoRoot $repoRoot
if ([string]::IsNullOrWhiteSpace($CorpusRoot)) {
  $CorpusRoot = [string]$baseline.corpusRootDefault
}
$corpusRootResolved = Assert-OracleCorpusRootSafe -CorpusRoot $CorpusRoot -OracleRoot $OracleRoot

if (-not [string]::IsNullOrWhiteSpace($Scenario)) {
  $entries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved -Scenario $Scenario
} else {
  $allEntries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved
  $entries = @($allEntries | Where-Object { -not [bool]$_.Baseline.expectedOk })
}

if ($entries.Count -eq 0) {
  throw "No corpus diagnosis scenarios selected."
}
foreach ($entry in $entries) {
  if (-not $entry.Exists) {
    throw "Corpus scenario is missing its Scenario resource file: $($entry.SourcePath)"
  }
}

$started = Get-Date
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\corpus-diagnose-$stamp"
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
  $fixtureDefinition.ClassicArgs.TraceLevel = $TraceLevel
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
  name = "Providence oracle corpus diagnosis"
  runs = $batchRuns
}
$batch | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $batchPath -Encoding utf8

Write-Host "Running Providence harness batch for $($preparedRuns.Count) corpus diagnosis scenarios..."
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
  Write-Host "Completing oracle corpus diagnosis scenario: $scenarioName"
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
    FailureKind = $summary.failureKind
    LastGoodStage = $summary.lastGoodStage
    Summary = $prepared.Paths.SummaryPath
  }
}

$finished = Get-Date
$allMatched = ($results | Where-Object { -not $_.MatchedExpectation }).Count -eq 0
$matrixSummary = [ordered]@{
  ok = [bool]$allMatched
  matrixKind = "corpus-diagnose"
  timestamp = $stamp
  runRoot = $RunRoot
  corpusRoot = $corpusRootResolved
  scenarioCount = $results.Count
  baselineVersion = [int]$baseline.version
  traceLevel = $TraceLevel
  providenceMode = "batch"
  providenceLaunches = 1
  durationSeconds = [math]::Round(($finished - $started).TotalSeconds, 3)
  batchPath = $batchPath
  fixtures = $results
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$results | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage, FailureKind -AutoSize
Write-Host "Corpus diagnosis summary: $matrixSummaryPath"

if (-not $allMatched) {
  exit 1
}
exit 0
