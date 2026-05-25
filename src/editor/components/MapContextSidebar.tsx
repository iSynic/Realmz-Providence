import { useEffect, useState } from "react";
import { TOOLS } from "../constants";
import { EditorState } from "../store";
import { EditorTool, MapEntity, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { randomRectEntityId } from "../map/geometry";
import { actionSlotEntitiesForTriggerRecord } from "../semanticGraph";
import { mapEntityId, selectEntityFromId, triggerEntityId } from "../utils";
import { InfoGrid } from "./InfoGrid";
import { ActionPointCodeTable, CellTileEvidence, MapCapabilityPanel, RandomRectangleForm } from "./MapAffordances";
import { PaintPalettePanel } from "./TileSelectionBar";
import { TileSprite, tileColor } from "./TileSprite";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";
import { ResizablePane } from "./ResizablePane";
import { actionPointCapacity, nextActionPointRecordIndex } from "../actionPointCapacity";

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
  onClearSelection,
  onApplyCommand
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
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const selection = selectionSummary(selectedMap, state.selectedEntity, state.selectedCell, mapTriggers, selectedRandomLevel, mapRecords);
  return (
    <ResizablePane
      className="editor-sidebar contextual-sidebar"
      ariaLabel="Map tools and context"
      storageKey="providence.mapLeftSidebarWidth.v4"
      defaultWidth={360}
      minWidth={320}
      maxWidth={560}
      edge="right"
    >
      <ScrollArea className="contextual-sidebar-scroll" aria-label="Map tools and browser">
        <MapOutliner
          project={state.project}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
        />
        {selection ? (
          <SelectionInspector
            selection={selection}
            map={selectedMap}
            project={state.project}
            onSelectEntity={onSelectEntity}
            onClearSelection={onClearSelection}
            onApplyCommand={onApplyCommand}
          />
        ) : (
          <CoreMapSetup
            project={state.project}
            selectedMap={selectedMap}
            randomLevel={selectedRandomLevel}
            activeTool={state.activeTool}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
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
      </ScrollArea>
    </ResizablePane>
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Core Map Setup</span>
        <small>{selectedMap?.levelType ?? "none"}</small>
      </div>
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
        <MapLevelSettings map={selectedMap} randomLevel={randomLevel} onApplyCommand={onApplyCommand} />
      </details>
      {selectedMap && project && (
        <p className="context-capacity-note">
          {actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index).active}/100 Action Point records used.{" "}
          {randomLevel?.rects.length ?? 0}/20 Random Rectangles active.
        </p>
      )}
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

function MapOutliner({
  project,
  selectedMap,
  onSelectMap
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  onSelectMap: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const maps = project?.maps ?? [];
  const filtered = normalizedQuery
    ? maps.filter((map) => {
        const label = `${map.name} ${map.levelType} ${map.index} ${map.render.tilesetId}`.toLowerCase();
        return label.includes(normalizedQuery);
      })
    : maps;
  const landCount = maps.filter((map) => map.levelType === "land").length;
  const dungeonCount = maps.filter((map) => map.levelType === "dungeon").length;
  return (
    <section className="context-panel map-outliner-panel">
      <div className="panel-header">
        <span>Scenario Maps</span>
        <small>{maps.length.toLocaleString()}</small>
      </div>
      <label className="context-field compact">
        <span>Current Map</span>
        <select value={selectedMap?.id ?? ""} onChange={(event) => onSelectMap(event.currentTarget.value)} disabled={!project}>
          {!project && <option value="">No project loaded</option>}
          {maps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      </label>
      <div className="map-outliner-meta">
        <span>{landCount} land</span>
        <span>{dungeonCount} dungeon</span>
        {selectedMap && <span>{selectedMap.render.tilesetId}</span>}
      </div>
      <input
        className="map-outliner-search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search maps..."
        aria-label="Search maps"
      />
      <ScrollArea className="map-outliner-list" aria-label="Scenario map list">
        {filtered.map((map) => (
          <button
            key={map.id}
            className={`map-outliner-row${map.id === selectedMap?.id ? " selected" : ""}`}
            type="button"
            onClick={() => onSelectMap(map.id)}
          >
            <span className={`map-type-badge ${map.levelType}`}>{map.levelType === "dungeon" ? "D" : "L"}</span>
            <span>
              <strong>{map.name}</strong>
              <small>{map.levelType} {map.index} | {map.render.tilesetId}</small>
            </span>
          </button>
        ))}
        {project && filtered.length === 0 && <p className="empty-copy compact">No maps match that search.</p>}
        {!project && <p className="empty-copy compact">Create or import a scenario to browse maps.</p>}
      </ScrollArea>
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
  const [paletteOpen, setPaletteOpen] = useState(false);
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
      <PaintTileSummary
        selectedTile={state.selectedTile}
        inspectedTile={state.selectedCell?.tile ?? null}
        atlas={atlas}
        selectedTileset={selectedTileset}
        onSelectTile={onSelectTile}
      />
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

function MapLevelSettings({
  map,
  randomLevel,
  onApplyCommand
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  if (!map) return <p className="empty-copy compact">Select a map to edit Realmz level flags.</p>;
  const commit = (fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>) => {
    onApplyCommand({
      kind: "updateRandomLevelSettings",
      label: "Update map level flags",
      levelType: map.levelType,
      levelIndex: map.index,
      fields
    });
  };
  return (
    <div className="map-level-settings">
      <MapNumberField label="Landlook" value={randomLevel?.landlook ?? map.render.landlook ?? (map.levelType === "land" ? 2 : -1)} onCommit={(landlook) => commit({ landlook })} />
      <label className="map-check-field">
        <input type="checkbox" checked={Boolean(randomLevel?.isDark)} onChange={(event) => commit({ isDark: event.currentTarget.checked })} />
        <span>Dark level</span>
      </label>
      <label className="map-check-field">
        <input type="checkbox" checked={Boolean(randomLevel?.useLos)} onChange={(event) => commit({ useLos: event.currentTarget.checked })} />
        <span>Use line of sight</span>
      </label>
      <small>{map.levelType === "dungeon" ? "Dungeon geometry stays evidence-only in this slice." : "Landlook changes update Realmz random-level metadata and render hints."}</small>
    </div>
  );
}

function PaintTileSummary({
  selectedTile,
  inspectedTile,
  atlas,
  selectedTileset,
  onSelectTile
}: {
  selectedTile: number;
  inspectedTile: number | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  onSelectTile: (tile: number) => void;
}) {
  return (
    <div className="paint-tile-summary">
      <button
        type="button"
        className="paint-tile-preview"
        style={{ background: tileColor(selectedTile) }}
        onClick={() => onSelectTile(selectedTile)}
        title={`Selected paint tile ${selectedTile}`}
      >
        {atlas && <TileSprite atlas={atlas} tile={selectedTile} />}
        <span>{selectedTile}</span>
      </button>
      <div>
        <strong>Paint tile {selectedTile}</strong>
        <small>{selectedTileset?.name ?? "No tileset loaded"}</small>
        {inspectedTile != null && <small>Selected cell tile {inspectedTile}</small>}
      </div>
    </div>
  );
}

function SelectionInspector({
  selection,
  map,
  project,
  onSelectEntity,
  onClearSelection,
  onApplyCommand
}: {
  selection: Selection;
  map: MapEntity | null;
  project: Project | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Selection Inspector</span>
        <button className="btn btn-ghost btn-xs" onClick={onClearSelection}>Core</button>
      </div>
      {selection.kind === "cell" && (
        <>
          {map && project && (
            <p className={`context-capacity-note${actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "" : " blocked"}`}>
              {actionPointCapacity(project.triggers, map.levelType, map.index).active}/100 Action Point records used on this map.
            </p>
          )}
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
          <MapDiagnostics diagnostics={cellDiagnostics(selection)} />
          <SelectionLinks
            map={map}
            triggers={selection.triggers}
            rects={selection.rects}
            records={selection.records}
            onSelectEntity={onSelectEntity}
          />
          {map && (
            <div className="context-action-stack">
              <button
                className="btn btn-primary btn-xs context-action-button"
                type="button"
                disabled={project ? !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate : false}
                title={project && !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "This map already uses all 100 Realmz Action Point records." : "Create an Action Point at the selected cell."}
                onClick={() => {
                  const recordIndex = nextActionPointRecordIndex(project?.triggers ?? [], map.levelType, map.index);
                  onApplyCommand({
                    kind: "createActionPoint",
                    label: `Create Action Point ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    x: selection.cell.x,
                    y: selection.cell.y
                  });
                  if (recordIndex != null) {
                    const source = map.levelType === "land" ? "Data DD" : "Data DDD";
                    onSelectEntity(selectEntityFromId(triggerEntityId(map.levelType, map.index, recordIndex, source)));
                  }
                }}
              >
                Create Action Point Here
              </button>
              <button
                className="btn btn-ghost btn-xs context-action-button"
                type="button"
                onClick={() => {
                  const rectIndex = nextAvailableRandomRectIndex(project, map.levelType, map.index);
                  onApplyCommand({
                    kind: "createRandomRect",
                    label: `Create Random Rectangle ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    rect: {
                      left: selection.cell.x,
                      top: selection.cell.y,
                      right: selection.cell.x,
                      bottom: selection.cell.y,
                      percent: 1000,
                      battleRange: [0, 0],
                      randomDoors: [0, 0, 0],
                      randomDoorPercent: [0, 0, 0],
                      only: false,
                      option: 0,
                      sound: 0,
                      text: 0
                    }
                  });
                  if (rectIndex != null) onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rectIndex}` });
                }}
                disabled={nextAvailableRandomRectIndex(project, map.levelType, map.index) == null}
              >
                Create Random Rectangle Here
              </button>
            </div>
          )}
        </>
      )}
      {selection.kind === "trigger" && (
        <TriggerSelectionDetails
          project={project}
          trigger={selection.trigger}
          onApplyCommand={onApplyCommand}
          onSelectEntity={onSelectEntity}
        />
      )}
      {selection.kind === "random" && (
        <RandomRectangleEditor map={map} rect={selection.rect} onApplyCommand={onApplyCommand} />
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

function MapDiagnostics({ diagnostics }: { diagnostics: string[] }) {
  if (diagnostics.length === 0) {
    return <div className="map-diagnostic-list ok"><span>Realmz-writable</span>No map-local blockers detected.</div>;
  }
  return (
    <div className="map-diagnostic-list">
      {diagnostics.map((diagnostic) => (
        <span key={diagnostic}>{diagnostic}</span>
      ))}
    </div>
  );
}

function cellDiagnostics(selection: Extract<Selection, { kind: "cell" }>) {
  const diagnostics: string[] = [];
  const tileLooksLikeActionMarker = Math.abs(selection.cell.tile) >= 1000;
  if (selection.triggers.length > 0 && !tileLooksLikeActionMarker) {
    diagnostics.push("Action Point exists here, but the tile does not look like an AP marker.");
  }
  if (tileLooksLikeActionMarker && selection.triggers.length === 0) {
    diagnostics.push("Tile looks like an AP marker, but no Action Point record resolves to this cell.");
  }
  for (const rect of selection.rects) {
    diagnostics.push(...randomRectDiagnostics(rect).map((message) => `Random Rectangle ${rect.rectIndex}: ${message}`));
  }
  return diagnostics;
}

function randomRectDiagnostics(rect: RandomLevel["rects"][number]) {
  const diagnostics: string[] = [];
  if (rect.left < 0 || rect.top < 0 || rect.right > 89 || rect.bottom > 89) diagnostics.push("Bounds are outside the 90x90 map.");
  if (rect.left > rect.right || rect.top > rect.bottom) diagnostics.push("Bounds are inverted.");
  if (rect.percent < 0 || rect.percent > 10000) diagnostics.push("Chance must be between 0 and 10000.");
  rect.randomDoorPercent.forEach((percent, index) => {
    if (percent < 0 || percent > 10000) diagnostics.push(`Door ${index + 1} percent must be between 0 and 10000.`);
  });
  if (rect.percent === 0 && rect.randomDoors.every((door) => door === 0)) diagnostics.push("Rectangle is effectively inactive.");
  return diagnostics;
}

function TriggerSelectionDetails({
  project,
  trigger,
  onApplyCommand,
  onSelectEntity
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
  const isActionPoint = trigger.source !== "Data ED3" && trigger.levelType && trigger.levelIndex != null;
  const move = (patch: Partial<{ x: number; y: number }>) => {
    const levelType = trigger.levelType;
    const levelIndex = trigger.levelIndex;
    if (!isActionPoint || !trigger.coordinate || !levelType || levelIndex == null) return;
    onApplyCommand({
      kind: "moveActionPoint",
      label: "Move Action Point",
      triggerId: trigger.id,
      levelType,
      levelIndex,
      x: patch.x ?? trigger.coordinate.x,
      y: patch.y ?? trigger.coordinate.y
    });
  };
  return (
    <>
      <InfoGrid
        rows={[
          ["Type", trigger.source === "Data ED3" ? "Extra Action Point" : "Action Point"],
          ["Record", `${trigger.source} #${trigger.recordIndex}`],
          ["Edit State", isActionPoint ? "Realmz-writable" : "macro"]
        ]}
      />
      {isActionPoint && trigger.coordinate && (
        <div className="map-authoring-form">
          <MapNumberField label="Cell X" value={trigger.coordinate.x} min={0} max={89} onCommit={(x) => move({ x })} />
          <MapNumberField label="Cell Y" value={trigger.coordinate.y} min={0} max={89} onCommit={(y) => move({ y })} />
          <MapNumberField label="% Chance" value={trigger.percent} min={0} max={100} onCommit={(percent) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point chance", triggerId: trigger.id, fields: { percent } })} />
          <MapNumberField label="Goto Level" value={trigger.landid ?? 0} min={0} max={255} onCommit={(landid) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target level", triggerId: trigger.id, fields: { landid } })} />
          <MapNumberField label="Goto X" value={trigger.targetX ?? 0} min={0} max={89} onCommit={(targetX) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target X", triggerId: trigger.id, fields: { targetX } })} />
          <MapNumberField label="Goto Y" value={trigger.targetY ?? 0} min={0} max={89} onCommit={(targetY) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target Y", triggerId: trigger.id, fields: { targetY } })} />
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onApplyCommand({ kind: "deleteTrigger", label: "Clear Action Point", triggerId: trigger.id })}>
            Clear to reusable slot
          </button>
        </div>
      )}
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

function RandomRectangleEditor({
  map,
  rect,
  onApplyCommand
}: {
  map: MapEntity | null;
  rect: RandomLevel["rects"][number];
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  if (!map) return null;
  const update = (fields: Partial<Omit<RandomLevel["rects"][number], "rectIndex">>) => {
    onApplyCommand({
      kind: "updateRandomRect",
      label: `Update Random Rectangle ${rect.rectIndex}`,
      levelType: map.levelType,
      levelIndex: map.index,
      rectIndex: rect.rectIndex,
      fields
    });
  };
  const updateDoor = (index: number, value: number) => {
    const randomDoors = [rect.randomDoors[0] ?? 0, rect.randomDoors[1] ?? 0, rect.randomDoors[2] ?? 0];
    randomDoors[index] = value;
    update({ randomDoors });
  };
  const updateDoorPercent = (index: number, value: number) => {
    const randomDoorPercent = [rect.randomDoorPercent[0] ?? 0, rect.randomDoorPercent[1] ?? 0, rect.randomDoorPercent[2] ?? 0];
    randomDoorPercent[index] = value;
    update({ randomDoorPercent });
  };
  return (
    <div className="map-random-editor">
      <InfoGrid
        rows={[
          ["Rectangle", rect.rectIndex],
          ["Edit State", "Realmz-writable"],
          ["Source", map.levelType === "land" ? "Data RD" : "Data RDD"]
        ]}
      />
      <MapDiagnostics diagnostics={randomRectDiagnostics(rect)} />
      <div className="map-authoring-form">
        <MapNumberField label="Left" value={rect.left} min={0} max={89} onCommit={(left) => update({ left })} />
        <MapNumberField label="Top" value={rect.top} min={0} max={89} onCommit={(top) => update({ top })} />
        <MapNumberField label="Right" value={rect.right} min={0} max={89} onCommit={(right) => update({ right })} />
        <MapNumberField label="Bottom" value={rect.bottom} min={0} max={89} onCommit={(bottom) => update({ bottom })} />
        <MapNumberField label="Chance / 10000" value={rect.percent} min={0} max={10000} onCommit={(percent) => update({ percent })} />
        <MapNumberField label="Battle Low" value={rect.battleRange[0] ?? 0} onCommit={(value) => update({ battleRange: [value, rect.battleRange[1] ?? value] })} />
        <MapNumberField label="Battle High" value={rect.battleRange[1] ?? 0} onCommit={(value) => update({ battleRange: [rect.battleRange[0] ?? value, value] })} />
        <MapNumberField label="Option" value={rect.option} min={-128} max={127} onCommit={(option) => update({ option })} />
        <MapNumberField label="Sound" value={rect.sound} onCommit={(sound) => update({ sound })} />
        <MapNumberField label="Text" value={rect.text} onCommit={(text) => update({ text })} />
        <label className="map-check-field">
          <input type="checkbox" checked={rect.only} onChange={(event) => update({ only: event.currentTarget.checked })} />
          <span>Only this rectangle can fire</span>
        </label>
      </div>
      <details className="context-section" open>
        <summary><span>Extra Action Point Doors</span><b>3</b></summary>
        <div className="map-authoring-form">
          {[0, 1, 2].map((index) => (
            <div className="map-door-pair" key={index}>
              <MapNumberField label={`Door ${index + 1}`} value={rect.randomDoors[index] ?? 0} onCommit={(value) => updateDoor(index, value)} />
              <MapNumberField label={`Door ${index + 1} %`} value={rect.randomDoorPercent[index] ?? 0} min={0} max={10000} onCommit={(value) => updateDoorPercent(index, value)} />
            </div>
          ))}
        </div>
      </details>
      <button
        className="btn btn-ghost btn-xs context-action-button"
        type="button"
        onClick={() => onApplyCommand({ kind: "clearRandomRect", label: `Clear Random Rectangle ${rect.rectIndex}`, levelType: map.levelType, levelIndex: map.index, rectIndex: rect.rectIndex })}
      >
        Clear Random Rectangle
      </button>
      <details className="context-section">
        <summary><span>Source Evidence</span><b>{map.levelType === "land" ? "Data RD" : "Data RDD"}</b></summary>
        <RandomRectangleForm rect={rect} />
      </details>
    </div>
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

function nextAvailableRandomRectIndex(project: Project | null, levelType: MapEntity["levelType"], levelIndex: number) {
  const level = project?.randomLevels.find((candidate) => candidate.levelType === levelType && candidate.levelIndex === levelIndex);
  const used = new Set((level?.rects ?? []).map((rect) => rect.rectIndex));
  for (let index = 0; index < 20; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function MapNumberField({
  label,
  value,
  onCommit,
  min = -32768,
  max = 32767
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampNumber(Number(draft), min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="map-number-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function clampNumber(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, numeric));
}

function actionSlotLabel(slot: SemanticEntity) {
  const usage = slot.summary.edcdUsage as { summary?: string } | undefined;
  return usage?.summary ?? String(slot.summary.label ?? `opcode ${slot.summary.code ?? "?"}`);
}
