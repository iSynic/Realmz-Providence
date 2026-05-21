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

function Get-OracleFixtureDefinitions {
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
      PostExportMutation = "remove-scenario-resource"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    }
  )
}

function Get-OracleFixtureDefinition {
  param([string]$Fixture)
  $fixtures = Get-OracleFixtureDefinitions
  $definition = $fixtures | Where-Object { $_.Name -eq $Fixture } | Select-Object -First 1
  if (-not $definition) {
    $available = ($fixtures | ForEach-Object { $_.Name }) -join ", "
    throw "Unknown oracle fixture '$Fixture'. Available fixtures: $available"
  }
  return $definition
}

function New-OracleRunPaths {
  param(
    [string]$RunRoot,
    [string]$ScenarioName
  )
  $safeScenarioName = ($ScenarioName -replace '[\\/:*?"<>|]', "_")
  return [pscustomobject]@{
    ProjectDir = Join-Path $RunRoot "project\$safeScenarioName.providence"
    ExportDir = Join-Path $RunRoot "export\$ScenarioName"
    ScriptPath = Join-Path $RunRoot "providence-harness.json"
    ResultPath = Join-Path $RunRoot "providence-result.json"
    ClassicProfile = Join-Path $RunRoot "realmz-profile"
    ClassicLogDir = Join-Path $RunRoot "realmz-logs"
    SummaryPath = Join-Path $RunRoot "oracle-summary.json"
  }
}

function Initialize-OracleRunPaths {
  param([object]$Paths)
  New-Item -ItemType Directory -Force -Path `
    (Split-Path -Parent $Paths.ScriptPath), `
    (Split-Path -Parent $Paths.ProjectDir), `
    (Split-Path -Parent $Paths.ExportDir), `
    $Paths.ClassicProfile, `
    $Paths.ClassicLogDir | Out-Null
}

function Write-OracleHarnessScript {
  param(
    [object]$FixtureDefinition,
    [string]$SourceScenario,
    [string]$ScenarioName,
    [object]$Paths
  )
  $harnessScript = [ordered]@{
    version = 1
    name = $FixtureDefinition.HarnessName
    sourceScenarioDir = $SourceScenario
    projectName = $ScenarioName
    projectDir = $Paths.ProjectDir
    exportDir = $Paths.ExportDir
    commands = $FixtureDefinition.Commands
    assertions = $FixtureDefinition.Assertions
  }
  $harnessScript | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Paths.ScriptPath -Encoding utf8
}

function Invoke-OracleBuild {
  param([string]$RepoRoot)
  $viteCmd = Join-Path $RepoRoot "node_modules\.bin\vite.cmd"
  if (-not (Test-Path -LiteralPath $viteCmd)) {
    throw "Vite CLI shim was not found. Run npm install before oracle smoke: $viteCmd"
  }
  & $viteCmd build
  if ($LASTEXITCODE -ne 0) {
    throw "Vite build failed with exit code $LASTEXITCODE"
  }
  & cargo build --manifest-path (Join-Path $RepoRoot "src-tauri\Cargo.toml")
  if ($LASTEXITCODE -ne 0) {
    throw "Cargo build failed with exit code $LASTEXITCODE"
  }
}

function Start-OracleProvidenceHarness {
  param(
    [string]$RepoRoot,
    [string]$RunRoot,
    [string]$ScriptPath = "",
    [string]$ResultPath = "",
    [string]$BatchPath = "",
    [string[]]$ResultPaths = @(),
    [int]$TimeoutSeconds = 180,
    [switch]$KeepRunning
  )

  if ($ResultPaths.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($ResultPath)) {
    $ResultPaths = @($ResultPath)
  }

  $providence = $null
  $vite = $null
  try {
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $viteEntry = Join-Path $RepoRoot "node_modules\vite\bin\vite.js"
    $tauriEntry = Join-Path $RepoRoot "node_modules\@tauri-apps\cli\tauri.js"
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
      if ($ownerCommand -notlike "*vite*" -or $ownerCommand -notlike "*$RepoRoot*") {
        throw "Port $devPort is already in use by another process: $ownerCommand"
      }
    } else {
      $viteInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $viteInfo.FileName = $nodeExe
      $viteInfo.Arguments = "`"$viteEntry`" --host 127.0.0.1"
      $viteInfo.WorkingDirectory = $RepoRoot
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
    $startInfo.WorkingDirectory = $RepoRoot
    $startInfo.UseShellExecute = $false
    foreach ($key in @($startInfo.Environment.Keys)) {
      if ($key.StartsWith("npm_", [System.StringComparison]::OrdinalIgnoreCase)) {
        $startInfo.Environment.Remove($key) | Out-Null
      }
    }
    $startInfo.Environment["PROVIDENCE_HARNESS"] = "1"
    if (-not [string]::IsNullOrWhiteSpace($BatchPath)) {
      $startInfo.Environment["PROVIDENCE_HARNESS_BATCH"] = $BatchPath
    } else {
      $startInfo.Environment["PROVIDENCE_HARNESS_SCRIPT"] = $ScriptPath
      $startInfo.Environment["PROVIDENCE_HARNESS_RESULT"] = $ResultPath
    }
    $providence = [System.Diagnostics.Process]::Start($startInfo)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      $missing = @($ResultPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
      if ($missing.Count -eq 0) {
        break
      }
      $providence.Refresh()
      if ($providence.HasExited -and $missing.Count -gt 0) {
        throw "Providence desktop exited before writing all harness results. ExitCode=$($providence.ExitCode) Missing=$($missing -join ', ')"
      }
      Start-Sleep -Milliseconds 500
    }
    $missingAtDeadline = @($ResultPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missingAtDeadline.Count -gt 0) {
      throw "Timed out waiting for Providence harness results: $($missingAtDeadline -join ', ')"
    }
  } finally {
    if (-not $KeepRunning) {
      Stop-ProcessTree -Process $providence
      if ($vite) {
        Stop-ProcessTree -Process $vite
      }
    }
  }
}

