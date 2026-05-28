import { memo, type RefObject, useEffect, useState } from "react";
import { Action, Project, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import { ed3ReachabilityFor, isCallableMacro } from "../../semanticGraph";
import { isReusableDoorPlaceholder } from "../../actionPointCapacity";
import { ScriptDiagnostic } from "../../scriptValidation";

export const ScriptListItem = memo(function ScriptListItem({
  project,
  trigger,
  selected,
  buttonRef,
  issues,
  onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  selected: boolean;
  buttonRef?: RefObject<HTMLButtonElement>;
  issues: ScriptDiagnostic[];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`${selected ? "selected" : ""}${isReusableActionPoint(trigger) ? " reusable" : ""}`}
      onClick={() => onSelectEntity(selectEntityFromId(trigger.source === "Data ED3" ? `macro:${trigger.recordIndex}` : trigger.id))}
    >
      <strong>{scriptLabel(project, trigger)}</strong>
      <small>{scriptSubtitle(project, trigger)}</small>
      {trigger.source === "Data ED3" && <small className="script-reachability-badge">{ed3ReachabilityFor(project, trigger.recordIndex)?.rootType ?? "authored"}</small>}
      <ScriptIssueBadge issues={issues} />
    </button>
  );
});

function ScriptIssueBadge({ issues }: { issues: ScriptDiagnostic[] }) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  if (errors === 0 && warnings === 0) return <small className="script-issue-badge ok">ready</small>;
  return <small className={`script-issue-badge ${errors ? "danger" : "warning"}`}>{errors ? `${errors} error` : `${warnings} warning`}</small>;
}

export function issueCountsBySlot(issues: ScriptDiagnostic[]) {
  const counts = new Map<number, { errors: number; warnings: number }>();
  for (const issue of issues) {
    if (issue.slot == null) continue;
    const existing = counts.get(issue.slot) ?? { errors: 0, warnings: 0 };
    if (issue.severity === "error") existing.errors += 1;
    if (issue.severity === "warning") existing.warnings += 1;
    counts.set(issue.slot, existing);
  }
  return counts;
}


export const SCRIPT_INVENTORY_FILTERS: Array<{ id: ScriptInventoryFilter; label: string }> = [
  { id: "current-map", label: "Current Map" },
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "reusable", label: "Reusable" },
  { id: "warnings", label: "Warnings" },
  { id: "macros", label: "Macros" }
];

export function filterScriptsByInventory(
  project: Project | null,
  scripts: TriggerRecord[],
  filter: ScriptInventoryFilter,
  selectedMap: Project["maps"][number] | null,
  canScopeToMap: boolean,
  triggerDiagnosticsById: Map<string, ScriptDiagnostic[]>
) {
  if (filter === "current-map" && selectedMap && canScopeToMap) {
    return scripts.filter((trigger) => trigger.source !== "Data ED3" && trigger.levelType === selectedMap.levelType && trigger.levelIndex === selectedMap.index);
  }
  if (filter === "active") {
    return scripts.filter((trigger) => trigger.source !== "Data ED3" && !isReusableActionPoint(trigger));
  }
  if (filter === "reusable") {
    return scripts.filter(isReusableActionPoint);
  }
  if (filter === "warnings") {
    if (!project) return [];
    return scripts.filter((trigger) => (triggerDiagnosticsById.get(trigger.id) ?? []).length > 0);
  }
  if (filter === "macros") {
    return scripts.filter((trigger) => trigger.source === "Data ED3");
  }
  return scripts;
}

export function isReusableActionPoint(trigger: TriggerRecord) {
  return trigger.source !== "Data ED3" && isReusableDoorPlaceholder(trigger);
}

export function triggerVisibleForEditor(project: Project | null, trigger: TriggerRecord, activeEditor: string) {
  if (activeEditor === "macros" || activeEditor === "global-macros") return isCallableMacro(project, trigger);
  if (activeEditor === "action-points") return trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null;
  if (activeEditor === "quests") return trigger.actions.some((action) => [46, 47, 76, 77].includes(action.code));
  return (trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null) || isCallableMacro(project, trigger);
}

