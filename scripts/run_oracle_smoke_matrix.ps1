param(
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 180,
  [int]$ClassicTimeoutSeconds = 60,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Resolve-OrCreateDirectory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$smokeScript = Join-Path $PSScriptRoot "run_oracle_smoke.ps1"
$fixtures = @(
  "tutorial-macro",
  "tutorial-paint-tile",
  "tutorial-edcd-row",
  "missing-classic-exe",
  "missing-exported-scenario",
  "validation-error",
  "classic-fatal-marker",
  "scenario-not-appearing"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\matrix-$stamp"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot

if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build failed with exit code $LASTEXITCODE"
    }
    & cargo build --manifest-path (Join-Path $repoRoot "src-tauri\Cargo.toml")
    if ($LASTEXITCODE -ne 0) {
      throw "cargo build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$results = @()
foreach ($fixture in $fixtures) {
  $fixtureRoot = Join-Path $RunRoot $fixture
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  Write-Host "Running oracle fixture: $fixture"

  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $smokeScript,
    "-Fixture", $fixture,
    "-RunRoot", $fixtureRoot,
    "-OracleRoot", $OracleRoot,
    "-ProvidenceTimeoutSeconds", $ProvidenceTimeoutSeconds,
    "-ClassicTimeoutSeconds", $ClassicTimeoutSeconds,
    "-SkipBuild"
  )
  if (-not [string]::IsNullOrWhiteSpace($ClassicExePath)) {
    $args += @("-ClassicExePath", $ClassicExePath)
  }

  & powershell @args
  $exitCode = $LASTEXITCODE
  $summaryPath = Join-Path $fixtureRoot "oracle-summary.json"
  $summary = $null
  if (Test-Path -LiteralPath $summaryPath) {
    $summary = Get-Content -Raw -LiteralPath $summaryPath | ConvertFrom-Json
  }
  $matched = ($exitCode -eq 0) -and $summary -and [bool]$summary.matchedExpectation
  $results += [pscustomobject]@{
    Fixture = $fixture
    ExitCode = $exitCode
    ExpectedOk = if ($summary) { [bool]$summary.expectedOk } else { $null }
    ObservedOk = if ($summary) { [bool]$summary.observedOk } else { $null }
    MatchedExpectation = [bool]$matched
    Stage = if ($summary) { $summary.stage } else { $null }
    Error = if ($summary) { $summary.error } else { "summary missing" }
    Summary = if (Test-Path -LiteralPath $summaryPath) { $summaryPath } else { $null }
  }
}

$allMatched = ($results | Where-Object { -not $_.MatchedExpectation }).Count -eq 0
$matrixSummary = [ordered]@{
  ok = [bool]$allMatched
  timestamp = $stamp
  runRoot = $RunRoot
  fixtures = $results
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$results | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
Write-Host "Matrix summary: $matrixSummaryPath"

if (-not $allMatched) {
  exit 1
}
exit 0
