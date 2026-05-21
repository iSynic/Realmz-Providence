param(
  [string]$Fixture = "tutorial-macro",
  [switch]$ListFixtures,
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ScenarioName = "Providence Oracle Tutorial",
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$ClassicExePath = "",
  [string]$RunRoot = "",
  [int]$ProvidenceTimeoutSeconds = 180,
  [int]$ClassicTimeoutSeconds = 60,
  [switch]$SkipBuild,
  [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"

function Resolve-OrCreateDirectory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Stop-ProcessTree {
  param([System.Diagnostics.Process]$Process)
  if ($null -eq $Process) {
    return
  }
  try {
    $Process.Refresh()
    if (-not $Process.HasExited) {
      Get-CimInstance Win32_Process -Filter "ParentProcessId = $($Process.Id)" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
          $child = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
          if ($child) {
            Stop-ProcessTree -Process $child
          }
        } catch {
        }
      }
      Stop-Process -Id $Process.Id -Force
    }
  } catch {
  }
}

function Get-PortOwner {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) {
    return $null
  }
  return Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function New-BlockedAssetCommand {
  [ordered]@{
    kind = "attachProjectAsset"
    label = "Attach invalid blocked asset"
    asset = [ordered]@{
      id = "oracle-invalid-asset"
      label = "Oracle invalid blocked asset"
      kind = "other"
      resourceType = "TEXT"
      resourceId = 0
      fileName = "missing.bin"
      originalPath = ""
      previewPath = ""
      resourcePath = "missing.bin"
      mimeType = "application/octet-stream"
      bytes = 0
      sha256 = ""
      width = $null
      height = $null
      durationMs = $null
      sampleRate = $null
      channels = $null
      exportState = "blocked"
      provenance = "oracle validation fixture"
      linkedEntity = $null
    }
  }
}

