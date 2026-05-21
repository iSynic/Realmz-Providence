import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Action, Project, ProjectCommand, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { actionSlotEntitiesForScript, actionSlotEntitiesForTriggerRecord, schemaEntities, scriptPrimaryCategory } from "../semanticGraph";
import { EntityBrowser } from "../components/EntityBrowser";
import { SemanticInspector } from "../components/SemanticInspector";
import { categoryColor } from "../components/TileSprite";
import { EmptyState, FieldRow, PanelSection } from "../ui";

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
      </section>
      <aside className="tab-panel semantic-right">
        <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        <EdcdList project={project} onSelectEntity={onSelectEntity} />
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
  const selectedTrigger =
    scripts.find((trigger) => trigger.id === selectedEntity?.id || actionBelongsTo(trigger, selectedEntity?.id ?? "")) ??
    scripts[0] ??
    null;
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("Core");
  const slotDraft = (slot: number, action?: Action) => draft[`${selectedTrigger?.id}:${slot}`] ?? { rawCode: action?.rawCode ?? 0, id: action?.id ?? 0 };
  if (!project) return null;
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = `${selectedTrigger?.id}:${selectedSlot}`;
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedOption = actionOptionFor(selectedDraft.rawCode);
  const actionSlots = selectedTrigger ? actionSlotEntitiesForTriggerRecord(project, selectedTrigger) : [];
  const selectedSlotEntity = actionSlots.find((entity) => Number(entity.summary.slot) === selectedSlot);
  return (
    <section className="realmz-script-editor">
      <header>
        <div>
          <strong>{scriptPanelTitle(activeEditor)}</strong>
          <small>Writes CODE/ID slots directly; EDCD rows remain visible below.</small>
        </div>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "createMacro", label: "Create macro" })}>
          <Plus size={12} /> New Macro
        </button>
      </header>
      <div className="realmz-script-layout">
        <div className="realmz-script-list">
          {scripts.slice(0, 160).map((trigger) => (
            <button
              type="button"
              key={trigger.id}
              className={trigger.id === selectedTrigger?.id ? "selected" : ""}
              onClick={() => onSelectEntity(selectEntityFromId(trigger.id))}
            >
              <strong>{scriptLabel(trigger)}</strong>
              <small>{trigger.source === "Data ED3" ? "macro" : trigger.coordinate ? `${trigger.coordinate.x},${trigger.coordinate.y}` : "action point"}</small>
            </button>
          ))}
        </div>
        <div className="realmz-script-form">
          {selectedTrigger ? (
            <>
              <div className="script-header-grid">
                <NumberField
                  label="% Chance"
                  value={selectedTrigger.percent}
                  onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                />
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
                  <div className="realmz-step-list">
                    {Array.from({ length: 8 }, (_, slot) => {
                      const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
                      const current = slotDraft(slot, action);
                      const option = actionOptionFor(current.rawCode);
                      const changed = action ? current.rawCode !== action.rawCode || current.id !== action.id : current.rawCode !== 0 || current.id !== 0;
                      return (
                        <button
                          key={slot}
                          className={`realmz-step-card${slot === selectedSlot ? " selected" : ""}${changed ? " dirty" : ""}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{ borderColor: categoryColor(option.category) }}
                        >
                          <span className="slot-index">{slot}</span>
                          <span>
                            <strong>{option.shortLabel}</strong>
                            <small>{actionSummary(action)}</small>
                          </span>
                          <b>{option.category}</b>
                        </button>
                      );
                    })}
                  </div>
                </PanelSection>
                <PanelSection
                  title={`Slot ${selectedSlot} Details`}
                  eyebrow={selectedOption.category}
                  actions={
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => onApplyCommand?.({
                        kind: "updateActionSlot",
                        label: `Update slot ${selectedSlot}`,
                        triggerId: selectedTrigger.id,
                        slot: selectedSlot,
                        rawCode: selectedDraft.rawCode,
                        id: selectedDraft.id
                      })}
                    >
                      <Save size={12} /> Apply
                    </button>
                  }
                >
                  <div className="realmz-step-detail">
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
                    <div className="realmz-step-picker-grid">
                      {ACTION_OPTIONS.filter((option) => option.category === categoryFilter).map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          className={selectedDraft.rawCode === option.code ? "selected" : ""}
                          onClick={() => setDraft({ ...draft, [selectedKey]: { ...selectedDraft, rawCode: option.code } })}
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
                          onChange={(event) => setDraft({ ...draft, [selectedKey]: { ...selectedDraft, rawCode: Number(event.currentTarget.value) } })}
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
                          onChange={(event) => setDraft({ ...draft, [selectedKey]: { ...selectedDraft, id: Number(event.currentTarget.value) } })}
                          aria-label={`Slot ${selectedSlot} ID`}
                        />
                      </label>
                    </div>
                    <div className="realmz-raw-preview">
                      <FieldRow label="Raw CODE" value={selectedDraft.rawCode} />
                      <FieldRow label="Raw ID" value={selectedDraft.id} />
                      <FieldRow label="EDCD Shape" value={selectedOption.edcdShape ?? "none"} />
                      <FieldRow label="Source Summary" value={selectedSlotEntity?.summary.edcdUsage ? String((selectedSlotEntity.summary.edcdUsage as { summary?: string }).summary ?? selectedOption.description) : selectedOption.description} />
                    </div>
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
              {selectedTrigger.source === "Data ED3" && (
                <button className="btn btn-danger btn-xs" type="button" onClick={() => onApplyCommand?.({ kind: "deleteMacro", label: "Delete macro", triggerId: selectedTrigger.id })}>
                  <Trash2 size={12} /> Delete Macro
                </button>
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

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
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

const ACTION_OPTIONS = [
  { code: 0, label: "0 Empty", shortLabel: "Empty", category: "Core", description: "Clear this slot; Realmz will skip it." },
  { code: 1, label: "1 Show Message", shortLabel: "Message", category: "Text", description: "Display a scenario message by ID." },
  { code: 2, label: "2 Start Battle", shortLabel: "Battle", category: "Combat", description: "Start a battle record.", edcdShape: "battle" },
  { code: 3, label: "3 Choice / Branch", shortLabel: "Choice", category: "Branch", description: "Prompt or branch using EDCD parameters.", edcdShape: "choice" },
  { code: 4, label: "4 Simple Encounter", shortLabel: "Simple Encounter", category: "Encounter", description: "Start a simple encounter." },
  { code: 5, label: "5 Complex Encounter", shortLabel: "Complex Encounter", category: "Encounter", description: "Start a complex encounter." },
  { code: 6, label: "6 Open Shop", shortLabel: "Shop", category: "Economy", description: "Open a shop by ID." },
  { code: 9, label: "9 Play Sound", shortLabel: "Sound", category: "Media", description: "Play a snd resource." },
  { code: 10, label: "10 Give Treasure", shortLabel: "Treasure", category: "Economy", description: "Give treasure or reward data." },
  { code: 12, label: "12 Mutate Tile", shortLabel: "Tile Patch", category: "Map", description: "Mutate land/dungeon tile data.", edcdShape: "tile mutation" },
  { code: 13, label: "13 Enable/Disable AP", shortLabel: "AP State", category: "Map", description: "Enable, disable, or mutate an Action Point.", edcdShape: "trigger mutation" },
  { code: 20, label: "20 Teleport", shortLabel: "Teleport", category: "Map", description: "Move the party to a level/cell.", edcdShape: "teleport" },
  { code: 23, label: "23 Mutate Random Region", shortLabel: "Random Region", category: "Encounter", description: "Patch random encounter rectangle data.", edcdShape: "random-region mutation" },
  { code: 24, label: "24 Keep Codes", shortLabel: "Keep Codes", category: "Branch", description: "Keep evaluating following action slots." },
  { code: 27, label: "27 Show Picture", shortLabel: "Picture", category: "Media", description: "Show a PICT resource." },
  { code: 29, label: "29 Give/Display Map", shortLabel: "Map Item", category: "Map", description: "Give or display map-related data." },
  { code: 39, label: "39 Extend Codes", shortLabel: "Extend", category: "Branch", description: "Use extended CODE/ID behavior." },
  { code: 46, label: "46 Branch Quest Flag", shortLabel: "Read Flag", category: "Quest", description: "Branch based on quest flag state." },
  { code: 47, label: "47 Set Quest Flag", shortLabel: "Write Flag", category: "Quest", description: "Set a quest flag." },
  { code: 57, label: "57 Change Landlook", shortLabel: "Landlook", category: "Map", description: "Change map render/landlook state.", edcdShape: "render mutation" },
  { code: 73, label: "73 Restricted Shop", shortLabel: "Restricted Shop", category: "Economy", description: "Open a restricted shop variant.", edcdShape: "restricted shop" },
  { code: 76, label: "76 Write Quest Value", shortLabel: "Write Quest", category: "Quest", description: "Write quest value data.", edcdShape: "condition/value mutation" },
  { code: 77, label: "77 Branch Quest Value", shortLabel: "Quest Branch", category: "Quest", description: "Branch on quest value data.", edcdShape: "condition" },
  { code: 84, label: "84 Check Registration", shortLabel: "Registration", category: "Scenario", description: "Legacy registration check." },
  { code: 98, label: "98 Registration Check", shortLabel: "Reg Check", category: "Scenario", description: "Legacy registration choke point." },
  { code: 99, label: "99 Registration Gate", shortLabel: "Reg Gate", category: "Scenario", description: "Legacy registration gate." },
  { code: 111, label: "111 Return from GOSUB", shortLabel: "Return", category: "Core", description: "Return from a GOSUB macro." },
  { code: 112, label: "112 Pop Stack", shortLabel: "Pop", category: "Core", description: "Pop script stack state." },
  { code: 126, label: "126 Battle Macro", shortLabel: "Battle Macro", category: "Combat", description: "Call battle macro behavior.", edcdShape: "battle macro" }
];

const ACTION_CATEGORIES = Array.from(new Set(ACTION_OPTIONS.map((option) => option.category)));

function actionOptionFor(rawCode: number) {
  return ACTION_OPTIONS.find((option) => option.code === rawCode) ?? {
    code: rawCode,
    label: `${rawCode} Unknown`,
    shortLabel: `Opcode ${rawCode}`,
    category: "Unknown",
    description: "Unsupported or archaeology-only opcode. Keep visible and inspect raw fields."
  };
}

function scriptLabel(trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") return `Macro ${trigger.recordIndex}`;
  if (trigger.coordinate) return `Action Point ${trigger.recordIndex} (${trigger.coordinate.x}, ${trigger.coordinate.y})`;
  return `Action Point ${trigger.recordIndex}`;
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
      <div className="edcd-grid">
        {rows.slice(0, 180).map((row) => (
          <button key={row.id} onClick={() => onSelectEntity(selectEntityFromId(row.id))}>
            {row.label}: {Array.isArray(row.summary.values) ? row.summary.values.join(", ") : "semantic row"}
          </button>
        ))}
      </div>
    </section>
  );
}
