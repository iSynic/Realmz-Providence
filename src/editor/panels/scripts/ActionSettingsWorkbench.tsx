import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { EdcdRowEditor } from "../../components/EdcdRowEditor";
import {
  buildEdcdRowUsages,
  edcdUsageMatchesFilter,
  edcdUsageStatusTone,
  edcdUsageToEditorUsage,
  normalizeEdcdValues,
  type EdcdRowCaller,
  type EdcdRowFilter,
  type EdcdRowUsage
} from "../../edcdRows";
import { TutorialTip } from "../../components/TutorialTip";
import { EmptyState, PanelSection, ScrollArea, SearchField } from "../../ui";
import { scriptActionDefinitionFor } from "./scriptActionCatalog";
import { scriptLabel, usePersistentValue } from "./scriptInventory";
import { actionSlotSelectionId } from "./actionPointSelection";

const SETTINGS_HELP =
  "Data EDCD stores Divinity Extra Code values behind settings-backed actions. Authors normally edit these values from the calling script step. This advanced browser exists for diagnostics, archaeology, and deliberate storage repair.";

export function ActionSettingsWorkbench({
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const usages = useMemo(() => buildEdcdRowUsages(project, catalog), [project, catalog]);
  const handleOpenCaller = useCallback((caller: EdcdRowCaller) => {
    if (caller.contextKind === "trigger") {
      const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
      if (!trigger) return;
      onSelectEntity(selectEntityFromId(actionSlotSelectionId(trigger, caller.slot)));
      onSelectEditor?.(scriptEditorForTriggerSource(trigger.source));
      return;
    }
    if (caller.contextKind === "simpleEncounter") {
      onSelectEntity(selectEntityFromId(`encounter:simple:${caller.triggerRecordIndex}`));
      onSelectEditor?.("simple");
      return;
    }
    onSelectEntity(selectEntityFromId(`encounter:complex:${caller.triggerRecordIndex}`));
    onSelectEditor?.("complex");
  }, [onSelectEditor, onSelectEntity, project]);
  return (
    <SettingsRowsPanel
      project={project}
      catalog={catalog}
      selectedEntity={selectedEntity}
      usages={usages}
      onSelectEntity={onSelectEntity}
      onOpenTool={onOpenTool}
      onOpenCaller={handleOpenCaller}
      onApplyCommand={onApplyCommand}
    />
  );
}

const EDCD_ROW_FILTERS: Array<{ id: EdcdRowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in-use", label: "In Use" },
  { id: "shared", label: "Shared" },
  { id: "unused", label: "Unused" },
  { id: "missing", label: "Missing" },
  { id: "conflict", label: "Conflicts" }
];

const MAX_VISIBLE_STORAGE_ROWS = 500;

function SettingsRowsPanel({
  project,
  catalog,
  selectedEntity,
  usages,
  onSelectEntity,
  onOpenTool,
  onOpenCaller,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  usages: EdcdRowUsage[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenCaller: (caller: EdcdRowCaller) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [filter, setFilter] = usePersistentValue<EdcdRowFilter>("scripts.edcdRows.filter", "all");
  const [query, setQuery] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const selectedEntityRowId = edcdRowIdFromSelectedEntity(selectedEntity);

  useEffect(() => {
    if (selectedEntityRowId == null) return;
    setSelectedRowId(selectedEntityRowId);
    setQuery(String(selectedEntityRowId));
  }, [selectedEntityRowId]);
  const usageCounts = useMemo(() => {
    const counts = new Map<EdcdRowFilter, number>(EDCD_ROW_FILTERS.map((entry) => [entry.id, 0]));
    for (const usage of usages) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(usage.status, (counts.get(usage.status) ?? 0) + 1);
    }
    return counts;
  }, [usages]);
  const filteredUsages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return usages.filter((usage) => {
      if (!edcdUsageMatchesFilter(usage, filter)) return false;
      if (!normalized) return true;
      return [
        usage.rowId,
        usage.statusLabel,
        usage.summary,
        usage.primaryActionLabel,
        usage.primaryShape,
        usage.possibleShapes.join(" "),
        usage.values.join(" "),
        usage.callers.map((caller) => `${caller.actionLabel} ${callerLabel(project, caller)} ${caller.slot}`).join(" ")
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [filter, query, usages]);
  const visibleUsages = filteredUsages.slice(0, MAX_VISIBLE_STORAGE_ROWS);
  const selectedUsage = filteredUsages.find((usage) => usage.rowId === selectedRowId)
    ?? filteredUsages[0]
    ?? usages.find((usage) => usage.rowId === selectedRowId)
    ?? usages[0]
    ?? null;
  const selectedShape = selectedUsage?.primaryShape ?? undefined;
  const selectedOpcode = selectedUsage?.primaryOpcode ?? undefined;
  const editorUsage = selectedUsage ? edcdUsageToEditorUsage(selectedUsage) : null;
  const editorMode = selectedUsage ? settingsEditorModeForUsage(selectedUsage) : null;
  const canDelete = selectedUsage?.exists && selectedUsage.status === "unused";
  const deleteSelectedRow = () => {
    if (!selectedUsage || !canDelete) return;
    if (!window.confirm(`Delete unused Data EDCD row #${selectedUsage.rowId}? Imported unused rows are preserved unless you deliberately delete them here.`)) return;
    onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete Data EDCD row #${selectedUsage.rowId}`, rowId: selectedUsage.rowId });
  };

  return (
    <section className="settings-rows-workbench">
      <header>
        <div>
          <span className="technical-storage-eyebrow">Technical Inventory</span>
          <TutorialTip title="Data EDCD / Extra Code Storage" body={SETTINGS_HELP} side="below">
            <strong>Data EDCD / Extra Code Storage</strong>
          </TutorialTip>
          <small>Inspect backing rows and repair storage only when caller-based editing is insufficient.</small>
        </div>
      </header>
      <div className="settings-rows-layout">
        <aside className="settings-row-list-column">
          <div className="settings-row-filter-panel">
            <SearchField
              className="settings-row-search"
              value={query}
              onChange={setQuery}
              placeholder="Search Data EDCD storage..."
              ariaLabel="Search Data EDCD storage"
              resultCount={filteredUsages.length}
              resultNoun="settings row"
            />
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Action settings filter">
              {EDCD_ROW_FILTERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={filter === entry.id ? "active" : ""}
                  onClick={() => setFilter(entry.id)}
                >
                  <span>{entry.label}</span>
                  <b>{usageCounts.get(entry.id) ?? 0}</b>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="settings-row-list" aria-label="Data EDCD storage rows">
            {filteredUsages.length > visibleUsages.length && (
              <p className="settings-row-list-limit">
                Showing {visibleUsages.length.toLocaleString()} of {filteredUsages.length.toLocaleString()} matching rows. Search or narrow the status filter to reach the rest.
              </p>
            )}
            {visibleUsages.map((usage) => (
              <button
                key={usage.rowId}
                type="button"
                className={`settings-row-card${usage.rowId === selectedUsage?.rowId ? " selected" : ""} ${edcdUsageStatusTone(usage.status)}`}
                onClick={() => setSelectedRowId(usage.rowId)}
              >
                <span>
                  <strong>Data EDCD #{usage.rowId}</strong>
                  <small>{usage.summary}</small>
                </span>
                <b>{usage.statusLabel}</b>
                <small>{usage.callers.length} caller{usage.callers.length === 1 ? "" : "s"}{usage.primaryShape ? ` | ${usage.primaryShape}` : ""}</small>
              </button>
            ))}
            {filteredUsages.length === 0 && <EmptyState compact title="No storage rows" body="No Data EDCD rows match this filter." />}
          </ScrollArea>
        </aside>
        <main className="settings-row-detail">
          {selectedUsage ? (
            <PanelSection
              title={`Data EDCD #${selectedUsage.rowId}`}
              eyebrow={selectedUsage.statusLabel}
              density="compact"
              actions={
                <>
                  <button type="button" className="btn btn-danger btn-xs" disabled={!canDelete} title={canDelete ? "Permanently delete this unused raw storage row." : "Only unused storage rows can be deleted here."} onClick={deleteSelectedRow}>
                    <Trash2 size={12} /> Delete Raw Row
                  </button>
                </>
              }
            >
              <div className="settings-row-overview">
                <div className={`settings-row-status ${edcdUsageStatusTone(selectedUsage.status)}`}>
                  <strong>{selectedUsage.statusLabel}</strong>
                  <span>{selectedUsage.exists ? "Stored in Data EDCD backing storage." : "Referenced by a script but not created yet. Open its caller to author and apply the missing values."}</span>
                </div>
                {selectedUsage.warnings.map((warning) => <p key={warning} className="field-warning">{warning}</p>)}
                {selectedUsage.callers.length > 0 && (
                  <div className="settings-row-callers">
                    <strong>Used By</strong>
                    {selectedUsage.callers.map((caller) => (
                      <button key={`${caller.triggerId}-${caller.slot}`} type="button" className="settings-row-caller" onClick={() => onOpenCaller(caller)}>
                        <span>{caller.actionShortLabel}</span>
                        <small>{callerLabel(project, caller)} | step {caller.slot + 1}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editorMode === "typed" && (
                <EdcdRowEditor
                  project={project}
                  catalog={catalog}
                  edcdUsage={editorUsage}
                  fallbackRowId={selectedUsage.rowId}
                  fallbackShape={selectedShape}
                  fallbackInitialValues={selectedUsage.values}
                  fallbackOpcode={selectedOpcode}
                  parameterLabels={selectedOpcode != null ? scriptActionDefinitionFor(selectedOpcode).parameters : undefined}
                  selectedSlotLabel="settings"
                  onSelectEntity={onSelectEntity}
                  onOpenText={(editor) => onOpenTool?.("text", editor)}
                  onApplyCommand={onApplyCommand}
                />
              )}
              {editorMode === "raw" && (
                <RawEdcdRowEditor rowId={selectedUsage.rowId} values={selectedUsage.values} onApplyCommand={onApplyCommand} />
              )}
              {editorMode === "caller" && (
                <EmptyState compact title="Create from the calling step" body="This referenced row is missing. Open a caller above, choose the action's named values, and Apply Step so Providence can create the correct storage shape." />
              )}
            </PanelSection>
          ) : (
            <EmptyState title="No Data EDCD storage" body="Settings-backed actions create their required storage when their calling steps are applied." />
          )}
        </main>
      </div>
    </section>
  );
}

export function settingsEditorModeForUsage(usage: Pick<EdcdRowUsage, "exists" | "status" | "primaryShape">): "typed" | "raw" | "caller" {
  if (!usage.exists) return "caller";
  if (usage.status === "unused" || usage.status === "conflict" || !usage.primaryShape) return "raw";
  return "typed";
}

function RawEdcdRowEditor({
  rowId,
  values,
  onApplyCommand
}: {
  rowId: number;
  values: readonly number[];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const normalized = normalizeEdcdValues(values);
  const storageKey = `${rowId}:${normalized.join("|")}`;
  const [draft, setDraft] = useState(normalized.map(String));
  useEffect(() => setDraft(normalized.map(String)), [storageKey]);
  const numericDraft = normalizeEdcdValues(draft.map((value) => clampSignedShort(Number(value))));
  const changed = numericDraft.some((value, index) => value !== normalized[index]);
  return (
    <div className="settings-row-raw-editor">
      <div>
        <strong>Uninterpreted Extra Code Values</strong>
        <small>No caller proves a single action shape for this row. These are the five raw signed-short values stored by Realmz.</small>
      </div>
      <div className="settings-row-raw-fields">
        {draft.map((value, index) => (
          <label key={index}>
            <span>Raw Value {index + 1}</span>
            <input
              type="number"
              min={-32768}
              max={32767}
              value={value}
              onChange={(event) => setDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? event.currentTarget.value : entry))}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        disabled={!changed || !onApplyCommand}
        onClick={() => onApplyCommand?.({ kind: "updateEdcdRow", label: `Update raw Data EDCD row #${rowId}`, rowId, values: numericDraft })}
      >
        <Save size={12} /> Apply Raw Storage
      </button>
    </div>
  );
}

function clampSignedShort(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-32768, Math.min(32767, Math.trunc(value)));
}

function callerLabel(project: Project, caller: EdcdRowCaller) {
  if (caller.contextKind === "simpleEncounter") return `Simple Encounter ${caller.triggerRecordIndex}`;
  if (caller.contextKind === "complexEncounter") return `Complex Encounter ${caller.triggerRecordIndex}`;
  const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
  if (!trigger) return `Record ${caller.triggerRecordIndex}`;
  return scriptLabel(project, trigger);
}

function scriptEditorForTriggerSource(source: string) {
  if (source === "Data ED3") return "macros";
  if (source === "Global") return "global-macros";
  return "action-points";
}

function edcdRowIdFromSelectedEntity(entity: SelectedEntity | null) {
  const match = /^record:Data EDCD:(-?\d+)$/.exec(entity?.id ?? "");
  if (!match) return null;
  const rowId = Number(match[1]);
  return Number.isFinite(rowId) ? Math.max(0, Math.trunc(rowId)) : null;
}