function Get-FixtureDefinitions {
  $baseAssertions = [ordered]@{
    validationOk = $true
    projectHasMaps = $true
    commandsAppliedAtLeast = 1
    exportContains = @("Scenario", "Data LD", "Data DD")
    semanticLinkKinds = @("has_render_profile")
  }

  return @(
    [pscustomobject]@{
      Name = "tutorial-macro"
      Description = "Import Tutorial, create one macro, export, and select in Classic."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle macro smoke"
      Commands = @(
        [ordered]@{
          kind = "createMacro"
          label = "Oracle smoke macro"
        }
      )
      Assertions = $baseAssertions
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "tutorial-paint-tile"
      Description = "Paint Tutorial land:0 tile index 0 from 61 to 62, assert project semantics, export, and select in Classic."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle paint tile smoke"
      Commands = @(
        [ordered]@{
          kind = "paintTiles"
          label = "Oracle paint land tile"
          mapId = "land:0"
          cells = @(
            [ordered]@{
              x = 0
              y = 0
              index = 0
              from = 61
              to = 62
            }
          )
        }
      )
      Assertions = [ordered]@{
        validationOk = $true
        projectHasMaps = $true
        projectTiles = @(
          [ordered]@{
            mapId = "land:0"
            index = 0
            value = 62
          }
        )
        commandsAppliedAtLeast = 1
        exportContains = @("Scenario", "Data LD", "Data DD")
        semanticLinkKinds = @("has_render_profile")
      }
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "tutorial-edcd-row"
      Description = "Update Tutorial EDCD row 0 to [1,2,3,4,5], export, and select in Classic."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle EDCD row smoke"
      Commands = @(
        [ordered]@{
          kind = "updateEdcdRow"
          label = "Oracle update EDCD row"
          rowId = 0
          values = @(1, 2, 3, 4, 5)
        }
      )
      Assertions = [ordered]@{
        validationOk = $true
        projectHasMaps = $true
        commandsAppliedAtLeast = 1
        exportContains = @("Scenario", "Data EDCD")
        semanticLinkKinds = @("has_render_profile")
      }
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "missing-classic-exe"
      Description = "Export successfully, then fail Classic preflight with a missing executable."
      ExpectedOk = $false
      ExpectedStage = "classic-preflight"
      HarnessName = "Tutorial oracle missing Classic exe fixture"
      Commands = @(
        [ordered]@{
          kind = "createMacro"
          label = "Oracle smoke macro"
        }
      )
      Assertions = $baseAssertions
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{ MissingExe = $true }
      RequiresClassicSummary = $false
    },
    [pscustomobject]@{
      Name = "missing-exported-scenario"
      Description = "Export successfully, then remove the exported Scenario file before Classic staging."
      ExpectedOk = $false
      ExpectedStage = "export-preflight"
      HarnessName = "Tutorial oracle missing Scenario fixture"
      Commands = @(
        [ordered]@{
          kind = "createMacro"
          label = "Oracle smoke macro"
        }
      )
      Assertions = $baseAssertions
      PreExportMutation = "none"
      PostExportMutation = "remove-scenario-data"
      ClassicArgs = @{}
      RequiresClassicSummary = $false
    },
    [pscustomobject]@{
      Name = "validation-error"
      Description = "Attach a blocked asset and require validationOk=true so the Providence assertion names the observed validation failure."
      ExpectedOk = $false
      ExpectedStage = "providence"
      HarnessName = "Tutorial oracle validation failure fixture"
      Commands = @(
        (New-BlockedAssetCommand)
      )
      Assertions = [ordered]@{
        validationOk = $true
        validationErrorsContain = @("blocked from export")
        projectHasMaps = $true
        commandsAppliedAtLeast = 1
        exportContains = @("Scenario")
      }
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $false
    },
    [pscustomobject]@{
      Name = "classic-fatal-marker"
      Description = "Export successfully, then ask the Classic oracle to inject a fatal marker into the runtime log."
      ExpectedOk = $false
      ExpectedStage = "classic"
      HarnessName = "Tutorial oracle Classic fatal marker fixture"
      Commands = @(
        [ordered]@{
          kind = "createMacro"
          label = "Oracle smoke macro"
        }
      )
      Assertions = $baseAssertions
      PreExportMutation = "none"
      PostExportMutation = "none"
      ClassicArgs = @{ InjectFatalMarker = $true }
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "scenario-not-appearing"
      Description = "Export successfully, then remove the Scenario resource sidecar so Classic cannot import/select it."
      ExpectedOk = $false
      ExpectedStage = "classic"
      HarnessName = "Tutorial oracle scenario not appearing fixture"
      Commands = @(
        [ordered]@{
          kind = "createMacro"
          label = "Oracle smoke macro"
        }
      )
      Assertions = $baseAssertions
      PreExportMutation = "none"
      PostExportMutation = "remove-scenario-resource"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    }
  )
}

