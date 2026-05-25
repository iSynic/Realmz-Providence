import { memo, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, CopyPlus, Plus, Save, Trash2, X } from "lucide-react";
import { Action, EncounterActionRow, LevelType, LibraryCatalog, Project, ProjectCommand, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, ed3EvidenceRecords, ed3ReachabilityFor, isCallableMacro } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { TargetPicker, targetOptionsForOpcode } from "../components/RealmzTargetPicker";
import { categoryColor } from "../components/TileSprite";
import { CollapsibleSection, EmptyState, FieldRow, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { ACTION_CATEGORIES, ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { ScriptDiagnostic, validateActionDraft, validateScriptTrigger } from "../scriptValidation";
import { actionPointCapacity, isReusableDoorPlaceholder, nextActionPointRecordIndex } from "../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../realmzScriptDescriptors";
import { validateRealmzTargetRecord } from "../targetValidation";
import { itemReferenceDetail, itemReferenceOptions } from "../itemReferences";

export function ScriptsPanel({
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onApplyCommand,
  activeEditor = "domain"
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const scriptCount = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)).length ?? 0,
    [project, activeEditor]
  );

  return (
    <div className="editor-full-panel scripts-workbench">
      <section className="tab-panel script-detail">
        <div className="panel-header scripts-panel-header">
          <span>{scriptPanelTitle(activeEditor)}</span>
          <b>{scriptCount.toLocaleString()}</b>
        </div>
        <ScrollArea className="script-detail-scroll" aria-label="Script editor">
          <ScriptAuthoringPanel project={project} catalog={catalog} activeEditor={activeEditor} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />
        </ScrollArea>
      </section>
    </div>
  );
}

