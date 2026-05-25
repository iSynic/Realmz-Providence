param(
  [string]$SourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$ExePath = "F:\Realmz - Providence\src-tauri\target\release\realmz-providence.exe",
  [string]$RunRoot = "",
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "editor_smoke_lib.ps1")

function New-NumberArray([int]$Length, [int]$First = 0) {
  $values = @()
  for ($i = 0; $i -lt $Length; $i++) {
    if ($i -eq 0) { $values += $First } else { $values += 0 }
  }
  return $values
}

if (-not (Test-Path -LiteralPath $SourceScenarioDir)) {
  throw "Source scenario not found: $SourceScenarioDir"
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Providence release exe not found: $ExePath"
}

if (-not $RunRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $RunRoot = Join-Path (Resolve-Path ".").Path "tmp\editor-smoke-runs\$stamp"
}
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$scriptPath = Join-Path $RunRoot "providence-script.json"
$resultPath = Join-Path $RunRoot "providence-result.json"
$projectDir = Join-Path $RunRoot "Tutorial-ScriptsV2.providence"
$exportDir = Join-Path $RunRoot "exported-Tutorial"

$battleGrid = New-NumberArray -Length 169 -First 77
$battleGrid[168] = 88
$treasureItems = New-NumberArray -Length 20 -First 1
$treasureItems[1] = 2
$treasureItems[2] = 3
$treasureItems[19] = 620
$shopItems = New-NumberArray -Length 1000 -First 1
$shopItems[999] = 845
$shopQty = New-NumberArray -Length 1000 -First 3
$shopQty[999] = 8