function Apply-PostExportMutation {
  param(
    [string]$Mutation,
    [string]$ExportDir
  )

  if ($Mutation -eq "none") {
    return $null
  }
  if ($Mutation -eq "remove-scenario-data") {
    $scenarioFile = Join-Path $ExportDir "Scenario"
    $renamed = Join-Path $ExportDir "Scenario.removed-by-fixture"
    if (Test-Path -LiteralPath $renamed) {
      Remove-Item -LiteralPath $renamed -Force
    }
    Move-Item -LiteralPath $scenarioFile -Destination $renamed -Force
    return "Moved $scenarioFile to $renamed"
  }
  if ($Mutation -eq "remove-scenario-resource") {
    $resourceFile = Join-Path $ExportDir "Scenario.rsrc"
    $renamed = Join-Path $ExportDir "Scenario.rsrc.removed-by-fixture"
    if (Test-Path -LiteralPath $renamed) {
      Remove-Item -LiteralPath $renamed -Force
    }
    Move-Item -LiteralPath $resourceFile -Destination $renamed -Force
    return "Moved $resourceFile to $renamed"
  }
  throw "Unknown post-export fixture mutation: $Mutation"
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$fixtures = Get-FixtureDefinitions

if ($ListFixtures) {
  $fixtures |
    Select-Object Name, ExpectedOk, ExpectedStage, Description |
    Format-Table -AutoSize
  exit 0
}

$fixtureDefinition = $fixtures | Where-Object { $_.Name -eq $Fixture } | Select-Object -First 1
if (-not $fixtureDefinition) {
  $available = ($fixtures | ForEach-Object { $_.Name }) -join ", "
  throw "Unknown oracle fixture '$Fixture'. Available fixtures: $available"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($RunRoot)) {
  $RunRoot = Join-Path $repoRoot "tmp\oracle-runs\$stamp-$($fixtureDefinition.Name)"
}
$RunRoot = Resolve-OrCreateDirectory $RunRoot

$safeScenarioName = ($ScenarioName -replace '[\\/:*?"<>|]', "_")
$projectDir = Join-Path $RunRoot "project\$safeScenarioName.providence"
$exportDir = Join-Path $RunRoot "export\$ScenarioName"
$scriptPath = Join-Path $RunRoot "providence-harness.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$classicProfile = Join-Path $RunRoot "realmz-profile"
$classicLogDir = Join-Path $RunRoot "realmz-logs"
$combinedSummary = Join-Path $RunRoot "oracle-summary.json"
$sourceScenario = $null
$classicSummaryPath = $null
$mutationNote = $null
$stage = "setup"
$errorText = $null
$observedOk = $false
$resolvedClassicExePath = $ClassicExePath

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $scriptPath), (Split-Path -Parent $projectDir), (Split-Path -Parent $exportDir), $classicProfile, $classicLogDir | Out-Null

