import { ItemTextRecord, Project, ProjectCommand } from "./types";
import {
  clearLandLayout,
  clearRandomRect,
  createMap,
  createCustomLandlookFromSource,
  createMapRecord,
  createRandomRect,
  duplicateMap,
  ensureLandLayout,
  paintTiles,
  setLandCellSecretState,
  updateCustomLandTileAttributes,
  updateCustomLandTileCombatBuild,
  updateCustomLandlookBase,
  updateCustomLandlookRangeSlot,
  updateDungeonCellFlags,
  updateLandLayoutCell,
  updateMapRecord,
  updateMapRecordNames,
  updateRandomLevelSettings,
  updateSpecialTileSolidity,
  updateRandomRect
} from "./projectCommands/mapCommands";
import {
  attachProjectAsset,
  deleteProjectAsset,
  removeScenarioResource,
  replaceProjectAsset,
  replaceCustomLandlookAtlas,
  updateProjectAsset
} from "./projectCommands/assetCommands";
import {
  clearCasteOverride,
  clearRaceOverride,
  clearRuleOverride,
  createCasteOverride,
  createRaceOverride,
  createSpellOverride,
  defaultGlobalMacroHooks,
  renameEditorEntity,
  updateCasteName,
  updateGlobalMacroHook,
  updateCustomSpellName,
  updateRaceName,
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
  createStartupTestMacro,
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
  clearMonsterRecord,
  clearOptionLabel,
  createMonsterFromTemplate,
  createMonstersFromTemplates,
  copyCurrentMonsterToAllSets,
  createMonsterVariantFromNormal,
  createOptionLabel,
  createTargetRecord,
  deleteMonsterIconOverride,
  deleteScenarioIconResource,
  deleteTargetRecord,
  duplicateMessageRecord,
  duplicateOptionLabel,
  emptyScenarioItem,
  generateMonsterVariantsForAll,
  generateMonsterVariants,
  paintBattleGridCells,
  rewriteBattleMonsterReferences,
  switchMonsterRecords,
  upsertMonsterIconOverride,
  updateMonsterRecord,
  updateOptionLabel,
  updateRecord,
  updateStringSound,
  upsertMonsterDescription,
  upsertQuestLabel,
  upsertScenarioIconResource
} from "./projectCommands/targetRecordCommands";
import {
  addTileToPalette,
  createTilePalette,
  deleteTilePalette,
  removeTileFromPalette,
  renameTilePalette,
  updateTilePaletteTiles
} from "./projectCommands/tilePaletteCommands";
import {
  createMapStamp,
  deleteMapStamp,
  duplicateMapStamp,
  renameMapStamp,
  updateMapStamp
} from "./projectCommands/mapStampCommands";
import {
  addQuestContextSource,
  createQuestThread,
  deleteQuestContextSource,
  deleteQuestThread,
  updateQuestThread
} from "./projectCommands/questThreadCommands";

export { defaultGlobalMacroHooks };