$commands = @(
  @{ kind = "deleteTrigger"; label = "Clear AP 5 for reuse"; triggerId = "Data DD:0:5" },
  @{ kind = "createActionPoint"; label = "Reuse AP 5 at 22,22"; levelType = "land"; levelIndex = 0; x = 22; y = 22; displayName = "Smoke AP" },
  @{ kind = "createTargetRecord"; label = "Create smoke message"; recordType = "message"; id = 250 },
  @{ kind = "updateMessageRecord"; label = "Write smoke message"; id = 250; changes = @{ text = "Providence Scripts V2 smoke message." } },
  @{ kind = "updateActionSlot"; label = "Slot 0 message"; triggerId = "Data DD:0:5"; slot = 0; rawCode = 1; id = 250 },
  @{ kind = "createTargetRecord"; label = "Create smoke battle"; recordType = "battle"; id = 40 },
  @{ kind = "updateBattleRecord"; label = "Edit smoke battle"; id = 40; changes = @{ dist = 2; messageBefore = 250; messageAfter = 250; battleMacro = 0; grid = $battleGrid } },
  @{ kind = "updateEdcdRow"; label = "Battle EDCD row points at smoke battle"; rowId = 40; values = @(40, 0, 0, 250, 0) },
  @{ kind = "updateActionSlot"; label = "Slot 1 battle"; triggerId = "Data DD:0:5"; slot = 1; rawCode = 2; id = 40 },
  @{ kind = "createTargetRecord"; label = "Create smoke treasure"; recordType = "treasure"; id = 40 },
  @{ kind = "updateTreasureRecord"; label = "Edit smoke treasure"; id = 40; changes = @{ itemIds = $treasureItems; exp = 10; gold = 20; gems = 1; jewelry = 0 } },
  @{ kind = "updateActionSlot"; label = "Slot 2 treasure"; triggerId = "Data DD:0:5"; slot = 2; rawCode = 10; id = 40 },
  @{ kind = "createTargetRecord"; label = "Create smoke shop"; recordType = "shop"; id = 40 },
  @{ kind = "updateShopRecord"; label = "Edit smoke shop"; id = 40; changes = @{ itemIds = $shopItems; quantities = $shopQty; inflation = 100 } },
  @{ kind = "updateActionSlot"; label = "Slot 3 shop"; triggerId = "Data DD:0:5"; slot = 3; rawCode = 6; id = 40 },
  @{ kind = "createTargetRecord"; label = "Create smoke simple encounter"; recordType = "simpleEncounter"; id = 40 },
  @{ kind = "updateSimpleEncounterRecord"; label = "Edit smoke simple encounter"; id = 40; changes = @{ prompt = 250; canBackOut = $true; maxTimes = 3; casteSuccess = 2; choiceResults = @(1, 2, 3, 4); texts = @("Simple smoke option", "", "", "Simple smoke final option"); actions = @(@{ slot = 0; rawCode = 1; id = 250 }, @{ slot = 1; rawCode = 10; id = 40 }, @{ slot = 2; rawCode = 65; id = 320 }) } },
  @{ kind = "updateActionSlot"; label = "Slot 4 simple encounter"; triggerId = "Data DD:0:5"; slot = 4; rawCode = 4; id = 40 },
  @{ kind = "createTargetRecord"; label = "Create smoke complex encounter"; recordType = "complexEncounter"; id = 40 },
  @{ kind = "updateComplexEncounterRecord"; label = "Edit smoke complex encounter"; id = 40; changes = @{ prompt = 250; canBackOut = $true; thief = $true; maxTimes = 4; casteSuccess = 3; thiefSuccess = 2; thiefFail = -1; choiceResults = @(4, 3, 2, 1); wordResults = @(1, 3, 5, 7); texts = @("Complex smoke option", "", "", "", "", "", "", "", "Complex final"); actions = @(@{ slot = 0; rawCode = 1; id = 250 }, @{ slot = 1; rawCode = 6; id = 40 }, @{ slot = 2; rawCode = 2; id = 40 }) } },
  @{ kind = "updateActionSlot"; label = "Slot 5 complex encounter"; triggerId = "Data DD:0:5"; slot = 5; rawCode = 5; id = 40 },
  @{ kind = "createTargetRecord"; label = "Create clearable battle"; recordType = "battle"; id = 41 },
  @{ kind = "updateBattleRecord"; label = "Edit clearable battle"; id = 41; changes = @{ dist = 9; messageBefore = 250; messageAfter = 250; battleMacro = 0; grid = $battleGrid } },
  @{ kind = "deleteTargetRecord"; label = "Clear clearable battle"; recordType = "battle"; id = 41 },
  @{ kind = "createTargetRecord"; label = "Create clearable treasure"; recordType = "treasure"; id = 41 },
  @{ kind = "updateTreasureRecord"; label = "Edit clearable treasure"; id = 41; changes = @{ itemIds = $treasureItems; exp = 99; gold = 88; gems = 7; jewelry = 6 } },
  @{ kind = "deleteTargetRecord"; label = "Clear clearable treasure"; recordType = "treasure"; id = 41 },
  @{ kind = "createTargetRecord"; label = "Create clearable shop"; recordType = "shop"; id = 41 },
  @{ kind = "updateShopRecord"; label = "Edit clearable shop"; id = 41; changes = @{ itemIds = $shopItems; quantities = $shopQty; inflation = 125 } },
  @{ kind = "deleteTargetRecord"; label = "Clear clearable shop"; recordType = "shop"; id = 41 },
  @{ kind = "createTargetRecord"; label = "Create clearable simple encounter"; recordType = "simpleEncounter"; id = 41 },
  @{ kind = "updateSimpleEncounterRecord"; label = "Edit clearable simple encounter"; id = 41; changes = @{ prompt = 250; canBackOut = $true; maxTimes = 9; casteSuccess = 8; choiceResults = @(4, 3, 2, 1); texts = @("Clear simple", "", "", ""); actions = @(@{ slot = 0; rawCode = 1; id = 250 }) } },
  @{ kind = "deleteTargetRecord"; label = "Clear clearable simple encounter"; recordType = "simpleEncounter"; id = 41 },
  @{ kind = "createTargetRecord"; label = "Create clearable complex encounter"; recordType = "complexEncounter"; id = 41 },
  @{ kind = "updateComplexEncounterRecord"; label = "Edit clearable complex encounter"; id = 41; changes = @{ prompt = 250; canBackOut = $true; thief = $true; maxTimes = 9; casteSuccess = 8; thiefSuccess = 7; thiefFail = 6; choiceResults = @(1, 2, 3, 4); wordResults = @(5, 6, 7, 8); texts = @("Clear complex", "", "", "", "", "", "", "", ""); actions = @(@{ slot = 0; rawCode = 6; id = 40 }) } },
  @{ kind = "deleteTargetRecord"; label = "Clear clearable complex encounter"; recordType = "complexEncounter"; id = 41 },
  @{ kind = "applyRealmzScriptStep"; label = "Slot 7 random items EDCD"; triggerId = "Data DD:0:5"; slot = 7; opcode = 65; id = 320; edcdValues = @(1, 2, 3, 4, 5) },
  @{ kind = "duplicateActionSlot"; label = "Duplicate slot 0 to slot 6"; triggerId = "Data DD:0:5"; fromSlot = 0; toSlot = 6 },
  @{ kind = "swapActionSlots"; label = "Swap slot 6 and 7"; triggerId = "Data DD:0:5"; fromSlot = 6; toSlot = 7 },
  @{ kind = "deleteActionSlot"; label = "Clear slot 6"; triggerId = "Data DD:0:5"; slot = 6 },
  @{ kind = "createTargetRecord"; label = "Create clearable smoke message"; recordType = "message"; id = 251 },
  @{ kind = "updateMessageRecord"; label = "Write clearable smoke message"; id = 251; changes = @{ text = "This message should be cleared." } },
  @{ kind = "deleteTargetRecord"; label = "Clear smoke message"; recordType = "message"; id = 251 },
  @{ kind = "upsertQuestLabel"; label = "Create smoke quest label"; quest = @{ id = 77; label = "Smoke Quest"; note = "should be removed" } },
  @{ kind = "deleteQuestLabel"; label = "Clear smoke quest label"; id = 77 }
)