function Apply-OraclePostExportMutation {
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

function Resolve-OracleClassicExePath {
  param(
    [object]$FixtureDefinition,
    [string]$ClassicExePath,
    [string]$OracleRoot,
    [string]$RunRoot
  )

  $resolved = $ClassicExePath
  if ($FixtureDefinition.ClassicArgs.MissingExe) {
    $resolved = Join-Path $RunRoot "missing\Realmz.exe"
  } elseif ([string]::IsNullOrWhiteSpace($resolved)) {
    $classicCandidates = @(
      (Join-Path $OracleRoot "out_win_clang\Realmz.exe"),
      "F:\Realmz\out_win_clang\Realmz.exe"
    )
    $resolved = ($classicCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
  }
  if ([string]::IsNullOrWhiteSpace($resolved) -or -not (Test-Path -LiteralPath $resolved)) {
    throw "Classic Realmz executable was not found. Pass -ClassicExePath or build/install Realmz first."
  }
  return (Resolve-Path -LiteralPath $resolved).Path
}

function Get-OracleClassicSummaryPath {
  param([string]$ClassicLogDir)
  $classicSummary = Get-ChildItem -LiteralPath $ClassicLogDir -Filter "providence-oracle-*-summary.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($classicSummary) {
    return $classicSummary.FullName
  }
  return $null
}

function Invoke-OracleClassic {
  param(
    [object]$FixtureDefinition,
    [string]$OracleRoot,
    [string]$ClassicExePath,
    [string]$RunRoot,
    [string]$ExportDir,
    [string]$ScenarioName,
    [string]$ClassicProfile,
    [string]$ClassicLogDir,
    [int]$ClassicTimeoutSeconds,
    [switch]$KeepRunning
  )

  $oracleScript = Join-Path $OracleRoot "scripts\run_providence_oracle.ps1"
  if (-not (Test-Path -LiteralPath $oracleScript)) {
    throw "Classic oracle script not found: $oracleScript"
  }
  $resolvedClassicExePath = Resolve-OracleClassicExePath `
    -FixtureDefinition $FixtureDefinition `
    -ClassicExePath $ClassicExePath `
    -OracleRoot $OracleRoot `
    -RunRoot $RunRoot

  $classicArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $oracleScript,
    "-ScenarioPath", $ExportDir,
    "-ScenarioName", $ScenarioName,
    "-ProfileRoot", $ClassicProfile,
    "-LogDir", $ClassicLogDir,
    "-ExePath", $resolvedClassicExePath,
    "-TimeoutSeconds", $ClassicTimeoutSeconds
  )
  if ($KeepRunning) {
    $classicArgs += "-KeepRunning"
  }
  if ($FixtureDefinition.ClassicArgs.InjectFatalMarker) {
    $classicArgs += "-InjectFatalMarker"
  }
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $classicOutput = & powershell @classicArgs 2>&1
  $classicExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  $classicOutput | ForEach-Object { Write-Host $_ }
  $classicSummaryPath = Get-OracleClassicSummaryPath -ClassicLogDir $ClassicLogDir
  if (-not $classicSummaryPath) {
    throw "Classic oracle did not write a summary JSON under $ClassicLogDir"
  }
  $classicResult = Get-Content -Raw -LiteralPath $classicSummaryPath | ConvertFrom-Json
  return [pscustomobject]@{
    ExitCode = $classicExitCode
    SummaryPath = $classicSummaryPath
    Result = $classicResult
    ClassicExePath = $resolvedClassicExePath
  }
}

