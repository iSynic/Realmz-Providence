param(
  [string]$CorpusRoot = "",
  [string]$Scenario = "",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 300,
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
$entry = $entries | Select-Object -First 1
if (-not $entry.Exists) {
  throw "Corpus scenario is missing its Scenario resource file: $($entry.SourcePath)"
}

$scenarioName = [string]$entry.Name
$fixtureDefinition = New-OracleCorpusFixtureDefinition -ScenarioName $scenarioName -BaselineEntry $entry.Baseline
$fixtureDefinition.ClassicArgs.SupportScenarioPath = Join-Path $corpusRootResolved "City of Bywater"
$started = Get-Date
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\corpus-$stamp-$(ConvertTo-OracleSafeName -Name $scenarioName)"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot

if (-not $SkipBuild) {
  Invoke-OracleBuild -RepoRoot $repoRoot
}

$sourceScenario = (Resolve-Path -LiteralPath $entry.SourcePath).Path
$paths = New-OracleRunPaths -RunRoot $RunRoot -ScenarioName $scenarioName
Initialize-OracleRunPaths -Paths $paths
Write-OracleHarnessScript -FixtureDefinition $fixtureDefinition -SourceScenario $sourceScenario -ScenarioName $scenarioName -Paths $paths
Write-OracleGameplayScript -FixtureDefinition $fixtureDefinition -Paths $paths | Out-Null

Start-OracleProvidenceHarness `
  -RepoRoot $repoRoot `
  -RunRoot $RunRoot `
  -ScriptPath $paths.ScriptPath `
  -ResultPath $paths.ResultPath `
  -TimeoutSeconds $ProvidenceTimeoutSeconds `
  -KeepRunning:$KeepRunning

$summary = Complete-OracleFixtureAfterProvidence `
  -FixtureDefinition $fixtureDefinition `
  -Stamp $stamp `
  -RunRoot $RunRoot `
  -ScenarioName $scenarioName `
  -SourceScenario $sourceScenario `
  -OracleRoot $OracleRoot `
  -ClassicExePath $ClassicExePath `
  -Paths $paths `
  -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
  -ProvidenceMode "single" `
  -KeepRunning:$KeepRunning

$finished = Get-Date
$matrixSummary = [ordered]@{
  ok = [bool]$summary.matchedExpectation
  matrixKind = "corpus-single"
  timestamp = $stamp
  runRoot = $RunRoot
  corpusRoot = $corpusRootResolved
  baselineVersion = [int]$baseline.version
  scenarioCount = 1
  visualGatedCount = if ($fixtureDefinition.Corpus.visualGate) { 1 } else { 0 }
  durationSeconds = [math]::Round(($finished - $started).TotalSeconds, 3)
  fixtures = @(
    [pscustomobject]@{
      Fixture = $scenarioName
      Scenario = $scenarioName
      ExpectedOk = [bool]$summary.expectedOk
      ObservedOk = [bool]$summary.observedOk
      MatchedExpectation = [bool]$summary.matchedExpectation
      Stage = $summary.stage
      Error = $summary.error
      Summary = $paths.SummaryPath
    }
  )
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$matrixSummary.fixtures | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
Write-Host "Corpus summary: $($paths.SummaryPath)"
Write-Host "Corpus run summary: $matrixSummaryPath"

if (-not $summary.matchedExpectation) {
  exit 1
}
exit 0
