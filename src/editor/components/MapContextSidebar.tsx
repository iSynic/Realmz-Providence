import { useState } from "react";
import { TOOLS } from "../constants";
import { EditorState } from "../store";
import { EditorTool, MapEntity, Project, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { randomRectEntityId } from "../map/geometry";
import { actionSlotEntitiesForTriggerRecord } from "../semanticGraph";
import { mapEntityId, selectEntityFromId, triggerEntityId } from "../utils";
import { EntityBrowser } from "./EntityBrowser";
import { InfoGrid } from "./InfoGrid";
import { ActionPointCodeTable, CellTileEvidence, MapCapabilityPanel, RandomRectangleForm } from "./MapAffordances";
import { PaintPalettePanel } from "./TileSelectionBar";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";

export function MapContextSidebar({
  state,
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  mapRecords,
  selectedTileset,
  atlas,
  onSelectMap,
  onSetTool,
  onSelectTile,
  onSelectEntity,
  onClearSelection
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  onSelectMap: (id: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
}) {
  const selection = selectionSummary(selectedMap, state.selectedEntity, state.selectedCell, mapTriggers, selectedRandomLevel, mapRecords);
  return (
    <aside className="editor-sidebar contextual-sidebar">
      <ScrollArea className="contextual-sidebar-scroll" aria-label="Map tools and browser">
        {selection ? (
          <SelectionInspector
            selection={selection}
            map={selectedMap}
            project={state.project}
            onSelectEntity={onSelectEntity}
            onClearSelection={onClearSelection}
          />
        ) : (
          <CoreMapSetup
            project={state.project}
            selectedMap={selectedMap}
            randomLevel={selectedRandomLevel}
            activeTool={state.activeTool}
            onSelectMap={onSelectMap}
            onSelectEntity={onSelectEntity}
          />
        )}
        <MapToolset
          state={state}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          onSetTool={onSetTool}
          onSelectTile={onSelectTile}
        />
        <EntityBrowser project={state.project} selectedEntity={state.selectedEntity} onSelect={onSelectEntity} />
      </ScrollArea>
    </aside>
  );
}

type Selection =
  | { kind: "cell"; cell: { x: number; y: number; tile: number }; triggers: TriggerRecord[]; rects: RandomLevel["rects"]; records: SemanticEntity[] }
  | { kind: "trigger"; trigger: TriggerRecord }
  | { kind: "random"; rect: RandomLevel["rects"][number] }
  | { kind: "record"; record: SemanticEntity };

function CoreMapSetup({
  project,
  selectedMap,
  randomLevel,
  activeTool,
  onSelectMap,
  onSelectEntity
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  onSelectMap: (id: string) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <section className="context-panel">
      <div className="tutorial-callout">
        Map-level setup, source identity, and Realmz flags.
      </div>
      <div className="panel-header">
        <span>Core Map Setup</span>
        <small>{project?.maps.length ?? 0} maps</small>
      </div>
      <label className="context-field">
        <span>Scenario Map</span>
        <select value={selectedMap?.id ?? ""} onChange={(event) => onSelectMap(event.currentTarget.value)} disabled={!project}>
          {!project && <option value="">No project loaded</option>}
          {project?.maps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      </label>
      <details className="context-section" open>
        <summary>
          <span>Map Identity</span>
          <b>{selectedMap?.levelType ?? "none"}</b>
        </summary>
        <InfoGrid
          rows={[
            ["Map ID", selectedMap ? mapEntityId(selectedMap.levelType, selectedMap.index) : "none"],
            ["Record", selectedMap ? `${selectedMap.source} #${selectedMap.index}` : "none"],
            ["Tileset", selectedMap?.render.tilesetId ?? "none"],
            ["Land Look", randomLevel?.landlook ?? "none"]
          ]}
        />
      </details>
      <details className="context-section" open>
        <summary>
          <span>Realmz Map Flags</span>
          <b>{randomLevel ? "configured" : "none"}</b>
        </summary>
        <InfoGrid
          rows={[
            ["Dark", randomLevel?.isDark ? "yes" : "no"],
            ["Use LOS", randomLevel?.useLos ? "yes" : "no"],
            ["Random Rects", randomLevel?.rects.length ?? 0],
            ["Action Points", selectedMap ? "up to 100" : "none"]
          ]}
        />
      </details>
      <MapCapabilityPanel
        map={selectedMap}
        randomLevel={randomLevel}
        activeTool={activeTool}
        onSelectRandomRect={
          selectedMap
            ? (rectIndex) => onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, rectIndex) })
            : undefined
        }
      />
    </section>
  );
}