export function scriptPanelTitle(activeEditor: string) {
  if (activeEditor === "action-points") return "Action Points / GOSUBs";
  if (activeEditor === "macros") return "Macro Editor";
  if (activeEditor === "ed3-evidence") return "Imported ED3 Rows";
  if (activeEditor === "global-macros") return "Global Macro Editor";
  if (activeEditor === "quests") return "Quest Script Links";
  return "Triggers And Macros";
}

export function scriptLabel(project: Project, trigger: TriggerRecord) {
  const fallback = trigger.source === "Data ED3"
    ? `Macro ${trigger.recordIndex}`
    : isReusableDoorPlaceholder(trigger)
      ? `Empty Action Point ${trigger.recordIndex}`
    : trigger.coordinate
      ? `Action Point ${trigger.recordIndex} (${trigger.coordinate.x}, ${trigger.coordinate.y})`
      : `Action Point ${trigger.recordIndex}`;
  return project.editorMetadata?.displayNames?.[trigger.id]?.label ?? fallback;
}

export function scriptSubtitle(project: Project, trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") {
    const row = ed3ReachabilityFor(project, trigger.recordIndex);
    return `macro | record ${trigger.recordIndex} | ${row?.pathStatus ?? "authored"}`;
  }
  const map = project.maps.find((candidate) => candidate.levelType === trigger.levelType && candidate.index === trigger.levelIndex);
  const mapLabel = map?.name ?? `${trigger.levelType ?? "map"} ${trigger.levelIndex ?? 0}`;
  const coordinate = trigger.coordinate ? `${trigger.coordinate.x},${trigger.coordinate.y}` : isReusableDoorPlaceholder(trigger) ? "empty reusable slot" : "no coordinate";
  return `${mapLabel} | record ${trigger.recordIndex} | ${coordinate}`;
}

export function scriptMatchesQuery(project: Project, trigger: TriggerRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    scriptLabel(project, trigger),
    scriptSubtitle(project, trigger),
    trigger.id,
    trigger.actions.map((action) => `${action.slot} ${action.rawCode} ${action.id} ${action.label}`).join(" ")
  ].join(" ").toLowerCase().includes(normalized);
}

export function actionSummary(action?: Action, slotEntity?: SemanticEntity) {
  if (!action) return "empty";
  const edcdUsage = slotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  if (edcdUsage?.summary) {
    const prefix = edcdUsage.rowId != null ? `EDCD ${edcdUsage.rowId}` : "EDCD";
    return `${action.rawCode} / ${action.id} · ${prefix}: ${edcdUsage.summary}`;
  }
  return `${action.rawCode} / ${action.id} · ${action.label}${action.gosub ? " · GOSUB" : ""}`;
}

export function actionBelongsTo(trigger: TriggerRecord, entityId: string) {
  return entityId.includes(trigger.id) || entityId.startsWith(`action:${trigger.source}:${trigger.recordIndex}:`) || entityId.startsWith(`action-slot:${triggerSelectionId(trigger)}:`);
}

export function triggerMatchesSelection(trigger: TriggerRecord, entityId: string) {
  if (!entityId) return false;
  return triggerSelectionId(trigger) === entityId ||
    triggerSemanticSelectionId(trigger) === entityId ||
    trigger.id === entityId ||
    actionBelongsTo(trigger, entityId);
}

export function triggerSelectionId(trigger: TriggerRecord) {
  return trigger.source === "Data ED3" ? `macro:${trigger.recordIndex}` : trigger.id;
}

export function triggerSemanticSelectionId(trigger: TriggerRecord) {
  return triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
}

export function usePersistentBoolean(key: string, fallback: boolean) {
  return usePersistentValue(key, fallback, (value) => value === "1" || value === "true", (value) => value ? "1" : "0");
}

export function usePersistentValue<T extends string | boolean>(
  key: string,
  fallback: T,
  parse: (value: string) => T = (value) => value as T,
  serialize: (value: T) => string = (value) => String(value)
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored == null ? fallback : parse(stored);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
