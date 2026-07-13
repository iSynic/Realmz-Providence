import { useEffect, useMemo, useState } from "react";
import type { LibraryCatalog, Project, ScriptInventoryFilter, TriggerRecord } from "../../types";
import type { ScriptDiagnostic } from "../../scriptValidation";
import { hasScriptWarning } from "./scriptInventory";
import { actionPointDiagnosticDependencyKey, validateActionPointTriggerCached } from "./actionPointDiagnostics";

export function useActionPointWarningDiagnostics({
  project,
  catalog,
  scripts,
  inventoryFilter,
  activeEditor
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  scripts: TriggerRecord[];
  inventoryFilter: ScriptInventoryFilter;
  activeEditor: string;
}) {
  const [warningScanReady, setWarningScanReady] = useState(false);
  const diagnosticDependencyKey = useMemo(
    () => actionPointDiagnosticDependencyKey(project, catalog),
    [project, catalog]
  );

  useEffect(() => {
    setWarningScanReady(false);
    if (inventoryFilter !== "warnings") return;
    const handle = window.setTimeout(() => setWarningScanReady(true), 160);
    return () => window.clearTimeout(handle);
  }, [activeEditor, diagnosticDependencyKey, inventoryFilter, scripts.length]);

  const fullWarningDiagnosticsById = useMemo(() => {
    const map = new Map<string, ScriptDiagnostic[]>();
    if (inventoryFilter !== "warnings" || !warningScanReady) return map;
    for (const trigger of scripts) {
      const diagnostics = validateActionPointTriggerCached(project, trigger, catalog, diagnosticDependencyKey);
      if (hasScriptWarning(diagnostics)) map.set(trigger.id, diagnostics);
    }
    return map;
  }, [project, scripts, catalog, diagnosticDependencyKey, inventoryFilter, warningScanReady]);

  return { diagnosticDependencyKey, warningScanReady, fullWarningDiagnosticsById };
}

export function useSelectedActionPointDiagnostics({
  project,
  catalog,
  selectedTrigger,
  diagnosticDependencyKey,
  fullWarningDiagnosticsById
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedTrigger: TriggerRecord | null;
  diagnosticDependencyKey: string;
  fullWarningDiagnosticsById: Map<string, ScriptDiagnostic[]>;
}) {
  const [selectedDiagnosticsReady, setSelectedDiagnosticsReady] = useState(false);

  useEffect(() => {
    setSelectedDiagnosticsReady(false);
    if (!selectedTrigger) return;
    const handle = window.setTimeout(() => setSelectedDiagnosticsReady(true), 120);
    return () => window.clearTimeout(handle);
  }, [project, selectedTrigger?.id, diagnosticDependencyKey]);

  return useMemo(() => {
    const map = new Map(fullWarningDiagnosticsById);
    if (selectedDiagnosticsReady && selectedTrigger && !map.has(selectedTrigger.id)) {
      map.set(selectedTrigger.id, validateActionPointTriggerCached(project, selectedTrigger, catalog, diagnosticDependencyKey));
    }
    return map;
  }, [project, selectedTrigger, selectedDiagnosticsReady, catalog, diagnosticDependencyKey, fullWarningDiagnosticsById]);
}
