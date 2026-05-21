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
  if ($summary -and ($summary.PSObject.Properties.Name -contains "classification")) {
    $laneSummaries = [string[]]@($summary.lanes | ForEach-Object {
      "$($_.lane):ok=$($_.ok):profile=$($_.profileKind):source=$($_.sourceKind):opcode=$($_.blocking.opcode):id=$($_.blocking.id)"
    })
    $timeoutArtifacts = [string[]]@($summary.lanes | ForEach-Object {
      if ($_.timeoutArtifacts) {
        "$($_.lane):$($_.timeoutArtifacts.runtimeLogTail)"
      }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    return [pscustomobject]@{
      Fixture = $summary.fixture
      Scenario = $summary.scenario
      CorpusDepth = "triage"
      VisualGate = $false
      ExpectedOk = $null
      ObservedOk = $null
      MatchedExpectation = [bool]$summary.ok
      Stage = "triage"
      Error = $null
      FailureKind = $summary.classification
      LastGoodStage = if ($summary.baseline) { $summary.baseline.lastGoodStage } else { $null }
      Diagnosis = [pscustomobject]@{
        classification = $summary.classification
        confidence = $summary.confidence
        evidenceLane = $summary.evidenceLane
        recommendedNextAction = $summary.recommendedNextAction
      }
      ProvidenceError = $null
      CommandsApplied = $null
      AutoImportDispatch = $null
      ScenarioSelectDispatch = $null
      ScenarioSelectSkippedReason = $null
      MarkerMatches = $null
      FatalMarkers = [string[]]@($summary.lanes | ForEach-Object { @($_.fatalMarkers) } | Where-Object { $_ })
      RuntimeMirrorCleanup = $null
      RuntimeMirrorCleanupOk = $null
      SupportScenarioName = "City of Bywater"
      RuntimeSupportScenarioPath = $null
      RuntimeSupportScenarioCleanup = $null
      RuntimeSupportScenarioCleanupOk = $null
      GameplayOk = $null
      GameplayError = $null
      GameplayFailedAssertion = $null
      GameplaySteps = [string[]]@()
      GameplayResponses = [string[]]@()
      GameplayScreenshots = [string[]]@()
      GameplayHostScreenshots = [string[]]@()
      GameplayLastSnapshotPath = $null
      GameplayLastSnapshot = $null
      GameplayLastScreenshotPath = $null
      GameplayLastScreenshot = $null
      GameplayLastHostScreenshotPath = $null
      GameplayLastHostScreenshot = $null
      VisualWarnings = [string[]]@()
      VisualFailures = [string[]]@()
      GameplayResultPath = $null
      GameplayCommandPath = $null
      GameplayMarkers = [string[]]@($summary.lanes | ForEach-Object { $_.lastGameplayMarker } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
      LastStartMarker = $summary.lastClassicPhase
      LastRenderMarker = $null
      LastActionMarker = $summary.lastNewlandMarker
      TriggerMarkers = [string[]]@($summary.lanes | ForEach-Object { $_.lastNewlandMarker } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
      SaveLoadMarkers = [string[]]@()
      TimeoutArtifacts = $timeoutArtifacts
      VisualRegionDiagnostics = @()
      VisualRegionFailures = [string[]]@()
      RuntimeLog = $null
      InitialMenuJson = $null
      PostImportMenuJson = $null
      ExportDir = $summary.exportDir
      ProfileDir = $null
      Summary = $SummaryPath
      TriageClassification = $summary.classification
      TriageConfidence = $summary.confidence
      TriageEvidenceLane = $summary.evidenceLane
      TriageBlocking = "opcode=$($summary.blockingOpcode) id=$($summary.blockingId) coord=$($summary.blockingCoordinate) door=$($summary.blockingDoor) slot=$($summary.blockingSlot)"
      TriageLanes = $laneSummaries
      TriageDiff = $summary.sourceExportDiff
      TriageRecommendedNextAction = $summary.recommendedNextAction
    }
  }
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
  $gameplay = if ($classic) { $classic.GameplayResult } else { $null }
  $gameplaySteps = if ($gameplay) {
    [string[]]@($gameplay.Steps | ForEach-Object {
      "$($_.Name):$($_.Command):ok=$($_.Ok):assert=$($_.AssertionError)"
    })
  } else {
    [string[]]@()
  }
  $gameplayResponses = if ($gameplay) { [string[]]@($gameplay.Responses | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $gameplayScreenshots = if ($gameplay) { [string[]]@($gameplay.Screenshots | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $gameplayHostScreenshots = if ($gameplay) { [string[]]@($gameplay.HostScreenshots | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $lastSnapshotPath = $null
  $lastScreenshotPath = $null
  $lastScreenshotSummary = $null
  $lastHostScreenshotPath = $null
  $lastHostScreenshotSummary = $null
  if ($gameplay) {
    $lastStep = @($gameplay.Steps | Where-Object { $_.SnapshotPath } | Select-Object -Last 1)
    if ($lastStep.Count -gt 0) {
      $lastSnapshotPath = [string]$lastStep[0].SnapshotPath
    }
    $lastVisualStep = @($gameplay.Steps | Where-Object { $_.ScreenshotPath } | Select-Object -Last 1)
    if ($lastVisualStep.Count -gt 0) {
      $lastScreenshotPath = [string]$lastVisualStep[0].ScreenshotPath
      if ($lastVisualStep[0].Screenshot) {
        $visual = $lastVisualStep[0].Screenshot
        $lastScreenshotSummary = "written=$($visual.written) size=$($visual.width)x$($visual.height) nonBlack=$($visual.nonBlackPixels) nonWhite=$($visual.nonWhitePixels)"
      }
    }
    $lastHostVisualStep = @($gameplay.Steps | Where-Object { $_.HostScreenshotPath } | Select-Object -Last 1)
    if ($lastHostVisualStep.Count -gt 0) {
      $lastHostScreenshotPath = [string]$lastHostVisualStep[0].HostScreenshotPath
      if ($lastHostVisualStep[0].HostScreenshot) {
        $hostVisual = $lastHostVisualStep[0].HostScreenshot
        $lastHostScreenshotSummary = "written=$($hostVisual.written) size=$($hostVisual.width)x$($hostVisual.height) nonBlack=$($hostVisual.nonBlackPixels) rightOcc=$($hostVisual.rightPanelOccupancy) bottomOcc=$($hostVisual.bottomPanelOccupancy)"
      }
    }
  }
  $lastSnapshot = Read-JsonFile -Path $lastSnapshotPath
  $lastSnapshotSummary = $null
  if ($lastSnapshot) {
    $characterNames = @($lastSnapshot.characters | ForEach-Object { [string]$_ }) -join ","
    $lastSnapshotSummary = "scenario=$($lastSnapshot.scenarioName) global=$($lastSnapshot.globalX),$($lastSnapshot.globalY) party=$($lastSnapshot.partyCount) chars=$characterNames saveA=$($lastSnapshot.saveSlotAExists) combat=$($lastSnapshot.inCombat) dungeon=$($lastSnapshot.inDungeon)"
  }
  $gameplayMarkers = if ($classic) { [string[]]@($classic.GameplayMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $newlandMarkers = if ($classic) { [string[]]@($classic.NewlandMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $renderMarkers = if ($classic -and ($classic.PSObject.Properties.Name -contains "RenderMarkers")) { [string[]]@($classic.RenderMarkers | ForEach-Object { [string]$_ }) } elseif ($gameplay -and ($gameplay.PSObject.Properties.Name -contains "RenderMarkers")) { [string[]]@($gameplay.RenderMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@($gameplayMarkers | Where-Object { $_ -like "* render*" -or $_ -like "*renderFrame*" }) }
  $actionMarkers = if ($classic -and ($classic.PSObject.Properties.Name -contains "ActionMarkers")) { [string[]]@($classic.ActionMarkers | ForEach-Object { [string]$_ }) } elseif ($gameplay -and ($gameplay.PSObject.Properties.Name -contains "ActionMarkers")) { [string[]]@($gameplay.ActionMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@($newlandMarkers | Where-Object { $_ -like "* action*" -or $_ -like "*status=action*" }) }
  $saveLoadMarkers = [string[]]@($gameplayMarkers | Where-Object { $_ -match "saveSlot|loadSlot|fileprep" })
  $visualWarnings = if ($classic) { [string[]]@($classic.VisualWarnings | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $visualFailures = if ($classic) { [string[]]@($classic.VisualFailures | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $visualRegionDiagnostics = if ($summary.PSObject.Properties.Name -contains "visualRegionDiagnostics") { @($summary.visualRegionDiagnostics) } elseif ($classic -and ($classic.PSObject.Properties.Name -contains "VisualRegionDiagnostics")) { @($classic.VisualRegionDiagnostics) } else { @() }
  $visualRegionFailures = [string[]]@($visualFailures | Where-Object { $_ -like "*region*" })
  $timeoutArtifacts = if ($gameplay -and ($gameplay.PSObject.Properties.Name -contains "TimeoutArtifacts")) { $gameplay.TimeoutArtifacts } else { $null }
  $diagnosis = if ($summary.PSObject.Properties.Name -contains "diagnosis") { $summary.diagnosis } else { $null }
  $lastStartMarker = @($gameplayMarkers | Where-Object { $_ -like "*startScenario*" } | Select-Object -Last 1)
  $lastRenderMarker = @($renderMarkers | Select-Object -Last 1)
  $lastActionMarker = @($actionMarkers | Select-Object -Last 1)

  [pscustomobject]@{
    Fixture = $summary.fixture
    Scenario = if ($summary.corpus) { $summary.corpus.scenarioName } else { $summary.scenarioName }
    CorpusDepth = if ($summary.corpus) { $summary.corpus.depth } else { $null }
    VisualGate = if ($summary.corpus) { [bool]$summary.corpus.visualGate } else { if ($classic) { [bool]$classic.VisualGate } else { $null } }
    ExpectedOk = [bool]$summary.expectedOk
    ObservedOk = [bool]$summary.observedOk
    MatchedExpectation = [bool]$summary.matchedExpectation
    Stage = $summary.stage
    Error = $summary.error
    FailureKind = if ($summary.PSObject.Properties.Name -contains "failureKind") { $summary.failureKind } else { $null }
    LastGoodStage = if ($summary.PSObject.Properties.Name -contains "lastGoodStage") { $summary.lastGoodStage } else { $null }
    Diagnosis = $diagnosis
    ProvidenceError = if ($providence) { $providence.error } else { $null }
    CommandsApplied = if ($providence) { $providence.commandsApplied } else { $null }
    AutoImportDispatch = if ($classic) { $classic.AutoImportDispatch } else { $null }
    ScenarioSelectDispatch = if ($classic) { $classic.ScenarioSelectDispatch } else { $null }
    ScenarioSelectSkippedReason = if ($classic) { $classic.ScenarioSelectSkippedReason } else { $null }
    MarkerMatches = if ($classic) { $classic.MarkerMatches } else { $null }
    FatalMarkers = [string[]]@($fatalMarkers)
    RuntimeMirrorCleanup = if ($classic) { $classic.RuntimeMirrorCleanup } else { $null }
    RuntimeMirrorCleanupOk = if ($classic) { $classic.RuntimeMirrorCleanupOk } else { $null }
    SupportScenarioName = if ($classic) { $classic.SupportScenarioName } else { $null }
    RuntimeSupportScenarioPath = if ($classic) { $classic.RuntimeSupportScenarioPath } else { $null }
    RuntimeSupportScenarioCleanup = if ($classic) { $classic.RuntimeSupportScenarioCleanup } else { $null }
    RuntimeSupportScenarioCleanupOk = if ($classic) { $classic.RuntimeSupportScenarioCleanupOk } else { $null }
    GameplayOk = if ($gameplay) { $gameplay.Ok } else { $null }
    GameplayError = if ($gameplay) { $gameplay.Error } else { $null }
    GameplayFailedAssertion = if ($gameplay) { $gameplay.FailedAssertion } else { $null }
    GameplaySteps = $gameplaySteps
    GameplayResponses = $gameplayResponses
    GameplayScreenshots = $gameplayScreenshots
    GameplayHostScreenshots = $gameplayHostScreenshots
    GameplayLastSnapshotPath = $lastSnapshotPath
    GameplayLastSnapshot = $lastSnapshotSummary
    GameplayLastScreenshotPath = $lastScreenshotPath
    GameplayLastScreenshot = $lastScreenshotSummary
    GameplayLastHostScreenshotPath = $lastHostScreenshotPath
    GameplayLastHostScreenshot = $lastHostScreenshotSummary
    VisualWarnings = $visualWarnings
    VisualFailures = $visualFailures
    GameplayResultPath = if ($classic) { $classic.GameplayResultPath } else { $null }
    GameplayCommandPath = if ($classic) { $classic.GameplayCommandPath } else { $null }
    GameplayMarkers = $gameplayMarkers
    LastStartMarker = if ($lastStartMarker.Count -gt 0) { [string]$lastStartMarker[0] } else { $null }
    LastRenderMarker = if ($lastRenderMarker.Count -gt 0) { [string]$lastRenderMarker[0] } else { $null }
    LastActionMarker = if ($lastActionMarker.Count -gt 0) { [string]$lastActionMarker[0] } else { $null }
    TriggerMarkers = $newlandMarkers
    SaveLoadMarkers = $saveLoadMarkers
    TimeoutArtifacts = $timeoutArtifacts
    VisualRegionDiagnostics = $visualRegionDiagnostics
    VisualRegionFailures = $visualRegionFailures
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
  if ($null -eq $Value) {
    return "-"
  }
  if ($Value -is [string] -and $Value -eq "") {
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

$matrixSummary = Read-JsonFile -Path (Join-Path $RunRoot "matrix-summary.json")
$reports = @($summaryPaths | ForEach-Object { New-OracleReportRow -SummaryPath $_ })
$allMatched = ($reports | Where-Object { -not $_.MatchedExpectation }).Count -eq 0

if ($Json) {
  [ordered]@{
    ok = [bool]$allMatched
    runRoot = $RunRoot
    matrix = $matrixSummary
    reports = $reports
  } | ConvertTo-Json -Depth 10
} else {
  Write-Host "Oracle run: $RunRoot"
  if ($matrixSummary) {
    Write-Host "Matrix: kind=$(Format-Nullable $matrixSummary.matrixKind) scenarios=$(Format-Nullable $matrixSummary.scenarioCount) visualGated=$(Format-Nullable $matrixSummary.visualGatedCount) baseline=$(Format-Nullable $matrixSummary.baselineVersion)"
  }
  $reports | Format-Table Fixture, ExpectedOk, ObservedOk, MatchedExpectation, Stage -AutoSize
  foreach ($report in $reports) {
    Write-Host ""
    Write-Host "[$($report.Fixture)]"
    Write-Host "  scenario: $(Format-Nullable $report.Scenario) depth=$(Format-Nullable $report.CorpusDepth) visualGate=$(Format-Nullable $report.VisualGate)"
    Write-Host "  diagnosis: failureKind=$(Format-Nullable $report.FailureKind) lastGoodStage=$(Format-Nullable $report.LastGoodStage) detail=$(Format-Nullable $report.Diagnosis)"
    if ($report.PSObject.Properties.Name -contains "TriageClassification") {
      Write-Host "  triage: classification=$(Format-Nullable $report.TriageClassification) confidence=$(Format-Nullable $report.TriageConfidence) evidenceLane=$(Format-Nullable $report.TriageEvidenceLane)"
      Write-Host "  triageBlocking: $(Format-Nullable $report.TriageBlocking)"
      Write-Host "  triageLanes: $(Format-Nullable $report.TriageLanes)"
      Write-Host "  triageDiff: $(Format-Nullable $report.TriageDiff)"
      Write-Host "  triageNext: $(Format-Nullable $report.TriageRecommendedNextAction)"
    }
    Write-Host "  error: $(Format-Nullable $report.Error)"
    Write-Host "  providence: $(Format-Nullable $report.ProvidenceError)"
    Write-Host "  commandsApplied: $(Format-Nullable $report.CommandsApplied)"
    Write-Host "  classicDispatch: autoImport=$(Format-Nullable $report.AutoImportDispatch) scenarioSelect=$(Format-Nullable $report.ScenarioSelectDispatch) skipped=$(Format-Nullable $report.ScenarioSelectSkippedReason)"
    Write-Host "  markerMatches: $(Format-Nullable $report.MarkerMatches)"
    Write-Host "  fatalMarkers: $(Format-Nullable $report.FatalMarkers)"
    Write-Host "  cleanup: $(Format-Nullable $report.RuntimeMirrorCleanup) ok=$(Format-Nullable $report.RuntimeMirrorCleanupOk)"
    Write-Host "  supportScenario: name=$(Format-Nullable $report.SupportScenarioName) cleanup=$(Format-Nullable $report.RuntimeSupportScenarioCleanup) ok=$(Format-Nullable $report.RuntimeSupportScenarioCleanupOk) runtime=$(Format-Nullable $report.RuntimeSupportScenarioPath)"
    Write-Host "  gameplay: ok=$(Format-Nullable $report.GameplayOk) error=$(Format-Nullable $report.GameplayError) assertion=$(Format-Nullable $report.GameplayFailedAssertion)"
    Write-Host "  gameplaySteps: $(Format-Nullable $report.GameplaySteps)"
    Write-Host "  gameplayResponses: $(Format-Nullable $report.GameplayResponses)"
    Write-Host "  gameplayScreenshots: $(Format-Nullable $report.GameplayScreenshots)"
    Write-Host "  gameplayHostScreenshots: $(Format-Nullable $report.GameplayHostScreenshots)"
    Write-Host "  lastSnapshot: $(Format-Nullable $report.GameplayLastSnapshot)"
    Write-Host "  lastSnapshotPath: $(Format-Nullable $report.GameplayLastSnapshotPath)"
    Write-Host "  lastScreenshot: $(Format-Nullable $report.GameplayLastScreenshot)"
    Write-Host "  lastScreenshotPath: $(Format-Nullable $report.GameplayLastScreenshotPath)"
    Write-Host "  lastHostScreenshot: $(Format-Nullable $report.GameplayLastHostScreenshot)"
    Write-Host "  lastHostScreenshotPath: $(Format-Nullable $report.GameplayLastHostScreenshotPath)"
    Write-Host "  visualWarnings: $(Format-Nullable $report.VisualWarnings)"
    Write-Host "  visualFailures: $(Format-Nullable $report.VisualFailures)"
    Write-Host "  visualRegionFailures: $(Format-Nullable $report.VisualRegionFailures)"
    Write-Host "  gameplayArtifacts: result=$(Format-Nullable $report.GameplayResultPath) command=$(Format-Nullable $report.GameplayCommandPath)"
    Write-Host "  timeoutArtifacts: $(Format-Nullable $report.TimeoutArtifacts)"
    Write-Host "  lastMarkers: start=$(Format-Nullable $report.LastStartMarker) render=$(Format-Nullable $report.LastRenderMarker) action=$(Format-Nullable $report.LastActionMarker)"
    Write-Host "  gameplayMarkers: $(Format-Nullable $report.GameplayMarkers)"
    Write-Host "  triggerMarkers: $(Format-Nullable $report.TriggerMarkers)"
    Write-Host "  saveLoadMarkers: $(Format-Nullable $report.SaveLoadMarkers)"
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