$script = @{
  version = 1
  name = "scripts-v2-editor-smoke"
  sourceScenarioDir = $SourceScenarioDir
  projectName = "Tutorial Scripts V2 Smoke"
  projectDir = $projectDir
  exportDir = $exportDir
  reopenAfterSave = $true
  commands = $commands
  assertions = @{
    validationOk = $true
    validationWarningsNotContain = @(
      "Data DD:0:5 action slot 0 references message 250",
      "Data DD:0:5 action slot 1 references battle 40",
      "Data DD:0:5 action slot 2 references treasure 40",
      "Data DD:0:5 action slot 3 references shop 40",
      "Data DD:0:5 action slot 4 references simple encounter 40",
      "Data DD:0:5 action slot 5 references complex encounter 40"
    )
    commandsAppliedAtLeast = 45
    triggerCountAtLeast = 100
    triggers = @(
      @{ triggerId = "Data DD:0:5"; fields = @{ active = $true; levelType = "land"; levelIndex = 0; recordIndex = 5; "coordinate.x" = 22; "coordinate.y" = 22; percent = 100 } }
    )
    actionSlots = @(
      @{ triggerId = "Data DD:0:5"; slot = 0; rawCode = 1; id = 250 },
      @{ triggerId = "Data DD:0:5"; slot = 1; rawCode = 2; id = 40 },
      @{ triggerId = "Data DD:0:5"; slot = 2; rawCode = 10; id = 40 },
      @{ triggerId = "Data DD:0:5"; slot = 3; rawCode = 6; id = 40 },
      @{ triggerId = "Data DD:0:5"; slot = 4; rawCode = 4; id = 40 },
      @{ triggerId = "Data DD:0:5"; slot = 5; rawCode = 5; id = 40 },
      @{ triggerId = "Data DD:0:5"; slot = 6; rawCode = 0; id = 0 },
      @{ triggerId = "Data DD:0:5"; slot = 7; rawCode = 1; id = 250 }
    )
    edcdRows = @(
      @{ rowId = 40; values = @(40, 0, 0, 250, 0) },
      @{ rowId = 320; values = @(1, 2, 3, 4, 5) }
    )
    targetRecords = @(
      @{ recordType = "message"; id = 250; fields = @{ text = "Providence Scripts V2 smoke message." } },
      @{ recordType = "battle"; id = 40; fields = @{ dist = 2; messageBefore = 250; messageAfter = 250; battleMacro = 0; "grid.0" = 77; "grid.168" = 88 } },
      @{ recordType = "treasure"; id = 40; fields = @{ exp = 10; gold = 20; gems = 1; jewelry = 0; "itemIds.0" = 1; "itemIds.1" = 2; "itemIds.2" = 3; "itemIds.19" = 620 } },
      @{ recordType = "shop"; id = 40; fields = @{ inflation = 100; "itemIds.0" = 1; "quantities.0" = 3; "itemIds.999" = 845; "quantities.999" = 8 } },
      @{ recordType = "simpleEncounter"; id = 40; fields = @{ prompt = 250; canBackOut = $true; maxTimes = 3; casteSuccess = 2; "choiceResults.0" = 1; "choiceResults.3" = 4; "texts.0" = "Simple smoke option"; "texts.3" = "Simple smoke final option"; "actions.0.rawCode" = 1; "actions.0.id" = 250; "actions.1.rawCode" = 10; "actions.1.id" = 40; "actions.2.rawCode" = 65; "actions.2.id" = 320 } },
      @{ recordType = "complexEncounter"; id = 40; fields = @{ prompt = 250; canBackOut = $true; thief = $true; maxTimes = 4; casteSuccess = 3; thiefSuccess = 2; thiefFail = -1; "choiceResults.0" = 4; "wordResults.3" = 7; "texts.0" = "Complex smoke option"; "texts.8" = "Complex final"; "actions.0.rawCode" = 1; "actions.0.id" = 250; "actions.1.rawCode" = 6; "actions.1.id" = 40; "actions.2.rawCode" = 2; "actions.2.id" = 40 } },
      @{ recordType = "message"; id = 251; fields = @{ text = "" } },
      @{ recordType = "battle"; id = 41; fields = @{ dist = 0; messageBefore = 0; messageAfter = 0; battleMacro = 0; "grid.0" = 0; "grid.168" = 0 } },
      @{ recordType = "treasure"; id = 41; fields = @{ exp = 0; gold = 0; gems = 0; jewelry = 0; "itemIds.0" = 0; "itemIds.19" = 0 } },
      @{ recordType = "shop"; id = 41; fields = @{ inflation = 0; "itemIds.0" = 0; "quantities.0" = 0; "itemIds.999" = 0; "quantities.999" = 0 } },
      @{ recordType = "simpleEncounter"; id = 41; fields = @{ prompt = 0; canBackOut = $false; maxTimes = 0; casteSuccess = 0; "choiceResults.0" = 0; "texts.0" = ""; "actions.0" = $null } },
      @{ recordType = "complexEncounter"; id = 41; fields = @{ prompt = 0; canBackOut = $false; thief = $false; maxTimes = 0; casteSuccess = 0; thiefSuccess = 0; thiefFail = 0; "choiceResults.0" = 0; "wordResults.0" = 0; "texts.0" = ""; "actions.0" = $null } }
    )
    targetRecordsAbsent = @(
      @{ recordType = "questLabel"; id = 77 }
    )
    exportContains = @("Data DD", "Data EDCD", "Data SD2", "Data BD", "Data TD", "Data SD", "Data ED", "Data ED2")
  }
}

$script | ConvertTo-Json -Depth 24 | Set-Content -Path $scriptPath -Encoding UTF8

$process = Invoke-ProvidenceEditorHarness -ExePath $ExePath -ScriptPath $scriptPath -ResultPath $resultPath

if (-not (Test-Path -LiteralPath $resultPath)) {
  throw "Providence did not write a smoke result: $resultPath"
}

$result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
$ok = [bool]$result.ok
Write-Host "Scripts V2 editor smoke: ok=$ok commands=$($result.commandsApplied) root=$RunRoot"
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
