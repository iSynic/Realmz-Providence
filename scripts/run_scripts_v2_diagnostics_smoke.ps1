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
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\diagnostics-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "Tutorial-ScriptsV2-Diagnostics.providence"
$exportDir = Join-Path $RunRoot "exported-Tutorial"

$commands = @(
  @{ kind = "deleteTrigger"; label = "Clear AP 6 for diagnostics"; triggerId = "Data DD:0:6" },
  @{ kind = "createActionPoint"; label = "Reuse AP 6 at 24,24"; levelType = "land"; levelIndex = 0; x = 24; y = 24; displayName = "Diagnostics AP" },
  @{ kind = "updateEdcdRow"; label = "Create parameter row with missing battle/message"; rowId = 777; values = @(9999, 0, 0, 8888, 0) },
  @{ kind = "updateActionSlot"; label = "AP slot uses missing parameter targets"; triggerId = "Data DD:0:6"; slot = 0; rawCode = 2; id = 777 },
  @{ kind = "createTargetRecord"; label = "Create encounter with missing parameter targets"; recordType = "simpleEncounter"; id = 77 },
  @{ kind = "updateSimpleEncounterRecord"; label = "Encounter row uses missing parameter targets"; id = 77; changes = @{ prompt = 0; canBackOut = $true; maxTimes = 1; casteSuccess = 0; choiceResults = @(0, 0, 0, 0); texts = @("Diagnostics", "", "", ""); actions = @(@{ slot = 0; rawCode = 2; id = 777 }) } }
)

$script = @{
  version = 1
  name = "scripts-v2-diagnostics-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Tutorial Scripts V2 Diagnostics Smoke"
  projectDir = $projectDir
  exportDir = $exportDir
  reopenAfterSave = $true
  commands = $commands
  assertions = @{
    validationOk = $true
    commandsAppliedAtLeast = 6
    actionSlots = @(
      @{ triggerId = "Data DD:0:6"; slot = 0; rawCode = 2; id = 777 }
    )
    edcdRows = @(
      @{ rowId = 777; values = @(9999, 0, 0, 8888, 0) }
    )
    targetRecords = @(
      @{ recordType = "simpleEncounter"; id = 77; fields = @{ "actions.0.rawCode" = 2; "actions.0.id" = 777 } }
    )
    scriptDiagnosticsContain = @(
      @{ triggerId = "Data DD:0:6"; text = "Missing battle low target" },
      @{ triggerId = "Data DD:0:6"; text = "Missing string target" }
    )
    targetDiagnosticsContain = @(
      @{ recordType = "simpleEncounter"; id = 77; text = "Missing battle low target" },
      @{ recordType = "simpleEncounter"; id = 77; text = "Missing string target" }
    )
    exportContains = @("Data DD", "Data EDCD", "Data ED")
  }
}

$script | ConvertTo-Json -Depth 24 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath

if (-not (Test-Path -LiteralPath $resultPath)) {
  throw "Providence did not write a diagnostics smoke result: $resultPath"
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
$ok = [bool]$result.ok
Write-Host "Scripts V2 diagnostics smoke: ok=$ok commands=$($result.commandsApplied) root=$RunRoot"
if (-not $ok) {
  Write-Host "Error: $($result.error)"
}

if (-not $KeepArtifacts -and $ok) {
  Remove-Item -LiteralPath $RunRoot -Recurse -Force
}

if ($process.ExitCode -ne 0 -or -not $ok) {
  exit 1
}
exit 0
