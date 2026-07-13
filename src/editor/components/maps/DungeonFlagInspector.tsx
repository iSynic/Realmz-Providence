import { useEffect, useRef } from "react";
import { activeManagedDungeonFlags, DUNGEON_CELL_FLAG_DEFINITIONS, DUNGEON_CLEAR_TO_WALL_FLAGS, DUNGEON_CELL_FLAG_MASKS, dungeonCellMask, dungeonDrawFlagsFromValue, dungeonFlagState } from "../../map/dungeonCellFlags";
import { mapTileIndex, tileValueAt } from "../../map/geometry";
import { rectCells } from "../../map/regionPaint";
import type { EditorState } from "../../store";
import type { DungeonCellFlag, MapEntity, ProjectCommand, TilesetAsset } from "../../types";
import { InfoGrid } from "../InfoGrid";
import { TileSwatch } from "../TileSwatch";
import { regionLabel } from "./mapRegionUiUtils";
import type { MapSelection } from "./mapSelectionModel";

const DUNGEON_FLAG_PREVIEW_TILES: Partial<Record<DungeonCellFlag, number>> = {
  wall: DUNGEON_CELL_FLAG_MASKS.wall,
  horizontalDoor: DUNGEON_CELL_FLAG_MASKS.horizontalDoor,
  verticalDoor: DUNGEON_CELL_FLAG_MASKS.verticalDoor,
  stairs: DUNGEON_CELL_FLAG_MASKS.stairs,
  column: DUNGEON_CELL_FLAG_MASKS.column,
  unmapped: DUNGEON_CELL_FLAG_MASKS.unmapped,
  allowMoveNorth: DUNGEON_CELL_FLAG_MASKS.allowMoveNorth,
  allowMoveEast: DUNGEON_CELL_FLAG_MASKS.allowMoveEast,
  allowMoveSouth: DUNGEON_CELL_FLAG_MASKS.allowMoveSouth,
  allowMoveWest: DUNGEON_CELL_FLAG_MASKS.allowMoveWest,
  archway: DUNGEON_CELL_FLAG_MASKS.archway,
  noWallInBattle: DUNGEON_CELL_FLAG_MASKS.noWallInBattle
};

export function DungeonDrawInspector({
  atlas,
  selectedTileset,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
}) {
  const setFlag = (flag: DungeonCellFlag, enabled: boolean) => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, [flag]: enabled });
  };
  return (
    <section className="context-panel dungeon-draw-inspector">
      <div className="panel-header">
        <span>Dungeon Draw</span>
        <b>Flags</b>
      </div>
      <div className="selection-summary-card">
        <strong>Draw flags</strong>
        <span>Choose the cell flags Draw will place on the dungeon canvas.</span>
      </div>
      <div className="dungeon-flag-actions">
        <button
          className="btn btn-ghost btn-xs"
          type="button"
          onClick={() => onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...DUNGEON_CLEAR_TO_WALL_FLAGS })}
        >
          Clear To Wall
        </button>
      </div>
      <div className="dungeon-flag-grid">
        {DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => (
          <DungeonFlagToggle
            key={definition.id}
            label={definition.label}
            group={definition.group}
            state={dungeonDrawFlags[definition.id] ? "on" : "off"}
            previewTile={DUNGEON_FLAG_PREVIEW_TILES[definition.id]}
            atlas={atlas}
            selectedTileset={selectedTileset}
            icons={icons}
            onChange={(enabled) => setFlag(definition.id, enabled)}
          />
        ))}
      </div>
    </section>
  );
}

