param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ExePath = "F:\Realmz - Providence\src-tauri\target\release\realmz-providence.exe",
  [string]$RunRoot = "",
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "editor_smoke_lib.ps1")

if (-not (Test-Path -LiteralPath $SourceScenarioDir)) {
  throw "Source scenario not found: $SourceScenarioDir"
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Providence release exe not found: $ExePath"
}

if (-not $RunRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\maps-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "Tutorial-MapsAuthoring.providence"
$exportDir = Join-Path $RunRoot "exported-Tutorial"

$commands = @(
  @{ kind = "paintTiles"; label = "Paint smoke tile"; mapId = "land:0"; cells = @(@{ x = 1; y = 1; index = 91; from = 155; to = 62 }) },
  @{ kind = "paintTiles"; label = "Region fill smoke"; mapId = "land:0"; cells = @(
    @{ x = 2; y = 2; index = 182; from = 0; to = 63 },
    @{ x = 3; y = 2; index = 183; from = 0; to = 63 },
    @{ x = 2; y = 3; index = 272; from = 0; to = 63 },
    @{ x = 3; y = 3; index = 273; from = 0; to = 63 }
  ) },
  @{ kind = "paintTiles"; label = "Region replace smoke"; mapId = "land:0"; cells = @(
    @{ x = 2; y = 2; index = 182; from = 63; to = 64 },
    @{ x = 3; y = 2; index = 183; from = 63; to = 64 },
    @{ x = 2; y = 3; index = 272; from = 63; to = 64 },
    @{ x = 3; y = 3; index = 273; from = 63; to = 64 }
  ) },
  @{ kind = "paintTiles"; label = "Region clear smoke"; mapId = "land:0"; cells = @(
    @{ x = 2; y = 2; index = 182; from = 64; to = 1 },
    @{ x = 3; y = 2; index = 183; from = 64; to = 1 },
    @{ x = 2; y = 3; index = 272; from = 64; to = 1 },
    @{ x = 3; y = 3; index = 273; from = 64; to = 1 }
  ) },
  @{ kind = "paintTiles"; label = "Place special stamp smoke"; mapId = "land:0"; cells = @(@{ x = 4; y = 4; index = 364; from = 0; to = -100 }) },
  @{ kind = "paintTiles"; label = "Place removable stamp smoke"; mapId = "land:0"; cells = @(@{ x = 5; y = 4; index = 365; from = 0; to = -101 }) },
  @{ kind = "paintTiles"; label = "Remove stamp smoke"; mapId = "land:0"; cells = @(@{ x = 5; y = 4; index = 365; from = -101; to = 1 }) },
  @{ kind = "updateMapRecord"; label = "Update map record smoke"; id = 0; changes = @{ startX = 2; startY = 2; note = "Providence map record smoke" } },
  @{ kind = "updateRandomLevelSettings"; label = "Update land flags"; levelType = "land"; levelIndex = 0; fields = @{ landlook = 3; isDark = $true; useLos = $true } },
  @{ kind = "deleteTrigger"; label = "Clear AP 7 for reuse"; triggerId = "Data DD:0:7" },
  @{ kind = "createActionPoint"; label = "Reuse AP 7 at 18,18"; levelType = "land"; levelIndex = 0; x = 18; y = 18; displayName = "Map Smoke AP" },
  @{ kind = "moveActionPoint"; label = "Move AP 7 to 19,18"; triggerId = "Data DD:0:7"; levelType = "land"; levelIndex = 0; x = 19; y = 18 },
  @{ kind = "updateTriggerHeader"; label = "Update AP 7 target"; triggerId = "Data DD:0:7"; fields = @{ percent = 75; landid = 0; targetX = 20; targetY = 18 } },
  @{ kind = "createRandomRect"; label = "Create smoke random rectangle"; levelType = "land"; levelIndex = 0; rect = @{ rectIndex = 19; left = 10; top = 10; right = 12; bottom = 12; percent = 2500; battleRange = @(1, 2); randomDoors = @(7, 0, 0); randomDoorPercent = @(10000, 0, 0); only = $false; option = 0; sound = 0; text = 0 } },
  @{ kind = "updateRandomRect"; label = "Edit smoke random rectangle"; levelType = "land"; levelIndex = 0; rectIndex = 19; fields = @{ left = 11; top = 11; right = 13; bottom = 13; percent = 3000; battleRange = @(2, 4); text = 25 } },
  @{ kind = "createRandomRect"; label = "Create clearable random rectangle"; levelType = "land"; levelIndex = 0; rect = @{ rectIndex = 18; left = 30; top = 30; right = 31; bottom = 31; percent = 100; battleRange = @(0, 0); randomDoors = @(0, 0, 0); randomDoorPercent = @(0, 0, 0); only = $false; option = 0; sound = 0; text = 0 } },
  @{ kind = "clearRandomRect"; label = "Clear random rectangle 18"; levelType = "land"; levelIndex = 0; rectIndex = 18 }
)

$script = @{
  version = 1
  name = "maps-authoring-editor-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Tutorial Maps Authoring Smoke"
  projectDir = $projectDir
  exportDir = $exportDir
  reopenAfterSave = $true
  commands = $commands
  assertions = @{
    validationOk = $true
    projectTiles = @(
      @{ mapId = "land:0"; index = 91; value = 62 },
      @{ mapId = "land:0"; index = 182; value = 1 },
      @{ mapId = "land:0"; index = 183; value = 1 },
      @{ mapId = "land:0"; index = 272; value = 1 },
      @{ mapId = "land:0"; index = 273; value = 1 },
      @{ mapId = "land:0"; index = 364; value = -100 },
      @{ mapId = "land:0"; index = 365; value = 1 }
    )
    mapRecords = @(
      @{ id = 0; fields = @{ startX = 2; startY = 2; note = "Providence map record smoke" } }
    )
    triggers = @(
      @{ triggerId = "Data DD:0:7"; fields = @{ active = $true; levelType = "land"; levelIndex = 0; recordIndex = 7; "coordinate.x" = 19; "coordinate.y" = 18; percent = 75; landid = 0; targetX = 20; targetY = 18 } }
    )
    randomLevels = @(
      @{ levelType = "land"; levelIndex = 0; fields = @{ landlook = 3; isDark = $true; useLos = $true }; rects = @(
        @{ rectIndex = 19; fields = @{ left = 11; top = 11; right = 13; bottom = 13; percent = 3000; "battleRange.0" = 2; "battleRange.1" = 4; text = 25 } }
      ) }
    )
    validationWarningsNotContain = @(
      "random rect 19 extra door 0 points at missing Action Point record 7"
    )
    commandsAppliedAtLeast = 16
    exportContains = @("Data LD", "Data DD", "Data RD", "Data MD2")
  }
}

$script | ConvertTo-Json -Depth 20 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath
$exitCode = if ($process -and $process.ExitCode -ne $null) { [int]$process.ExitCode } else { 1 }
if ($exitCode -ne 0) {
  Write-Error "Maps authoring editor smoke failed. Result: $resultPath"
  exit $exitCode
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
if (-not $result.ok) {
  Write-Error "Maps authoring editor smoke assertions failed: $($result.error)"
  exit 1
}

Write-Host "Maps authoring editor smoke passed: $resultPath"
if (-not $KeepArtifacts) {
  Remove-Item -LiteralPath $RunRoot -Recurse -Force
}
exit 0
