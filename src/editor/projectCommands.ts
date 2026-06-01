import { Project, ProjectCommand } from "./types";
import {
  clearLandLayout,
  clearRandomRect,
  createRandomRect,
  ensureLandLayout,
  paintTiles,
  updateCustomLandTileAttributes,
  updateCustomLandTileCombatBuild,
  updateCustomLandlookBase,
  updateCustomLandlookRangeSlot,
  updateLandLayoutCell,
  updateMapRecord,
  updateRandomLevelSettings,
  updateRandomRect
} from "./projectCommands/mapCommands";
import {
  attachProjectAsset,
  deleteProjectAsset,
  replaceProjectAsset,
  replaceCustomLandlookAtlas,
  updateProjectAsset
} from "./projectCommands/assetCommands";
import {
  clearRuleOverride,
  createCasteOverride,
  createRaceOverride,
  createSpellOverride,
  renameEditorEntity,
  updateGlobalMacroHook,
  updateCustomSpellName,
  updateRuleOverride,
  updateScenarioContactInfo,
  updateScenarioRestrictions,
  updateScenarioSecurityCodes,
  updateScenarioShell,
  updateScenarioStartup
} from "./projectCommands/scenarioRulesCommands";
import {
  createActionPoint,
  createMacro,
  deleteEdcdRow,
  deleteTrigger,
  duplicateActionSlot,
  duplicateTrigger,
  moveActionPoint,
  swapActionSlots,
  updateActionSlot,
  updateEdcdRow,
  updateTriggerHeader
} from "./projectCommands/scriptCommands";
import {
  bulkUpdateMessageRecords,
  clearOptionLabel,
  createOptionLabel,
  createTargetRecord,
  deleteTargetRecord,
  duplicateMessageRecord,
  duplicateOptionLabel,
  emptyScenarioItem,
  updateOptionLabel,
  updateRecord,
  upsertQuestLabel
} from "./projectCommands/targetRecordCommands";

