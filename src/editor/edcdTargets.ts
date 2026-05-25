import { Project, RealmzTargetRecordKind, SelectedEntity } from "./types";
import { isCallableMacro } from "./semanticGraph";
import { selectEntityFromId } from "./utils";

export type EdcdTargetKind = "message" | "battle" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel" | "macro";

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

export function edcdFieldTargetKind(shape: string, name: string, fieldNames: string[], values: number[]): EdcdTargetKind | null {
  const normalizedShape = shape.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (normalizedName === "shop") return "shop";
  if (normalizedName === "simpleencounter") return "simpleEncounter";
  if (normalizedName === "quest") return "questLabel";
  if (normalizedName.includes("macro")) return "macro";
  if (normalizedName.includes("message") || normalizedName.startsWith("prompt")) return "message";
  if (normalizedShape.includes("battle") && (normalizedName === "battlelow" || normalizedName === "battlehigh")) return "battle";
  if (isBranchTargetField(normalizedName)) return branchTargetKind(fieldNames, values);
  return null;
}

export function edcdTargetOptions(project: Project, targetKind: EdcdTargetKind): EdcdTargetOption[] {
  if (targetKind === "macro") {
    return project.triggers
      .filter((trigger) => trigger.source === "Data ED3" && isCallableMacro(project, trigger))
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Macro ${trigger.recordIndex}`,
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

export function missingEdcdTargetReferences(project: Project, shape: string, fieldNames: string[], values: number[]): EdcdTargetReferenceIssue[] {
  const issues: EdcdTargetReferenceIssue[] = [];
  for (const [index, field] of fieldNames.entries()) {
    const value = values[index] ?? 0;
    if (!Number.isFinite(value) || value <= 0) continue;
    const targetKind = edcdFieldTargetKind(shape, field, fieldNames, values);
    if (!targetKind || targetKind === "questLabel") continue;
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

export function createRecordTypeForEdcdTarget(targetKind: EdcdTargetKind | null): RealmzTargetRecordKind | null {
  if (!targetKind || targetKind === "macro") return null;
  return targetKind;
}

export function edcdTargetLabel(targetKind: EdcdTargetKind) {
  const labels: Record<EdcdTargetKind, string> = {
    message: "message",
    battle: "battle",
    shop: "shop",
    simpleEncounter: "simple encounter",
    complexEncounter: "complex encounter",
    questLabel: "quest label",
    macro: "macro"
  };
  return labels[targetKind];
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

function branchTargetKind(fieldNames: string[], values: number[]): EdcdTargetKind | null {
  const branchModeIndex = fieldNames.findIndex((field) => field.toLowerCase().includes("branchmode"));
  if (branchModeIndex < 0) return null;
  const mode = values[branchModeIndex] ?? 0;
  if (mode === 1) return "macro";
  if (mode === 2) return "simpleEncounter";
  if (mode === 3) return "complexEncounter";
  return null;
}