function MapToolset({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  onSetTool,
  onSelectTile
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(true);
  return (
    <section className="context-panel map-toolset-panel">
      <div className="panel-header">
        <span>Map Toolset</span>
        <small>{toolLabel(state.activeTool)}</small>
      </div>
      <div className="sidebar-tool-grid">
        {TOOLS.map((tool) => (
          <TutorialTip key={tool.id} title={toolLabel(tool.id)} body={tool.hint} side="right">
            <button className={`sidebar-tool${state.activeTool === tool.id ? " active" : ""}`} onClick={() => onSetTool(tool.id)}>
              {tool.icon}
              <span>{toolLabel(tool.id)}</span>
            </button>
          </TutorialTip>
        ))}
      </div>
      <button className={`toolset-disclosure${paletteOpen ? " open" : ""}`} onClick={() => setPaletteOpen((open) => !open)}>
        <span>{paletteOpen ? "Collapse" : "Open"} Paint Palette</span>
        <b>Paint {state.selectedTile}</b>
      </button>
      {paletteOpen && (
        <PaintPalettePanel
          map={selectedMap}
          selectedTile={state.selectedTile}
          inspectedTile={state.selectedCell?.tile ?? null}
          setSelectedTile={onSelectTile}
          tileset={selectedTileset}
          atlas={atlas}
          atlasStatus={state.atlasStatus}
          variant="sidebar"
        />
      )}
    </section>
  );
}

function SelectionInspector({
  selection,
  map,
  project,
  onSelectEntity,
  onClearSelection
}: {
  selection: Selection;
  map: MapEntity | null;
  project: Project | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
}) {
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Selection Inspector</span>
        <button className="btn btn-ghost btn-xs" onClick={onClearSelection}>Core</button>
      </div>
      {selection.kind === "cell" && (
        <>
          <InfoGrid
            rows={[
              ["Cell", `${selection.cell.x}, ${selection.cell.y}`],
              ["Tile", selection.cell.tile],
              ["Action Points", selection.triggers.length],
              ["Random Rects", selection.rects.length],
              ["Starts", selection.records.length],
              ["Edit State", "editable"]
            ]}
          />
          <CellTileEvidence cell={selection.cell} records={selection.records} />
          <SelectionLinks
            map={map}
            triggers={selection.triggers}
            rects={selection.rects}
            records={selection.records}
            onSelectEntity={onSelectEntity}
          />
        </>
      )}
      {selection.kind === "trigger" && (
        <TriggerSelectionDetails
          project={project}
          trigger={selection.trigger}
          onSelectEntity={onSelectEntity}
        />
      )}
      {selection.kind === "random" && (
        <>
          <InfoGrid
            rows={[
              ["Rectangle", selection.rect.rectIndex],
              ["Bounds", `${selection.rect.left}, ${selection.rect.top} to ${selection.rect.right}, ${selection.rect.bottom}`],
              ["Times / 10000", selection.rect.percent],
              ["Battle Range", selection.rect.battleRange.join(" to ")],
              ["Extra APs", selection.rect.randomDoors.join(", ")],
              ["Text", selection.rect.text],
              ["Edit State", "inspect-only"]
            ]}
          />
          <RandomRectangleForm rect={selection.rect} />
        </>
      )}
      {selection.kind === "record" && (
        <InfoGrid
          rows={[
            ["Label", selection.record.label],
            ["Type", selection.record.type],
            ["Source", selection.record.source],
            ["Start", `${summaryNumber(selection.record, "startX") ?? "?"}, ${summaryNumber(selection.record, "startY") ?? "?"}`],
            ["Edit State", selection.record.editState ?? (selection.record.editable ? "editable" : "inspect-only")]
          ]}
        />
      )}
      {project && <small className="context-footnote">{project.scenario.name}</small>}
    </section>
  );
}