try {
  $stage = "setup"
  $sourceScenario = (Resolve-Path -LiteralPath $SourceScenarioDir).Path
  if (-not (Test-Path -LiteralPath (Join-Path $sourceScenario "Scenario"))) {
    throw "Source scenario is missing its Scenario resource file: $sourceScenario"
  }

  $harnessScript = [ordered]@{
    version = 1
    name = $fixtureDefinition.HarnessName
    sourceScenarioDir = $sourceScenario
    projectName = $ScenarioName
    projectDir = $projectDir
    exportDir = $exportDir
    commands = $fixtureDefinition.Commands
    assertions = $fixtureDefinition.Assertions
  }
  $harnessScript | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $scriptPath -Encoding utf8

  if (-not $SkipBuild) {
    $stage = "build"
    $viteCmd = Join-Path $repoRoot "node_modules\.bin\vite.cmd"
    if (-not (Test-Path -LiteralPath $viteCmd)) {
      throw "Vite CLI shim was not found. Run npm install before oracle smoke: $viteCmd"
    }
    & $viteCmd build
    if ($LASTEXITCODE -ne 0) {
      throw "Vite build failed with exit code $LASTEXITCODE"
    }
    & cargo build --manifest-path (Join-Path $repoRoot "src-tauri\Cargo.toml")
    if ($LASTEXITCODE -ne 0) {
      throw "Cargo build failed with exit code $LASTEXITCODE"
    }
  }

  $stage = "providence"
  $providence = $null
  $vite = $null
  try {
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $viteEntry = Join-Path $repoRoot "node_modules\vite\bin\vite.js"
    $tauriEntry = Join-Path $repoRoot "node_modules\@tauri-apps\cli\tauri.js"
    if (-not (Test-Path -LiteralPath $viteEntry)) {
      throw "Vite entrypoint was not found: $viteEntry"
    }
    if (-not (Test-Path -LiteralPath $tauriEntry)) {
      throw "Tauri CLI entrypoint was not found: $tauriEntry"
    }

    $devPort = 5178
    $portOwner = Get-PortOwner -Port $devPort
    if ($portOwner) {
      $ownerCommand = [string]$portOwner.CommandLine
      if ($ownerCommand -notlike "*vite*" -or $ownerCommand -notlike "*$repoRoot*") {
        throw "Port $devPort is already in use by another process: $ownerCommand"
      }
    } else {
      $viteInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $viteInfo.FileName = $nodeExe
      $viteInfo.Arguments = "`"$viteEntry`" --host 127.0.0.1"
      $viteInfo.WorkingDirectory = $repoRoot
      $viteInfo.UseShellExecute = $false
      foreach ($key in @($viteInfo.Environment.Keys)) {
        if ($key.StartsWith("npm_", [System.StringComparison]::OrdinalIgnoreCase)) {
          $viteInfo.Environment.Remove($key) | Out-Null
        }
      }
      $vite = [System.Diagnostics.Process]::Start($viteInfo)
      if (-not (Wait-ForPort -Port $devPort -TimeoutSeconds 30)) {
        throw "Timed out waiting for Vite dev server on port $devPort"
      }
    }

    $tauriHarnessConfig = Join-Path $RunRoot "tauri-harness-dev.json"
    @{ build = @{ beforeDevCommand = "" } } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $tauriHarnessConfig -Encoding utf8

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodeExe
    $startInfo.Arguments = "`"$tauriEntry`" dev --no-watch --config `"$tauriHarnessConfig`""
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    foreach ($key in @($startInfo.Environment.Keys)) {
      if ($key.StartsWith("npm_", [System.StringComparison]::OrdinalIgnoreCase)) {
        $startInfo.Environment.Remove($key) | Out-Null
      }
    }
    $startInfo.Environment["PROVIDENCE_HARNESS"] = "1"
    $startInfo.Environment["PROVIDENCE_HARNESS_SCRIPT"] = $scriptPath
    $startInfo.Environment["PROVIDENCE_HARNESS_RESULT"] = $resultPath
    $providence = [System.Diagnostics.Process]::Start($startInfo)

    $deadline = (Get-Date).AddSeconds($ProvidenceTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      if (Test-Path -LiteralPath $resultPath) {
        break
      }
      $providence.Refresh()
      if ($providence.HasExited -and -not (Test-Path -LiteralPath $resultPath)) {
        throw "Providence desktop exited before writing a harness result. ExitCode=$($providence.ExitCode)"
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path -LiteralPath $resultPath)) {
      throw "Timed out waiting for Providence harness result: $resultPath"
    }
    if (-not $KeepRunning) {
      Stop-ProcessTree -Process $providence
    }
  } finally {
    if (-not $KeepRunning) {
      Stop-ProcessTree -Process $providence
      if ($vite) {
        Stop-ProcessTree -Process $vite
      }
    }
  }

  $providenceResult = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
  if (-not $providenceResult.ok) {
    throw "Providence harness failed: $($providenceResult.error)"
  }

  $mutationNote = Apply-PostExportMutation -Mutation $fixtureDefinition.PostExportMutation -ExportDir $exportDir

  $stage = "export-preflight"
  if (-not (Test-Path -LiteralPath (Join-Path $exportDir "Scenario"))) {
    throw "Providence export did not produce a Scenario file: $exportDir"
  }

  $stage = "classic-preflight"
  $oracleScript = Join-Path $OracleRoot "scripts\run_providence_oracle.ps1"
  if (-not (Test-Path -LiteralPath $oracleScript)) {
    throw "Classic oracle script not found: $oracleScript"
  }

  if ($fixtureDefinition.ClassicArgs.MissingExe) {
    $resolvedClassicExePath = Join-Path $RunRoot "missing\Realmz.exe"
  } elseif ([string]::IsNullOrWhiteSpace($resolvedClassicExePath)) {
    $classicCandidates = @(
      (Join-Path $OracleRoot "out_win_clang\Realmz.exe"),
      "F:\Realmz\out_win_clang\Realmz.exe"
    )
    $resolvedClassicExePath = ($classicCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  }
  if ([string]::IsNullOrWhiteSpace($resolvedClassicExePath) -or -not (Test-Path -LiteralPath $resolvedClassicExePath)) {
    throw "Classic Realmz executable was not found. Pass -ClassicExePath or build/install Realmz first."
  }
  $resolvedClassicExePath = (Resolve-Path -LiteralPath $resolvedClassicExePath).Path

  $stage = "classic"
  $classicArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $oracleScript,
    "-ScenarioPath", $exportDir,
    "-ScenarioName", $ScenarioName,
    "-ProfileRoot", $classicProfile,
    "-LogDir", $classicLogDir,
    "-ExePath", $resolvedClassicExePath,
    "-TimeoutSeconds", $ClassicTimeoutSeconds
  )
  if ($KeepRunning) {
    $classicArgs += "-KeepRunning"
  }
  if ($fixtureDefinition.ClassicArgs.InjectFatalMarker) {
    $classicArgs += "-InjectFatalMarker"
  }
  & powershell @classicArgs
  $classicExitCode = $LASTEXITCODE

  $classicSummary = Get-ChildItem -LiteralPath $classicLogDir -Filter "providence-oracle-*-summary.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($classicSummary) {
    $classicSummaryPath = $classicSummary.FullName
  }
  if (-not $classicSummaryPath) {
    throw "Classic oracle did not write a summary JSON under $classicLogDir"
  }
  $classicResult = Get-Content -Raw -LiteralPath $classicSummaryPath | ConvertFrom-Json
  if ($classicExitCode -ne 0) {
    throw "Classic oracle script failed with exit code $classicExitCode"
  }
  if (-not $classicResult.Ok) {
    throw "Classic oracle summary reported failure. Summary: $classicSummaryPath"
  }

  $stage = "complete"
  $observedOk = $true
} catch {
  $errorText = $_.Exception.Message
}

