import { OptionLabelRecord } from "./types";

export type ChoicePromptKind = "default" | "message" | "option-label";
export type ChoiceBranchTargetKind = "macro" | "simpleEncounter" | "complexEncounter";

export type ChoicePromptTarget = {
  kind: ChoicePromptKind;
  id: number;
};

export const CHOICE_BRANCH_MODES = [
  { value: -1, label: "Continue", help: "The other choice also continues to the next step without branching." },
  { value: 0, label: "Back Up", help: "The party backs up one step." },
  { value: 1, label: "Extra Action Point", help: "Branch to an Extra Action Point." },
  { value: 2, label: "Simple Encounter Result", help: "Branch inside the current simple encounter." },
  { value: 3, label: "Complex Encounter Result", help: "Branch inside the current complex encounter." },
  { value: 4, label: "Eliminate Action Point", help: "Eliminate this Action Point and stop." }
] as const;

export function parseChoicePromptValue(value: number): ChoicePromptTarget {
  if (value > 0) return { kind: "message", id: value };
  if (value < 0) return { kind: "option-label", id: Math.abs(value) };
  return { kind: "default", id: 0 };
}

export function serializeChoicePromptValue(kind: ChoicePromptKind, id: number) {
  if (kind === "message") return Math.max(0, Math.trunc(id));
  if (kind === "option-label") return -Math.max(0, Math.trunc(id));
  return 0;
}

export function choiceBranchTargetKind(branchMode: number): ChoiceBranchTargetKind | null {
  if (branchMode === 1) return "macro";
  if (branchMode === 2) return "simpleEncounter";
  if (branchMode === 3) return "complexEncounter";
  return null;
}

export function choiceBranchModeLabel(branchMode: number) {
  return CHOICE_BRANCH_MODES.find((mode) => mode.value === branchMode)?.label ?? `Raw mode ${branchMode}`;
}

export function choiceContinueLabel(value: number) {
  if (value === 1) return "Left / Yes continues";
  if (value === 0) return "Right / No continues";
  return `Raw continue value ${value}`;
}

export function nextOptionLabelId(records: OptionLabelRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}
