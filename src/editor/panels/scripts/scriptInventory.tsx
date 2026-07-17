import { memo, type RefObject, useEffect, useState } from "react";
import { Action, Project, ScriptInventoryFilter, SemanticEntity, TriggerRecord } from "../../types";
import { triggerEntityId } from "../../utils";
import { ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification, isCallableMacro } from "../../semanticGraph";
import { isReusableDoorPlaceholder } from "../../actionPointCapacity";
import { ScriptDiagnostic } from "../../scriptValidation";
import { ed3DiagnosticForTrigger } from "../../scriptDiagnostics";
import { actionPointMarkerStateForTrigger, isSecretActionPointState } from "../../map/actionPointMarkers";

export const ScriptListItem = memo(function ScriptListItem({
  project,
  trigger,
  selected,
  buttonRef,
  issues,
  onSelectTrigger
}: {
  project: Project;
  trigger: TriggerRecord;
  selected: boolean;
  buttonRef?: RefObject<HTMLButtonElement>;
  issues: ScriptDiagnostic[];
  onSelectTrigger: (trigger: TriggerRecord) => void;
}) {
  const ed3Evidence = trigger.source === "Data ED3" ? extraActionEvidenceSummary(project, trigger) : null;
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`${selected ? "selected" : ""}${isReusableActionPoint(trigger) ? " reusable" : ""}`}
      onClick={() => onSelectTrigger(trigger)}
    >
      <strong>{scriptIdentity(trigger)}</strong>
      {scriptDescriptor(project, trigger) && <small className="script-record-descriptor">{scriptDescriptor(project, trigger)}</small>}
      <small>{scriptSubtitle(project, trigger)}</small>
      {trigger.source === "Data ED3" && (
        <small className={`script-reachability-badge ${ed3Evidence?.tone ?? ""}`} title={ed3Evidence?.detail}>
          {ed3Evidence?.label ?? authorFacingExtraActionKind(extraActionPointClassification(project, trigger))}
        </small>
      )}
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

export function hasScriptWarning(issues: ScriptDiagnostic[]) {
  return issues.some((issue) => issue.severity === "error" || issue.severity === "warning");
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

function authorFacingExtraActionKind(classification: string) {
  if (classification === "Callable Extra Action Point") return "Extra Action Point";
  if (classification === "Global Macro") return "Global Macro";
  if (classification === "Random Encounter Action") return "Random Encounter Action";
  if (classification === "Timed Encounter Action") return "Timed Encounter Action";
  if (classification === "Battle / Monster / Item Action") return "Source-Linked Extra Action";
  if (classification === "Likely Padding" || classification === "Imported Empty Slot") return "Likely Padding";
  if (classification === "Runtime Residue" || classification === "Imported Runtime Mutation") return "Runtime Residue";
  return "Unlinked Extra Action";
}

export const SCRIPT_INVENTORY_FILTERS: Array<{ id: ScriptInventoryFilter; label: string }> = [
  { id: "current-map", label: "Current Map" },
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "reusable", label: "Reusable" },
  { id: "warnings", label: "Warnings" }
];

export const ED3_EVIDENCE_FILTERS: Array<{ id: ScriptInventoryFilter; label: string; classification: string }> = [
  { id: "ed3-padding", label: "Likely Padding", classification: "probable-editor-padding" },
  { id: "ed3-runtime", label: "Runtime Residue", classification: "runtime-mutation-candidate" },
  { id: "ed3-orphan", label: "Orphan Authored", classification: "orphan-authored-content" },
  { id: "ed3-needs-trace", label: "Needs Trace", classification: "needs-runtime-trace" }
];

export const EXTRA_ACTION_INVENTORY_FILTERS: Array<{ id: ScriptInventoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "macros", label: "Macros" },
  { id: "ed3-battle", label: "Battle" },
  { id: "ed3-monster", label: "Monster" },
  { id: "ed3-unlinked", label: "Unlinked" },
  ...ED3_EVIDENCE_FILTERS.map((filter) => ({ id: filter.id, label: filter.label })),
  { id: "warnings", label: "Warnings" }
];

