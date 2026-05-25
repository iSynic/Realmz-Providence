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

function New-OracleGameplayDiagnostics {
  param(
    [bool]$TraceStart = $true,
    [bool]$TraceActions = $true,
    [bool]$TraceRender = $true,
    [bool]$CaptureOnTimeout = $true,
    [bool]$AutoAckTextboxes = $false,
    [bool]$AutoAckFlashMessages = $false,
    [bool]$AutoChooseEncounters = $false,
    [bool]$AutoChooseTreasure = $false,
    [int]$AutoChoiceIndex = 1
  )
  return [ordered]@{
    traceStart = $TraceStart
    traceActions = $TraceActions
    traceRender = $TraceRender
    captureOnTimeout = $CaptureOnTimeout
    autoAckTextboxes = $AutoAckTextboxes
    autoAckFlashMessages = $AutoAckFlashMessages
    autoChooseEncounters = $AutoChooseEncounters
    autoChooseTreasure = $AutoChooseTreasure
    autoChoiceIndex = $AutoChoiceIndex
  }
}

function New-OracleRenderFrameStep {
  param(
    [string]$Name,
    [object]$Assert = $null
  )
  $step = [ordered]@{
    name = $Name
    command = "renderFrame"
  }
  if ($Assert) {
    $step.assert = $Assert
  }
  return $step
}

