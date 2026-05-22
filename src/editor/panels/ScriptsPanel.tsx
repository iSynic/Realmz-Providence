import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Plus, Save, Trash2, X } from "lucide-react";
import { Action, LevelType, Project, ProjectCommand, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { actionSlotEntitiesForScript, actionSlotEntitiesForTriggerRecord, schemaEntities, scriptPrimaryCategory } from "../semanticGraph";
import { EntityBrowser } from "../components/EntityBrowser";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { TargetPicker } from "../components/RealmzTargetPicker";
import { SemanticInspector } from "../components/SemanticInspector";
import { categoryColor } from "../components/TileSprite";
import { EmptyState, FieldRow, PanelSection, ScrollArea } from "../ui";
import { ACTION_CATEGORIES, ACTION_OPTIONS, actionOptionFor } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { ScriptDiagnostic, validateActionDraft, validateScriptTrigger } from "../scriptValidation";
import { actionPointCapacity } from "../actionPointCapacity";

export function ScriptsPanel({
  project,
  selectedEntity,
  onSelectEntity,
  onApplyCommand,
  activeEditor = "domain"
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const scriptEntities = useMemo(
    () => schemaEntities(project).filter((entity) => scriptEntityVisibleForEditor(entity, activeEditor)),
    [project, activeEditor]
  );
  const grouped = useMemo(() => {
    const map = new Map<string, SemanticEntity[]>();
    for (const entity of scriptEntities) {
      const category = scriptPrimaryCategory(project, entity);
      const list = map.get(category) ?? [];
      list.push(entity);
      map.set(category, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [scriptEntities]);

  return (
    <div className="editor-full-panel semantic-workbench">
      <aside className="tab-panel semantic-left">
        <EntityBrowser project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
      </aside>
      <section className="tab-panel script-detail">
        <div className="panel-header">
          <span>{scriptPanelTitle(activeEditor)}</span>
          <b>{scriptEntities.length.toLocaleString()}</b>
        </div>
        <ScrollArea className="script-detail-scroll" aria-label="Script editor">
          <ScriptAuthoringPanel project={project} activeEditor={activeEditor} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />
          <div className="script-category-grid">
            {grouped.map(([category, entities]) => (
              <section key={category} className="script-category">
                <header>
                  <span style={{ color: categoryColor(category) }}>●</span>
                  <strong>{category}</strong>
                  <b>{entities.length.toLocaleString()}</b>
                </header>
                {entities.slice(0, 18).map((entity) => (
                  <ScriptRow key={entity.id} project={project} entity={entity} onSelectEntity={onSelectEntity} />
                ))}
              </section>
            ))}
            {!project && <div className="entity-empty">Open a project to inspect scripts.</div>}
          </div>
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <ScrollArea className="semantic-right-scroll" aria-label="Script semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
          <EdcdList project={project} onSelectEntity={onSelectEntity} />
        </ScrollArea>
      </aside>
    </div>
  );
}

function ScriptAuthoringPanel({
  project,
  activeEditor,
  selectedEntity,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const scripts = project?.triggers.filter((trigger) => triggerVisibleForEditor(trigger, activeEditor)) ?? [];
  const projectMaps = project?.maps ?? [];
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("Core");
  const [opcodeQuery, setOpcodeQuery] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [scriptScope, setScriptScope] = useState<"current-map" | "all">("current-map");
  const [newActionPoint, setNewActionPoint] = useState({ mapId: projectMaps[0]?.id ?? "", x: 1, y: 1 });
  useEffect(() => {
    if (projectMaps.length === 0) return;
    if (!projectMaps.some((map) => map.id === newActionPoint.mapId)) {
      setNewActionPoint((current) => ({ ...current, mapId: projectMaps[0].id }));
    }
  }, [newActionPoint.mapId, projectMaps]);
  useEffect(() => {
    if (activeEditor === "macros" || activeEditor === "global-macros") {
      setScriptScope("all");
    }
  }, [activeEditor]);
  const slotDraft = (slot: number, action?: Action) => draft[`${selectedTrigger?.id}:${slot}`] ?? { rawCode: action?.rawCode ?? 0, id: action?.id ?? 0 };
  if (!project) return null;
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = `${selectedTrigger?.id}:${selectedSlot}`;
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedOption = actionOptionFor(selectedDraft.rawCode);
  const filteredOptions = ACTION_OPTIONS.filter((option) => {
    const query = opcodeQuery.trim().toLowerCase();
    if (option.category !== categoryFilter) return false;
    if (!query) return true;
    return `${option.code} ${option.label} ${option.description} ${option.edcdShape ?? ""}`.toLowerCase().includes(query);
  });
  const actionSlots = selectedTrigger ? actionSlotEntitiesForTriggerRecord(project, selectedTrigger) : [];
  const selectedSlotEntity = actionSlots.find((entity) => Number(entity.summary.slot) === selectedSlot);
  const selectedEdcdUsage = selectedSlotEntity?.summary.edcdUsage as
    | {
        rowId?: number;
        shape?: string;
        fields?: { name?: string; value?: number }[];
        secondaryRowId?: number;
        secondaryShape?: string;
        secondaryFields?: { name?: string; value?: number }[];
        diagnostics?: string[];
        summary?: string;
      }
    | undefined;
  const triggerDiagnostics = selectedTrigger ? validateScriptTrigger(project, selectedTrigger) : [];
  const selectedSlotDiagnostics = selectedTrigger
    ? validateActionDraft(project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id)
    : [];
  const selectedEdcdRowId = selectedEdcdUsage?.rowId ?? (selectedOption.edcdShape ? Math.max(0, selectedDraft.id) : null);
  const selectedMap = projectMaps.find((map) => map.id === newActionPoint.mapId) ?? projectMaps[0] ?? null;
  const selectedMapCapacity = selectedMap ? actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index) : null;
  const canScopeToMap = Boolean(selectedMap && activeEditor !== "macros" && activeEditor !== "global-macros");
  const scopedScripts = scriptScope === "current-map" && selectedMap && canScopeToMap
    ? scripts.filter((trigger) => trigger.source !== "Data ED3" && trigger.levelType === selectedMap.levelType && trigger.levelIndex === selectedMap.index)
    : scripts;
  const filteredScripts = scopedScripts.filter((trigger) => scriptMatchesQuery(project, trigger, scriptQuery));
  const selectedTrigger =
    scripts.find((trigger) => trigger.id === selectedEntity?.id || actionBelongsTo(trigger, selectedEntity?.id ?? "")) ??
    filteredScripts[0] ??
    scripts[0] ??
    null;
  const isMacro = selectedTrigger?.source === "Data ED3";
  const moveMapKey = selectedTrigger && !isMacro && selectedTrigger.levelType && selectedTrigger.levelIndex != null
    ? `${selectedTrigger.levelType}:${selectedTrigger.levelIndex}`
    : "";
  const issueCounts = issueCountsBySlot(triggerDiagnostics);
  const setSelectedDraft = (values: { rawCode: number; id: number }) => setDraft({ ...draft, [selectedKey]: values });
  const applySelectedSlot = () => {
    if (!selectedTrigger) return;
    onApplyCommand?.({
      kind: "updateActionSlot",
      label: `Update slot ${selectedSlot}`,
      triggerId: selectedTrigger.id,
      slot: selectedSlot,
      rawCode: selectedDraft.rawCode,
      id: selectedDraft.id
    });
  };
  const moveSelectedActionPoint = (fields: Partial<{ levelType: LevelType; levelIndex: number; x: number; y: number }>) => {
    if (!selectedTrigger || isMacro) return;
    const levelType = fields.levelType ?? selectedTrigger.levelType ?? "land";
    const levelIndex = fields.levelIndex ?? selectedTrigger.levelIndex ?? 0;
    const coordinate = selectedTrigger.coordinate ?? { x: selectedTrigger.targetX ?? 0, y: selectedTrigger.targetY ?? 0 };
    const x = clampRealmzCoordinate(fields.x ?? coordinate.x);
    const y = clampRealmzCoordinate(fields.y ?? coordinate.y);
    onApplyCommand?.({ kind: "moveActionPoint", label: "Move Action Point", triggerId: selectedTrigger.id, levelType, levelIndex, x, y });
  };
  return (
    <section className="realmz-script-editor">
      <header>
        <div>
          <strong>{scriptPanelTitle(activeEditor)}</strong>
          <small>Guided Realmz CODE/ID authoring with raw slots, EDCD rows, and compatibility checks kept visible.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "createMacro", label: "Create macro" })}>
            <Plus size={12} /> Macro
          </button>
          {selectedTrigger && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
              <Copy size={12} /> Duplicate
            </button>
          )}
        </div>
      </header>
      {selectedMap && (
        <div className="script-create-strip">
          <label>
            <span>New Action Point</span>
            <select value={newActionPoint.mapId} onChange={(event) => setNewActionPoint({ ...newActionPoint, mapId: event.currentTarget.value })}>
              {projectMaps.map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
          </label>
          <NumberField label="X" value={newActionPoint.x} onCommit={(x) => setNewActionPoint({ ...newActionPoint, x: clampRealmzCoordinate(x) })} />
          <NumberField label="Y" value={newActionPoint.y} onCommit={(y) => setNewActionPoint({ ...newActionPoint, y: clampRealmzCoordinate(y) })} />
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!selectedMapCapacity?.canCreate}
            title={selectedMapCapacity?.canCreate ? "Create an Action Point on the selected map." : "This map already uses all 100 Realmz Action Point records."}
            onClick={() => onApplyCommand?.({
              kind: "createActionPoint",
              label: `Create Action Point ${newActionPoint.x},${newActionPoint.y}`,
              levelType: selectedMap.levelType,
              levelIndex: selectedMap.index,
              x: clampRealmzCoordinate(newActionPoint.x),
              y: clampRealmzCoordinate(newActionPoint.y)
            })}
          >
            <Plus size={12} /> Action Point
          </button>
          <small className={selectedMapCapacity?.canCreate ? "script-capacity-note" : "script-capacity-note blocked"}>
            {selectedMapCapacity?.active ?? 0}/{selectedMapCapacity?.max ?? 100} Action Point records used
            {selectedMapCapacity?.reusable ? `, ${selectedMapCapacity.reusable} empty reusable` : ""}
          </small>
        </div>
      )}
      <div className="realmz-script-layout">
        <div className="script-list-column">
          <div className="script-list-tools">
            <div className="script-list-summary">
              <strong>{filteredScripts.length.toLocaleString()} shown</strong>
              <small>{scripts.length.toLocaleString()} total</small>
            </div>
            <input
              className="script-list-filter"
              value={scriptQuery}
              onChange={(event) => setScriptQuery(event.currentTarget.value)}
              placeholder="Filter action points..."
            />
            <div className="script-list-scope" role="group" aria-label="Script list scope">
              <button
                type="button"
                className={scriptScope === "current-map" ? "active" : ""}
                disabled={!canScopeToMap}
                onClick={() => setScriptScope("current-map")}
              >
                Current map
              </button>
              <button type="button" className={scriptScope === "all" ? "active" : ""} onClick={() => setScriptScope("all")}>
                All scripts
              </button>
            </div>
          </div>
          <ScrollArea className="realmz-script-list" aria-label="Triggers and macros">
            {filteredScripts.slice(0, 240).map((trigger) => (
              <button
                type="button"
                key={trigger.id}
                className={trigger.id === selectedTrigger?.id ? "selected" : ""}
                onClick={() => onSelectEntity(selectEntityFromId(trigger.id))}
              >
                <strong>{scriptLabel(project, trigger)}</strong>
                <small>{scriptSubtitle(project, trigger)}</small>
                <ScriptIssueBadge issues={validateScriptTrigger(project, trigger)} />
              </button>
            ))}
            {filteredScripts.length === 0 && (
              <div className="script-list-empty">
                No scripts match this view.
              </div>
            )}
            {filteredScripts.length > 240 && (
              <div className="script-list-empty">
                Showing the first 240 matches. Narrow the filter to jump further.
              </div>
            )}
          </ScrollArea>
        </div>
        <div className="realmz-script-form">
          {selectedTrigger ? (
            <>
              <div className="script-record-header">
                <label className="script-name-field">
                  <span>Name</span>
                  <input
                    key={selectedTrigger.id}
                    defaultValue={scriptLabel(project, selectedTrigger)}
                    onBlur={(event) => {
                      const displayName = event.currentTarget.value.trim();
                      if (displayName && displayName !== scriptLabel(project, selectedTrigger)) {
                        onApplyCommand?.({ kind: "renameEditorEntity", label: "Rename script", entityId: selectedTrigger.id, displayName });
                      }
                    }}
                  />
                </label>
                <div className="script-record-actions">
                  <button className="btn btn-secondary btn-xs" type="button" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
                    <Copy size={12} /> Duplicate
                  </button>
                  <button className="btn btn-danger btn-xs" type="button" onClick={() => onApplyCommand?.({ kind: "deleteTrigger", label: "Delete script", triggerId: selectedTrigger.id })}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
              <ScriptDiagnostics issues={triggerDiagnostics.filter((issue) => issue.slot == null)} />
              <div className="script-header-grid">
                <NumberField
                  label="% Chance"
                  value={selectedTrigger.percent}
                  onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                />
                {!isMacro && (
                  <label>
                    <span>Map</span>
                    <select
                      value={moveMapKey}
                      onChange={(event) => {
                        const [levelType, levelIndex] = event.currentTarget.value.split(":");
                        moveSelectedActionPoint({ levelType: levelType as LevelType, levelIndex: Number(levelIndex) });
                      }}
                    >
                      {projectMaps.map((map) => (
                        <option key={map.id} value={`${map.levelType}:${map.index}`}>{map.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!isMacro && (
                  <NumberField
                    label="Cell X"
                    value={selectedTrigger.coordinate?.x ?? selectedTrigger.targetX ?? 0}
                    onCommit={(x) => moveSelectedActionPoint({ x })}
                  />
                )}
                {!isMacro && (
                  <NumberField
                    label="Cell Y"
                    value={selectedTrigger.coordinate?.y ?? selectedTrigger.targetY ?? 0}
                    onCommit={(y) => moveSelectedActionPoint({ y })}
                  />
                )}
                <NumberField
                  label="Goto Level"
                  value={selectedTrigger.landid ?? 0}
                  onCommit={(landid) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target level", triggerId: selectedTrigger.id, fields: { landid } })}
                />
                <NumberField
                  label="Goto X"
                  value={selectedTrigger.targetX ?? 0}
                  onCommit={(targetX) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target X", triggerId: selectedTrigger.id, fields: { targetX } })}
                />
                <NumberField
                  label="Goto Y"
                  value={selectedTrigger.targetY ?? 0}
                  onCommit={(targetY) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target Y", triggerId: selectedTrigger.id, fields: { targetY } })}
                />
              </div>
              <div className="realmz-visual-script">
                <PanelSection title="Action Slots" eyebrow="Visual step list" count="8" density="compact">
                  <ScrollArea className="realmz-step-list" aria-label="Action slots">
                    {Array.from({ length: 8 }, (_, slot) => {
                      const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
                      const current = slotDraft(slot, action);
                      const option = actionOptionFor(current.rawCode);
                      const changed = action ? current.rawCode !== action.rawCode || current.id !== action.id : current.rawCode !== 0 || current.id !== 0;
                      const slotIssues = issueCounts.get(slot) ?? { errors: 0, warnings: 0 };
                      return (
                        <button
                          key={slot}
                          className={`realmz-step-card${slot === selectedSlot ? " selected" : ""}${changed ? " dirty" : ""}${slotIssues.errors ? " has-error" : slotIssues.warnings ? " has-warning" : ""}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{ borderColor: categoryColor(option.category) }}
                        >
                          <span className="slot-index">{slot}</span>
                          <span>
                            <strong>{option.shortLabel}</strong>
                            <small>{actionSummary(action)}</small>
                          </span>
                          <b>
                            {option.edcdShape && <em>EDCD</em>}
                            {slotIssues.errors + slotIssues.warnings > 0 && <em className={slotIssues.errors ? "danger" : "warning"}>{slotIssues.errors + slotIssues.warnings}</em>}
                            {option.category}
                          </b>
                        </button>
                      );
                    })}
                  </ScrollArea>
                </PanelSection>
                <PanelSection
                  title={`Slot ${selectedSlot} Details`}
                  eyebrow={selectedOption.category}
                  actions={
                    <>
                      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move slot up" disabled={selectedSlot === 0} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Swap action slots", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot - 1 })}>
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move slot down" disabled={selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Swap action slots", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
                        <ArrowDown size={12} />
                      </button>
                      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Duplicate slot to next slot" disabled={!selectedAction || selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "duplicateActionSlot", label: "Duplicate action slot", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
                        <Copy size={12} />
                      </button>
                      <button type="button" className="btn btn-danger btn-xs icon-only" title="Clear slot" disabled={!selectedAction} onClick={() => onApplyCommand?.({ kind: "deleteActionSlot", label: "Clear action slot", triggerId: selectedTrigger.id, slot: selectedSlot })}>
                        <X size={12} />
                      </button>
                      <button type="button" className="btn btn-primary btn-xs" onClick={applySelectedSlot}>
                        <Save size={12} /> Apply
                      </button>
                    </>
                  }
                >
                  <div className="realmz-step-detail">
                    <ScriptDiagnostics issues={selectedSlotDiagnostics} />
                    <div className="realmz-step-category-bar">
                      {ACTION_CATEGORIES.map((category) => (
                        <button
                          key={category}
                          type="button"
                          className={categoryFilter === category ? "active" : ""}
                          onClick={() => setCategoryFilter(category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                    <input
                      className="realmz-opcode-search"
                      value={opcodeQuery}
                      onChange={(event) => setOpcodeQuery(event.currentTarget.value)}
                      placeholder="Search opcodes, descriptions, EDCD shapes..."
                      aria-label="Search Realmz opcodes"
                    />
                    <div className="realmz-step-picker-grid">
                      {filteredOptions.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          className={selectedDraft.rawCode === option.code ? "selected" : ""}
                          onClick={() => setSelectedDraft({ ...selectedDraft, rawCode: option.code })}
                        >
                          <strong>{option.shortLabel}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="realmz-step-form-grid">
                      <label>
                        <span>Opcode</span>
                        <select
                          value={selectedDraft.rawCode}
                          onChange={(event) => setSelectedDraft({ ...selectedDraft, rawCode: Number(event.currentTarget.value) })}
                        >
                          {ACTION_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>ID / Parameter</span>
                        <input
                          type="number"
                          value={selectedDraft.id}
                          onChange={(event) => setSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
                          aria-label={`Slot ${selectedSlot} ID`}
                        />
                      </label>
                    </div>
                    <TargetPicker
                      project={project}
                      opcode={selectedDraft.rawCode}
                      value={selectedDraft.id}
                      onChange={(id) => setSelectedDraft({ ...selectedDraft, id })}
                      onInspect={onSelectEntity}
                    />
                    <EdcdRowEditor
                      project={project}
                      edcdUsage={selectedEdcdUsage}
                      fallbackRowId={selectedDraft.id}
                      fallbackShape={selectedOption.edcdShape}
                      fallbackFieldNames={edcdFieldNamesForShape(selectedOption.edcdShape)}
                      selectedSlotLabel={`slot ${selectedSlot}`}
                      onApplyCommand={onApplyCommand}
                    />
                    <div className="realmz-raw-preview">
                      <FieldRow label="Raw CODE" value={selectedDraft.rawCode} />
                      <FieldRow label="Raw ID" value={selectedDraft.id} />
                      <FieldRow label="EDCD Shape" value={selectedOption.edcdShape ?? "none"} />
                      <FieldRow label="Source Summary" value={selectedSlotEntity?.summary.edcdUsage ? String((selectedSlotEntity.summary.edcdUsage as { summary?: string }).summary ?? selectedOption.description) : selectedOption.description} />
                    </div>
                    {selectedEdcdRowId != null && (
                      <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSelectEntity(selectEntityFromId(`record:Data EDCD:${selectedEdcdRowId}`))}>
                        Inspect attached EDCD row {selectedEdcdRowId}
                      </button>
                    )}
                    {selectedSlotEntity ? (
                      <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSelectEntity(selectEntityFromId(selectedSlotEntity.id))}>
                        Inspect semantic action slot
                      </button>
                    ) : (
                      <EmptyState compact title="No semantic slot yet" body="Apply this slot to create or update the source-backed Realmz action entry." />
                    )}
                  </div>
                </PanelSection>
              </div>
            </>
          ) : (
            <p className="empty-copy compact">Create a macro or select an Action Point to edit its Realmz CODE/ID slots.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function ScriptDiagnostics({ issues }: { issues: ScriptDiagnostic[] }) {
  if (issues.length === 0) {
    return (
      <div className="script-diagnostics ok">
        <span>Compatibility</span>
        <strong>No script blockers detected for this selection.</strong>
      </div>
    );
  }
  return (
    <div className="script-diagnostics">
      {issues.slice(0, 5).map((issue) => (
        <div key={issue.id} className={`script-diagnostic ${issue.severity}`}>
          <AlertTriangle size={13} />
          <span>
            <strong>{issue.slot != null ? `Slot ${issue.slot}: ${issue.message}` : issue.message}</strong>
            <small>{issue.detail}</small>
          </span>
        </div>
      ))}
      {issues.length > 5 && <small className="script-diagnostic-more">{issues.length - 5} more issue(s) in this script.</small>}
    </div>
  );
}

function ScriptIssueBadge({ issues }: { issues: ScriptDiagnostic[] }) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  if (errors === 0 && warnings === 0) return <small className="script-issue-badge ok">ready</small>;
  return <small className={`script-issue-badge ${errors ? "danger" : "warning"}`}>{errors ? `${errors} error` : `${warnings} warning`}</small>;
}

function issueCountsBySlot(issues: ScriptDiagnostic[]) {
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

function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}

function scriptEntityVisibleForEditor(entity: SemanticEntity, activeEditor: string) {
  if (activeEditor === "action-points") return entity.type === "trigger" || entity.type === "action-slot";
  if (activeEditor === "macros") return entity.type === "macro";
  if (activeEditor === "global-macros") return entity.type === "global-macro" || entity.type === "macro";
  if (activeEditor === "quests") return entity.type === "quest flag" || entity.type === "action-slot";
  return entity.type === "trigger" || entity.type === "macro";
}

function triggerVisibleForEditor(trigger: TriggerRecord, activeEditor: string) {
  if (activeEditor === "macros" || activeEditor === "global-macros") return trigger.source === "Data ED3";
  if (activeEditor === "quests") return trigger.actions.some((action) => [46, 47, 76, 77].includes(action.code));
  return trigger.source === "Data ED3" || Boolean(trigger.coordinate);
}

function scriptPanelTitle(activeEditor: string) {
  if (activeEditor === "action-points") return "Action Points / GOSUBs";
  if (activeEditor === "macros") return "Macro Editor";
  if (activeEditor === "global-macros") return "Global Macro Editor";
  if (activeEditor === "quests") return "Quest Script Links";
  return "Triggers And Macros";
}

function scriptLabel(project: Project, trigger: TriggerRecord) {
  const fallback = trigger.source === "Data ED3"
    ? `Macro ${trigger.recordIndex}`
    : trigger.coordinate
      ? `Action Point ${trigger.recordIndex} (${trigger.coordinate.x}, ${trigger.coordinate.y})`
      : `Action Point ${trigger.recordIndex}`;
  return project.editorMetadata?.displayNames?.[trigger.id]?.label ?? fallback;
}

function scriptSubtitle(project: Project, trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") return `macro | record ${trigger.recordIndex}`;
  const map = project.maps.find((candidate) => candidate.levelType === trigger.levelType && candidate.index === trigger.levelIndex);
  const mapLabel = map?.name ?? `${trigger.levelType ?? "map"} ${trigger.levelIndex ?? 0}`;
  const coordinate = trigger.coordinate ? `${trigger.coordinate.x},${trigger.coordinate.y}` : "no coordinate";
  return `${mapLabel} | record ${trigger.recordIndex} | ${coordinate}`;
}

function scriptMatchesQuery(project: Project, trigger: TriggerRecord, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    scriptLabel(project, trigger),
    scriptSubtitle(project, trigger),
    trigger.id,
    trigger.actions.map((action) => `${action.slot} ${action.rawCode} ${action.id} ${action.label}`).join(" ")
  ].join(" ").toLowerCase().includes(normalized);
}

function actionSummary(action?: Action) {
  if (!action) return "empty";
  return `${action.rawCode} / ${action.id} · ${action.label}${action.gosub ? " · GOSUB" : ""}`;
}

function actionBelongsTo(trigger: TriggerRecord, entityId: string) {
  return entityId.includes(trigger.id) || entityId.startsWith(`action:${trigger.source}:${trigger.recordIndex}:`);
}

function ScriptRow({
  project,
  entity,
  onSelectEntity
}: {
  project: Project | null;
  entity: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const links = linksFor(project, entity.id).outgoing;
  const actions = actionSlotEntitiesForScript(project, entity).slice(0, 8);
  return (
    <article className="script-row">
      <button onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
        <strong>{entity.label}</strong>
        <small>{entity.id}</small>
      </button>
      <div className="action-slot-list">
        {actions.map((slotEntity, index) => {
          const slot = slotEntity.summary as {
            slot?: number;
            code?: number;
            id?: number;
            label?: string;
            category?: string;
            edcdUsage?: { summary?: string; shape?: string };
          };
          const label = slot.edcdUsage?.summary ?? slot.label ?? `opcode ${slot.code}`;
          const title = slot.edcdUsage?.shape ? `${slot.label ?? `opcode ${slot.code}`} · ${slot.edcdUsage.shape}` : label;
          return (
            <button
              key={`${entity.id}-${index}`}
              title={title}
              style={{ borderColor: categoryColor(slot.category ?? "unknown") }}
              onClick={() => onSelectEntity(selectEntityFromId(slotEntity.id))}
            >
              {slot.slot ?? index}: {label}
            </button>
          );
        })}
        {actions.length === 0 && <span>No action slots</span>}
      </div>
      <div className="link-chip-row">
        {links.slice(0, 8).map((link) => (
          <button key={link.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>
            {link.kind}: {semanticLabel(project, link.to)}
          </button>
        ))}
      </div>
    </article>
  );
}

function EdcdList({ project, onSelectEntity }: { project: Project | null; onSelectEntity: (entity: SelectedEntity) => void }) {
  const rows = schemaEntities(project, "edcd-row");
  return (
    <section className="object-inspector">
      <div className="inspector-header">
        <span>EDCD Rows</span>
        <small>{rows.length}</small>
      </div>
      <ScrollArea className="edcd-grid" aria-label="EDCD Rows">
        {rows.slice(0, 180).map((row) => (
          <button key={row.id} onClick={() => onSelectEntity(selectEntityFromId(row.id))}>
            {row.label}: {Array.isArray(row.summary.values) ? row.summary.values.join(", ") : "semantic row"}
          </button>
        ))}
      </ScrollArea>
    </section>
  );
}
