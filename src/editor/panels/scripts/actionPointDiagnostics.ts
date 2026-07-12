import type { LibraryCatalog, Project, TriggerRecord } from "../../types";
import { validateScriptTrigger, type ScriptDiagnostic } from "../../scriptValidation";

const scriptDiagnosticCache = new WeakMap<TriggerRecord, { key: string; diagnostics: ScriptDiagnostic[] }>();
const objectIdentity = new WeakMap<object, number>();
let nextObjectIdentity = 1;

function refKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIdentity.get(value);
  if (existing) return existing;
  const next = nextObjectIdentity++;
  objectIdentity.set(value, next);
  return next;
}

export function actionPointDiagnosticDependencyKey(project: Project, catalog?: LibraryCatalog | null) {
  return [
    refKey(catalog ?? null),
    refKey(project.triggers),
    refKey(project.extracodes),
    refKey(project.messages),
    refKey(project.battles),
    refKey(project.monsters),
    refKey(project.treasures),
    refKey(project.shops),
    refKey(project.simpleEncounters),
    refKey(project.complexEncounters),
    refKey(project.thiefEncounters),
    refKey(project.timedEncounters),
    refKey(project.questLabels),
    refKey(project.assets),
    refKey(project.maps),
    refKey(project.mapRecords)
  ].join("|");
}

export function validateActionPointTriggerCached(
  project: Project,
  trigger: TriggerRecord,
  catalog: LibraryCatalog | null | undefined,
  dependencyKey: string
) {
  const cached = scriptDiagnosticCache.get(trigger);
  if (cached?.key === dependencyKey) return cached.diagnostics;
  const diagnostics = validateScriptTrigger(project, trigger, catalog);
  scriptDiagnosticCache.set(trigger, { key: dependencyKey, diagnostics });
  return diagnostics;
}