export function scriptTabKind(activeEditor: string) {
  if (activeEditor === "macros") return "reusable-actions";
  if (activeEditor === "global-macros") return "global-macros";
  if (activeEditor === "quests") return "quests";
  if (activeEditor === "settings-rows") return "settings-rows";
  if (activeEditor === "ed3-evidence") return "reusable-actions";
  return "action-points";
}

export function extraActionTabClassification(project: Project | null, trigger: TriggerRecord) {
  if (trigger.source !== "Data ED3") return "map-action-point";
  const classification = extraActionPointClassification(project, trigger);
  if (classification === "Global Macro") return "global-macros";
  return "reusable-actions";
}

export function filterScriptsByInventory(
  project: Project | null,
  scripts: TriggerRecord[],
  filter: ScriptInventoryFilter,
  selectedMap: Project["maps"][number] | null,
  canScopeToMap: boolean,
  triggerDiagnosticsById: Map<string, ScriptDiagnostic[]>
) {
  return scripts.filter((trigger) => scriptMatchesInventoryFilter(project, trigger, filter, selectedMap, canScopeToMap, triggerDiagnosticsById));
}

export function scriptMatchesInventoryFilter(
  project: Project | null,
  trigger: TriggerRecord,
  filter: ScriptInventoryFilter,
  selectedMap: Project["maps"][number] | null,
  canScopeToMap: boolean,
  triggerDiagnosticsById: Map<string, ScriptDiagnostic[]>
) {
  if (filter === "all") return true;
  if (filter === "current-map" && selectedMap && canScopeToMap) {
    return trigger.source !== "Data ED3" && trigger.levelType === selectedMap.levelType && trigger.levelIndex === selectedMap.index;
  }
  if (filter === "active") return trigger.source !== "Data ED3" && !isReusableActionPoint(trigger);
  if (filter === "reusable") return isReusableActionPoint(trigger);
  if (filter === "warnings") return Boolean(project) && hasScriptWarning(triggerDiagnosticsById.get(trigger.id) ?? []);
  if (filter === "macros") return trigger.source === "Data ED3" && isCallableMacro(project, trigger);
  if (filter === "ed3-battle") return ed3RootTypeIncludes(project, trigger, "battle");
  if (filter === "ed3-monster") return ed3RootTypeIncludes(project, trigger, "monster");
  if (filter === "ed3-unlinked") return trigger.source === "Data ED3" && !ed3DiagnosticForTrigger(project, trigger)?.reachable;
  const ed3Filter = ED3_EVIDENCE_FILTERS.find((candidate) => candidate.id === filter);
  if (ed3Filter) return ed3Classification(project, trigger) === ed3Filter.classification;
  return true;
}

export function ed3Classification(project: Project | null, trigger: TriggerRecord) {
  if (trigger.source !== "Data ED3") return null;
  return ed3DiagnosticForTrigger(project, trigger)?.classification ?? null;
}

export function isReusableActionPoint(trigger: TriggerRecord) {
  return trigger.source !== "Data ED3" && isReusableDoorPlaceholder(trigger);
}

export function triggerVisibleForEditor(project: Project | null, trigger: TriggerRecord, activeEditor: string) {
  const tabKind = scriptTabKind(activeEditor);
  if (tabKind === "reusable-actions") return trigger.source === "Data ED3";
  if (tabKind === "global-macros") return extraActionTabClassification(project, trigger) === "global-macros";
  if (activeEditor === "action-points") return trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null;
  if (activeEditor === "quests") return trigger.actions.some((action) => [46, 47, 76, 77].includes(action.code));
  if (activeEditor === "settings-rows") return false;
  return (trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null) || isCallableMacro(project, trigger);
}

export function scriptPanelTitle(activeEditor: string) {
  if (activeEditor === "action-points") return "Action Points";
  if (activeEditor === "macros") return "Extra Action Points";
  if (activeEditor === "ed3-evidence") return "Extra Action Points";
  if (activeEditor === "global-macros") return "Global Macro Scripts";
  if (activeEditor === "quests") return "Quests";
  if (activeEditor === "settings-rows") return "Data EDCD Storage";
  return "Action Points";
}