function TriggerSelectionDetails({
  project,
  trigger,
  onSelectEntity
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
  return (
    <>
          <InfoGrid
            rows={[
              ["Type", trigger.source === "Data ED3" ? "Extra Action Point" : "Action Point"],
              ["Cell", trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "macro"],
              ["Record", `${trigger.source} #${trigger.recordIndex}`],
              ["Chance", trigger.percent],
              ["Goto", `${trigger.landid ?? "?"}, ${trigger.targetX ?? "?"}, ${trigger.targetY ?? "?"}`],
              ["Edit State", "blocked"]
            ]}
          />
          <ActionPointCodeTable trigger={trigger} />
          <div className="action-slot-list padded">
            {slots.length > 0
              ? slots.map((slot) => (
                  <button key={slot.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(slot.id))}>
                    {String(slot.summary.slot ?? "?")}: {actionSlotLabel(slot)}
                  </button>
                ))
              : trigger.actions.map((action) => (
                  <button key={`${trigger.id}:${action.slot}`} className="link-chip">
                    {action.slot}: {action.label} {action.id ? `#${action.id}` : ""}
                  </button>
                ))}
          </div>
    </>
  );
}

function SelectionLinks({
  map,
  triggers,
  rects,
  records,
  onSelectEntity
}: {
  map: MapEntity | null;
  triggers: TriggerRecord[];
  rects: RandomLevel["rects"];
  records: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="selection-link-list">
      {triggers.map((trigger) => (
        <button
          key={trigger.id}
          className="link-chip"
          onClick={() => onSelectEntity(selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)))}
        >
          {trigger.actions[0]?.label ?? "Action Point"} #{trigger.recordIndex}
        </button>
      ))}
      {map && rects.map((rect) => (
        <button key={rect.rectIndex} className="link-chip" onClick={() => onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rect.rectIndex}` })}>
          Random Rectangle {rect.rectIndex}
        </button>
      ))}
      {records.map((record) => (
        <button key={record.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
          {record.label}
        </button>
      ))}
    </div>
  );
}

function selectionSummary(
  map: MapEntity | null,
  selectedEntity: SelectedEntity | null,
  selectedCell: { x: number; y: number; tile: number } | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
): Selection | null {
  if (map && selectedEntity?.id) {
    const trigger = triggers.find((candidate) => triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id);
    if (trigger) return { kind: "trigger", trigger };
    const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === `random:${map.levelType}:${map.index}:${candidate.rectIndex}`);
    if (rect) return { kind: "random", rect };
    const record = mapRecords.find((candidate) => candidate.id === selectedEntity.id);
    if (record) return { kind: "record", record };
  }
  if (!selectedCell) return null;
  return {
    kind: "cell",
    cell: selectedCell,
    triggers: triggers.filter((trigger) => trigger.coordinate?.x === selectedCell.x && trigger.coordinate.y === selectedCell.y),
    rects: randomLevel?.rects.filter((rect) => selectedCell.x >= rect.left && selectedCell.x <= rect.right && selectedCell.y >= rect.top && selectedCell.y <= rect.bottom) ?? [],
    records: mapRecords.filter((record) => record.summary.startX === selectedCell.x && record.summary.startY === selectedCell.y)
  };
}

function toolLabel(tool: EditorTool) {
  if (tool === "trigger") return "Action Point";
  return tool[0].toUpperCase() + tool.slice(1);
}

function summaryNumber(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function actionSlotLabel(slot: SemanticEntity) {
  const usage = slot.summary.edcdUsage as { summary?: string } | undefined;
  return usage?.summary ?? String(slot.summary.label ?? `opcode ${slot.summary.code ?? "?"}`);
}