export function DungeonCellFlagEditor({
  map,
  selection,
  atlas,
  selectedTileset,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags,
  onApplyCommand
}: {
  map: MapEntity;
  selection: Extract<MapSelection, { kind: "cell" }> | Extract<MapSelection, { kind: "region" }>;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const selectedCell = selection.kind === "cell"
    ? {
        ...selection.cell,
        index: mapTileIndex(map, selection.cell.x, selection.cell.y),
        tile: tileValueAt(map, selection.cell.x, selection.cell.y)
      }
    : null;
  const cells = selection.kind === "cell"
    ? selectedCell ? [selectedCell] : []
    : rectCells(map, selection.region);
  const values = cells.map((cell) => cell.tile);
  const managedFlags = activeManagedDungeonFlags(values);
  const scopeLabel = selection.kind === "cell"
    ? `Cell ${selection.cell.x}, ${selection.cell.y}`
    : `${regionLabel(selection.region)} (${cells.length} cells)`;
  const selectedCellTile = selectedCell?.tile ?? null;
  useEffect(() => {
    if (selection.kind !== "cell" || selectedCellTile == null) return;
    onSetDungeonDrawFlags(dungeonDrawFlagsFromValue(selectedCellTile));
  }, [onSetDungeonDrawFlags, selectedCellTile, selection.kind]);
  const applyFlags = (label: string, flags: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>["flags"]) => {
    onApplyCommand({
      kind: "updateDungeonCellFlags",
      label,
      mapId: map.id,
      flags,
      cells: cells.map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile }))
    });
  };
  const setDrawAndApplyFlags = (
    label: string,
    flags: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>["flags"]
  ) => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...flags });
    applyFlags(label, flags);
  };
  const clearDrawFlags = () => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...DUNGEON_CLEAR_TO_WALL_FLAGS });
    applyFlags("Clear selected dungeon cells", DUNGEON_CLEAR_TO_WALL_FLAGS);
  };

  return (
    <div className="dungeon-flag-editor">
      <div className="selection-summary-card">
        <strong>{scopeLabel}</strong>
        <span>{selection.kind === "region" ? "Batch edit dungeon cell flags" : "Edit dungeon cell flags"}; Draw uses these toggles.</span>
      </div>
      <div className="dungeon-flag-actions">
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => setDrawAndApplyFlags("Map selected dungeon cells", { unmapped: false })}>
          Map Selected
        </button>
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => setDrawAndApplyFlags("Unmap selected dungeon cells", { unmapped: true })}>
          Unmap Selected
        </button>
        <button className="btn btn-ghost btn-xs" type="button" onClick={clearDrawFlags}>
          Clear To Wall
        </button>
      </div>
      <div className="dungeon-flag-grid">
        {DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => (
          <DungeonFlagToggle
            key={definition.id}
            label={definition.label}
            group={definition.group}
            state={dungeonFlagState(values, definition.id)}
            previewTile={DUNGEON_FLAG_PREVIEW_TILES[definition.id]}
            atlas={atlas}
            selectedTileset={selectedTileset}
            icons={icons}
            onChange={(enabled) => setDrawAndApplyFlags(`${enabled ? "Set" : "Clear"} ${definition.label}`, { [definition.id]: enabled })}
          />
        ))}
      </div>
      {managedFlags.length > 0 && (
        <div className="dungeon-managed-flags">
          <span>Preserved</span>
          {managedFlags.map((flag) => <b key={flag.id}>{flag.label}</b>)}
        </div>
      )}
      <details className="context-section dungeon-technical-details">
        <summary><span>Technical Details</span><b>{cells.length}</b></summary>
        <InfoGrid
          rows={[
            ["Raw values", summarizeRawDungeonValues(values)],
            ["Masks", summarizeDungeonMasks(values)]
          ]}
        />
      </details>
    </div>
  );
}

function DungeonFlagToggle({
  label,
  group,
  state,
  previewTile,
  atlas,
  selectedTileset,
  icons,
  onChange
}: {
  label: string;
  group: string;
  state: "on" | "off" | "mixed";
  previewTile: number | undefined;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  onChange: (enabled: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <label className={`dungeon-flag-toggle ${state}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={state === "on"}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="dungeon-flag-preview">
        {previewTile != null
          ? <TileSwatch atlas={atlas} icons={icons} tile={previewTile} tileset={selectedTileset} showBadge={false} allowIconFallback={false} />
          : <span className="dungeon-flag-preview-empty" />}
      </span>
      <span>{label}</span>
      <small>{state === "mixed" ? "mixed" : group}</small>
    </label>
  );
}

function summarizeRawDungeonValues(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values)];
  if (unique.length === 1) return String(unique[0]);
  return `${unique.length} values`;
}

function summarizeDungeonMasks(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values.map((value) => `0x${dungeonCellMask(value).toString(16).padStart(4, "0")}`))];
  return unique.length === 1 ? unique[0] : `${unique.length} masks`;
}
