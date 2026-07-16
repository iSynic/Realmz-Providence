import { LevelType, LibraryCatalog, Project, RealmzTargetRecordKind, SelectedEntity } from "./types";
import { selectEntityFromId } from "./utils";
import { choiceBranchTargetKind, choicePromptStorageFromOptionLabels, parseChoicePromptValue } from "./choiceDialogs";
import { divinityCompatibleSoundIds, divinitySoundReferenceLabel, isDivinityCompatibleSoundId } from "./soundReferences";
import { itemReferenceOptions } from "./itemReferences";

export type EdcdTargetKind =
  | "message"
  | "optionLabel"
  | "battle"
  | "treasure"
  | "item"
  | "shop"
  | "simpleEncounter"
  | "complexEncounter"
  | "thiefEncounter"
  | "timedEncounter"
  | "questLabel"
  | "macro"
  | "sound"
  | "monster"
  | "mapLevel"
  | "landLevel"
  | "dungeonLevel"
  | "mapRecord"
  | "randomEncounterRectangle"
  | "scrollingText";

export type EdcdTargetOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  entity?: SelectedEntity;
};

export type EdcdTargetReferenceIssue = {
  index: number;
  field: string;
  targetKind: EdcdTargetKind;
  targetLabel: string;
  value: number;
};

export function edcdFieldTargetKind(shape: string, name: string, fieldNames: string[], values: number[], opcode?: number): EdcdTargetKind | null {
  const normalizedShape = shape.toLowerCase();
  const normalizedName = name.toLowerCase();
  const fieldValue = valueForField(fieldNames, values, normalizedName);
  if (normalizedShape === "action-data-patching") {
    if (normalizedName === "macro") return "macro";
    if (normalizedName === "targetrecord") {
      const levelOrCache = valueForField(fieldNames, values, "levelorcache") ?? values[0] ?? 0;
      if (levelOrCache === -2) return "simpleEncounter";
      if (levelOrCache === -3) return "complexEncounter";
    }
  }
  if (normalizedShape === "quest-value" && opcode === 76 && normalizedName === "target") {
    const threshold = valueForField(fieldNames, values, "threshold") ?? 0;
    if (threshold === 0) return null;
  }
  if (normalizedShape === "false-true-branch" && (opcode === 77 || opcode === 78) && (normalizedName === "falsetarget" || normalizedName === "truetarget")) {
    if ((fieldValue ?? 0) === 0) return null;
  }
  if (normalizedShape === "misc-conditional-branch" && opcode === 86 && (normalizedName === "truetarget" || normalizedName === "falsetarget")) {
    if ((fieldValue ?? 0) === 0) return null;
  }
  if (normalizedShape === "picked-branch" && normalizedName === "failuretarget") {
    const failureBehavior = values[1] ?? 0;
    if (failureBehavior === 1) return "macro";
    if (failureBehavior === 2) return "message";
    return null;
  }
  if (normalizedShape === "item-branch" && normalizedName === "missingtarget") {
    const missingBehavior = values[2] ?? 0;
    if (missingBehavior === 0) return zeroBasedBranchTargetKind(values[1] ?? 0);
    if (missingBehavior === 2) return "message";
    return null;
  }
  if (normalizedShape === "conditional-branch" && opcode === 87 && normalizedName === "falsetarget") {
    const falseBehavior = values[2] ?? 0;
    if (falseBehavior === 0) return zeroBasedBranchTargetKind(values[1] ?? 0);
    if (falseBehavior === 2) return "message";
    return null;
  }
  if (normalizedShape === "battle" && opcode === 2 && normalizedName === "soundorrevivelossmacro") {
    return (values[4] ?? 0) === 10 ? "macro" : "sound";
  }
  if (normalizedName.includes("scrollingtext")) return "scrollingText";
  if (normalizedName.includes("timedencounter") || normalizedName === "timeencounter") return "timedEncounter";
  if (normalizedName.includes("thief") || normalizedName.includes("rogue")) return "thiefEncounter";
  if (normalizedName.includes("treasure")) return "treasure";
  if (normalizedName.includes("randomrect") || (normalizedName === "rectangle" && normalizedShape.includes("random"))) return "randomEncounterRectangle";
  if (normalizedName.includes("maprecord")) return "mapRecord";
  if (normalizedShape === "dungeon-move" && normalizedName === "level") return dungeonMoveLevelTargetKind(fieldNames, values);
  if (normalizedName === "landlevel" || normalizedName === "maplevel" || (normalizedName === "level" && (normalizedShape.includes("teleport") || normalizedShape.includes("random-region") || normalizedShape.includes("dungeon")))) return "mapLevel";
  if (normalizedShape.includes("item") && (normalizedName.includes("item") || normalizedName === "required")) return "item";
  if (normalizedName === "shop") return "shop";
  if (normalizedName === "simpleencounter") return "simpleEncounter";
  if (normalizedName === "complexencounter") return "complexEncounter";
  if (normalizedName === "quest") return "questLabel";
  if (normalizedName.includes("macro")) return "macro";
  if (normalizedName.includes("sound")) return "sound";
  if (normalizedName.includes("monster")) return "monster";
  if (normalizedName.includes("message") || normalizedName.startsWith("prompt")) return "message";
  if (normalizedShape.includes("battle") && (normalizedName === "battlelow" || normalizedName === "battlehigh")) return "battle";
  if (isBranchTargetField(normalizedName)) return branchTargetKind(normalizedShape, fieldNames, values, opcode);
  return null;
}

