param(
  [string]$RunRoot = "",
  [string]$Fixture = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"

function Resolve-LatestOracleRun {
  param([string]$RepoRoot)
  $runsRoot = Join-Path $RepoRoot "tmp\oracle-runs"
  if (-not (Test-Path -LiteralPath $runsRoot)) {
    throw "Oracle runs directory does not exist: $runsRoot"
  }
  $latest = Get-ChildItem -LiteralPath $runsRoot -Directory |
    Where-Object {
      (Test-Path -LiteralPath (Join-Path $_.FullName "oracle-summary.json")) -or
      (Test-Path -LiteralPath (Join-Path $_.FullName "matrix-summary.json"))
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No oracle run summaries found under $runsRoot"
  }
  return $latest.FullName
}

function Read-JsonFile {
  param([AllowNull()][string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Get-SummaryPaths {
  param(
    [string]$Root,
    [string]$FixtureName
  )
  $matrixPath = Join-Path $Root "matrix-summary.json"
  $singlePath = Join-Path $Root "oracle-summary.json"

  if (Test-Path -LiteralPath $matrixPath) {
    $matrix = Read-JsonFile -Path $matrixPath
    $paths = @()
    foreach ($fixture in @($matrix.fixtures)) {
      if (-not [string]::IsNullOrWhiteSpace($FixtureName) -and $fixture.Fixture -ne $FixtureName) {
        continue
      }
      if ($fixture.Summary) {
        $paths += [string]$fixture.Summary
      }
    }
    return $paths
  }

  if (-not [string]::IsNullOrWhiteSpace($FixtureName)) {
    $fixturePath = Join-Path $Root $FixtureName
    $fixtureSummary = Join-Path $fixturePath "oracle-summary.json"
    if (Test-Path -LiteralPath $fixtureSummary) {
      return @($fixtureSummary)
    }
  }

  if (Test-Path -LiteralPath $singlePath) {
    return @($singlePath)
  }

  throw "No oracle-summary.json or matrix-summary.json found at $Root"
}

function New-OracleReportRow {
  param([string]$SummaryPath)
  $summary = Read-JsonFile -Path $SummaryPath
  $providence = Read-JsonFile -Path $summary.providenceResult
  $classic = Read-JsonFile -Path $summary.classicResult
  $fatalMarkers = [System.Collections.Generic.List[string]]::new()
  if ($classic) {
    foreach ($marker in @($classic.FoundBadMarkers)) {
      if ($null -ne $marker) {
        $fatalMarkers.Add([string]$marker) | Out-Null
      }
    }
  }

  [pscustomobject]@{
    Fixture = $summary.fixture
    ExpectedOk = [bool]$summary.expectedOk
    ObservedOk = [bool]$summary.observedOk
    MatchedExpectation = [bool]$summary.matchedExpectation
    Stage = $summary.stage
    Error = $summary.error
    ProvidenceError = if ($providence) { $providence.error } else { $null }
    CommandsApplied = if ($providence) { $providence.commandsApplied } else { $null }
    AutoImportDispatch = if ($classic) { $classic.AutoImportDispatch } else { $null }
    ScenarioSelectDispatch = if ($classic) { $classic.ScenarioSelectDispatch } else { $null }
    ScenarioSelectSkippedReason = if ($classic) { $classic.ScenarioSelectSkippedReason } else { $null }
    MarkerMatches = if ($classic) { $classic.MarkerMatches } else { $null }
    FatalMarkers = $fatalMarkers
    RuntimeMirrorCleanup = if ($classic) { $classic.RuntimeMirrorCleanup } else { $null }
    RuntimeMirrorCleanupOk = if ($classic) { $classic.RuntimeMirrorCleanupOk } else { $null }
    RuntimeLog = if ($classic) { $classic.RuntimeLog } else { $null }
    InitialMenuJson = if ($classic) { $classic.InitialMenuJson } else { $null }
    PostImportMenuJson = if ($classic) { $classic.PostImportMenuJson } else { $null }
    ExportDir = $summary.exportDir
    ProfileDir = if ($summary.artifacts) { $summary.artifacts.classicProfile } else { $null }
    Summary = $SummaryPath
  }
}

function Format-Nullable {
  param($Value)
  if ($null -eq $Value -or $Value -eq "") {
    return "-"
  }
  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    $items = @($Value | ForEach-Object { [string]$_ })
    if ($items.Count -eq 0) {
      return "-"
    }
    return ($items -join ", ")
  }
  return [string]$Value
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Resolve-LatestOracleRun -RepoRoot $repoRoot
} else {
  $RunRoot = (Resolve-Path -LiteralPath $RunRoot).Path
}

$summaryPaths = Get-SummaryPaths -Root $RunRoot -FixtureName $Fixture
if ($summaryPaths.Count -eq 0) {
  throw "No matching oracle summaries found. RunRoot=$RunRoot Fixture=$Fixture"
}

$reports = @($summaryPaths | ForEach-Object { New-OracleReportRow -SummaryPath $_ })
$allMatched = ($reports | Where-Object { -not $_.MatchedExpectation }).Count -eq 0

if ($Json) {
  [ordered]@{
    ok = [bool]$allMatched
    runRoot = $RunRoot
    reports = $reports
  } | ConvertTo-Json -Depth 10
} else {
  Write-Host "Oracle run: $RunRoot"
  $reports | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
  foreach ($report in $reports) {
    Write-Host ""
    Write-Host "[$($report.Fixture)]"
    Write-Host "  error: $(Format-Nullable $report.Error)"
    Write-Host "  providence: $(Format-Nullable $report.ProvidenceError)"
    Write-Host "  commandsApplied: $(Format-Nullable $report.CommandsApplied)"
    Write-Host "  classicDispatch: autoImport=$(Format-Nullable $report.AutoImportDispatch) scenarioSelect=$(Format-Nullable $report.ScenarioSelectDispatch) skipped=$(Format-Nullable $report.ScenarioSelectSkippedReason)"
    Write-Host "  markerMatches: $(Format-Nullable $report.MarkerMatches)"
    Write-Host "  fatalMarkers: $(Format-Nullable $report.FatalMarkers)"
    Write-Host "  cleanup: $(Format-Nullable $report.RuntimeMirrorCleanup) ok=$(Format-Nullable $report.RuntimeMirrorCleanupOk)"
    Write-Host "  runtimeLog: $(Format-Nullable $report.RuntimeLog)"
    Write-Host "  menus: initial=$(Format-Nullable $report.InitialMenuJson) postImport=$(Format-Nullable $report.PostImportMenuJson)"
    Write-Host "  exportDir: $(Format-Nullable $report.ExportDir)"
    Write-Host "  profileDir: $(Format-Nullable $report.ProfileDir)"
    Write-Host "  summary: $($report.Summary)"
  }
}

if (-not $allMatched) {
  exit 1
}
exit 0