export function scriptPanelDescription(activeEditor: string) {
  if (activeEditor === "global-macros") return "Extra Action Points assigned to Start, Death, Quit, Shop, or Temple in Scenario > Global Macros.";
  if (activeEditor === "macros" || activeEditor === "ed3-evidence") return "Create and reuse Extra Action Point scripts across scenario systems.";
  if (activeEditor === "quests") return "Inspect story-flag labels and the scripts that read or change them.";
  return "Build scenario behavior from clear steps, targets, choices, and Extra Action Points.";
}

export function scriptInventoryPresentation(activeEditor: string) {
  if (activeEditor === "global-macros") {
    return {
      placeholder: "Search global macro scripts...",
      ariaLabel: "Search global macro scripts",
      resultNoun: "global macro",
      listAriaLabel: "Global Macro Scripts",
      emptyCopy: "Assign an Extra Action Point in Scenario > Global Macros to edit it here."
    };
  }
  if (activeEditor === "macros" || activeEditor === "ed3-evidence") {
    return {
      placeholder: "Search Extra Action Points...",
      ariaLabel: "Search Extra Action Points",
      resultNoun: "Extra Action Point",
      listAriaLabel: "Extra Action Points",
      emptyCopy: "Create or select an Extra Action Point to build its script steps."
    };
  }
  return {
    placeholder: "Search Action Points...",
    ariaLabel: "Search Action Points",
    resultNoun: "Action Point",
    listAriaLabel: "Action Points",
    emptyCopy: "Create or select an Action Point to build its script steps."
  };
}

function ed3RootTypeIncludes(project: Project | null, trigger: TriggerRecord, needle: string) {
  if (trigger.source !== "Data ED3") return false;
  return String(ed3ReachabilityFor(project, trigger.recordIndex)?.rootType ?? "").includes(needle);
}

export function scriptIdentity(trigger: TriggerRecord) {
  return trigger.source === "Data ED3"
    ? `Extra Action Point ${trigger.recordIndex}`
    : isReusableDoorPlaceholder(trigger)
      ? `Empty Action Point ${trigger.recordIndex}`
      : trigger.coordinate
        ? `Action Point ${trigger.recordIndex} (${trigger.coordinate.x}, ${trigger.coordinate.y})`
        : `Action Point ${trigger.recordIndex}`;
}

export function scriptDescriptor(project: Project, trigger: TriggerRecord) {
  return project.editorMetadata?.displayNames?.[trigger.id]?.label?.trim() ?? "";
}

export function scriptLabel(project: Project, trigger: TriggerRecord) {
  const identity = scriptIdentity(trigger);
  const descriptor = scriptDescriptor(project, trigger);
  return descriptor ? `${identity} - ${descriptor}` : identity;
}

export function scriptSubtitle(project: Project, trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") {
    return `${trigger.actions.length} step${trigger.actions.length === 1 ? "" : "s"}`;
  }
  const map = project.maps.find((candidate) => candidate.levelType === trigger.levelType && candidate.index === trigger.levelIndex);
  const mapLabel = map?.name ?? `${trigger.levelType ?? "map"} ${trigger.levelIndex ?? 0}`;
  if (isReusableDoorPlaceholder(trigger)) return `${mapLabel} | reusable slot`;
  const markerState = actionPointMarkerStateForTrigger(project, trigger);
  if (!isSecretActionPointState(markerState)) return mapLabel;
  return `${mapLabel} | ${markerState === "revealed-secret" ? "revealed secret" : "secret"}`;
}

export function scriptMatchesQuery(project: Project, trigger: TriggerRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    scriptIdentity(trigger),
    scriptDescriptor(project, trigger),
    scriptSubtitle(project, trigger),
    trigger.id,
    trigger.actions.map((action) => `${action.slot} ${action.rawCode} ${action.id} ${action.label}`).join(" ")
  ].join(" ").toLowerCase().includes(normalized);
}

export function actionSummary(action?: Action, slotEntity?: SemanticEntity) {
  if (!action) return "empty";
  const edcdUsage = slotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  if (edcdUsage?.summary) {
    return `Settings: ${edcdUsage.summary}`;
  }
  return `${action.label}${action.gosub ? " · reusable" : ""}`;
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
  return trigger.source === "Data ED3"
    ? `macro:${trigger.recordIndex}`
    : triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
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
