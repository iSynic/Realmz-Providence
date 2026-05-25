param(
  [string]$CorpusRoot = "",
  [string]$Scenario = "",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 1800,
  [int]$ClassicTimeoutSeconds = 90,
  [switch]$AllExpectedFailures,
  [switch]$SkipBuild,
  [switch]$KeepRunning,
  [ValidateSet("normal", "verbose")]
  [string]$TraceLevel = "verbose"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "oracle_smoke_lib.ps1")

$triageScenarioNames = @("Half Truth", "The End Worlds", "Wrath of the Mind Lords")

function Read-OracleJsonFile {
  param([AllowNull()][string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Get-RelativePathForOracle {
  param(
    [string]$Root,
    [string]$Path
  )
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\') + '\'
  $rootUri = [Uri]$rootFull
  $pathUri = [Uri]((Resolve-Path -LiteralPath $Path).Path)
  return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
}

function Get-OracleFileSha256 {
  param([string]$Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $hashBytes = $sha.ComputeHash($stream)
    return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

function Get-OracleDirectoryInventory {
  param([string]$Root)
  $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
  $items = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $resolvedRoot -File -Recurse -Force)) {
    $relativePath = Get-RelativePathForOracle -Root $resolvedRoot -Path $file.FullName
    $items += [pscustomobject]@{
      path = $relativePath
      length = [int64]$file.Length
      sha256 = Get-OracleFileSha256 -Path $file.FullName
      resourceSidecar = ($file.Name -like "*.rsrc" -or $file.Name -like "*.rsf")
    }
  }
  return @($items | Sort-Object path)
}

function Write-OracleSourceExportDiff {
  param(
    [string]$SourceDir,
    [string]$ExportDir,
    [string]$OutputPath,
    [array]$BlockingMarkers = @()
  )
  $sourceInventory = @(Get-OracleDirectoryInventory -Root $SourceDir)
  $exportInventory = @(Get-OracleDirectoryInventory -Root $ExportDir)
  $sourceByPath = @{}
  $exportByPath = @{}
  foreach ($item in $sourceInventory) { $sourceByPath[[string]$item.path] = $item }
  foreach ($item in $exportInventory) { $exportByPath[[string]$item.path] = $item }

  $allPaths = @($sourceByPath.Keys + $exportByPath.Keys | Sort-Object -Unique)
  $comparisons = @()
  foreach ($path in $allPaths) {
    $source = $sourceByPath[$path]
    $export = $exportByPath[$path]
    $status = if ($null -eq $source) {
      "extra-in-export"
    } elseif ($null -eq $export) {
      "missing-in-export"
    } elseif ($source.sha256 -eq $export.sha256 -and [int64]$source.length -eq [int64]$export.length) {
      "same"
    } else {
      "different"
    }
    $comparisons += [pscustomobject]@{
      path = $path
      status = $status
      sourceLength = if ($source) { $source.length } else { $null }
      exportLength = if ($export) { $export.length } else { $null }
      sourceSha256 = if ($source) { $source.sha256 } else { $null }
      exportSha256 = if ($export) { $export.sha256 } else { $null }
    }
  }

  $diff = [ordered]@{
    sourceDir = $SourceDir
    exportDir = $ExportDir
    sourceFileCount = $sourceInventory.Count
    exportFileCount = $exportInventory.Count
    sourceResourceSidecarCount = @($sourceInventory | Where-Object { $_.resourceSidecar }).Count
    exportResourceSidecarCount = @($exportInventory | Where-Object { $_.resourceSidecar }).Count
    missingInExport = @($comparisons | Where-Object { $_.status -eq "missing-in-export" })
    extraInExport = @($comparisons | Where-Object { $_.status -eq "extra-in-export" })
    different = @($comparisons | Where-Object { $_.status -eq "different" })
    focusedDecodedRows = @()
    focusedDecodeNote = "No committed action-row decoder is available in Phase 5.1; blocking newland markers are preserved instead."
    blockingMarkers = @($BlockingMarkers)
  }
  $diff | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding utf8
  return [pscustomobject]$diff
}

function New-OracleTriageClassicFixture {
  param(
    [string]$ScenarioName,
    [string]$SupportScenarioPath,
    [string]$TraceLevel,
    [bool]$SeedProfile
  )
  return [pscustomobject]@{
    Name = $ScenarioName
    ClassicArgs = @{
      SupportScenarioName = "City of Bywater"
      SupportScenarioPath = $SupportScenarioPath
      TraceLevel = $TraceLevel
      SeedProfile = $SeedProfile
      VisualGate = $false
    }
  }
}

function Get-LastOracleItem {
  param([array]$Items)
  if ($Items.Count -gt 0) {
    return [string]$Items[-1]
  }
  return $null
}

function Parse-OracleNewlandMarker {
  param([AllowNull()][string]$Marker)
  $parsed = [ordered]@{
    raw = $Marker
    opcode = $null
    id = $null
    coord = $null
    door = $null
    slot = $null
    record = $null
  }
  if ([string]::IsNullOrWhiteSpace($Marker)) {
    return [pscustomobject]$parsed
  }
  foreach ($field in @("opcode", "id", "door", "slot", "record")) {
    if ($Marker -match "$field=(-?\d+)") {
      $parsed[$field] = [int]$Matches[1]
    }
  }
  if ($Marker -match "coord=(-?\d+,-?\d+)") {
    $parsed.coord = $Matches[1]
  }
  return [pscustomobject]$parsed
}

function Invoke-OracleTriageLane {
  param(
    [string]$LaneName,
    [string]$ScenarioName,
    [string]$ScenarioPath,
    [bool]$SeedProfile,
    [string]$SupportScenarioPath,
    [string]$OracleRoot,
    [string]$ClassicExePath,
    [string]$LaneRoot,
    [string]$GameplayScriptPath,
    [int]$ClassicTimeoutSeconds,
    [string]$TraceLevel,
    [switch]$KeepRunning
  )
  $laneRootResolved = Resolve-OrCreateDirectory $LaneRoot
  $profileRoot = Resolve-OrCreateDirectory (Join-Path $laneRootResolved "realmz-profile")
  $logDir = Resolve-OrCreateDirectory (Join-Path $laneRootResolved "realmz-logs")
  $fixture = New-OracleTriageClassicFixture -ScenarioName $ScenarioName -SupportScenarioPath $SupportScenarioPath -TraceLevel $TraceLevel -SeedProfile $SeedProfile

  $classic = $null
  $classicSummaryPath = $null
  $classicResult = $null
  $errorText = $null
  try {
    $classic = Invoke-OracleClassic `
      -FixtureDefinition $fixture `
      -OracleRoot $OracleRoot `
      -ClassicExePath $ClassicExePath `
      -RunRoot $laneRootResolved `
      -ExportDir $ScenarioPath `
      -ScenarioName $ScenarioName `
      -ClassicProfile $profileRoot `
      -ClassicLogDir $logDir `
      -GameplayScriptPath $GameplayScriptPath `
      -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
      -KeepRunning:$KeepRunning
    $classicSummaryPath = $classic.SummaryPath
    $classicResult = $classic.Result
  } catch {
    $errorText = $_.Exception.Message
    $classicSummaryPath = Get-OracleClassicSummaryPath -ClassicLogDir $logDir
    $classicResult = Read-OracleJsonFile -Path $classicSummaryPath
  }

  $exitCode = if ($classic) { $classic.ExitCode } else { $null }
  $ok = ($classic -and [int]$classic.ExitCode -eq 0 -and $classicResult -and [bool]$classicResult.Ok)
  if (-not $errorText -and -not $ok) {
    if ($classicResult -and $classicResult.GameplayResult -and $classicResult.GameplayResult.Error) {
      $errorText = [string]$classicResult.GameplayResult.Error
    } elseif ($classicResult) {
      $errorText = "Classic oracle summary reported failure."
    } else {
      $errorText = "Classic oracle did not produce a result."
    }
  }

  $gameplayMarkers = if ($classicResult) { [string[]]@($classicResult.GameplayMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $newlandMarkers = if ($classicResult) { [string[]]@($classicResult.NewlandMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $actionMarkers = if ($classicResult -and ($classicResult.PSObject.Properties.Name -contains "ActionMarkers")) {
    [string[]]@($classicResult.ActionMarkers | ForEach-Object { [string]$_ })
  } else {
    [string[]]@($newlandMarkers | Where-Object { $_ -like "* action*" -or $_ -like "*status=action*" })
  }
  $dialogStateMarkers = if ($classicResult -and ($classicResult.PSObject.Properties.Name -contains "DialogStateMarkers")) {
    [string[]]@($classicResult.DialogStateMarkers | ForEach-Object { [string]$_ })
  } else {
    [string[]]@($gameplayMarkers | Where-Object { $_ -like "*dialog state*" })
  }
  $modalMarkers = [string[]]@($gameplayMarkers | Where-Object { $_ -like "*oracle gameplay modal*" })
  $autoAckMarkers = [string[]]@($modalMarkers | Where-Object { $_ -like "*phase=auto-ack*" })
  $autoChoiceMarkers = [string[]]@($modalMarkers | Where-Object { $_ -like "*phase=auto-choice*" })
  $fatalMarkers = if ($classicResult) { [string[]]@($classicResult.FoundBadMarkers | ForEach-Object { [string]$_ }) } else { [string[]]@() }
  $gameplayResult = if ($classicResult) { $classicResult.GameplayResult } else { $null }
  $timeoutArtifacts = if ($gameplayResult -and ($gameplayResult.PSObject.Properties.Name -contains "TimeoutArtifacts")) { $gameplayResult.TimeoutArtifacts } else { $null }
  $lastActionMarker = Get-LastOracleItem -Items $actionMarkers
  $lastNewlandMarker = Get-LastOracleItem -Items $newlandMarkers
  $lastGameplayMarker = Get-LastOracleItem -Items $gameplayMarkers
  $lastDialogState = Get-LastOracleItem -Items $dialogStateMarkers
  $lastModalMarker = Get-LastOracleItem -Items $modalMarkers
  $lastAutoAckMarker = Get-LastOracleItem -Items $autoAckMarkers
  $lastAutoChoiceMarker = Get-LastOracleItem -Items $autoChoiceMarkers
  $parsed = Parse-OracleNewlandMarker -Marker $lastActionMarker

  return [pscustomobject]@{
    lane = $LaneName
    ok = [bool]$ok
    stage = if ($ok) { "complete" } else { "classic" }
    exitCode = $exitCode
    error = $errorText
    sourceKind = if ($LaneName -like "original-*") { "original" } else { "exported" }
    profileKind = if ($SeedProfile) { "seeded" } else { "minimal" }
    scenarioPath = $ScenarioPath
    runRoot = $laneRootResolved
    profileDir = $profileRoot
    logDir = $logDir
    classicSummary = $classicSummaryPath
    gameplayResult = if ($classicResult) { $classicResult.GameplayResultPath } else { $null }
    runtimeLog = if ($classicResult) { $classicResult.RuntimeLog } else { $null }
    seedProfile = [bool]$SeedProfile
    seededProfileDirectories = if ($classicResult -and ($classicResult.PSObject.Properties.Name -contains "SeededProfileDirectories")) { @($classicResult.SeededProfileDirectories) } else { @() }
    fatalMarkers = @($fatalMarkers)
    lastGameplayMarker = $lastGameplayMarker
    lastNewlandMarker = $lastNewlandMarker
    lastActionMarker = $lastActionMarker
    lastModalMarker = $lastModalMarker
    lastAutoAckMarker = $lastAutoAckMarker
    autoAckMarkers = @($autoAckMarkers)
    lastAutoChoiceMarker = $lastAutoChoiceMarker
    autoChoiceMarkers = @($autoChoiceMarkers)
    dialogState = $lastDialogState
    timeoutArtifacts = $timeoutArtifacts
    blocking = $parsed
  }
}

function Get-OracleLane {
  param(
    [array]$Lanes,
    [string]$Name
  )
  return @($Lanes | Where-Object { $_.lane -eq $Name } | Select-Object -First 1)[0]
}

function Classify-OracleTriageScenario {
  param([array]$Lanes)
  $exportedMinimal = Get-OracleLane -Lanes $Lanes -Name "exported-minimal"
  $originalMinimal = Get-OracleLane -Lanes $Lanes -Name "original-minimal"
  $exportedSeeded = Get-OracleLane -Lanes $Lanes -Name "exported-seeded"
  $originalSeeded = Get-OracleLane -Lanes $Lanes -Name "original-seeded"
  $evidenceLane = @(@($exportedMinimal, $originalMinimal, $exportedSeeded, $originalSeeded) | Where-Object { $_ -and $_.lastActionMarker } | Select-Object -First 1)[0]
  if (-not $evidenceLane) {
    $evidenceLane = @($Lanes | Select-Object -First 1)[0]
  }
  $blocking = if ($evidenceLane) { $evidenceLane.blocking } else { Parse-OracleNewlandMarker -Marker $null }
  $combinedText = (@($Lanes | ForEach-Object {
    "$($_.lastActionMarker)`n$($_.lastModalMarker)`n$($_.lastAutoAckMarker)`n$($_.lastAutoChoiceMarker)`n$($_.dialogState)`n$($_.error)"
  }) -join "`n")
  $autoAckCount = @($Lanes | Where-Object { @($_.autoAckMarkers).Count -gt 0 }).Count
  $autoChoiceCount = @($Lanes | Where-Object { @($_.autoChoiceMarkers).Count -gt 0 }).Count

  if (@($Lanes | Where-Object { @($_.fatalMarkers).Count -gt 0 }).Count -gt 0) {
    return [pscustomobject]@{
      classification = "classic-runtime-bug"
      confidence = "high"
      recommendedNextAction = "Inspect the fatal marker and runtime log before changing Providence export behavior."
      blocking = $blocking
      evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
    }
  }

  if (
    (($originalMinimal -and $originalMinimal.ok) -and ($exportedMinimal -and -not $exportedMinimal.ok)) -or
    (($originalSeeded -and $originalSeeded.ok) -and ($exportedSeeded -and -not $exportedSeeded.ok))
  ) {
    return [pscustomobject]@{
      classification = "providence-export-mismatch"
      confidence = "high"
      recommendedNextAction = "Compare source-vs-export-diff.json, then fix the smallest proven Providence export mismatch."
      blocking = $blocking
      evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
    }
  }

  if (
    ($exportedMinimal -and -not $exportedMinimal.ok) -and
    ($originalMinimal -and -not $originalMinimal.ok) -and
    ($exportedSeeded -and $exportedSeeded.ok) -and
    ($originalSeeded -and $originalSeeded.ok)
  ) {
    return [pscustomobject]@{
      classification = "missing-fixture-setup"
      confidence = "high"
      recommendedNextAction = "Promote the required seeded profile resource into the focused gameplay fixture setup."
      blocking = $blocking
      evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
    }
  }

  if (@($Lanes | Where-Object { $_.ok }).Count -eq $Lanes.Count -and $Lanes.Count -gt 0) {
    if ($autoChoiceCount -gt 0) {
      return [pscustomobject]@{
        classification = "fixed-by-auto-choice"
        confidence = "high"
        recommendedNextAction = "Run the full corpus matrix; if it stays green, update the baseline expected outcome for this scenario."
        blocking = $blocking
        evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
      }
    }
    if ($autoAckCount -gt 0) {
      return [pscustomobject]@{
        classification = "fixed-by-auto-ack"
        confidence = "high"
        recommendedNextAction = "Run the full corpus matrix; if it stays green, update the baseline expected outcome for this scenario."
        blocking = $blocking
        evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
      }
    }
    return [pscustomobject]@{
      classification = "not-reproduced"
      confidence = "medium"
      recommendedNextAction = "Run the full corpus matrix; if it stays green, update the baseline expected outcome."
      blocking = $blocking
      evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
    }
  }

  if (
    $combinedText -like "*oracle gameplay modal*" -or
    $combinedText -like "*textbox waiting*" -or
    $combinedText -like "*handler=text click=1*" -or
    $combinedText -like "*dialog state*active=1*"
  ) {
    return [pscustomobject]@{
      classification = "classic-automation-limitation"
      confidence = "high"
      recommendedNextAction = "Add a debug-only acknowledgement path for the blocking modal/text wait, then rerun this triage lane."
      blocking = $blocking
      evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
    }
  }

  return [pscustomobject]@{
    classification = "unsupported-scenario-action-behavior"
    confidence = "medium"
    recommendedNextAction = "Instrument or implement the blocking action handler path; source and export failed with the same Classic behavior."
    blocking = $blocking
    evidenceLane = if ($evidenceLane) { $evidenceLane.lane } else { $null }
  }
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$baseline = Read-OracleCorpusBaseline -RepoRoot $repoRoot
if ([string]::IsNullOrWhiteSpace($CorpusRoot)) {
  $CorpusRoot = [string]$baseline.corpusRootDefault
}
$corpusRootResolved = Assert-OracleCorpusRootSafe -CorpusRoot $CorpusRoot -OracleRoot $OracleRoot

if (-not [string]::IsNullOrWhiteSpace($Scenario)) {
  if ($triageScenarioNames -notcontains $Scenario) {
    throw "Phase 5.1 triage is intentionally limited to: $($triageScenarioNames -join ', ')"
  }
  $entries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved -Scenario $Scenario
} elseif ($AllExpectedFailures) {
  $allEntries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved
  $entries = @($allEntries | Where-Object { -not [bool]$_.Baseline.expectedOk -and $triageScenarioNames -contains [string]$_.Name })
  if ($entries.Count -eq 0) {
    $entries = @($allEntries | Where-Object { $triageScenarioNames -contains [string]$_.Name })
  }
} else {
  $allEntries = Get-OracleCorpusScenarioEntries -Baseline $baseline -CorpusRoot $corpusRootResolved
  $entries = @($allEntries | Where-Object { $triageScenarioNames -contains [string]$_.Name })
}

if ($entries.Count -eq 0) {
  throw "No corpus triage scenarios selected."
}
foreach ($entry in $entries) {
  if (-not $entry.Exists) {
    throw "Corpus scenario is missing its Scenario resource file: $($entry.SourcePath)"
  }
}

$started = Get-Date
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\corpus-triage-$stamp"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot
$batchPath = Join-Path $RunRoot "providence-harness-batch.json"
$supportScenarioPath = Join-Path $corpusRootResolved "City of Bywater"

if (-not $SkipBuild) {
  Invoke-OracleBuild -RepoRoot $repoRoot
}

$preparedRuns = @()
$batchRuns = @()
foreach ($entry in $entries) {
  $scenarioName = [string]$entry.Name
  $fixtureDefinition = New-OracleCorpusFixtureDefinition -ScenarioName $scenarioName -BaselineEntry $entry.Baseline
  $fixtureDefinition.ClassicArgs.SupportScenarioPath = $supportScenarioPath
  $fixtureDefinition.ClassicArgs.TraceLevel = $TraceLevel
  $sourceScenario = (Resolve-Path -LiteralPath $entry.SourcePath).Path
  $scenarioRoot = Resolve-OrCreateDirectory (Join-Path $RunRoot (ConvertTo-OracleSafeName -Name $scenarioName))
  $paths = New-OracleRunPaths -RunRoot $scenarioRoot -ScenarioName $scenarioName
  Initialize-OracleRunPaths -Paths $paths
  Write-OracleHarnessScript -FixtureDefinition $fixtureDefinition -SourceScenario $sourceScenario -ScenarioName $scenarioName -Paths $paths
  Write-OracleGameplayScript -FixtureDefinition $fixtureDefinition -Paths $paths | Out-Null

  $preparedRuns += [pscustomobject]@{
    ScenarioName = $scenarioName
    SourceScenario = $sourceScenario
    Baseline = $entry.Baseline
    FixtureDefinition = $fixtureDefinition
    RunRoot = $scenarioRoot
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
  name = "Providence oracle corpus triage"
  runs = $batchRuns
}
$batch | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $batchPath -Encoding utf8

Write-Host "Running Providence harness batch for $($preparedRuns.Count) corpus triage scenarios..."
Start-OracleProvidenceHarness `
  -RepoRoot $repoRoot `
  -RunRoot $RunRoot `
  -BatchPath $batchPath `
  -ResultPaths @($preparedRuns | ForEach-Object { $_.Paths.ResultPath }) `
  -TimeoutSeconds $ProvidenceTimeoutSeconds `
  -KeepRunning:$KeepRunning

$triageResults = @()
foreach ($prepared in $preparedRuns) {
  $scenarioName = $prepared.ScenarioName
  Write-Host "Triaging corpus start failure: $scenarioName"
  $providenceResult = Read-OracleJsonFile -Path $prepared.Paths.ResultPath
  if (-not $providenceResult -or -not [bool]$providenceResult.ok) {
    throw "Providence export failed before Classic triage for $scenarioName`: $($providenceResult.error)"
  }

  $laneDefinitions = @(
    [pscustomobject]@{ Name = "exported-minimal"; ScenarioPath = $prepared.Paths.ExportDir; SeedProfile = $false },
    [pscustomobject]@{ Name = "original-minimal"; ScenarioPath = $prepared.SourceScenario; SeedProfile = $false },
    [pscustomobject]@{ Name = "exported-seeded"; ScenarioPath = $prepared.Paths.ExportDir; SeedProfile = $true },
    [pscustomobject]@{ Name = "original-seeded"; ScenarioPath = $prepared.SourceScenario; SeedProfile = $true }
  )

  $lanes = @()
  foreach ($laneDefinition in $laneDefinitions) {
    Write-Host "  Lane: $($laneDefinition.Name)"
    $laneRoot = Join-Path (Join-Path $prepared.RunRoot "triage-lanes") $laneDefinition.Name
    $lanes += Invoke-OracleTriageLane `
      -LaneName $laneDefinition.Name `
      -ScenarioName $scenarioName `
      -ScenarioPath $laneDefinition.ScenarioPath `
      -SeedProfile ([bool]$laneDefinition.SeedProfile) `
      -SupportScenarioPath $supportScenarioPath `
      -OracleRoot $OracleRoot `
      -ClassicExePath $ClassicExePath `
      -LaneRoot $laneRoot `
      -GameplayScriptPath $prepared.Paths.GameplayScriptPath `
      -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
      -TraceLevel $TraceLevel `
      -KeepRunning:$KeepRunning
  }

  $classification = Classify-OracleTriageScenario -Lanes $lanes
  $blockingMarkers = @($lanes | ForEach-Object { $_.lastActionMarker } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $diffPath = Join-Path $prepared.RunRoot "source-vs-export-diff.json"
  $diff = Write-OracleSourceExportDiff -SourceDir $prepared.SourceScenario -ExportDir $prepared.Paths.ExportDir -OutputPath $diffPath -BlockingMarkers $blockingMarkers
  $triageSummaryPath = Join-Path $prepared.RunRoot "triage-summary.json"
  $ok = [string]$classification.classification -notin @("", "inconclusive")
  $triageSummary = [ordered]@{
    ok = [bool]$ok
    scenario = $scenarioName
    fixture = $scenarioName
    timestamp = $stamp
    runRoot = $prepared.RunRoot
    sourceScenarioDir = $prepared.SourceScenario
    exportDir = $prepared.Paths.ExportDir
    classification = $classification.classification
    confidence = $classification.confidence
    blockingOpcode = $classification.blocking.opcode
    blockingId = $classification.blocking.id
    blockingCoordinate = $classification.blocking.coord
    blockingDoor = $classification.blocking.door
    blockingSlot = $classification.blocking.slot
    evidenceLane = $classification.evidenceLane
    lastClassicPhase = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).lastGameplayMarker } else { $null }
    lastNewlandMarker = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).lastNewlandMarker } else { $null }
    lastModalMarker = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).lastModalMarker } else { $null }
    lastAutoAckMarker = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).lastAutoAckMarker } else { $null }
    autoAckMarkers = @($lanes | ForEach-Object { @($_.autoAckMarkers) } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    lastAutoChoiceMarker = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).lastAutoChoiceMarker } else { $null }
    autoChoiceMarkers = @($lanes | ForEach-Object { @($_.autoChoiceMarkers) } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    dialogState = if ($classification.evidenceLane) { (Get-OracleLane -Lanes $lanes -Name $classification.evidenceLane).dialogState } else { $null }
    sourceExportDiff = $diffPath
    sourceExportDiffSummary = [ordered]@{
      sourceFileCount = $diff.sourceFileCount
      exportFileCount = $diff.exportFileCount
      missingInExportCount = @($diff.missingInExport).Count
      extraInExportCount = @($diff.extraInExport).Count
      differentCount = @($diff.different).Count
      sourceResourceSidecarCount = $diff.sourceResourceSidecarCount
      exportResourceSidecarCount = $diff.exportResourceSidecarCount
    }
    recommendedNextAction = $classification.recommendedNextAction
    lanes = @($lanes)
    baseline = $prepared.Baseline
    artifacts = [ordered]@{
      providenceHarness = $prepared.Paths.ScriptPath
      providenceResult = $prepared.Paths.ResultPath
      gameplayScript = $prepared.Paths.GameplayScriptPath
      sourceExportDiff = $diffPath
      triageSummary = $triageSummaryPath
    }
  }
  $triageSummary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $triageSummaryPath -Encoding utf8

  $triageResults += [pscustomobject]@{
    Fixture = $scenarioName
    Scenario = $scenarioName
    Classification = $classification.classification
    Confidence = $classification.confidence
    BlockingOpcode = $classification.blocking.opcode
    BlockingId = $classification.blocking.id
    EvidenceLane = $classification.evidenceLane
    Ok = [bool]$ok
    Summary = $triageSummaryPath
  }
}

$finished = Get-Date
$allClassified = ($triageResults | Where-Object { -not $_.Ok }).Count -eq 0
$matrixSummary = [ordered]@{
  ok = [bool]$allClassified
  matrixKind = "corpus-triage"
  timestamp = $stamp
  runRoot = $RunRoot
  corpusRoot = $corpusRootResolved
  scenarioCount = $triageResults.Count
  baselineVersion = [int]$baseline.version
  traceLevel = $TraceLevel
  providenceMode = "batch"
  providenceLaunches = 1
  durationSeconds = [math]::Round(($finished - $started).TotalSeconds, 3)
  batchPath = $batchPath
  fixtures = $triageResults
}
$matrixSummaryPath = Join-Path $RunRoot "matrix-summary.json"
$matrixSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $matrixSummaryPath -Encoding utf8

$triageResults | Format-Table Fixture, Classification, Confidence, BlockingOpcode, BlockingId, EvidenceLane -AutoSize
Write-Host "Corpus triage summary: $matrixSummaryPath"

if (-not $allClassified) {
  exit 1
}
exit 0
