import { Project, RealmzTargetRecordKind, SelectedEntity } from "./types";
import { isCallableMacro } from "./semanticGraph";
import { selectEntityFromId } from "./utils";
import { choiceBranchTargetKind, parseChoicePromptValue } from "./choiceDialogs";

export type EdcdTargetKind = "message" | "optionLabel" | "battle" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel" | "macro";

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
    return (values[4] ?? 0) === 10 ? "macro" : null;
  }
  if (normalizedName === "shop") return "shop";
  if (normalizedName === "simpleencounter") return "simpleEncounter";
  if (normalizedName === "quest") return "questLabel";
  if (normalizedName.includes("macro")) return "macro";
  if (normalizedName.includes("message") || normalizedName.startsWith("prompt")) return "message";
  if (normalizedShape.includes("battle") && (normalizedName === "battlelow" || normalizedName === "battlehigh")) return "battle";
  if (isBranchTargetField(normalizedName)) return branchTargetKind(normalizedShape, fieldNames, values, opcode);
  return null;
}

export function edcdTargetOptions(project: Project, targetKind: EdcdTargetKind): EdcdTargetOption[] {
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
      .filter((trigger) => trigger.source === "Data ED3" && isCallableMacro(project, trigger))
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
      label: `Message ${record.id}`,
      detail: record.text ? record.text.slice(0, 96) : "empty message",
      entity: selectEntityFromId(`message:${record.id}`)
    }));
  }
  return (project.battles ?? []).map((record) => ({
    key: `battle:${record.id}`,
    value: record.id,
    label: `Battle ${record.id}`,
    detail: `distance ${record.dist}, before ${record.messageBefore}, after ${record.messageAfter}`,
    entity: selectEntityFromId(`battle:${record.id}`)
  }));
}

export function missingEdcdTargetReferences(project: Project, shape: string, fieldNames: string[], values: number[], opcode?: number, preservedIndexes?: Iterable<number>): EdcdTargetReferenceIssue[] {
  if (shape.toLowerCase() === "choice" && Math.abs(opcode ?? 0) === 3) {
    return missingChoiceDialogReferences(project, fieldNames, values, preservedIndexes);
  }
  const issues: EdcdTargetReferenceIssue[] = [];
  const preserved = new Set(preservedIndexes ?? []);
  for (const [index, field] of fieldNames.entries()) {
    if (preserved.has(index)) continue;
    const rawValue = values[index] ?? 0;
    const targetKind = edcdFieldTargetKind(shape, field, fieldNames, values, opcode);
    if (!targetKind || targetKind === "questLabel") continue;
    const value = normalizedEdcdTargetValueForValidation(targetKind, rawValue, field, opcode);
    if (!Number.isFinite(value) || value < 0) continue;
    if (value === 0 && !["macro", "simpleEncounter", "complexEncounter"].includes(targetKind)) continue;
    if (edcdTargetOptions(project, targetKind).some((option) => option.value === value)) continue;
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

function normalizedEdcdTargetValueForValidation(targetKind: EdcdTargetKind, rawValue: number, field: string, opcode?: number) {
  if (targetKind === "battle") return Math.abs(rawValue);
  if (targetKind === "message" && (opcode === 15 || opcode === 16) && field.toLowerCase() === "message") return Math.abs(rawValue);
  return rawValue;
}

export function createRecordTypeForEdcdTarget(targetKind: EdcdTargetKind | null): RealmzTargetRecordKind | null {
  if (!targetKind || targetKind === "macro" || targetKind === "optionLabel") return null;
  return targetKind;
}

export function edcdTargetLabel(targetKind: EdcdTargetKind) {
  const labels: Record<EdcdTargetKind, string> = {
    message: "message",
    optionLabel: "option label",
    battle: "battle",
    shop: "shop",
    simpleEncounter: "simple encounter",
    complexEncounter: "complex encounter",
    questLabel: "quest label",
    macro: "Extra Action Point"
  };
  return labels[targetKind];
}

function missingChoiceDialogReferences(project: Project, fieldNames: string[], values: number[], preservedIndexes?: Iterable<number>): EdcdTargetReferenceIssue[] {
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
  if (!preserved.has(2) && branchKind && branchTarget > 0 && !edcdTargetOptions(project, branchKind).some((option) => option.value === branchTarget)) {
    addIssue(2, fieldNames[2] ?? "branchTarget", branchKind, branchTarget);
  }

  for (const index of [3, 4]) {
    if (preserved.has(index)) continue;
    const prompt = parseChoicePromptValue(values[index] ?? 0);
    if (prompt.kind === "message" && !project.messages.some((record) => record.id === prompt.id)) {
      addIssue(index, fieldNames[index] ?? `prompt${index - 2}`, "message", prompt.id);
    }
    if (prompt.kind === "option-label" && !project.optionLabels.some((record) => record.id === prompt.id)) {
      addIssue(index, fieldNames[index] ?? `prompt${index - 2}`, "optionLabel", prompt.id);
    }
  }

  return issues;
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