export function applyProjectCommand(project: Project, command: ProjectCommand) {
  if (command.kind === "paintTiles") return paintTiles(project, command.mapId, command.cells);
  if (command.kind === "createMacro") return createMacro(project, command.displayName);
  if (command.kind === "deleteMacro" || command.kind === "deleteTrigger") return deleteTrigger(project, command.triggerId);
  if (command.kind === "duplicateTrigger") return duplicateTrigger(project, command.triggerId, command.displayName);
  if (command.kind === "createActionPoint") return createActionPoint(project, command);
  if (command.kind === "moveActionPoint") return moveActionPoint(project, command);
  if (command.kind === "updateTriggerHeader") return updateTriggerHeader(project, command.triggerId, command.fields);
  if (command.kind === "updateRandomLevelSettings") return updateRandomLevelSettings(project, command);
  if (command.kind === "updateMapRecord") return updateMapRecord(project, command.id, command.changes);
  if (command.kind === "createLandLayout") return ensureLandLayout(project);
  if (command.kind === "updateLandLayoutCell") return updateLandLayoutCell(project, command.row, command.col, command.value);
  if (command.kind === "clearLandLayout") return clearLandLayout(project);
  if (command.kind === "updateCustomLandTileAttributes") return updateCustomLandTileAttributes(project, command);
  if (command.kind === "updateCustomLandTileCombatBuild") return updateCustomLandTileCombatBuild(project, command);
  if (command.kind === "updateCustomLandlookBase") return updateCustomLandlookBase(project, command);
  if (command.kind === "updateCustomLandlookRangeSlot") return updateCustomLandlookRangeSlot(project, command);
  if (command.kind === "createRandomRect") return createRandomRect(project, command);
  if (command.kind === "updateRandomRect") return updateRandomRect(project, command);
  if (command.kind === "clearRandomRect") return clearRandomRect(project, command);
  if (command.kind === "updateActionSlot") return updateActionSlot(project, command.triggerId, command.slot, command.rawCode, command.id);
  if (command.kind === "swapActionSlots") return swapActionSlots(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "duplicateActionSlot") return duplicateActionSlot(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "deleteActionSlot") return updateActionSlot(project, command.triggerId, command.slot, 0, 0);
  if (command.kind === "updateEdcdRow") return updateEdcdRow(project, command.rowId, command.values);
  if (command.kind === "deleteEdcdRow") return deleteEdcdRow(project, command.rowId);
  if (command.kind === "createTargetRecord") return createTargetRecord(project, command.recordType, command.id);
  if (command.kind === "deleteTargetRecord") return deleteTargetRecord(project, command.recordType, command.id);
  if (command.kind === "duplicateMessageRecord") return duplicateMessageRecord(project, command.fromId, command.toId);
  if (command.kind === "updateMessageRecord") return updateRecord(project, "messages", command.id, command.changes);
  if (command.kind === "bulkUpdateMessageRecords") return bulkUpdateMessageRecords(project, command.updates);
  if (command.kind === "createOptionLabel") return createOptionLabel(project, command.id);
  if (command.kind === "clearOptionLabel") return clearOptionLabel(project, command.id);
  if (command.kind === "duplicateOptionLabel") return duplicateOptionLabel(project, command.fromId, command.toId);
  if (command.kind === "updateOptionLabel") return updateOptionLabel(project, command.id, command.changes);
  if (command.kind === "updateBattleRecord") return updateRecord(project, "battles", command.id, command.changes);
  if (command.kind === "updateMonsterRecord") return updateRecord(project, "monsters", command.id, command.changes);
  if (command.kind === "updateScenarioItemRecord") return updateRecord(project, "scenarioItems", command.id, command.changes);
  if (command.kind === "clearScenarioItemRecord") return updateRecord(project, "scenarioItems", command.id, emptyScenarioItem(command.id));
  if (command.kind === "updateTreasureRecord") return updateRecord(project, "treasures", command.id, command.changes);
  if (command.kind === "updateShopRecord") return updateRecord(project, "shops", command.id, command.changes);
  if (command.kind === "updateSimpleEncounterRecord") return updateRecord(project, "simpleEncounters", command.id, command.changes);
  if (command.kind === "updateComplexEncounterRecord") return updateRecord(project, "complexEncounters", command.id, command.changes);
  if (command.kind === "updateThiefEncounterRecord") return updateRecord(project, "thiefEncounters", command.id, command.changes);
  if (command.kind === "updateTimedEncounterRecord") return updateRecord(project, "timedEncounters", command.id, command.changes);
  if (command.kind === "upsertQuestLabel") return upsertQuestLabel(project, command.quest);
  if (command.kind === "deleteQuestLabel") return { ...project, questLabels: (project.questLabels ?? []).filter((quest) => quest.id !== command.id) };
  if (command.kind === "applyRealmzScriptStep") {
    const withSlot = updateActionSlot(project, command.triggerId, command.slot, command.opcode, command.id);
    return command.edcdValues ? updateEdcdRow(withSlot, command.id, command.edcdValues) : withSlot;
  }
  if (command.kind === "renameEditorEntity") return renameEditorEntity(project, command.entityId, command.displayName);
  if (command.kind === "updateScenarioShell") return updateScenarioShell(project, command.changes);
  if (command.kind === "updateScenarioSecurityCodes") return updateScenarioSecurityCodes(project, command);
  if (command.kind === "updateScenarioContactInfo") return updateScenarioContactInfo(project, command.changes);
  if (command.kind === "updateScenarioRestrictions") return updateScenarioRestrictions(project, command.changes);
  if (command.kind === "updateGlobalMacroHook") return updateGlobalMacroHook(project, command.slot, command.door);
  if (command.kind === "createSpellOverride") return createSpellOverride(project, command.id, command.template);
  if (command.kind === "updateSpellOverride") return updateRuleOverride(project, "spellOverrides", command.id, command.changes);
  if (command.kind === "updateCustomSpellName") return updateCustomSpellName(project, command.id, command.displayName);
  if (command.kind === "clearSpellOverride") return clearRuleOverride(project, "spellOverrides", command.id);
  if (command.kind === "createRaceOverride") return createRaceOverride(project, command.id, command.template);
  if (command.kind === "updateRaceOverride") return updateRuleOverride(project, "raceOverrides", command.id, command.changes);
  if (command.kind === "clearRaceOverride") return clearRuleOverride(project, "raceOverrides", command.id);
  if (command.kind === "createCasteOverride") return createCasteOverride(project, command.id, command.template);
  if (command.kind === "updateCasteOverride") return updateRuleOverride(project, "casteOverrides", command.id, command.changes);
  if (command.kind === "clearCasteOverride") return clearRuleOverride(project, "casteOverrides", command.id);
  if (command.kind === "updateScenarioStartup") return updateScenarioStartup(project, command.fields);
  if (command.kind === "attachProjectAsset") return attachProjectAsset(project, command);
  if (command.kind === "replaceProjectAsset") return replaceProjectAsset(project, command);
  if (command.kind === "replaceCustomLandlookAtlas") return replaceCustomLandlookAtlas(project, command);
  if (command.kind === "updateProjectAsset") return updateProjectAsset(project, command);
  if (command.kind === "deleteProjectAsset") return deleteProjectAsset(project, command);
  return project;
}

export function projectCommandLabel(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length === 1 ? "Paint tile" : `Paint ${command.cells.length} tiles`;
  return command.label;
}

export function projectCommandChangeCount(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length;
  if (command.kind === "bulkUpdateMessageRecords") return command.updates.length;
  return 1;
}