function ScriptAuthoringPanel({
  project,
  catalog,
  activeEditor,
  selectedEntity,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const scripts = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)) ?? [],
    [project, activeEditor]
  );
  const ed3Evidence = useMemo(() => ed3EvidenceRecords(project), [project]);
  const projectMaps = project?.maps ?? [];
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("Core");
  const [opcodeQuery, setOpcodeQuery] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = usePersistentValue<ScriptInventoryFilter>("scripts.inventory.filter", "current-map");
  const [detailSurface, setDetailSurface] = usePersistentValue<ScriptDetailSurface>("scripts.detailSurface", "docked");
  const [targetDrawerOpen, setTargetDrawerOpen] = usePersistentBoolean("scripts.targetDrawer.open", true);
  const [newActionPoint, setNewActionPoint] = useState({ mapId: projectMaps[0]?.id ?? "", x: 1, y: 1 });
  const selectedScriptButtonRef = useRef<HTMLButtonElement | null>(null);
  const benchmarkStartedRef = useRef(false);
  useEffect(() => {
    if (projectMaps.length === 0) return;
    if (!projectMaps.some((map) => map.id === newActionPoint.mapId)) {
      setNewActionPoint((current) => ({ ...current, mapId: projectMaps[0].id }));
    }
  }, [newActionPoint.mapId, projectMaps]);
  useEffect(() => {
    if (activeEditor === "macros" || activeEditor === "global-macros") {
      setInventoryFilter("macros");
    }
  }, [activeEditor]);
  useEffect(() => {
    selectedScriptButtonRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedEntity?.id, inventoryFilter, scriptQuery, scripts.length]);
  const selectedMap = projectMaps.find((map) => map.id === newActionPoint.mapId) ?? projectMaps[0] ?? null;
  const canScopeToMap = Boolean(selectedMap && activeEditor !== "macros" && activeEditor !== "global-macros");
  const triggerDiagnosticsById = useMemo(() => {
    const map = new Map<string, ScriptDiagnostic[]>();
    if (!project) return map;
    for (const trigger of scripts) {
      map.set(trigger.id, validateScriptTrigger(project, trigger, catalog));
    }
    return map;
  }, [project, scripts, catalog]);
  const inventoryCounts = useMemo(() => {
    const counts = new Map<ScriptInventoryFilter, number>();
    for (const filter of SCRIPT_INVENTORY_FILTERS) {
      counts.set(filter.id, filterScriptsByInventory(project, scripts, filter.id, selectedMap, canScopeToMap, triggerDiagnosticsById).length);
    }
    return counts;
  }, [project, scripts, selectedMap, canScopeToMap, triggerDiagnosticsById]);
  const scopedScripts = useMemo(
    () => filterScriptsByInventory(project, scripts, inventoryFilter, selectedMap, canScopeToMap, triggerDiagnosticsById),
    [project, scripts, inventoryFilter, selectedMap, canScopeToMap, triggerDiagnosticsById]
  );
  const filteredScripts = useMemo(
    () => project ? scopedScripts.filter((trigger) => scriptMatchesQuery(project, trigger, scriptQuery)) : [],
    [project, scopedScripts, scriptQuery]
  );
  useEffect(() => {
    if (!isScriptsBenchmarkMode() || benchmarkStartedRef.current || filteredScripts.length === 0) return;
    benchmarkStartedRef.current = true;
    let disposed = false;
    const afterPaint = () => new Promise<void>((resolve) => setTimeout(() => setTimeout(resolve, 0), 0));
    const summarize = (label: string, values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
      return {
        label,
        count: values.length,
        min: Math.round(sorted[0] ?? 0),
        median: Math.round(pick(0.5)),
        p90: Math.round(pick(0.9)),
        p95: Math.round(pick(0.95)),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
        avg: Math.round(values.reduce((total, value) => total + value, 0) / Math.max(1, values.length))
      };
    };
    const writeResult = (result: unknown) => {
      let node = document.getElementById("providence-scripts-benchmark-result");
      if (!node) {
        node = document.createElement("script");
        node.id = "providence-scripts-benchmark-result";
        node.setAttribute("type", "application/json");
        document.body.appendChild(node);
      }
      node.textContent = JSON.stringify(result);
    };
    const measure = async (label: string, indexes: number[], action: (index: number) => boolean) => {
      const values: number[] = [];
      for (const index of indexes) {
        const start = Date.now();
        if (!action(index)) continue;
        await afterPaint();
        values.push(Date.now() - start);
      }
      return summarize(label, values);
    };
    async function runBenchmark() {
      const scriptIndexes = [1, 2, 3, 4, 5, 10, 20, 40, 60, 80];
      const slotIndexes = [0, 1, 2, 3, 4, 5, 6, 7];
      const scriptSwitch = await measure("script-row-switch", scriptIndexes, (index) => {
        const trigger = filteredScripts[index];
        if (!trigger) return false;
        onSelectEntity(selectEntityFromId(trigger.source === "Data ED3" ? `macro:${trigger.recordIndex}` : trigger.id));
        return true;
      });
      const slotSwitch = await measure("slot-switch", slotIndexes, (slot) => {
        if (slot < 0 || slot > 7) return false;
        setSelectedSlot(slot);
        return true;
      });
      const surfaceToggle = await measure("dock-float-toggle", [0, 1], () => {
        setDetailSurface((current) => current === "floating" ? "docked" : "floating");
        return true;
      });
      if (!disposed) {
        writeResult({
          filteredScripts: filteredScripts.length,
          visibleScripts: Math.min(filteredScripts.length, 240),
          scriptSwitch,
          slotSwitch,
          surfaceToggle
        });
      }
    }
    void runBenchmark();
    return () => {
      disposed = true;
      benchmarkStartedRef.current = false;
    };
  }, [filteredScripts, onSelectEntity, setDetailSurface]);
  if (!project) return null;
  const selectedMapCapacity = selectedMap ? actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index) : null;
  const selectedTrigger =
    scripts.find((trigger) => triggerMatchesSelection(trigger, selectedEntity?.id ?? "")) ??
    filteredScripts[0] ??
    scripts[0] ??
    null;
  const slotDraft = (slot: number, action?: Action) => draft[`${selectedTrigger?.id}:${slot}`] ?? { rawCode: action?.rawCode ?? 0, id: action?.id ?? 0 };
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = `${selectedTrigger?.id}:${selectedSlot}`;
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedDraftDirty = selectedAction
    ? selectedDraft.rawCode !== selectedAction.rawCode || selectedDraft.id !== selectedAction.id
    : selectedDraft.rawCode !== 0 || selectedDraft.id !== 0;
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
  const triggerDiagnostics = selectedTrigger ? triggerDiagnosticsById.get(selectedTrigger.id) ?? [] : [];
  const selectedSlotDiagnostics = selectedTrigger
    ? validateActionDraft(project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id, catalog)
    : [];
  const selectedEdcdRowId = selectedEdcdUsage?.rowId ?? (selectedOption.edcdShape ? Math.max(0, selectedDraft.id) : null);
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
  const floatingDetail = detailSurface === "floating";
  const directTargetDrawerAvailable = !selectedOption.edcdShape;
  const targetRecordType = realmzScriptStepDescriptorFor(selectedDraft.rawCode).targetType;
  const wideTargetRecord = targetRecordType === "battle" || targetRecordType === "treasure" || targetRecordType === "shop" || targetRecordType === "simpleEncounter" || targetRecordType === "complexEncounter";
  const detailSurfaceButton = (
    <button
      type="button"
      className="btn btn-secondary btn-xs"
      title={floatingDetail ? "Dock this selected slot editor back into the Scripts workbench." : "Float this selected slot editor for more target editing room."}
      onClick={() => setDetailSurface(floatingDetail ? "docked" : "floating")}
    >
      {floatingDetail ? "Dock" : "Float"}
    </button>
  );
  const stepDetailActions = selectedTrigger ? (
    <>
      {detailSurfaceButton}
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move slot up" disabled={selectedSlot === 0} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Swap action slots", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot - 1 })}>
        <ArrowUp size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move slot down" disabled={selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Swap action slots", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
        <ArrowDown size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Duplicate slot to next slot" disabled={!selectedAction || selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "duplicateActionSlot", label: "Duplicate action slot", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
        <CopyPlus size={12} />
      </button>
      <button type="button" className="btn btn-danger btn-xs icon-only" title="Clear slot" disabled={!selectedAction} onClick={() => onApplyCommand?.({ kind: "deleteActionSlot", label: "Clear action slot", triggerId: selectedTrigger.id, slot: selectedSlot })}>
        <X size={12} />
      </button>
      <button
        type="button"
        className={`btn btn-secondary btn-xs${targetDrawerOpen && directTargetDrawerAvailable ? " active" : ""}`}
        title={directTargetDrawerAvailable ? targetDrawerOpen ? "Hide target details" : "Show target details" : "This opcode stores target fields in EDCD Attachment."}
        disabled={!directTargetDrawerAvailable}
        onClick={() => directTargetDrawerAvailable && setTargetDrawerOpen(!targetDrawerOpen)}
      >
        Target
      </button>
      <button
        type="button"
        className={`btn btn-primary btn-xs script-apply-button${selectedDraftDirty ? " is-dirty" : ""}`}
        title={selectedDraftDirty ? "Write this draft CODE/ID pair into the Realmz action slot." : "This slot already matches the current draft."}
        disabled={!selectedDraftDirty}
        onClick={applySelectedSlot}
      >
        <Save size={12} /> Apply Slot
      </button>
    </>
  ) : null;
  const stepDetailBody = selectedTrigger ? (
    <SelectedStepDetail
      project={project}
      catalog={catalog}
      selectedSlot={selectedSlot}
      selectedDraft={selectedDraft}
      selectedDraftDirty={selectedDraftDirty}
      selectedSlotApplied={Boolean(selectedAction) && !selectedDraftDirty}
      selectedOption={selectedOption}
      selectedEdcdUsage={selectedEdcdUsage}
      selectedEdcdRowId={selectedEdcdRowId}
      selectedSlotEntity={selectedSlotEntity}
      selectedSlotDiagnostics={selectedSlotDiagnostics}
      categoryFilter={categoryFilter}
      opcodeQuery={opcodeQuery}
      filteredOptions={filteredOptions}
      onSetCategoryFilter={setCategoryFilter}
      onSetOpcodeQuery={setOpcodeQuery}
      onSetSelectedDraft={setSelectedDraft}
      onSelectEntity={onSelectEntity}
      onApplyCommand={onApplyCommand}
    />
  ) : null;
  const targetEditorPanel = selectedTrigger && targetDrawerOpen && directTargetDrawerAvailable ? (
    <PanelSection title="Target Record" eyebrow="selected slot" density="compact" className={`script-target-drawer${wideTargetRecord ? " wide-target" : ""}`} actions={<button type="button" className="btn btn-secondary btn-xs icon-only" title="Hide target drawer" onClick={() => setTargetDrawerOpen(false)}><X size={12} /></button>}>
      <TargetRecordEditor
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        targetId={selectedDraft.id}
        onApplyCommand={onApplyCommand}
      />
    </PanelSection>
  ) : null;
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
            title={selectedMapCapacity?.canCreate ? "Create an Action Point on the selected map, reusing the first empty slot when possible." : "This map has no reusable Action Point slots. Clear an existing Action Point to reuse its fixed Realmz record."}
            onClick={() => {
              const recordIndex = nextActionPointRecordIndex(project.triggers, selectedMap.levelType, selectedMap.index);
              onApplyCommand?.({
                kind: "createActionPoint",
                label: `Create Action Point ${newActionPoint.x},${newActionPoint.y}`,
                levelType: selectedMap.levelType,
                levelIndex: selectedMap.index,
                x: clampRealmzCoordinate(newActionPoint.x),
                y: clampRealmzCoordinate(newActionPoint.y)
              });
              if (recordIndex != null) {
                const source = selectedMap.levelType === "land" ? "Data DD" : "Data DDD";
                onSelectEntity(selectEntityFromId(triggerEntityId(selectedMap.levelType, selectedMap.index, recordIndex, source)));
              }
            }}
          >
            <Plus size={12} /> Action Point
          </button>
          <small className={selectedMapCapacity?.canCreate ? "script-capacity-note" : "script-capacity-note blocked"}>
            {selectedMapCapacity?.active ?? 0}/{selectedMapCapacity?.max ?? 100} active Action Point records
            {selectedMapCapacity?.reusable ? `, ${selectedMapCapacity.reusable} empty reusable slot(s)` : selectedMapCapacity?.canCreate ? ", next create will append a fixed record" : ". Clear selected Action Point to reuse this record."}
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
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Script inventory filter">
              {SCRIPT_INVENTORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={inventoryFilter === filter.id ? "active" : ""}
                  disabled={filter.id === "current-map" && !canScopeToMap}
                  onClick={() => setInventoryFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <b>{inventoryCounts.get(filter.id) ?? 0}</b>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="realmz-script-list" aria-label="Triggers and macros">
            {filteredScripts.slice(0, 240).map((trigger) => (
              <ScriptListItem
                key={trigger.id}
                project={project}
                trigger={trigger}
                selected={trigger.id === selectedTrigger?.id}
                buttonRef={trigger.id === selectedTrigger?.id ? selectedScriptButtonRef : undefined}
                issues={triggerDiagnosticsById.get(trigger.id) ?? []}
                onSelectEntity={onSelectEntity}
              />
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
          {ed3Evidence.length > 0 && (
            <CollapsibleSection className="ed3-evidence-strip" title="ED3 Evidence" eyebrow="preserved non-callable rows" count={ed3Evidence.length.toLocaleString()} density="compact" storageKey="scripts.ed3Evidence.open" defaultOpen={false}>
              <small>{ed3Evidence.length.toLocaleString()} preserved non-callable Data ED3 row(s)</small>
              <ScrollArea className="ed3-evidence-list" aria-label="ED3 evidence records">
                {ed3Evidence.slice(0, 80).map((trigger) => {
                  const row = ed3ReachabilityFor(project, trigger.recordIndex);
                  return (
                    <button key={trigger.id} type="button" onClick={() => onSelectEntity(selectEntityFromId(`macro:${trigger.recordIndex}`))}>
                      <strong>ED3 row {trigger.recordIndex}</strong>
                      <small>{row?.classification ?? "unclassified"} | {trigger.actions.length} slot(s)</small>
                    </button>
                  );
                })}
              </ScrollArea>
            </CollapsibleSection>
          )}
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
                  <button className="btn btn-danger btn-xs" type="button" title={isMacro ? "Delete this macro record" : "Clear this fixed Realmz Action Point record so it can be reused"} onClick={() => onApplyCommand?.({ kind: "deleteTrigger", label: isMacro ? "Delete macro" : "Clear Action Point", triggerId: selectedTrigger.id })}>
                    <Trash2 size={12} /> {isMacro ? "Delete Macro" : "Clear Action Point"}
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
              <SourceEvidence
                project={project}
                trigger={selectedTrigger}
                selectedSlot={selectedSlot}
                selectedAction={selectedAction}
                selectedDraft={selectedDraft}
                selectedOption={selectedOption}
                selectedSlotEntity={selectedSlotEntity}
                selectedEdcdRowId={selectedEdcdRowId}
                onSelectEntity={onSelectEntity}
              />
              <div className={`realmz-visual-script${floatingDetail ? " has-floating-detail" : ""}${targetEditorPanel ? "" : " no-target-drawer"}${wideTargetRecord && targetEditorPanel && !floatingDetail ? " has-wide-target" : ""}`}>
                <PanelSection title="Action Slots" eyebrow="Visual step list" count="8" density="compact">
                  <ScrollArea className="realmz-step-list" aria-label="Action slots">
                    {Array.from({ length: 8 }, (_, slot) => {
                      const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
                      const current = slotDraft(slot, action);
                      const option = actionOptionFor(current.rawCode);
                      const slotEntity = actionSlots.find((entity) => Number(entity.summary.slot) === slot);
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
                            <small>{actionSummary(action, slotEntity)}</small>
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
                {!floatingDetail && (
                  <PanelSection title={`Slot ${selectedSlot} Details`} eyebrow={selectedOption.category} actions={stepDetailActions}>
                    {stepDetailBody}
                  </PanelSection>
                )}
                {!floatingDetail && targetEditorPanel}
              </div>
              {floatingDetail && (
                <FloatingWorkbenchPanel
                  title={`Slot ${selectedSlot} Details`}
                  eyebrow={`${scriptLabel(project, selectedTrigger)} | ${selectedOption.category}`}
                  storageKey="scripts.floatingEditor.position"
                  className="script-floating-detail"
                  actions={
                    <>
                      {stepDetailActions}
                    </>
                  }
                >
                  {stepDetailBody}
                  {targetEditorPanel}
                </FloatingWorkbenchPanel>
              )}
            </>
          ) : (
            <p className="empty-copy compact">Create a macro or select an Action Point to edit its Realmz CODE/ID slots.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SourceEvidence({
  project,
  trigger,
  selectedSlot,
  selectedAction,
  selectedDraft,
  selectedOption,
  selectedSlotEntity,
  selectedEdcdRowId,
  onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  selectedSlot: number;
  selectedAction?: Action;
  selectedDraft: { rawCode: number; id: number };
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedSlotEntity?: SemanticEntity;
  selectedEdcdRowId: number | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const triggerEntityIdValue = triggerSemanticSelectionId(trigger);
  const triggerLinks = linksFor(project, triggerEntityIdValue);
  const slotLinks = linksFor(project, selectedSlotEntity?.id ?? null);
  const linkCount = triggerLinks.outgoing.length + triggerLinks.incoming.length + slotLinks.outgoing.length + slotLinks.incoming.length;
  const edcdUsage = selectedSlotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  const count = [
    trigger.source,
    selectedSlotEntity?.id,
    selectedEdcdRowId != null ? `edcd:${selectedEdcdRowId}` : null,
    linkCount ? `links:${linkCount}` : null
  ].filter(Boolean).length;
  return (
    <CollapsibleSection title="Source Evidence" eyebrow="contextual" count={String(count)} density="compact" storageKey="scripts.sourceEvidence.open" defaultOpen={false}>
      <div className="script-source-evidence">
        <div className="realmz-raw-preview">
          <FieldRow label="Script Source" value={trigger.source} />
          <FieldRow label="Script Entity" value={triggerEntityIdValue} />
          <FieldRow label="Record Index" value={trigger.recordIndex} />
          <FieldRow label="Door ID" value={trigger.doorid} />
          <FieldRow label="Map" value={trigger.levelType != null ? `${trigger.levelType} ${trigger.levelIndex ?? 0}` : "macro"} />
          <FieldRow label="Coordinate" value={trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "none"} />
          <FieldRow label="Selected Slot" value={selectedSlot} />
          <FieldRow label="Slot Entity" value={selectedSlotEntity?.id ?? "draft-only"} />
          <FieldRow label="Applied CODE/ID" value={selectedAction ? `${selectedAction.rawCode} / ${selectedAction.id}` : "empty"} />
          <FieldRow label="Draft CODE/ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} />
          <FieldRow label="Opcode" value={selectedOption.label} />
          <FieldRow label="Dispatcher" value={isDispatcherNoopOpcode(selectedDraft.rawCode) ? "dispatcher no-op; Realmz ignores this CODE" : "has documented dispatcher behavior"} />
          <FieldRow label="EDCD" value={selectedEdcdRowId != null ? `row ${selectedEdcdRowId}${edcdUsage?.shape ? ` (${edcdUsage.shape})` : ""}` : "none"} />
          <FieldRow label="Edit State" value={selectedSlotEntity?.editState ?? "authored/draft"} />
        </div>
        {edcdUsage?.summary && <p className="field-help">{edcdUsage.summary}</p>}
        {selectedEdcdRowId != null && (
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSelectEntity(selectEntityFromId(`record:Data EDCD:${selectedEdcdRowId}`))}>
            Inspect Data EDCD row {selectedEdcdRowId}
          </button>
        )}
        <EvidenceLinkGroup title="Script Links" project={project} links={[...triggerLinks.outgoing, ...triggerLinks.incoming]} onSelectEntity={onSelectEntity} />
        <EvidenceLinkGroup title="Slot Links" project={project} links={[...slotLinks.outgoing, ...slotLinks.incoming]} onSelectEntity={onSelectEntity} />
      </div>
    </CollapsibleSection>
  );
}

function EvidenceLinkGroup({
  title,
  project,
  links,
  onSelectEntity
}: {
  title: string;
  project: Project;
  links: ReturnType<typeof linksFor>["outgoing"];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="script-source-link-group">
      <strong>{title}</strong>
      <div className="link-chip-row">
        {links.slice(0, 12).map((link) => (
          <button key={link.id} className="link-chip" type="button" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>
            {link.kind}: {semanticLabel(project, link.to)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedStepDetail({
  project,
  catalog,
  selectedSlot,
  selectedDraft,
  selectedDraftDirty,
  selectedSlotApplied,
  selectedOption,
  selectedEdcdUsage,
  selectedEdcdRowId,
  selectedSlotEntity,
  selectedSlotDiagnostics,
  categoryFilter,
  opcodeQuery,
  filteredOptions,
  onSetCategoryFilter,
  onSetOpcodeQuery,
  onSetSelectedDraft,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSlot: number;
  selectedDraft: { rawCode: number; id: number };
  selectedDraftDirty: boolean;
  selectedSlotApplied: boolean;
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedEdcdUsage?: {
    rowId?: number;
    shape?: string;
    fields?: { name?: string; value?: number }[];
    secondaryRowId?: number;
    secondaryShape?: string;
    secondaryFields?: { name?: string; value?: number }[];
    diagnostics?: string[];
    summary?: string;
  };
  selectedEdcdRowId: number | null;
  selectedSlotEntity?: SemanticEntity;
  selectedSlotDiagnostics: ScriptDiagnostic[];
  categoryFilter: string;
  opcodeQuery: string;
  filteredOptions: typeof ACTION_OPTIONS;
  onSetCategoryFilter: (category: string) => void;
  onSetOpcodeQuery: (query: string) => void;
  onSetSelectedDraft: (values: { rawCode: number; id: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const selectedIdLabel = selectedOption.edcdShape ? "Data EDCD Row" : "ID / Parameter";
  return (
    <div className="realmz-step-detail selected-step-detail">
      {selectedDraftDirty && (
        <div className="script-draft-warning" role="status">
          <strong>Unapplied slot draft</strong>
          <span>Click Apply Slot to write CODE {selectedDraft.rawCode} / ID {selectedDraft.id} into this Realmz action record.</span>
        </div>
      )}
      <ScriptDiagnostics issues={selectedSlotDiagnostics} />
      <div className="realmz-current-opcode" style={{ borderColor: categoryColor(selectedOption.category) }}>
        <div>
          <strong>{selectedOption.label}</strong>
          <span>{selectedOption.category}</span>
        </div>
        <p>{selectedOption.description}</p>
        {selectedOption.edcdShape && <em>Uses Data EDCD shape {selectedOption.edcdShape}</em>}
      </div>
      <div className="realmz-step-form-grid">
        <label>
          <span>Opcode</span>
          <select
            value={selectedDraft.rawCode}
            onChange={(event) => onSetSelectedDraft({ ...selectedDraft, rawCode: Number(event.currentTarget.value) })}
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{selectedIdLabel}</span>
          <input
            type="number"
            value={selectedDraft.id}
            onChange={(event) => onSetSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
            aria-label={`Slot ${selectedSlot} ${selectedIdLabel}`}
          />
          {selectedOption.edcdShape && (
            <small>
              Realmz treats this value as a Data EDCD row number. Edit the typed target fields in EDCD Attachment below.
            </small>
          )}
        </label>
      </div>
      <TargetPicker
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        value={selectedDraft.id}
        onChange={(id) => onSetSelectedDraft({ ...selectedDraft, id })}
        onInspect={onSelectEntity}
        onCreate={(recordType, id) => {
          const targetId = id ?? nextAuthorableTargetId(project, recordType);
          onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${recordType}`, recordType, id: targetId });
          onSetSelectedDraft({ ...selectedDraft, id: targetId });
        }}
      />
      <CollapsibleSection title="Opcode Catalog" eyebrow="browse actions" count={filteredOptions.length} density="compact" storageKey="scripts.opcodeCatalog.open" defaultOpen={selectedDraft.rawCode === 0}>
        <div className="realmz-opcode-catalog">
          <div className="realmz-step-category-bar">
            {ACTION_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={categoryFilter === category ? "active" : ""}
                onClick={() => onSetCategoryFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <input
            className="realmz-opcode-search"
            value={opcodeQuery}
            onChange={(event) => onSetOpcodeQuery(event.currentTarget.value)}
            placeholder="Search opcodes, descriptions, EDCD shapes..."
            aria-label="Search Realmz opcodes"
          />
          <div className="realmz-step-picker-grid">
            {filteredOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                className={selectedDraft.rawCode === option.code ? "selected" : ""}
                onClick={() => onSetSelectedDraft({ ...selectedDraft, rawCode: option.code })}
              >
                <strong>{option.shortLabel}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="EDCD Attachment" eyebrow={selectedOption.edcdShape ?? "optional"} density="compact" storageKey="scripts.edcdEditor.open" defaultOpen={Boolean(selectedOption.edcdShape || selectedEdcdUsage)}>
        <EdcdRowEditor
          project={project}
          catalog={catalog}
          edcdUsage={selectedEdcdUsage}
          fallbackRowId={selectedDraft.id}
          fallbackShape={selectedOption.edcdShape}
          fallbackFieldNames={edcdFieldNamesForShape(selectedOption.edcdShape)}
          selectedSlotLabel={`slot ${selectedSlot}`}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      </CollapsibleSection>
      <CollapsibleSection title="Advanced Realmz Fields" eyebrow="raw CODE/ID" density="compact" storageKey="scripts.advancedFields.open" defaultOpen={false}>
        <div className="realmz-raw-preview">
          <FieldRow label="Raw CODE" value={selectedDraft.rawCode} />
          <FieldRow label="Raw ID" value={selectedDraft.id} />
          <FieldRow label="EDCD Shape" value={selectedOption.edcdShape ?? "none"} />
          <FieldRow label="Source Summary" value={selectedSlotEntity?.summary.edcdUsage ? String((selectedSlotEntity.summary.edcdUsage as { summary?: string }).summary ?? selectedOption.description) : selectedOption.description} />
        </div>
      </CollapsibleSection>
      <div className="selected-step-detail-links">
        {selectedEdcdRowId != null && (
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSelectEntity(selectEntityFromId(`record:Data EDCD:${selectedEdcdRowId}`))}>
            Inspect attached EDCD row {selectedEdcdRowId}
          </button>
        )}
        {selectedSlotEntity ? (
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSelectEntity(selectEntityFromId(selectedSlotEntity.id))}>
            Inspect semantic action slot
          </button>
        ) : selectedSlotApplied ? (
          <EmptyState compact title="Authored slot applied" body="This CODE/ID pair is written to the project. Source-backed semantic evidence will catch up when project semantics are rebuilt." />
        ) : (
          <EmptyState compact title="No semantic slot yet" body="Apply this slot to create or update the source-backed Realmz action entry." />
        )}
      </div>
    </div>
  );
}

export function TargetRecordEditor({
  project,
  catalog,
  opcode,
  targetId,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  opcode: number;
  targetId: number;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const descriptor = realmzScriptStepDescriptorFor(opcode);
  if (!descriptor.targetType || !Number.isInteger(targetId) || targetId < 0) {
    if (descriptor.edcdShape) {
      return (
        <EmptyState
          compact
          title="Target is stored in EDCD"
          body={`This opcode uses Data EDCD shape "${descriptor.edcdShape}". The action ID selects the EDCD row; edit the typed message, battle, shop, item, or branch fields in the EDCD Attachment section.`}
        />
      );
    }
    return <EmptyState compact title="No editable target" body="Choose an opcode with a Realmz target record to edit message, battle, treasure, shop, or encounter details here." />;
  }
  if (targetId === 0 && !targetRecordExists(project, descriptor.targetType, targetId)) {
    return <EmptyState compact title="No target selected" body="Choose an existing target or use the picker to create the next available Realmz record." />;
  }
  const badge = descriptor.compatibility ?? "realmz-writable";
  const targetIssues = validateRealmzTargetRecord(project, descriptor.targetType, targetId, catalog);
  if (descriptor.targetType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Message ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create message", recordType: "message", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear message", recordType: "message", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Text</span>
            <textarea
              defaultValue={record.text}
              maxLength={255}
              onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update message", id: targetId, changes: { text: event.currentTarget.value } })}
            />
            <small>{record.text.length}/255 bytes before Classic encoding</small>
          </label>
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear battle", recordType: "battle", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Distance" value={record.dist} onCommit={(dist) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle distance", id: targetId, changes: { dist } })} />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Before Msg"
              emptyLabel="No before message"
              opcode={1}
              value={record.messageBefore}
              createRecordType="message"
              onCommit={(messageBefore) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle message", id: targetId, changes: { messageBefore } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle message", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="After Msg"
              emptyLabel="No after message"
              opcode={1}
              value={record.messageAfter}
              createRecordType="message"
              onCommit={(messageAfter) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle message", id: targetId, changes: { messageAfter } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle message", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Battle Macro"
              emptyLabel="No battle macro"
              opcode={8}
              value={record.battleMacro}
              onCommit={(battleMacro) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle macro", id: targetId, changes: { battleMacro } })}
            />
            <BattleGridEditor
              grid={record.grid}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle grid", id: targetId, changes: { grid: updateArraySlot(record.grid, index, value, 13 * 13) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Treasure ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear treasure", recordType: "treasure", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Exp" value={record.exp} onCommit={(exp) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure exp", id: targetId, changes: { exp } })} />
            <NumberField label="Gold" value={record.gold} onCommit={(gold) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gold", id: targetId, changes: { gold } })} />
            <NumberField label="Gems" value={record.gems} onCommit={(gems) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gems", id: targetId, changes: { gems } })} />
            <NumberField label="Jewelry" value={record.jewelry} onCommit={(jewelry) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure jewelry", id: targetId, changes: { jewelry } })} />
            <TreasureItemGrid
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 20) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Shop ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear shop", recordType: "shop", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Inflation" value={record.inflation} onCommit={(inflation) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop inflation", id: targetId, changes: { inflation } })} />
            <ShopStockEditor
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              quantities={record.quantities}
              onCommitItem={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 1000) } })}
              onCommitQuantity={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop quantity", id: targetId, changes: { quantities: updateArraySlot(record.quantities, index, value, 1000) } })}
              onClearSlot={(index) => onApplyCommand?.({
                kind: "updateShopRecord",
                label: "Clear shop stock slot",
                id: targetId,
                changes: {
                  itemIds: updateArraySlot(record.itemIds, index, 0, 1000),
                  quantities: updateArraySlot(record.quantities, index, 0, 1000)
                }
              })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Simple Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            recordKind="simple"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            actions={record.actions}
            catalog={catalog}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            recordKind="complex"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            wordResults={record.wordResults}
            thief={record.thief}
            thiefSuccess={record.thiefSuccess}
            thiefFail={record.thiefFail}
            actions={record.actions}
            catalog={catalog}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (descriptor.targetType === "questLabel") {
    const record = project.questLabels?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Quest ${targetId}`}
        badge="metadata"
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: targetId, label: `Quest ${targetId}` } })}
        onClear={() => onApplyCommand?.({ kind: "deleteQuestLabel", label: "Clear quest label", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Label</span>
            <input defaultValue={record.label} onBlur={(event) => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest label", quest: { ...record, label: event.currentTarget.value } })} />
          </label>
        )}
      </InlineTargetShell>
    );
  }
  return null;
}

function InlineTargetShell({
  title,
  badge,
  exists,
  onCreate,
  onClear,
  issues,
  children
}: {
  title: string;
  badge: string;
  exists: boolean;
  onCreate: () => void;
  onClear?: () => void;
  issues?: ScriptDiagnostic[];
  children: ReactNode;
}) {
  return (
    <div className="script-inline-target-editor">
      <header>
        <strong>{title}</strong>
        <span>{exists ? badge : "missing-target"}</span>
        <div className="script-inline-target-actions">
          {!exists && <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>Create {title}</button>}
          {exists && onClear && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              title="Replace this fixed Realmz record with an empty reusable default record."
              onClick={onClear}
            >
              Clear to Defaults
            </button>
          )}
        </div>
      </header>
      {exists && issues && issues.length > 0 && <ScriptDiagnostics issues={issues} />}
      {exists ? children : <small>This slot points at a target record that does not exist yet.</small>}
    </div>
  );
}

function EncounterShell({
  project,
  recordKind,
  id,
  texts,
  prompt,
  canBackOut,
  maxTimes,
  casteSuccess,
  choiceResults,
  wordResults,
  thief,
  thiefSuccess,
  thiefFail,
  actions,
  catalog,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  id: number;
  texts: string[];
  prompt: number;
  canBackOut: boolean;
  maxTimes: number;
  casteSuccess: number;
  choiceResults: number[];
  wordResults?: number[];
  thief?: boolean;
  thiefSuccess?: number;
  thiefFail?: number;
  actions: EncounterActionRow[];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const visibleRows = [0, 1, 2, 3];
  const update = (changes: Record<string, unknown>) => {
    if (recordKind === "simple") {
      onApplyCommand?.({ kind: "updateSimpleEncounterRecord", label: "Update simple encounter", id, changes });
    } else {
      onApplyCommand?.({ kind: "updateComplexEncounterRecord", label: "Update complex encounter", id, changes });
    }
  };
  return (
    <div className="script-target-grid">
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Prompt Msg"
        emptyLabel="No prompt message"
        opcode={1}
        value={prompt}
        createRecordType="message"
        onCommit={(next) => update({ prompt: next })}
        onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter prompt", recordType: "message", id: targetId })}
      />
      <label className="script-target-checkbox">
        <span>Can Back Out</span>
        <input type="checkbox" defaultChecked={canBackOut} onChange={(event) => update({ canBackOut: event.currentTarget.checked })} />
      </label>
      <NumberField label="Max Times" value={maxTimes} onCommit={(value) => update({ maxTimes: value })} />
      <NumberField label="Caste Success" value={casteSuccess} onCommit={(value) => update({ casteSuccess: value })} />
      {recordKind === "complex" && (
        <>
          <label className="script-target-checkbox">
            <span>Thief</span>
            <input type="checkbox" defaultChecked={Boolean(thief)} onChange={(event) => update({ thief: event.currentTarget.checked })} />
          </label>
          <NumberField label="Thief Success" value={thiefSuccess ?? 0} onCommit={(value) => update({ thiefSuccess: value })} />
          <NumberField label="Thief Fail" value={thiefFail ?? 0} onCommit={(value) => update({ thiefFail: value })} />
        </>
      )}
      <div className="script-encounter-outcome-grid">
        <strong>Choice Results</strong>
        {visibleRows.map((slot) => (
          <NumberField key={slot} label={`Choice ${slot}`} value={choiceResults[slot] ?? 0} onCommit={(value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })} />
        ))}
      </div>
      {recordKind === "complex" && wordResults && (
        <div className="script-encounter-outcome-grid">
          <strong>Word Results</strong>
          {visibleRows.map((slot) => (
            <NumberField key={slot} label={`Word ${slot}`} value={wordResults[slot] ?? 0} onCommit={(value) => update({ wordResults: updateArraySlot(wordResults, slot, value, 4) })} />
          ))}
        </div>
      )}
      <div className="script-encounter-action-grid">
        {visibleRows.map((slot) => (
          <EncounterActionRowEditor
            key={slot}
            project={project}
            catalog={catalog}
            slot={slot}
            row={encounterActionAt(actions, slot)}
            onUpdate={(changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
          />
        ))}
      </div>
      <EncounterTextGrid
        recordKind={recordKind}
        texts={texts}
        onCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, recordKind === "simple" ? 4 : 9) })}
      />
    </div>
  );
}

function EncounterTextGrid({
  recordKind,
  texts,
  onCommit
}: {
  recordKind: "simple" | "complex";
  texts: string[];
  onCommit: (slot: number, text: string) => void;
}) {
  const count = recordKind === "simple" ? 4 : 9;
  const maxLength = recordKind === "simple" ? 79 : 39;
  return (
    <CollapsibleSection title="Choice / Response Text Buffers" eyebrow="Classic Pascal text" count={`${count} buffers, ${maxLength} display bytes each`} density="compact" className="script-encounter-text-section" defaultOpen>
      <p className="script-encounter-text-note">
        Realmz stores these as Pascal text buffers inside the encounter record. Providence shows the display text and writes the hidden length byte on export.
      </p>
      <div className="script-encounter-text-grid">
        {Array.from({ length: count }, (_, slot) => {
          const text = texts[slot] ?? "";
          return (
            <label key={slot} className="script-encounter-text-field">
              <span>
                {encounterTextBufferLabel(recordKind, slot)}
              </span>
              <textarea
                defaultValue={text}
                maxLength={maxLength}
                onBlur={(event) => onCommit(slot, event.currentTarget.value)}
              />
              <small>
                {text.length}/{maxLength}
              </small>
            </label>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function EncounterActionRowEditor({
  project,
  catalog,
  slot,
  row,
  onUpdate,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
}) {
  const rowOption = actionOptionFor(row.rawCode);
  const targetType = realmzScriptStepDescriptorFor(row.rawCode).targetType;
  return (
    <div className="script-encounter-action-row">
      <header>
        <div>
          <strong>Action Row {slot}</strong>
          <small>{rowOption ? `${rowOption.category} | ${rowOption.description}` : "Empty action row"}</small>
        </div>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onUpdate({ rawCode: 0, id: 0 })}>
          Clear Row
        </button>
      </header>
      <label>
        <span>Opcode</span>
        <select value={row.rawCode} onChange={(event) => onUpdate({ rawCode: Number(event.currentTarget.value) })}>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.code} {option.label}</option>
          ))}
        </select>
      </label>
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Action Target"
        emptyLabel="No action target"
        opcode={row.rawCode}
        value={row.id}
        createRecordType={targetType}
        onCommit={(next) => onUpdate({ id: next })}
        onCreateTarget={(targetId) => {
          if (targetType) onCreateTarget(targetType, targetId);
        }}
      />
    </div>
  );
}

function ReferenceIdField({
  project,
  catalog,
  label,
  emptyLabel,
  opcode,
  value,
  createRecordType,
  onCommit,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  emptyLabel: string;
  opcode: number;
  value: number;
  createRecordType?: RealmzTargetRecordKind;
  onCommit: (value: number) => void;
  onCreateTarget?: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => targetOptionsForOpcode(project, opcode, catalog), [project, opcode, catalog]);
  const selected = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => filterScriptTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  const resultOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 8);
    if (selected && !query.trim() && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 7)];
    return visible;
  }, [filteredOptions, query, selected]);
  const hasRawValue = value !== 0 && !selected;
  const canCreate = Boolean(createRecordType && onCreateTarget && (!selected || hasRawValue || value === 0));
  const createId = value > 0 && !selected ? value : createRecordType ? nextAuthorableTargetId(project, createRecordType) : value;
  const selectTarget = (next: number) => {
    onCommit(next);
    setQuery("");
  };
  return (
    <label className="script-reference-id-field">
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        aria-label={`Search ${label}`}
      />
      <div className="script-reference-results" aria-live="polite">
        {query.trim() && resultOptions.length === 0 && <small>No matching {label.toLowerCase()} targets.</small>}
        {(query.trim() ? resultOptions : selected ? [selected] : []).map((option) => (
          <button
            key={option.key}
            type="button"
            className={option.value === value ? "selected" : ""}
            onClick={() => selectTarget(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{[option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ")}</span>
          </button>
        ))}
        {query.trim() && filteredOptions.length > resultOptions.length && <small>{filteredOptions.length - resultOptions.length} more match(es); keep typing to narrow.</small>}
      </div>
      <select value={hasRawValue ? `raw:${value}` : selected ? String(selected.value) : ""} onChange={(event) => {
        const raw = event.currentTarget.value;
        if (!raw || raw.startsWith("raw:")) return;
        selectTarget(Number(raw));
      }}>
        <option value="">{emptyLabel}</option>
        {hasRawValue && <option value={`raw:${value}`}>Current raw ID {value}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} raw ID`} />
      <small>{selected ? [selected.detail, selected.summary, selected.compatibility, selected.sourceState].filter(Boolean).join(" | ") : hasRawValue ? "Raw ID is preserved; no matching Providence target is decoded yet." : filteredOptions.length === 0 && query.trim() ? "No targets match this search." : emptyLabel}</small>
      {canCreate && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
          onCreateTarget?.(createId);
          onCommit(createId);
        }}>
          Create {label} {createId}
        </button>
      )}
    </label>
  );
}

function updateArraySlot<T>(values: T[], index: number, value: T, minLength: number) {
  const next = [...values];
  while (next.length < minLength) next.push((typeof value === "number" ? 0 : "") as T);
  next[index] = value;
  return next;
}

function encounterActionAt(actions: EncounterActionRow[], slot: number): EncounterActionRow {
  return actions.find((row) => row.slot === slot) ?? { slot, rawCode: 0, id: 0 };
}

function updateEncounterActionRow(actions: EncounterActionRow[], slot: number, changes: Partial<EncounterActionRow>) {
  const next = new Map(actions.map((row) => [row.slot, { ...row }]));
  const updated = { ...(next.get(slot) ?? { slot, rawCode: 0, id: 0 }), ...changes, slot };
  if (updated.rawCode === 0 && updated.id === 0) {
    next.delete(slot);
  } else {
    next.set(slot, updated);
  }
  return [...next.values()].sort((a, b) => a.slot - b.slot);
}

function encounterTextBufferLabel(recordKind: "simple" | "complex", slot: number) {
  if (recordKind === "simple") {
    return ["Choice 0 Label", "Choice 1 Label", "Choice 2 Label", "Choice 3 Label"][slot] ?? `Text Buffer ${slot}`;
  }
  const labels = [
    "Action Option 0 Label",
    "Action Option 1 Label",
    "Action Option 2 Label",
    "Action Option 3 Label",
    "Action Option 4 Label",
    "Action Option 5 Label",
    "Action Option 6 Label",
    "Action Option 7 Label",
    "Word Answer"
  ];
  return labels[slot] ?? `Text Buffer ${slot}`;
}

function BattleGridEditor({ grid, onCommit }: { grid: number[]; onCommit: (index: number, value: number) => void }) {
  return (
    <CollapsibleSection title="Monster Grid" eyebrow="13 x 13" count={`${grid.filter(Boolean).length} placed`} density="compact" className="script-battle-grid-section" defaultOpen={false}>
      <div className="script-battle-grid-editor" role="grid" aria-label="Battle monster grid">
        {Array.from({ length: 13 * 13 }, (_, index) => (
          <NumberField key={index} label={`M${index}`} value={grid[index] ?? 0} onCommit={(value) => onCommit(index, value)} compact />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function TreasureItemGrid({ project, catalog, itemIds, onCommit }: { project: Project; catalog?: LibraryCatalog | null; itemIds: number[]; onCommit: (index: number, value: number) => void }) {
  return (
    <CollapsibleSection title="Treasure Items" eyebrow="20 slots" count={`${itemIds.filter(Boolean).length} filled`} density="compact" className="script-treasure-grid-section" defaultOpen>
      <div className="script-treasure-item-grid">
        {Array.from({ length: 20 }, (_, index) => (
          <ItemIdField key={index} project={project} catalog={catalog} label={`Item ${index}`} value={itemIds[index] ?? 0} onCommit={(value) => onCommit(index, value)} compact />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ShopStockEditor({
  project,
  catalog,
  itemIds,
  quantities,
  onCommitItem,
  onCommitQuantity,
  onClearSlot
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  quantities: number[];
  onCommitItem: (index: number, value: number) => void;
  onCommitQuantity: (index: number, value: number) => void;
  onClearSlot: (index: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [filledOnly, setFilledOnly] = useState(false);
  const [jumpSlot, setJumpSlot] = useState("");
  const filledSlots = useMemo(() => {
    const slots: number[] = [];
    for (let index = 0; index < 1000; index += 1) {
      if ((itemIds[index] ?? 0) !== 0 || (quantities[index] ?? 0) !== 0) slots.push(index);
    }
    return slots;
  }, [itemIds, quantities]);
  const allSlots = useMemo(() => Array.from({ length: 1000 }, (_, index) => index), []);
  const sourceSlots = filledOnly ? filledSlots : allSlots;
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sourceSlots.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleSlots = sourceSlots.slice(safePage * pageSize, safePage * pageSize + pageSize);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const jumpToSlot = () => {
    const slot = Number(jumpSlot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 999) return;
    setFilledOnly(false);
    setPage(Math.floor(slot / pageSize));
  };
  return (
    <CollapsibleSection title="Shop Stock" eyebrow="1000 slots" count={`${filledSlots.length} filled`} density="compact" className="script-shop-stock-section" defaultOpen>
      <div className="script-shop-stock-toolbar">
        <button type="button" className="btn btn-secondary btn-xs" disabled={safePage <= 0} onClick={() => setPage(Math.max(0, safePage - 1))}>Prev</button>
        <span>Page {safePage + 1} / {pageCount}</span>
        <button type="button" className="btn btn-secondary btn-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}>Next</button>
        <label>
          <input type="checkbox" checked={filledOnly} onChange={(event) => {
            setFilledOnly(event.currentTarget.checked);
            setPage(0);
          }} />
          Filled
        </label>
        <label>
          <span>Go to</span>
          <input type="number" min={0} max={999} value={jumpSlot} onChange={(event) => setJumpSlot(event.currentTarget.value)} onBlur={jumpToSlot} onKeyDown={(event) => {
            if (event.key === "Enter") jumpToSlot();
          }} />
        </label>
      </div>
      <div className="script-shop-stock-grid">
        {visibleSlots.map((index) => (
          <div key={index} className="script-shop-stock-row">
            <strong>{index}</strong>
            <ItemIdField project={project} catalog={catalog} label="Item" value={itemIds[index] ?? 0} onCommit={(value) => onCommitItem(index, value)} compact />
            <NumberField label="Qty" value={quantities[index] ?? 0} onCommit={(value) => onCommitQuantity(index, value)} compact />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onClearSlot(index)}>Clear</button>
          </div>
        ))}
        {visibleSlots.length === 0 && <p className="script-shop-stock-empty">No filled shop slots.</p>}
      </div>
    </CollapsibleSection>
  );
}

function ItemIdField({ project, catalog, label, value, onCommit, compact = false }: { project: Project; catalog?: LibraryCatalog | null; label: string; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => filterItemTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  return (
    <label className={`script-item-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search items..."
        aria-label={`Search ${label} items`}
      />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty / none</option>
        {value !== 0 && !options.some((option) => option.value === value) && <option value={value}>Current item ID {value}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} raw item ID`} />
      <small>{selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : filteredOptions.length === 0 && query.trim() ? "No items match this search." : itemReferenceDetail(project, value, catalog)}</small>
    </label>
  );
}

function filterScriptTargetOptions(options: ReturnType<typeof targetOptionsForOpcode>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.compatibility,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function filterItemTargetOptions(options: ReturnType<typeof itemReferenceOptions>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function targetRecordExists(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    project.questLabels;
  return Boolean((records ?? []).some((record) => record.id === id));
}

function isScriptsBenchmarkMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkScripts");
}

function NumberField({ label, value, onCommit, compact = false }: { label: string; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className={compact ? "script-number-field compact" : "script-number-field"}>
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

const ScriptListItem = memo(function ScriptListItem({
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

function nextAuthorableTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    project.questLabels;
  const used = new Set((records ?? []).map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + 1;
}

const SCRIPT_INVENTORY_FILTERS: Array<{ id: ScriptInventoryFilter; label: string }> = [
  { id: "current-map", label: "Current Map" },
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "reusable", label: "Reusable" },
  { id: "warnings", label: "Warnings" },
  { id: "macros", label: "Macros" }
];

function filterScriptsByInventory(
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

function isReusableActionPoint(trigger: TriggerRecord) {
  return trigger.source !== "Data ED3" && isReusableDoorPlaceholder(trigger);
}

function triggerVisibleForEditor(project: Project | null, trigger: TriggerRecord, activeEditor: string) {
  if (activeEditor === "macros" || activeEditor === "global-macros") return isCallableMacro(project, trigger);
  if (activeEditor === "action-points") return trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null;
  if (activeEditor === "quests") return trigger.actions.some((action) => [46, 47, 76, 77].includes(action.code));
  return (trigger.source !== "Data ED3" && trigger.levelType != null && trigger.levelIndex != null) || isCallableMacro(project, trigger);
}

function scriptPanelTitle(activeEditor: string) {
  if (activeEditor === "action-points") return "Action Points / GOSUBs";
  if (activeEditor === "macros") return "Macro Editor";
  if (activeEditor === "ed3-evidence") return "ED3 Evidence";
  if (activeEditor === "global-macros") return "Global Macro Editor";
  if (activeEditor === "quests") return "Quest Script Links";
  return "Triggers And Macros";
}

function scriptLabel(project: Project, trigger: TriggerRecord) {
  const fallback = trigger.source === "Data ED3"
    ? `Macro ${trigger.recordIndex}`
    : isReusableDoorPlaceholder(trigger)
      ? `Empty Action Point ${trigger.recordIndex}`
    : trigger.coordinate
      ? `Action Point ${trigger.recordIndex} (${trigger.coordinate.x}, ${trigger.coordinate.y})`
      : `Action Point ${trigger.recordIndex}`;
  return project.editorMetadata?.displayNames?.[trigger.id]?.label ?? fallback;
}

function scriptSubtitle(project: Project, trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") {
    const row = ed3ReachabilityFor(project, trigger.recordIndex);
    return `macro | record ${trigger.recordIndex} | ${row?.pathStatus ?? "authored"}`;
  }
  const map = project.maps.find((candidate) => candidate.levelType === trigger.levelType && candidate.index === trigger.levelIndex);
  const mapLabel = map?.name ?? `${trigger.levelType ?? "map"} ${trigger.levelIndex ?? 0}`;
  const coordinate = trigger.coordinate ? `${trigger.coordinate.x},${trigger.coordinate.y}` : isReusableDoorPlaceholder(trigger) ? "empty reusable slot" : "no coordinate";
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

function actionSummary(action?: Action, slotEntity?: SemanticEntity) {
  if (!action) return "empty";
  const edcdUsage = slotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  if (edcdUsage?.summary) {
    const prefix = edcdUsage.rowId != null ? `EDCD ${edcdUsage.rowId}` : "EDCD";
    return `${action.rawCode} / ${action.id} · ${prefix}: ${edcdUsage.summary}`;
  }
  return `${action.rawCode} / ${action.id} · ${action.label}${action.gosub ? " · GOSUB" : ""}`;
}

function actionBelongsTo(trigger: TriggerRecord, entityId: string) {
  return entityId.includes(trigger.id) || entityId.startsWith(`action:${trigger.source}:${trigger.recordIndex}:`) || entityId.startsWith(`action-slot:${triggerSelectionId(trigger)}:`);
}

function triggerMatchesSelection(trigger: TriggerRecord, entityId: string) {
  if (!entityId) return false;
  return triggerSelectionId(trigger) === entityId ||
    triggerSemanticSelectionId(trigger) === entityId ||
    trigger.id === entityId ||
    actionBelongsTo(trigger, entityId);
}

function triggerSelectionId(trigger: TriggerRecord) {
  return trigger.source === "Data ED3" ? `macro:${trigger.recordIndex}` : trigger.id;
}

function triggerSemanticSelectionId(trigger: TriggerRecord) {
  return triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
}

function usePersistentBoolean(key: string, fallback: boolean) {
  return usePersistentValue(key, fallback, (value) => value === "1" || value === "true", (value) => value ? "1" : "0");
}

function usePersistentValue<T extends string | boolean>(
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
