import { nextUnusedEdcdRowId } from "../../edcdRows";
import type { Project } from "../../types";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export type EdcdStepDraft = {
  values: [number, number, number, number, number];
  dirty: boolean;
  secondaryValues?: [number, number, number, number, number];
  secondaryDirty?: boolean;
};

export function defaultDraftForProject(project: Project, definition: ScriptActionDefinition) {
  const draft = definition.defaultDraft;
  if (!draft.parameters || draft.id !== 0) return { rawCode: draft.rawCode, id: draft.id };
  return { rawCode: draft.rawCode, id: nextUnusedEdcdRowId(project) };
}

export function edcdDraftValuesEqual(left?: readonly number[], right?: readonly number[]) {
  return [0, 1, 2, 3, 4].every((index) => Number(left?.[index] ?? 0) === Number(right?.[index] ?? 0));
}
