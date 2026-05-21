param(
  [string]$Fixture = "tutorial-gameplay-start",
  [switch]$ListFixtures,
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
$fixtures = Get-OracleGameplayFixtureDefinitions

if ($ListFixtures) {
  $fixtures |
    Select-Object Name, ExpectedOk, ExpectedStage, Description |
    Format-Table -AutoSize
  exit 0
}

$fixtureDefinition = Get-OracleGameplayFixtureDefinition -Fixture $Fixture
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\gameplay-$stamp-$($fixtureDefinition.Name)"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot
$paths = New-OracleRunPaths -RunRoot $RunRoot -ScenarioName $ScenarioName
Initialize-OracleRunPaths -Paths $paths

$stage = "setup"
$sourceScenario = $null
$summary = $null
$errorText = $null

try {
  $sourceScenario = (Resolve-Path -LiteralPath $SourceScenarioDir).Path
  if (-not (Test-Path -LiteralPath (Join-Path $sourceScenario "Scenario"))) {
    throw "Source scenario is missing its Scenario resource file: $sourceScenario"
  }
  Write-OracleHarnessScript `
    -FixtureDefinition $fixtureDefinition `
    -SourceScenario $sourceScenario `
    -ScenarioName $ScenarioName `
    -Paths $paths
  Write-OracleGameplayScript -FixtureDefinition $fixtureDefinition -Paths $paths | Out-Null

  if (-not $SkipBuild) {
    $stage = "build"
    Invoke-OracleBuild -RepoRoot $repoRoot
  }

  $stage = "providence"
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
    -ScenarioName $ScenarioName `
    -SourceScenario $sourceScenario `
    -OracleRoot $OracleRoot `
    -ClassicExePath $ClassicExePath `
    -Paths $paths `
    -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
    -ProvidenceMode "single" `
    -KeepRunning:$KeepRunning
} catch {
  $errorText = $_.Exception.Message
  $summary = Write-OracleFixtureSummary `
    -FixtureDefinition $fixtureDefinition `
    -ObservedOk $false `
    -Stage $stage `
    -ErrorText $errorText `
    -Stamp $stamp `
    -RunRoot $RunRoot `
    -ScenarioName $ScenarioName `
    -SourceScenario $sourceScenario `
    -ClassicExePath $ClassicExePath `
    -Paths $paths `
    -ClassicSummaryPath (Get-OracleClassicSummaryPath -ClassicLogDir $paths.ClassicLogDir) `
    -MutationNote $null `
    -ProvidenceMode "single"
}

if ($summary.matchedExpectation) {
  if ($summary.observedOk) {
    Write-Host "Oracle gameplay smoke passed."
  } else {
    Write-Host "Oracle gameplay fixture matched expected failure."
  }
  Write-Host "Summary: $($paths.SummaryPath)"
  exit 0
}

Write-Error "Oracle gameplay fixture did not match expectation. Summary: $($paths.SummaryPath)"
exit 1