export function applyProjectCommand(project: Project, command: ProjectCommand) {
  if (command.kind === "updateAuthoringTarget") return { ...project, authoringTarget: command.target };
  if (command.kind === "updateRemakeRuntime") return { ...project, remakeRuntime: command.runtime };
  if (command.kind === "paintTiles") return paintTiles(project, command.mapId, command.cells);
  if (command.kind === "setLandCellSecretState") return setLandCellSecretState(project, command);
  if (command.kind === "updateDungeonCellFlags") return updateDungeonCellFlags(project, command);
  if (command.kind === "paintBattleGridCells") return paintBattleGridCells(project, command.battleId, command.cells);
  if (command.kind === "createMap") return createMap(project, command);
  if (command.kind === "duplicateMap") return duplicateMap(project, command);
  if (command.kind === "createMapRecord") return createMapRecord(project, command);
  if (command.kind === "createMacro") return createMacro(project, command.displayName);
  if (command.kind === "createStartupTestMacro") return createStartupTestMacro(project, command.complexEncounterId);
  if (command.kind === "deleteMacro" || command.kind === "deleteTrigger") return deleteTrigger(project, command.triggerId);
  if (command.kind === "duplicateTrigger") return duplicateTrigger(project, command.triggerId, command.displayName);
  if (command.kind === "createActionPoint") return createActionPoint(project, command);
  if (command.kind === "moveActionPoint") return moveActionPoint(project, command);
  if (command.kind === "updateTriggerHeader") return updateTriggerHeader(project, command.triggerId, command.fields);
  if (command.kind === "updateRandomLevelSettings") return updateRandomLevelSettings(project, command);
  if (command.kind === "updateMapRecord") return updateMapRecord(project, command.id, command.changes);
  if (command.kind === "updateMapRecordNames") return updateMapRecordNames(project, command.id, command.changes);
  if (command.kind === "createLandLayout") return ensureLandLayout(project);
  if (command.kind === "updateLandLayoutCell") return updateLandLayoutCell(project, command.row, command.col, command.value);
  if (command.kind === "clearLandLayout") return clearLandLayout(project);
  if (command.kind === "createTilePalette") return createTilePalette(project, command);
  if (command.kind === "renameTilePalette") return renameTilePalette(project, command.paletteId, command.name);
  if (command.kind === "deleteTilePalette") return deleteTilePalette(project, command.paletteId);
  if (command.kind === "updateTilePaletteTiles") return updateTilePaletteTiles(project, command.paletteId, command.tiles);
  if (command.kind === "addTileToPalette") return addTileToPalette(project, command.paletteId, command.tile);
  if (command.kind === "removeTileFromPalette") return removeTileFromPalette(project, command.paletteId, command.tile);
  if (command.kind === "createMapStamp") return createMapStamp(project, command);
  if (command.kind === "renameMapStamp") return renameMapStamp(project, command.stampId, command.name);
  if (command.kind === "deleteMapStamp") return deleteMapStamp(project, command.stampId);
  if (command.kind === "duplicateMapStamp") return duplicateMapStamp(project, command.stampId, command.id, command.name);
  if (command.kind === "updateMapStamp") return updateMapStamp(project, command.stampId, command.changes);
  if (command.kind === "updateCustomLandTileAttributes") return updateCustomLandTileAttributes(project, command);
  if (command.kind === "createCustomLandlookFromSource") return createCustomLandlookFromSource(project, command);
  if (command.kind === "updateSpecialTileSolidity") return updateSpecialTileSolidity(project, command);
  if (command.kind === "updateCustomLandTileCombatBuild") return updateCustomLandTileCombatBuild(project, command);
  if (command.kind === "updateCustomLandlookBase") return updateCustomLandlookBase(project, command);
  if (command.kind === "updateCustomLandlookRangeSlot") return updateCustomLandlookRangeSlot(project, command);
  if (command.kind === "createRandomRect") return createRandomRect(project, command);
  if (command.kind === "updateRandomRect") return updateRandomRect(project, command);
  if (command.kind === "clearRandomRect") return clearRandomRect(project, command);
  if (command.kind === "updateActionSlot") {
    return updateActionSlot(
      project,
      command.triggerId,
      command.slot,
      command.rawCode,
      command.id,
      command.mediaRequiredForProgression
    );
  }
  if (command.kind === "swapActionSlots") return swapActionSlots(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "duplicateActionSlot") return duplicateActionSlot(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "deleteActionSlot") return updateActionSlot(project, command.triggerId, command.slot, 0, 0);
  if (command.kind === "updateEdcdRow") return updateEdcdRow(project, command.rowId, command.values);
  if (command.kind === "deleteEdcdRow") return deleteEdcdRow(project, command.rowId);
  if (command.kind === "createTargetRecord") return createTargetRecord(project, command.recordType, command.id);
  if (command.kind === "deleteTargetRecord") return deleteTargetRecord(project, command.recordType, command.id);
  if (command.kind === "duplicateMessageRecord") return duplicateMessageRecord(project, command.fromId, command.toId);
  if (command.kind === "updateMessageRecord") return updateRecord(project, "messages", command.id, command.changes);
  if (command.kind === "updateStringSound") return updateStringSound(project, command.messageId, command.soundId);
  if (command.kind === "bulkUpdateMessageRecords") return bulkUpdateMessageRecords(project, command.updates);
  if (command.kind === "createOptionLabel") return createOptionLabel(project, command.id);
  if (command.kind === "clearOptionLabel") return clearOptionLabel(project, command.id);
  if (command.kind === "duplicateOptionLabel") return duplicateOptionLabel(project, command.fromId, command.toId);
  if (command.kind === "updateOptionLabel") return updateOptionLabel(project, command.id, command.changes);
  if (command.kind === "updateBattleRecord") return updateRecord(project, "battles", command.id, command.changes);
  if (command.kind === "createMonsterFromTemplate") return createMonsterFromTemplate(project, command.id, command.template, command.description, command.setId);
  if (command.kind === "createMonstersFromTemplates") return createMonstersFromTemplates(project, command.entries);
  if (command.kind === "updateMonsterRecord") return updateMonsterRecord(project, command.id, command.changes, command.setId);
  if (command.kind === "clearMonsterRecord") return clearMonsterRecord(project, command.id, command.setId);
  if (command.kind === "createMonsterVariantFromNormal") return createMonsterVariantFromNormal(project, command.id, command.setId);
  if (command.kind === "copyCurrentMonsterToAllSets") return copyCurrentMonsterToAllSets(project, command.id, command.sourceSetId);
  if (command.kind === "switchMonsterRecords") return switchMonsterRecords(project, command.setId, command.fromId, command.toId);
  if (command.kind === "generateMonsterVariants") return generateMonsterVariants(project, command.id);
  if (command.kind === "generateMonsterVariantsForAll") return generateMonsterVariantsForAll(project, command.ids);
  if (command.kind === "rewriteBattleMonsterReferences") return rewriteBattleMonsterReferences(project, command.rewrite);
  if (command.kind === "upsertMonsterIconOverride") return upsertMonsterIconOverride(project, command.override);
  if (command.kind === "deleteMonsterIconOverride") return deleteMonsterIconOverride(project, command.targetBaseIconId);
  if (command.kind === "upsertScenarioIconResource") return upsertScenarioIconResource(project, command.resource);
  if (command.kind === "deleteScenarioIconResource") return deleteScenarioIconResource(project, command.resourceId);
  if (command.kind === "upsertMonsterDescription") return upsertMonsterDescription(project, command.id, command.text);
  if (command.kind === "updateScenarioItemRecord") return updateRecord(project, "scenarioItems", command.id, command.changes);
  if (command.kind === "clearScenarioItemRecord") return updateRecord(project, "scenarioItems", command.id, emptyScenarioItem(command.id));
  if (command.kind === "updateItemTextRecord") return updateItemTextRecord(project, command.itemId, command.changes);
  if (command.kind === "updateTreasureRecord") return updateRecord(project, "treasures", command.id, command.changes);
  if (command.kind === "updateShopRecord") return updateRecord(project, "shops", command.id, command.changes);
  if (command.kind === "updateSimpleEncounterRecord") return updateRecord(project, "simpleEncounters", command.id, command.changes);
  if (command.kind === "updateComplexEncounterRecord") return updateRecord(project, "complexEncounters", command.id, command.changes);
  if (command.kind === "applyEncounterResultSettings") return applyEncounterResultSettings(project, command);
  if (command.kind === "updateThiefEncounterRecord") return updateRecord(project, "thiefEncounters", command.id, command.changes);
  if (command.kind === "updateTimedEncounterRecord") return updateRecord(project, "timedEncounters", command.id, command.changes);
  if (command.kind === "upsertQuestLabel") return upsertQuestLabel(project, command.quest);
  if (command.kind === "deleteQuestLabel") return { ...project, questLabels: (project.questLabels ?? []).filter((quest) => quest.id !== command.id) };
  if (command.kind === "createQuestThread") return createQuestThread(project, command);
  if (command.kind === "updateQuestThread") return updateQuestThread(project, command.threadId, command.changes);
  if (command.kind === "deleteQuestThread") return deleteQuestThread(project, command.threadId);
  if (command.kind === "addQuestContextSource") return addQuestContextSource(project, command.source);
  if (command.kind === "deleteQuestContextSource") return deleteQuestContextSource(project, command.sourceId);
  if (command.kind === "applyRealmzScriptStep") {
    const withSlot = updateActionSlot(project, command.triggerId, command.slot, command.opcode, command.id);
    const withPrimarySettings = command.edcdValues ? updateEdcdRow(withSlot, command.id, command.edcdValues) : withSlot;
    if (Math.abs(command.opcode) !== 92) return withPrimarySettings;
    const secondaryRowId = command.id + 1;
    const secondaryValues = command.secondaryEdcdValues
      ?? withPrimarySettings.extracodes.find((row) => row.id === secondaryRowId)?.values
      ?? [0, 0, 0, 0, 0];
    return updateEdcdRow(withPrimarySettings, secondaryRowId, secondaryValues);
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
  if (command.kind === "updateRaceName") return updateRaceName(project, command.id, command.displayName);
  if (command.kind === "clearRaceOverride") return clearRaceOverride(project, command.id);
  if (command.kind === "createCasteOverride") return createCasteOverride(project, command.id, command.template);
  if (command.kind === "updateCasteOverride") return updateRuleOverride(project, "casteOverrides", command.id, command.changes);
  if (command.kind === "updateCasteName") return updateCasteName(project, command.id, command.displayName);
  if (command.kind === "clearCasteOverride") return clearCasteOverride(project, command.id);
  if (command.kind === "updateScenarioStartup") return updateScenarioStartup(project, command.fields);
  if (command.kind === "attachProjectAsset") return attachProjectAsset(project, command);
  if (command.kind === "replaceProjectAsset") return replaceProjectAsset(project, command);
  if (command.kind === "replaceCustomLandlookAtlas") return replaceCustomLandlookAtlas(project, command);
  if (command.kind === "updateProjectAsset") return updateProjectAsset(project, command);
  if (command.kind === "deleteProjectAsset") return deleteProjectAsset(project, command);
  if (command.kind === "removeScenarioResource") return removeScenarioResource(project, command);
  return project;
}

function applyEncounterResultSettings(
  project: Project,
  command: Extract<ProjectCommand, { kind: "applyEncounterResultSettings" }>
) {
  const withPrimarySettings = updateEdcdRow(project, command.rowId, command.edcdValues);
  const withSettings = Math.abs(command.rawCode) === 92
    ? updateEdcdRow(
      withPrimarySettings,
      command.rowId + 1,
      command.secondaryEdcdValues
        ?? withPrimarySettings.extracodes.find((row) => row.id === command.rowId + 1)?.values
        ?? [0, 0, 0, 0, 0]
    )
    : withPrimarySettings;
  const key = command.recordKind === "simple" ? "simpleEncounters" : "complexEncounters";
  const records = withSettings[key];
  const record = records.find((candidate) => candidate.id === command.encounterId);
  if (!record) return withSettings;
  const actions = new Map((record.actions ?? []).map((action) => [action.slot, { ...action }]));
  const updated = {
    ...(actions.get(command.slot) ?? { slot: command.slot, rawCode: 0, id: 0 }),
    slot: command.slot,
    rawCode: command.rawCode,
    id: command.rowId
  };
  if (![9, 27].includes(Math.abs(command.rawCode))) delete updated.mediaRequiredForProgression;
  actions.set(command.slot, updated);
  return updateRecord(withSettings, key, command.encounterId, {
    actions: [...actions.values()].sort((a, b) => a.slot - b.slot)
  });
}

function updateItemTextRecord(
  project: Project,
  itemId: number,
  changes: Partial<Pick<ItemTextRecord, "unidentifiedName" | "identifiedName" | "description">>
) {
  const normalizedItemId = Math.trunc(itemId);
  const current = [...(project.itemTexts ?? [])];
  const index = current.findIndex((record) => (record.itemId || record.id) === normalizedItemId);
  const base = index >= 0 ? current[index] : {
    id: normalizedItemId,
    itemId: normalizedItemId,
    unidentifiedName: "",
    identifiedName: "",
    description: "",
    authored: true,
    provenance: { sourceFile: "Data ID.rsrc", recordIndex: normalizedItemId, byteOffset: 0, byteLength: 0, confidence: "inferred" as const }
  };
  const next = { ...base, ...changes, id: normalizedItemId, itemId: normalizedItemId, authored: true };
  if (index >= 0) current[index] = next;
  else current.push(next);
  current.sort((a, b) => (a.itemId || a.id) - (b.itemId || b.id));
  return { ...project, itemTexts: current };
}

export function projectCommandLabel(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length === 1 ? "Paint tile" : `Paint ${command.cells.length} tiles`;
  if (command.kind === "updateDungeonCellFlags") return command.label;
  if (command.kind === "paintBattleGridCells") return command.cells.length === 1 ? "Paint battle cell" : `Paint ${command.cells.length} battle cells`;
  return command.label;
}

export function projectCommandChangeCount(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length;
  if (command.kind === "updateDungeonCellFlags") return command.cells.length;
  if (command.kind === "paintBattleGridCells") return command.cells.length;
  if (command.kind === "bulkUpdateMessageRecords") return command.updates.length;
  if (command.kind === "createMonstersFromTemplates") return command.entries.length;
  if (command.kind === "generateMonsterVariantsForAll") return command.ids.length;
  return 1;
}
