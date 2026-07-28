import {
  edcdUsageForRow,
  nextUnusedPositiveEdcdRowId,
  normalizeEdcdValues,
  type EdcdRowUsage
} from "../../edcdRows";
import { normalizeStepOpcode } from "../../realmzActions";
import type { EncounterActionRow, LibraryCatalog, Project } from "../../types";
import { encounterActionAt } from "./encounterFlow";
import {
  scriptActionDefinitionFor,
  scriptActionSummary,
  type ScriptActionDefinition
} from "./scriptActionCatalog";
import type { ContextualEcodeWriteMode } from "./ContextualEcodeSettingsModal";

export type EncounterEcodeSettingsState = {
  slot: number;
  rawCode: number;
  definition: ScriptActionDefinition;
  shape: string;
  sourceRowId: number | null;
  editorRowId: number;
  initialValues: [number, number, number, number, number];
  secondaryRowId: number | null;
  secondaryShape: string | null;
  secondaryInitialValues?: [number, number, number, number, number];
  sourceUsage: EdcdRowUsage | null;
  defaultWriteMode: ContextualEcodeWriteMode;
  allowSharedEdit: boolean;
};

export function encounterEcodeSettingsState(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  actions: EncounterActionRow[],
  slot: number,
  rawCode: number
): EncounterEcodeSettingsState | null {
  const definition = scriptActionDefinitionFor(rawCode);
  const shape = definition.edcdShape;
  if (!shape) return null;
  const current = encounterActionAt(actions, slot);
  const currentDefinition = scriptActionDefinitionFor(current.rawCode);
  const sameSettingsAction = normalizeStepOpcode(current.rawCode) === normalizeStepOpcode(rawCode)
    && currentDefinition.edcdShape === shape;
  const sourceRowId = sameSettingsAction ? Math.max(0, Number(current.id ?? 0)) : null;
  const sourceUsage = sourceRowId == null ? null : edcdUsageForRow(project, catalog, sourceRowId);
  const sourceValues = sameSettingsAction
    ? sourceUsage?.values
      ?? project.extracodes.find((row) => row.id === sourceRowId)?.values
    : undefined;
  const initialValues = normalizeEdcdValues(sourceValues ?? definition.defaultDraft.parameters);
  const requiresOwnedCopy = Boolean(
    sourceUsage
    && (sourceUsage.status === "shared" || sourceUsage.status === "conflict" || sourceUsage.callers.length > 1)
  );
  const rowSpan = normalizeStepOpcode(rawCode) === 92 ? 2 : 1;
  const editorRowId = sourceRowId == null || sourceRowId <= 0 || requiresOwnedCopy
    ? nextUnusedPositiveEdcdRowId(project, rowSpan)
    : sourceRowId;
  const secondaryRowId = normalizeStepOpcode(rawCode) === 92 ? editorRowId + 1 : null;
  const secondaryShape = secondaryRowId == null ? null : "random-region-shape-details";
  const secondaryInitialValues = secondaryRowId == null
    ? undefined
    : normalizeEdcdValues(
      sameSettingsAction
        ? sourceUsage?.secondaryValues
          ?? project.extracodes.find((row) => row.id === (sourceRowId ?? -1) + 1)?.values
        : undefined
    );
  return {
    slot,
    rawCode,
    definition,
    shape,
    sourceRowId,
    editorRowId,
    initialValues,
    secondaryRowId,
    secondaryShape,
    secondaryInitialValues,
    sourceUsage,
    defaultWriteMode: requiresOwnedCopy ? "duplicate" : "replace",
    allowSharedEdit: sourceUsage?.status === "shared"
  };
}

export function encounterEcodeTargetRowId(
  state: Pick<EncounterEcodeSettingsState, "sourceRowId" | "editorRowId">,
  writeMode: ContextualEcodeWriteMode
) {
  return writeMode === "replace" && state.sourceRowId != null && state.sourceRowId > 0
    ? state.sourceRowId
    : state.editorRowId;
}

export function encounterEcodeActionSummary(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  row: EncounterActionRow
) {
  const definition = scriptActionDefinitionFor(row.rawCode);
  if (!definition.edcdShape) return null;
  const settings = (project.extracodes ?? []).find((candidate) => candidate.id === Math.max(0, row.id));
  if (!settings) return `${definition.shortLabel} settings need review`;
  return scriptActionSummary(
    project,
    catalog,
    { rawCode: row.rawCode, id: row.id, parameters: normalizeEdcdValues(settings.values) },
    ""
  ) || definition.shortLabel;
}