function Get-OracleGameplayFixtureDefinitions {
  $baseAssertions = [ordered]@{
    validationOk = $true
    projectHasMaps = $true
    exportContains = @("Scenario", "Data LD", "Data DD")
    semanticLinkKinds = @("has_render_profile")
  }
  $diagnostics = New-OracleGameplayDiagnostics
  $startStep = [ordered]@{
    name = "start"
    command = "startScenario"
    characters = @("Beldar", "Dirk")
    assert = [ordered]@{
      partyCountAtLeast = 2
      partyContains = @("Beldar", "Dirk")
    }
  }
  $startSteps = @(
    $startStep,
    (New-OracleRenderFrameStep -Name "render-start" -Assert ([ordered]@{ partyCountAtLeast = 2; partyContains = @("Beldar", "Dirk") }))
  )
  $moveSteps = @(
    $startStep,
    (New-OracleRenderFrameStep -Name "render-start" -Assert ([ordered]@{ partyCountAtLeast = 2; partyContains = @("Beldar", "Dirk") })),
    [ordered]@{ name = "noclip"; command = "setNoclip"; enabled = $true; assert = [ordered]@{ noclip = $true } },
    [ordered]@{ name = "before-move"; command = "warpOutdoor"; map = 0; look = 0; x = 19; y = 20; assert = [ordered]@{ globalX = 19; globalY = 20 } },
    (New-OracleRenderFrameStep -Name "render-before-move" -Assert ([ordered]@{ globalX = 19; globalY = 20 })),
    [ordered]@{ name = "after-move"; command = "move"; direction = "east"; assert = [ordered]@{ deltaFrom = [ordered]@{ from = "before-move"; dx = 1; dy = 0 } } },
    (New-OracleRenderFrameStep -Name "render-after-move" -Assert ([ordered]@{ globalX = 20; globalY = 20 }))
  )
  $saveLoadSteps = @(
    $startStep,
    (New-OracleRenderFrameStep -Name "render-start" -Assert ([ordered]@{ partyCountAtLeast = 2; partyContains = @("Beldar", "Dirk") })),
    [ordered]@{ name = "noclip"; command = "setNoclip"; enabled = $true },
    [ordered]@{ name = "saved-position"; command = "warpOutdoor"; map = 0; look = 0; x = 19; y = 20; assert = [ordered]@{ globalX = 19; globalY = 20 } },
    (New-OracleRenderFrameStep -Name "render-saved-position" -Assert ([ordered]@{ globalX = 19; globalY = 20 })),
    [ordered]@{ name = "save-a"; command = "saveSlot"; slot = "A"; assert = [ordered]@{ saveSlotAExists = $true } },
    [ordered]@{ name = "away"; command = "warpOutdoor"; map = 0; look = 0; x = 30; y = 30; assert = [ordered]@{ globalX = 30; globalY = 30 } },
    (New-OracleRenderFrameStep -Name "render-away" -Assert ([ordered]@{ globalX = 30; globalY = 30 })),
    [ordered]@{ name = "load-a"; command = "loadSlot"; slot = "A"; assert = [ordered]@{ sameAs = [ordered]@{ from = "saved-position"; fields = @("globalX", "globalY", "landLevel", "inDungeon", "partyCount", "characters") } } },
    (New-OracleRenderFrameStep -Name "render-loaded" -Assert ([ordered]@{ sameAs = [ordered]@{ from = "saved-position"; fields = @("globalX", "globalY", "landLevel", "inDungeon", "partyCount", "characters") } }))
  )

  return @(
    [pscustomobject]@{
      Name = "tutorial-gameplay-start"
      Description = "Export Tutorial, start the scenario, and assert a seeded party is active."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle gameplay start"
      Commands = @()
      Assertions = $baseAssertions
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay start"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = $startSteps; assertions = [ordered]@{ partyCountAtLeast = 2 } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "tutorial-gameplay-move"
      Description = "Start Tutorial, warp to a stable outdoor coordinate, move east, and assert the coordinate delta."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle gameplay movement"
      Commands = @()
      Assertions = $baseAssertions
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay movement"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = $moveSteps; assertions = [ordered]@{ globalX = 20; globalY = 20 } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "tutorial-gameplay-trigger"
      Description = "Author a deterministic action point at 20,20, move onto it, and assert quest flag 7 is set."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle gameplay trigger"
      Commands = @(
        [ordered]@{
          kind = "updateTriggerHeader"
          label = "Oracle repoint trigger"
          triggerId = "Data DD:0:99"
          fields = [ordered]@{
            doorid = 2020
            coordinate = [ordered]@{ x = 20; y = 20 }
            percent = 100
            landid = 0
            targetX = 20
            targetY = 20
            active = $true
          }
        },
        [ordered]@{
          kind = "paintTiles"
          label = "Oracle paint trigger tile"
          mapId = "land:0"
          cells = @([ordered]@{ x = 20; y = 20; index = 1820; from = 155; to = -1109 })
        },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle set quest trigger"; triggerId = "Data DD:0:99"; slot = 0; rawCode = 47; id = 7 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 1"; triggerId = "Data DD:0:99"; slot = 1; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 2"; triggerId = "Data DD:0:99"; slot = 2; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 3"; triggerId = "Data DD:0:99"; slot = 3; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 4"; triggerId = "Data DD:0:99"; slot = 4; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 5"; triggerId = "Data DD:0:99"; slot = 5; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 6"; triggerId = "Data DD:0:99"; slot = 6; rawCode = 0; id = 0 },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle clear trigger slot 7"; triggerId = "Data DD:0:99"; slot = 7; rawCode = 0; id = 0 }
      )
      Assertions = [ordered]@{
        validationOk = $true
        projectHasMaps = $true
        projectTiles = @([ordered]@{ mapId = "land:0"; index = 1820; value = -1109 })
        triggerCountAtLeast = 1
        commandsAppliedAtLeast = 10
        exportContains = @("Scenario", "Data LD", "Data DD")
        semanticLinkKinds = @("has_render_profile")
      }
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay trigger"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = $moveSteps; assertions = [ordered]@{ questEquals = [ordered]@{ "7" = 1 }; globalX = 20; globalY = 20 } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "tutorial-gameplay-save-load"
      Description = "Start Tutorial, save slot A, move away, load slot A, and assert location and party state restore."
      ExpectedOk = $true
      ExpectedStage = "complete"
      HarnessName = "Tutorial oracle gameplay save load"
      Commands = @()
      Assertions = $baseAssertions
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay save load"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = $saveLoadSteps; assertions = [ordered]@{ sameAs = [ordered]@{ from = "saved-position"; fields = @("globalX", "globalY", "landLevel", "inDungeon", "partyCount", "characters") } } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "missing-staged-character"
      Description = "Ask Classic gameplay start to load a character that does not exist."
      ExpectedOk = $false
      ExpectedStage = "classic"
      HarnessName = "Tutorial oracle gameplay missing character"
      Commands = @()
      Assertions = $baseAssertions
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay missing character"; diagnostics = $diagnostics; requiredCharacters = @("OracleMissingHero"); steps = @([ordered]@{ name = "start"; command = "startScenario"; characters = @("OracleMissingHero") }); assertions = @{} }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "trigger-not-fired"
      Description = "Author the trigger but assert quest 7 without moving onto the action point."
      ExpectedOk = $false
      ExpectedStage = "classic"
      HarnessName = "Tutorial oracle gameplay trigger not fired"
      Commands = @(
        [ordered]@{ kind = "updateTriggerHeader"; label = "Oracle repoint trigger"; triggerId = "Data DD:0:99"; fields = [ordered]@{ doorid = 2020; coordinate = [ordered]@{ x = 20; y = 20 }; percent = 100; landid = 0; targetX = 20; targetY = 20; active = $true } },
        [ordered]@{ kind = "paintTiles"; label = "Oracle paint trigger tile"; mapId = "land:0"; cells = @([ordered]@{ x = 20; y = 20; index = 1820; from = 155; to = -1109 }) },
        [ordered]@{ kind = "updateActionSlot"; label = "Oracle set quest trigger"; triggerId = "Data DD:0:99"; slot = 0; rawCode = 47; id = 7 }
      )
      Assertions = [ordered]@{ validationOk = $true; projectHasMaps = $true; commandsAppliedAtLeast = 3; exportContains = @("Scenario", "Data LD", "Data DD") }
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay trigger not fired"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = @($startStep, (New-OracleRenderFrameStep -Name "render-start"), [ordered]@{ name = "before-trigger"; command = "warpOutdoor"; map = 0; look = 0; x = 19; y = 20 }, (New-OracleRenderFrameStep -Name "render-before-trigger")); assertions = [ordered]@{ questEquals = [ordered]@{ "7" = 1 } } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    },
    [pscustomobject]@{
      Name = "save-load-restore-mismatch"
      Description = "Run save/load but require the loaded position to match the wrong coordinate."
      ExpectedOk = $false
      ExpectedStage = "classic"
      HarnessName = "Tutorial oracle gameplay save load mismatch"
      Commands = @()
      Assertions = $baseAssertions
      GameplayScript = [ordered]@{ version = 1; name = "Tutorial gameplay save load mismatch"; diagnostics = $diagnostics; requiredCharacters = @("Beldar", "Dirk"); steps = $saveLoadSteps; assertions = [ordered]@{ globalX = 99 } }
      PostExportMutation = "none"
      ClassicArgs = @{}
      RequiresClassicSummary = $true
    }
  )
}