export function edcdTargetOptions(project: Project, targetKind: EdcdTargetKind, catalog?: LibraryCatalog | null): EdcdTargetOption[] {
  if (targetKind === "optionLabel") {
    return (project.optionLabels ?? []).map((record) => ({
      key: `option-label:${record.id}`,
      value: record.id,
      label: `Option Label ${record.id}`,
      detail: record.text || "empty option label",
      entity: selectEntityFromId(`option-label:${record.id}`)
    }));
  }
  if (targetKind === "macro") {
    return project.triggers
      .filter((trigger) => trigger.source === "Data ED3")
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.length} action slot(s)`,
        entity: selectEntityFromId(`macro:${trigger.recordIndex}`)
      }));
  }
  if (targetKind === "questLabel") {
    return (project.questLabels ?? []).map((record) => ({
      key: `quest:${record.id}`,
      value: record.id,
      label: record.label || `Quest ${record.id}`,
      detail: record.note || "Providence metadata label; Realmz state remains opcode-driven.",
      entity: { type: "questFlag", id: `quest:${record.id}` }
    }));
  }
  if (targetKind === "simpleEncounter") {
    return (project.simpleEncounters ?? []).map((record) => ({
      key: `simple:${record.id}`,
      value: record.id,
      label: `Simple Encounter ${record.id}`,
      detail: `${record.actions.length} action row(s), prompt ${record.prompt}`,
      entity: selectEntityFromId(`encounter:simple:${record.id}`)
    }));
  }
  if (targetKind === "complexEncounter") {
    return (project.complexEncounters ?? []).map((record) => ({
      key: `complex:${record.id}`,
      value: record.id,
      label: `Complex Encounter ${record.id}`,
      detail: `${record.actions.length} action row(s), prompt ${record.prompt}`,
      entity: selectEntityFromId(`encounter:complex:${record.id}`)
    }));
  }
  if (targetKind === "thiefEncounter") {
    return (project.thiefEncounters ?? []).map((record) => ({
      key: `thief:${record.id}`,
      value: record.id,
      label: `Rogue Encounter ${record.id}`,
      detail: `${record.typeFlags.filter(Boolean).length} enabled action(s), ${record.tumblers} tumbler(s)`,
      entity: selectEntityFromId(`thief:${record.id}`)
    }));
  }
  if (targetKind === "timedEncounter") {
    return (project.timedEncounters ?? []).map((record) => ({
      key: `timed:${record.id}`,
      value: record.id,
      label: `Timed Encounter ${record.id}`,
      detail: `day ${record.day}, ${record.percent}% chance, ${record.locationKind}`,
      entity: selectEntityFromId(`time:${record.id}`)
    }));
  }
  if (targetKind === "treasure") {
    return (project.treasures ?? []).map((record) => ({
      key: `treasure:${record.id}`,
      value: record.id,
      label: `Treasure ${record.id}`,
      detail: `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold, ${record.exp} exp`,
      entity: selectEntityFromId(`treasure:${record.id}`)
    }));
  }
  if (targetKind === "item") {
    return itemReferenceOptions(project, catalog).map((option) => ({
      key: option.key,
      value: option.value,
      label: option.label,
      detail: [option.detail, option.sourceState].filter(Boolean).join(" | "),
      entity: selectEntityFromId(`item:${option.value}`)
    }));
  }
  if (targetKind === "shop") {
    return (project.shops ?? []).map((record) => ({
      key: `shop:${record.id}`,
      value: record.id,
      label: `Shop ${record.id}`,
      detail: `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation`,
      entity: selectEntityFromId(`shop:${record.id}`)
    }));
  }
  if (targetKind === "message") {
    return (project.messages ?? []).map((record) => ({
      key: `message:${record.id}`,
      value: record.id,
      label: `String ${record.id}`,
      detail: record.text || "empty string",
      entity: selectEntityFromId(`message:${record.id}`)
    }));
  }
  if (targetKind === "sound") {
    const options: EdcdTargetOption[] = [];
    for (const asset of project.assets ?? []) {
      if (asset.kind !== "sound") continue;
      options.push({
        key: `asset:${asset.id}`,
        value: asset.resourceId,
        label: `${asset.label} (${asset.resourceType.trim()} ${asset.resourceId})`,
        detail: `${asset.exportState} sound asset`,
        entity: { type: "resource", id: asset.id }
      });
    }
    for (const asset of catalog?.assets ?? []) {
      if (asset.resourceId == null || asset.type !== "sound") continue;
      const resourceType = asset.resourceType?.trim() || "snd";
      options.push({
        key: `library:${asset.id}`,
        value: asset.resourceId,
        label: `${asset.label} (${resourceType} ${asset.resourceId})`,
        detail: "library sound reference",
        entity: { type: "resource", id: asset.id }
      });
    }
    for (const id of divinityCompatibleSoundIds()) {
      options.push({
        key: `builtin-sound:${id}`,
        value: id,
        label: divinitySoundReferenceLabel(id),
        detail: "built-in Realmz/Divinity sound reference",
        entity: { type: "resource", id: `resource:snd :${id}` }
      });
    }
    return dedupeEdcdTargetOptions(options);
  }
  if (targetKind === "monster") {
    return (project.monsters ?? []).map((record) => ({
      key: `monster:${record.id}`,
      value: record.id,
      label: record.displayName || `Monster ${record.id}`,
      detail: `HD ${record.hitDice}, armor ${record.armor}, move ${record.movementMax}`,
      entity: { type: "monster", id: `monster:${record.id}` }
    }));
  }
  if (targetKind === "mapLevel" || targetKind === "landLevel" || targetKind === "dungeonLevel") {
    const levelType = targetKind === "landLevel" ? "land" : targetKind === "dungeonLevel" ? "dungeon" : null;
    return dedupeEdcdTargetOptions((project.maps ?? [])
      .filter((map) => levelType == null || map.levelType === levelType)
      .map((map) => ({
      key: `map-level:${map.levelType}:${map.index}`,
      value: map.index,
      label: `${map.levelType === "dungeon" ? "Dungeon" : "Land"} Level ${map.index}`,
      detail: `${map.name}, ${map.width} x ${map.height}`,
      entity: selectEntityFromId(`map:${map.id}`)
    })));
  }
  if (targetKind === "mapRecord") {
    return (project.mapRecords ?? []).map((record) => ({
      key: `map-record:${record.id}`,
      value: record.id,
      label: record.name || record.primaryName || `Map Record ${record.id}`,
      detail: `${record.isDungeon ? "dungeon" : "land"} level ${record.level}, starts at ${record.startX},${record.startY}`,
      entity: selectEntityFromId(`map-record:${record.id}`)
    }));
  }
  if (targetKind === "randomEncounterRectangle") {
    const options: EdcdTargetOption[] = [];
    for (const level of project.randomLevels ?? []) {
      for (const rect of level.rects ?? []) {
        options.push({
          key: `random-rect:${level.levelType}:${level.levelIndex}:${rect.rectIndex}`,
          value: rect.rectIndex,
          label: `Random Area ${rect.rectIndex}`,
          detail: `${level.levelType} level ${level.levelIndex}, ${rect.percent}% chance, battles ${rect.battleRange.join("-")}`,
          entity: selectEntityFromId(`random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}`)
        });
      }
    }
    return dedupeEdcdTargetOptions(options);
  }
  if (targetKind === "scrollingText") {
    return scrollingTextResourceOptions(project);
  }
  return (project.battles ?? []).map((record) => ({
    key: `battle:${record.id}`,
    value: record.id,
    label: `Battle ${record.id}`,
    detail: `distance ${record.dist}, before ${record.messageBefore}, after ${record.messageAfter}`,
    entity: selectEntityFromId(`battle:${record.id}`)
  }));
}

export function missingEdcdTargetReferences(
  project: Project,
  shape: string,
  fieldNames: string[],
  values: number[],
  opcode?: number,
  preservedIndexes?: Iterable<number>,
  catalog?: LibraryCatalog | null,
  sourceLevelType: LevelType | null = null
): EdcdTargetReferenceIssue[] {
  if (shape.toLowerCase() === "choice" && Math.abs(opcode ?? 0) === 3) {
    return missingChoiceDialogReferences(project, fieldNames, values, preservedIndexes, catalog);
  }
  const issues: EdcdTargetReferenceIssue[] = [];
  const preserved = new Set(preservedIndexes ?? []);
  for (const [index, field] of fieldNames.entries()) {
    if (preserved.has(index)) continue;
    const rawValue = values[index] ?? 0;
    let targetKind = edcdFieldTargetKind(shape, field, fieldNames, values, opcode);
    if (shape.toLowerCase() === "teleport" && field.toLowerCase() === "levelorkeep" && sourceLevelType) {
      targetKind = sourceLevelType === "dungeon" ? "dungeonLevel" : "landLevel";
    }
    if (!targetKind || targetKind === "questLabel") continue;
    if (targetKind === "sound") continue;
    if (targetKind === "message" && Math.abs(rawValue) >= 10000) continue;
    const value = normalizedEdcdTargetValueForValidation(targetKind, rawValue, field, opcode);
    if (!Number.isFinite(value) || value < 0) continue;
    if (shape.toLowerCase() === "random-region-mutation" && field.toLowerCase() === "level") {
      const levelType = opcode === -23 ? "dungeon" : "land";
      if ((project.maps ?? []).some((record) => record.levelType === levelType && record.index === value)) continue;
      issues.push({
        index,
        field,
        targetKind,
        targetLabel: `${levelType === "dungeon" ? "Dungeon" : "Land"} Level`,
        value
      });
      continue;
    }
    if (value === 0 && !["macro", "simpleEncounter", "complexEncounter", "mapLevel", "landLevel", "dungeonLevel"].includes(targetKind)) continue;
    if (edcdTargetExists(project, targetKind, value, catalog)) continue;
    issues.push({
      index,
      field,
      targetKind,
      targetLabel: edcdTargetLabel(targetKind),
      value
    });
  }
  return issues;
}

function edcdTargetExists(project: Project, targetKind: EdcdTargetKind, value: number, catalog?: LibraryCatalog | null) {
  if (targetKind === "optionLabel") return (project.optionLabels ?? []).some((record) => record.id === value);
  if (targetKind === "macro") return project.triggers.some((trigger) => trigger.source === "Data ED3" && trigger.recordIndex === value);
  if (targetKind === "questLabel") return (project.questLabels ?? []).some((record) => record.id === value);
  if (targetKind === "simpleEncounter") return (project.simpleEncounters ?? []).some((record) => record.id === value);
  if (targetKind === "complexEncounter") return (project.complexEncounters ?? []).some((record) => record.id === value);
  if (targetKind === "thiefEncounter") return (project.thiefEncounters ?? []).some((record) => record.id === value);
  if (targetKind === "timedEncounter") return (project.timedEncounters ?? []).some((record) => record.id === value);
  if (targetKind === "treasure") return (project.treasures ?? []).some((record) => record.id === value);
  if (targetKind === "item") return itemReferenceOptions(project, catalog).some((option) => option.value === value);
  if (targetKind === "shop") return (project.shops ?? []).some((record) => record.id === value);
  if (targetKind === "message") return (project.messages ?? []).some((record) => record.id === value);
  if (targetKind === "sound") {
    return (project.assets ?? []).some((asset) => asset.kind === "sound" && asset.resourceId === value) ||
      (project.assetCatalog.sounds ?? []).some((asset) => asset.resourceId === value) ||
      (catalog?.assets ?? []).some((asset) => asset.type === "sound" && asset.resourceId === value) ||
      isDivinityCompatibleSoundId(value);
  }
  if (targetKind === "monster") return (project.monsters ?? []).some((record) => record.id === value);
  if (targetKind === "mapLevel") return (project.maps ?? []).some((record) => record.index === value);
  if (targetKind === "landLevel") return (project.maps ?? []).some((record) => record.levelType === "land" && record.index === value);
  if (targetKind === "dungeonLevel") return (project.maps ?? []).some((record) => record.levelType === "dungeon" && record.index === value);
  if (targetKind === "mapRecord") return (project.mapRecords ?? []).some((record) => record.id === value);
  if (targetKind === "randomEncounterRectangle") return (project.randomLevels ?? []).some((level) => level.rects.some((rect) => rect.rectIndex === value));
  if (targetKind === "scrollingText") return scrollingTextResourceOptions(project).some((option) => option.value === value);
  return (project.battles ?? []).some((record) => record.id === value);
}

function dedupeEdcdTargetOptions(options: EdcdTargetOption[]) {
  const byValue = new Map<number, EdcdTargetOption>();
  for (const option of options) {
    const existing = byValue.get(option.value);
    if (!existing || edcdTargetOptionScore(option) > edcdTargetOptionScore(existing)) byValue.set(option.value, option);
  }
  return [...byValue.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

function edcdTargetOptionScore(option: EdcdTargetOption) {
  if (option.key.startsWith("managed:")) return 4;
  if (option.key.startsWith("asset:")) return 3;
  if (option.key.startsWith("resource:TEXT:")) return 2;
  if (option.key.startsWith("library:")) return 2;
  if (option.key.startsWith("builtin-sound:")) return 1;
  return 0;
}

function scrollingTextResourceOptions(project: Project): EdcdTargetOption[] {
  const options: EdcdTargetOption[] = [];
  for (const asset of project.assets ?? []) {
    if (asset.resourceType.trim() !== "TEXT" && asset.kind !== "text") continue;
    options.push({
      key: asset.id,
      value: asset.resourceId,
      label: `Scrolling Text ${asset.resourceId}`,
      detail: `${asset.label} | ${asset.exportState}`,
      entity: { type: "resource", id: asset.id }
    });
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    const option = scrollingTextOptionFromSemanticEntity(entity);
    if (option) options.push(option);
  }
  return dedupeEdcdTargetOptions(options);
}

function scrollingTextOptionFromSemanticEntity(entity: Project["semanticSchema"]["entities"][number]): EdcdTargetOption | null {
  if (entity.type !== "resource") return null;
  const resourceType = String(entity.summary.type ?? entity.summary.resourceType ?? "").trim();
  if (resourceType !== "TEXT") return null;
  const id = Number(entity.summary.resourceId ?? entity.summary.id ?? entity.summary.index ?? trailingNumber(entity.id));
  if (!Number.isInteger(id)) return null;
  const preview = typeof entity.summary.textPreview === "string" ? entity.summary.textPreview : "";
  return {
    key: entity.id,
    value: id,
    label: entity.label || `Scrolling Text ${id}`,
    detail: preview || `TEXT resource | ${entity.source}`,
    entity: selectEntityFromId(entity.id)
  };
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)$/);
  return match ? Number(match[1]) : NaN;
}

function normalizedEdcdTargetValueForValidation(targetKind: EdcdTargetKind, rawValue: number, field: string, opcode?: number) {
  if (targetKind === "battle") return Math.abs(rawValue);
  if (targetKind === "sound") return Math.abs(rawValue);
  if (targetKind === "message" && (opcode === 15 || opcode === 16) && field.toLowerCase() === "message") return Math.abs(rawValue);
  return rawValue;
}

export function createRecordTypeForEdcdTarget(targetKind: EdcdTargetKind | null): RealmzTargetRecordKind | null {
  if (!targetKind || targetKind === "macro" || targetKind === "optionLabel" || targetKind === "sound") return null;
  if (targetKind === "item" || targetKind === "mapLevel" || targetKind === "landLevel" || targetKind === "dungeonLevel" || targetKind === "mapRecord" || targetKind === "randomEncounterRectangle" || targetKind === "scrollingText") return null;
  return targetKind;
}

export function edcdTargetLabel(targetKind: EdcdTargetKind) {
  const labels: Record<EdcdTargetKind, string> = {
    message: "string",
    optionLabel: "option label",
    battle: "battle",
    treasure: "treasure",
    item: "item",
    shop: "shop",
    simpleEncounter: "simple encounter",
    complexEncounter: "complex encounter",
    thiefEncounter: "rogue encounter",
    timedEncounter: "timed encounter",
    questLabel: "quest label",
    macro: "Extra Action Point",
    sound: "sound",
    monster: "monster",
    mapLevel: "map level",
    landLevel: "land level",
    dungeonLevel: "dungeon level",
    mapRecord: "map record",
    randomEncounterRectangle: "random encounter area",
    scrollingText: "scrolling text"
  };
  return labels[targetKind];
}

function missingChoiceDialogReferences(project: Project, fieldNames: string[], values: number[], preservedIndexes?: Iterable<number>, catalog?: LibraryCatalog | null): EdcdTargetReferenceIssue[] {
  const issues: EdcdTargetReferenceIssue[] = [];
  const preserved = new Set(preservedIndexes ?? []);
  const addIssue = (index: number, field: string, targetKind: EdcdTargetKind, value: number) => {
    issues.push({
      index,
      field,
      targetKind,
      targetLabel: edcdTargetLabel(targetKind),
      value
    });
  };

  const branchKind = choiceBranchTargetKind(values[1] ?? 0);
  const branchTarget = values[2] ?? 0;
  if (!preserved.has(2) && branchKind && branchTarget > 0 && !edcdTargetExists(project, branchKind, branchTarget, catalog)) {
    addIssue(2, fieldNames[2] ?? "branchTarget", branchKind, branchTarget);
  }

  const promptStorage = choicePromptStorageFromOptionLabels(project.optionLabels);
  for (const index of [3, 4]) {
    if (preserved.has(index)) continue;
    const prompt = parseChoicePromptValue(values[index] ?? 0, promptStorage);
    if (prompt.kind === "message" && !project.messages.some((record) => record.id === prompt.id)) {
      addIssue(index, fieldNames[index] ?? `prompt${index - 2}`, "message", prompt.id);
    }
    if (prompt.kind === "option-label" && !project.optionLabels.some((record) => record.id === prompt.id)) {
      addIssue(index, fieldNames[index] ?? `prompt${index - 2}`, "optionLabel", prompt.id);
    }
  }

  return issues;
}

function dungeonMoveLevelTargetKind(fieldNames: string[], values: number[]): EdcdTargetKind {
  const mode = valueForField(fieldNames, values, "mode") ?? values[0] ?? 0;
  return mode === 0 ? "dungeonLevel" : "landLevel";
}

function isBranchTargetField(normalizedName: string) {
  return [
    "branchtarget",
    "target",
    "truetarget",
    "falsetarget",
    "successtarget",
    "failuretarget",
    "hastarget",
    "missingtarget"
  ].includes(normalizedName);
}

function branchTargetKind(shape: string, fieldNames: string[], values: number[], opcode?: number): EdcdTargetKind | null {
  const branchModeIndex = branchModeFieldIndex(shape, fieldNames, opcode);
  if (branchModeIndex < 0) return null;
  const mode = values[branchModeIndex] ?? 0;
  if (shape === "force-branch" || shape === "percent-branch") return forceBranchTargetKind(mode);
  if ([
    "item-branch",
    "item-charge-branch",
    "false-true-branch",
    "range-branch",
    "random-branch",
    "conditional-branch",
    "misc-conditional-branch"
  ].includes(shape)) {
    return zeroBasedBranchTargetKind(mode);
  }
  return oneBasedBranchTargetKind(mode);
}

function branchModeFieldIndex(shape: string, fieldNames: string[], opcode?: number) {
  return fieldNames.findIndex((field) => field.toLowerCase().includes("branchmode"));
}

function valueForField(fieldNames: string[], values: number[], normalizedName: string) {
  const index = fieldNames.findIndex((field) => field.toLowerCase() === normalizedName);
  return index >= 0 ? values[index] : undefined;
}

function oneBasedBranchTargetKind(mode: number): EdcdTargetKind | null {
  if (mode === 1) return "macro";
  if (mode === 2) return "simpleEncounter";
  if (mode === 3) return "complexEncounter";
  return null;
}

function zeroBasedBranchTargetKind(mode: number): EdcdTargetKind | null {
  if (mode === 0) return "macro";
  if (mode === 1) return "simpleEncounter";
  if (mode === 2) return "complexEncounter";
  return null;
}

function forceBranchTargetKind(mode: number): EdcdTargetKind | null {
  if (mode === 0) return "macro";
  return null;
}