$classicResultPathForSummary = $classicSummaryPath
if (-not $classicResultPathForSummary) {
  $classicSummary = Get-ChildItem -LiteralPath $classicLogDir -Filter "providence-oracle-*-summary.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($classicSummary) {
    $classicResultPathForSummary = $classicSummary.FullName
  }
}

$summaryArtifacts = [ordered]@{
  harnessScript = $scriptPath
  providenceResult = $resultPath
  oracleSummary = $combinedSummary
  projectDir = $projectDir
  exportDir = $exportDir
  classicProfile = $classicProfile
  classicLogDir = $classicLogDir
  classicSummary = $classicResultPathForSummary
}

$classicSummaryRequirementOk = (-not $fixtureDefinition.RequiresClassicSummary) -or [bool]$classicResultPathForSummary
$stageMatches = if ($fixtureDefinition.ExpectedOk) {
  $stage -eq $fixtureDefinition.ExpectedStage
} else {
  $stage -eq $fixtureDefinition.ExpectedStage
}
$matchedExpectation = (
  ($observedOk -eq [bool]$fixtureDefinition.ExpectedOk) -and
  $stageMatches -and
  $classicSummaryRequirementOk
)

$summary = [ordered]@{
  fixture = $fixtureDefinition.Name
  expectedOk = [bool]$fixtureDefinition.ExpectedOk
  observedOk = [bool]$observedOk
  matchedExpectation = [bool]$matchedExpectation
  stage = $stage
  expectedStage = $fixtureDefinition.ExpectedStage
  error = $errorText
  timestamp = $stamp
  runRoot = $RunRoot
  scenarioName = $ScenarioName
  sourceScenarioDir = $sourceScenario
  classicExePath = $resolvedClassicExePath
  providenceResult = if (Test-Path -LiteralPath $resultPath) { $resultPath } else { $null }
  classicResult = $classicResultPathForSummary
  exportDir = $exportDir
  mutation = $mutationNote
  artifacts = $summaryArtifacts
}
$summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $combinedSummary -Encoding utf8

if ($matchedExpectation) {
  if ($observedOk) {
    Write-Host "Oracle smoke passed."
  } else {
    Write-Host "Oracle smoke matched expected failure."
  }
  Write-Host "Summary: $combinedSummary"
  exit 0
}

Write-Error "Oracle smoke did not match expectation. Summary: $combinedSummary"
exit 1