function Get-OracleGameplayFixtureDefinition {
  param([string]$Fixture)
  $fixtures = Get-OracleGameplayFixtureDefinitions
  $definition = $fixtures | Where-Object { $_.Name -eq $Fixture } | Select-Object -First 1
  if (-not $definition) {
    $available = ($fixtures | ForEach-Object { $_.Name }) -join ", "
    throw "Unknown oracle gameplay fixture '$Fixture'. Available fixtures: $available"
  }
  return $definition
}

function Read-OracleCorpusBaseline {
  param([string]$RepoRoot)
  $baselinePath = Join-Path $RepoRoot "scripts\oracle_corpus_baseline.json"
  if (-not (Test-Path -LiteralPath $baselinePath)) {
    throw "Oracle corpus baseline was not found: $baselinePath"
  }
  return Get-Content -Raw -LiteralPath $baselinePath | ConvertFrom-Json
}

function Assert-OracleCorpusRootSafe {
  param(
    [string]$CorpusRoot,
    [string]$OracleRoot
  )
  $resolvedCorpus = (Resolve-Path -LiteralPath $CorpusRoot).Path
  $resolvedOracle = (Resolve-Path -LiteralPath $OracleRoot).Path
  $runtimeScenarioRoot = [System.IO.Path]::GetFullPath((Join-Path $resolvedOracle "out_win_clang\Scenarios"))
  $runtimePrefix = $runtimeScenarioRoot.TrimEnd('\') + '\'
  if (
    $resolvedCorpus.Equals($runtimeScenarioRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolvedCorpus.StartsWith($runtimePrefix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "Refusing to use the Classic runtime mirror as corpus source. CorpusRoot=$resolvedCorpus RuntimeMirrorRoot=$runtimeScenarioRoot"
  }
  return $resolvedCorpus
}

function Get-OracleCorpusScenarioEntries {
  param(
    [object]$Baseline,
    [string]$CorpusRoot,
    [string]$Scenario = "",
    [int]$MaxScenarios = 0
  )
  $entries = @()
  foreach ($baselineScenario in @($Baseline.scenarios)) {
    $name = [string]$baselineScenario.name
    if (-not [string]::IsNullOrWhiteSpace($Scenario) -and $name -ne $Scenario) {
      continue
    }
    $sourcePath = Join-Path $CorpusRoot $name
    $entries += [pscustomobject]@{
      Name = $name
      SourcePath = $sourcePath
      Exists = (Test-Path -LiteralPath (Join-Path $sourcePath "Scenario"))
      Baseline = $baselineScenario
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($Scenario) -and $entries.Count -eq 0) {
    $available = (@($Baseline.scenarios) | ForEach-Object { [string]$_.name }) -join ", "
    throw "Unknown corpus scenario '$Scenario'. Available scenarios: $available"
  }
  if ($MaxScenarios -gt 0) {
    $entries = @($entries | Select-Object -First $MaxScenarios)
  }
  return @($entries)
}

function ConvertTo-OracleSafeName {
  param([string]$Name)
  $safe = ($Name -replace '[\\/:*?"<>|]', "_")
  $safe = ($safe -replace '\s+', "-")
  return $safe
}

function New-OracleCorpusFixtureDefinition {
  param(
    [string]$ScenarioName,
    [object]$BaselineEntry
  )
  $visualGate = [bool]$BaselineEntry.visualGate
  $depth = if ($BaselineEntry.depth) { [string]$BaselineEntry.depth } else { "import-select-start" }
  $notes = if ($BaselineEntry.notes) { [string]$BaselineEntry.notes } else { "" }
  $failureKind = if ($BaselineEntry.failureKind) { [string]$BaselineEntry.failureKind } else { $null }
  $lastGoodStage = if ($BaselineEntry.lastGoodStage) { [string]$BaselineEntry.lastGoodStage } else { $null }
  $diagnosticOwner = if ($BaselineEntry.diagnosticOwner) { [string]$BaselineEntry.diagnosticOwner } else { $null }
  $markerNotes = if ($BaselineEntry.markerNotes) { [string]$BaselineEntry.markerNotes } else { $null }
  $suspectedCause = if ($BaselineEntry.suspectedCause) { [string]$BaselineEntry.suspectedCause } else { $null }
  $diagnostics = New-OracleGameplayDiagnostics -AutoAckTextboxes $true -AutoAckFlashMessages $true -AutoChooseEncounters $true -AutoChooseTreasure $true -AutoChoiceIndex 1
  $scenarioAssert = [ordered]@{
    scenarioNameContains = $ScenarioName
    partyCountAtLeast = 2
    partyContains = @("Beldar", "Dirk")
  }
  $startSteps = @(
    [ordered]@{
      name = "start"
      command = "startScenario"
      characters = @("Beldar", "Dirk")
      assert = $scenarioAssert
    },
    (New-OracleRenderFrameStep -Name "render-start" -Assert $scenarioAssert),
    [ordered]@{
      name = "snapshot"
      command = "snapshot"
      assert = $scenarioAssert
    }
  )
  return [pscustomobject]@{
    Name = $ScenarioName
    Description = "Corpus conformance for $ScenarioName."
    ExpectedOk = [bool]$BaselineEntry.expectedOk
    ExpectedStage = [string]$BaselineEntry.expectedStage
    HarnessName = "$ScenarioName oracle corpus conformance"
    Commands = @()
    Assertions = [ordered]@{
      validationOk = $true
      projectHasMaps = $true
      exportContains = @("Scenario", "Data LD", "Data DD")
      semanticLinkKinds = @("has_render_profile")
    }
    GameplayScript = [ordered]@{
      version = 1
      name = "$ScenarioName corpus start"
      diagnostics = $diagnostics
      requiredCharacters = @("Beldar", "Dirk")
      steps = $startSteps
      assertions = [ordered]@{
        scenarioNameContains = $ScenarioName
        partyCountAtLeast = 2
      }
    }
    PostExportMutation = "none"
    ClassicArgs = @{ VisualGate = $visualGate; SupportScenarioName = "City of Bywater" }
    RequiresClassicSummary = $true
    Corpus = [ordered]@{
      scenarioName = $ScenarioName
      depth = $depth
      visualGate = $visualGate
      failureKind = $failureKind
      lastGoodStage = $lastGoodStage
      diagnosticOwner = $diagnosticOwner
      suspectedCause = $suspectedCause
      markerNotes = $markerNotes
      notes = $notes
    }
  }
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
    GameplayScriptPath = Join-Path $RunRoot "classic-gameplay-script.json"
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

function Write-OracleGameplayScript {
  param(
    [object]$FixtureDefinition,
    [object]$Paths
  )
  if (-not ($FixtureDefinition.PSObject.Properties.Name -contains "GameplayScript")) {
    return $null
  }
  $FixtureDefinition.GameplayScript | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Paths.GameplayScriptPath -Encoding utf8
  return $Paths.GameplayScriptPath
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
    [string]$GameplayScriptPath = "",
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
  if (-not [string]::IsNullOrWhiteSpace($GameplayScriptPath)) {
    $classicArgs += @("-GameplayScriptPath", $GameplayScriptPath)
    $classicArgs += @("-GameplayTimeoutSeconds", $ClassicTimeoutSeconds)
  }
  if ($KeepRunning) {
    $classicArgs += "-KeepRunning"
  }
  if ($FixtureDefinition.ClassicArgs.InjectFatalMarker) {
    $classicArgs += "-InjectFatalMarker"
  }
  if ($FixtureDefinition.ClassicArgs.VisualGate) {
    $classicArgs += "-VisualGate"
  }
  if ($FixtureDefinition.ClassicArgs.SeedProfile) {
    $classicArgs += "-SeedProfile"
  }
  if ($FixtureDefinition.ClassicArgs.TraceLevel) {
    $classicArgs += @("-TraceLevel", [string]$FixtureDefinition.ClassicArgs.TraceLevel)
  }
  $supportScenarioName = if ($FixtureDefinition.ClassicArgs.SupportScenarioName) {
    [string]$FixtureDefinition.ClassicArgs.SupportScenarioName
  } else {
    "City of Bywater"
  }
  $supportScenarioPath = if ($FixtureDefinition.ClassicArgs.SupportScenarioPath) {
    [string]$FixtureDefinition.ClassicArgs.SupportScenarioPath
  } else {
    $defaultSupportScenarioPath = "F:\Realmz\out_win_clang\Scenarios\$supportScenarioName"
    if (Test-Path -LiteralPath (Join-Path $defaultSupportScenarioPath "Scenario")) {
      $defaultSupportScenarioPath
    } else {
      ""
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($supportScenarioPath) -and $supportScenarioName -ne $ScenarioName) {
    $classicArgs += @("-SupportScenarioPath", $supportScenarioPath)
    $classicArgs += @("-SupportScenarioName", $supportScenarioName)
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
    gameplayScript = if ($Paths.PSObject.Properties.Name -contains "GameplayScriptPath") { $Paths.GameplayScriptPath } else { $null }
    oracleSummary = $Paths.SummaryPath
    projectDir = $Paths.ProjectDir
    exportDir = $Paths.ExportDir
    classicProfile = $Paths.ClassicProfile
    classicLogDir = $Paths.ClassicLogDir
    classicSummary = $ClassicSummaryPath
  }

  $classicResult = if ($ClassicSummaryPath -and (Test-Path -LiteralPath $ClassicSummaryPath)) {
    Get-Content -Raw -LiteralPath $ClassicSummaryPath | ConvertFrom-Json
  } else {
    $null
  }
  $gameplayResult = if ($classicResult) { $classicResult.GameplayResult } else { $null }
  $visualFailures = if ($classicResult) { @($classicResult.VisualFailures) } else { @() }
  $visualWarnings = if ($classicResult) { @($classicResult.VisualWarnings) } else { @() }
  $corpus = if ($FixtureDefinition.PSObject.Properties.Name -contains "Corpus") { $FixtureDefinition.Corpus } else { $null }
  $failureKind = if ($corpus -and $corpus.failureKind) { [string]$corpus.failureKind } else { $null }
  $lastGoodStage = if ($corpus -and $corpus.lastGoodStage) { [string]$corpus.lastGoodStage } else { $null }
  $markerNotes = if ($corpus -and $corpus.markerNotes) { [string]$corpus.markerNotes } else { $null }
  $diagnosticOwner = if ($corpus -and $corpus.diagnosticOwner) { [string]$corpus.diagnosticOwner } else { $null }
  $suspectedCause = if ($corpus -and $corpus.suspectedCause) { [string]$corpus.suspectedCause } else { $null }
  $visualRegionDiagnostics = if ($gameplayResult -and ($gameplayResult.PSObject.Properties.Name -contains "VisualRegions")) {
    @($gameplayResult.VisualRegions)
  } elseif ($classicResult -and ($classicResult.PSObject.Properties.Name -contains "VisualRegionDiagnostics")) {
    @($classicResult.VisualRegionDiagnostics)
  } else {
    @()
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
    corpus = $corpus
    failureKind = $failureKind
    lastGoodStage = $lastGoodStage
    diagnosis = [ordered]@{
      failureKind = $failureKind
      lastGoodStage = $lastGoodStage
      diagnosticOwner = $diagnosticOwner
      suspectedCause = $suspectedCause
      markerNotes = $markerNotes
      traceLevel = if ($FixtureDefinition.ClassicArgs.TraceLevel) { [string]$FixtureDefinition.ClassicArgs.TraceLevel } else { $null }
      lastGameplayMarker = if ($classicResult -and $classicResult.GameplayMarkers) { @($classicResult.GameplayMarkers)[-1] } else { $null }
      lastNewlandMarker = if ($classicResult -and $classicResult.NewlandMarkers) { @($classicResult.NewlandMarkers)[-1] } else { $null }
      timeoutArtifacts = if ($gameplayResult -and ($gameplayResult.PSObject.Properties.Name -contains "TimeoutArtifacts")) { $gameplayResult.TimeoutArtifacts } else { $null }
    }
    startResult = if ($gameplayResult) {
      [ordered]@{
        ok = [bool]$gameplayResult.Ok
        stage = $gameplayResult.Stage
        failedAssertion = $gameplayResult.FailedAssertion
        error = $gameplayResult.Error
      }
    } else { $null }
    visualDiagnostics = if ($classicResult) {
      [ordered]@{
        visualGate = [bool]$classicResult.VisualGate
        warnings = @($visualWarnings)
        failures = @($visualFailures)
        internalScreenshots = if ($gameplayResult) { @($gameplayResult.Screenshots) } else { @() }
        hostScreenshots = if ($gameplayResult) { @($gameplayResult.HostScreenshots) } else { @() }
      }
    } else { $null }
    visualRegionDiagnostics = @($visualRegionDiagnostics)
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
    $gameplayScriptPath = ""
    if (($FixtureDefinition.PSObject.Properties.Name -contains "GameplayScript") -and (Test-Path -LiteralPath $Paths.GameplayScriptPath)) {
      $gameplayScriptPath = $Paths.GameplayScriptPath
    }
    $classic = Invoke-OracleClassic `
      -FixtureDefinition $FixtureDefinition `
      -OracleRoot $OracleRoot `
      -ClassicExePath $resolvedClassicExePath `
      -RunRoot $RunRoot `
      -ExportDir $Paths.ExportDir `
      -ScenarioName $ScenarioName `
      -ClassicProfile $Paths.ClassicProfile `
      -ClassicLogDir $Paths.ClassicLogDir `
      -GameplayScriptPath $gameplayScriptPath `
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
