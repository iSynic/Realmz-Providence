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
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\text-assets-$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "Tutorial-TextAssets.providence"
$exportDir = Join-Path $RunRoot "exported-Tutorial"

$commands = @(
  @{ kind = "createTargetRecord"; label = "Create smoke message"; recordType = "message"; id = 252 },
  @{ kind = "updateMessageRecord"; label = "Write smoke message"; id = 252; changes = @{ text = "Providence text and assets smoke message." } },
  @{ kind = "duplicateMessageRecord"; label = "Duplicate smoke message"; fromId = 252; toId = 253 },
  @{ kind = "bulkUpdateMessageRecords"; label = "Import smoke text batch"; updates = @(
      @{ id = 252; text = "Providence text import/export smoke message." },
      @{ id = 253; text = "Duplicated message edited through batch import." }
    )
  },
  @{ kind = "updateMessageRecord"; label = "Edit duplicated smoke message"; id = 253; changes = @{ text = "Duplicated message edited in Text workbench smoke." } },
  @{ kind = "deleteTargetRecord"; label = "Clear duplicated smoke message"; recordType = "message"; id = 253 },
  @{ kind = "updateActionSlot"; label = "Reference smoke message"; triggerId = "Data DD:0:5"; slot = 0; rawCode = 1; id = 252 }
)

$script = @{
  version = 1
  name = "text-assets-editor-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Tutorial Text Assets Smoke"
  projectDir = $projectDir
  exportDir = $exportDir
  reopenAfterSave = $true
  commands = $commands
  assertions = @{
    validationOk = $true
    commandsAppliedAtLeast = 7
    actionSlots = @(
      @{ triggerId = "Data DD:0:5"; slot = 0; rawCode = 1; id = 252 }
    )
    targetRecords = @(
      @{ recordType = "message"; id = 252; fields = @{ text = "Providence text import/export smoke message." } },
      @{ recordType = "message"; id = 253; fields = @{ text = "" } }
    )
    exportContains = @("Data SD2", "Data DD", "Scenario")
  }
}

$script | ConvertTo-Json -Depth 20 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath

if (-not (Test-Path -LiteralPath $resultPath)) {
  throw "Providence did not write a smoke result: $resultPath"
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
$ok = [bool]$result.ok
Write-Host "Text/assets editor smoke: ok=$ok commands=$($result.commandsApplied) root=$RunRoot"
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