function Write-OracleFixtureSummary {
  param(
    [object]$FixtureDefinition,
    [bool]$ObservedOk,
    [string]$Stage,
    [AllowNull()][string]$ErrorText,
    [string]$Stamp,
    [string]$RunRoot,
    [string]$ScenarioName,
    [AllowNull()][string]$SourceScenario,
    [AllowNull()][string]$ClassicExePath,
    [object]$Paths,
    [AllowNull()][string]$ClassicSummaryPath,
    [AllowNull()][string]$MutationNote,
    [string]$ProvidenceMode = "single"
  )

  $summaryArtifacts = [ordered]@{
    harnessScript = $Paths.ScriptPath
    providenceResult = $Paths.ResultPath
    oracleSummary = $Paths.SummaryPath
    projectDir = $Paths.ProjectDir
    exportDir = $Paths.ExportDir
    classicProfile = $Paths.ClassicProfile
    classicLogDir = $Paths.ClassicLogDir
    classicSummary = $ClassicSummaryPath
  }

  $classicSummaryRequirementOk = (-not $FixtureDefinition.RequiresClassicSummary) -or [bool]$ClassicSummaryPath
  $stageMatches = $Stage -eq $FixtureDefinition.ExpectedStage
  $matchedExpectation = (
    ($ObservedOk -eq [bool]$FixtureDefinition.ExpectedOk) -and
    $stageMatches -and
    $classicSummaryRequirementOk
  )

  $summary = [ordered]@{
    fixture = $FixtureDefinition.Name
    expectedOk = [bool]$FixtureDefinition.ExpectedOk
    observedOk = [bool]$ObservedOk
    matchedExpectation = [bool]$matchedExpectation
    stage = $Stage
    expectedStage = $FixtureDefinition.ExpectedStage
    error = $ErrorText
    timestamp = $Stamp
    runRoot = $RunRoot
    scenarioName = $ScenarioName
    sourceScenarioDir = $SourceScenario
    classicExePath = $ClassicExePath
    providenceMode = $ProvidenceMode
    providenceResult = if (Test-Path -LiteralPath $Paths.ResultPath) { $Paths.ResultPath } else { $null }
    classicResult = $ClassicSummaryPath
    exportDir = $Paths.ExportDir
    mutation = $MutationNote
    artifacts = $summaryArtifacts
  }
  $summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Paths.SummaryPath -Encoding utf8
  return [pscustomobject]$summary
}

function Complete-OracleFixtureAfterProvidence {
  param(
    [object]$FixtureDefinition,
    [string]$Stamp,
    [string]$RunRoot,
    [string]$ScenarioName,
    [string]$SourceScenario,
    [string]$OracleRoot,
    [string]$ClassicExePath,
    [object]$Paths,
    [int]$ClassicTimeoutSeconds,
    [string]$ProvidenceMode = "single",
    [switch]$KeepRunning
  )

  $stage = "providence"
  $errorText = $null
  $observedOk = $false
  $classicSummaryPath = $null
  $mutationNote = $null
  $resolvedClassicExePath = $ClassicExePath

  try {
    $providenceResult = Get-Content -Raw -LiteralPath $Paths.ResultPath | ConvertFrom-Json
    if (-not $providenceResult.ok) {
      throw "Providence harness failed: $($providenceResult.error)"
    }

    $mutationNote = Apply-OraclePostExportMutation -Mutation $FixtureDefinition.PostExportMutation -ExportDir $Paths.ExportDir

    $stage = "export-preflight"
    if (-not (Test-Path -LiteralPath (Join-Path $Paths.ExportDir "Scenario"))) {
      throw "Providence export did not produce a Scenario file: $($Paths.ExportDir)"
    }

    $stage = "classic-preflight"
    $resolvedClassicExePath = Resolve-OracleClassicExePath `
      -FixtureDefinition $FixtureDefinition `
      -ClassicExePath $ClassicExePath `
      -OracleRoot $OracleRoot `
      -RunRoot $RunRoot

    $stage = "classic"
    $classic = Invoke-OracleClassic `
      -FixtureDefinition $FixtureDefinition `
      -OracleRoot $OracleRoot `
      -ClassicExePath $resolvedClassicExePath `
      -RunRoot $RunRoot `
      -ExportDir $Paths.ExportDir `
      -ScenarioName $ScenarioName `
      -ClassicProfile $Paths.ClassicProfile `
      -ClassicLogDir $Paths.ClassicLogDir `
      -ClassicTimeoutSeconds $ClassicTimeoutSeconds `
      -KeepRunning:$KeepRunning
    $classicSummaryPath = $classic.SummaryPath
    $resolvedClassicExePath = $classic.ClassicExePath
    if ($classic.ExitCode -ne 0) {
      throw "Classic oracle script failed with exit code $($classic.ExitCode)"
    }
    if (-not $classic.Result.Ok) {
      throw "Classic oracle summary reported failure. Summary: $classicSummaryPath"
    }

    $stage = "complete"
    $observedOk = $true
  } catch {
    $errorText = $_.Exception.Message
    if (-not $classicSummaryPath) {
      $classicSummaryPath = Get-OracleClassicSummaryPath -ClassicLogDir $Paths.ClassicLogDir
    }
  }

  return Write-OracleFixtureSummary `
    -FixtureDefinition $FixtureDefinition `
    -ObservedOk $observedOk `
    -Stage $stage `
    -ErrorText $errorText `
    -Stamp $Stamp `
    -RunRoot $RunRoot `
    -ScenarioName $ScenarioName `
    -SourceScenario $SourceScenario `
    -ClassicExePath $resolvedClassicExePath `
    -Paths $Paths `
    -ClassicSummaryPath $classicSummaryPath `
    -MutationNote $mutationNote `
    -ProvidenceMode $ProvidenceMode
}
