import { useEffect } from "react";
import {
  DUNGEON_CLEAR_TO_WALL_FLAGS,
  dungeonDrawFlagsFromValue,
  dungeonFlagState
} from "../../map/dungeonCellFlags";
import type { EditorState } from "../../store";
import type { DungeonCellFlag, MapEntity, ProjectCommand, TilesetAsset } from "../../types";
import { CollapsibleSection, PanelSection } from "../../ui";
import { InfoGrid } from "../InfoGrid";
import { DungeonFlagSections } from "./DungeonFlagControls";
import {
  resolveDungeonSelection,
  summarizeDungeonMasks,
  summarizeRawDungeonValues
} from "./dungeonSelectionModel";
import type { MapSelection } from "./mapSelectionModel";

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
  const activeCount = Object.values(dungeonDrawFlags).filter(Boolean).length;
  return (
    <section className="context-panel dungeon-draw-inspector">
      <div className="panel-header">
        <span>Dungeon Draw</span>
        <b>Flags</b>
      </div>
      <div className="dungeon-flag-editor dungeon-draw-editor">
        <PanelSection title="Draw Preset" eyebrow="dungeon flags" count={`${activeCount} active`} density="compact">
          <p className="empty-copy compact">These flags are applied together when Draw changes a dungeon cell.</p>
          <div className="dungeon-flag-actions">
            <button
              className="btn btn-ghost btn-xs"
              type="button"
              onClick={() => onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...DUNGEON_CLEAR_TO_WALL_FLAGS })}
            >
              Clear To Wall
            </button>
          </div>
        </PanelSection>
        <DungeonFlagSections
          atlas={atlas}
          selectedTileset={selectedTileset}
          icons={icons}
          storageKey="maps.dungeon.drawFlags"
          stateFor={(flag) => dungeonDrawFlags[flag] ? "on" : "off"}
          onChange={(flag, enabled) => onSetDungeonDrawFlags({ ...dungeonDrawFlags, [flag]: enabled })}
        />
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
  const model = resolveDungeonSelection(map, selection);
  useEffect(() => {
    if (selection.kind !== "cell" || model.selectedCellTile == null) return;
    onSetDungeonDrawFlags(dungeonDrawFlagsFromValue(model.selectedCellTile));
  }, [model.selectedCellTile, onSetDungeonDrawFlags, selection.kind]);

  const applyFlags = (label: string, flags: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>["flags"]) => {
    onApplyCommand({
      kind: "updateDungeonCellFlags",
      label,
      mapId: map.id,
      flags,
      cells: model.cells.map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile }))
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
    <div className="dungeon-flag-editor dungeon-selection-editor">
      <PanelSection
        title={model.scopeTitle}
        eyebrow={model.scopeLabel}
        count={`${model.cells.length} cell${model.cells.length === 1 ? "" : "s"}`}
        density="compact"
      >
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
      </PanelSection>
      <DungeonFlagSections
        atlas={atlas}
        selectedTileset={selectedTileset}
        icons={icons}
        storageKey="maps.dungeon.selectionFlags"
        stateFor={(flag) => dungeonFlagState(model.values, flag)}
        onChange={(flag, enabled, label) => setDrawAndApplyFlags(`${enabled ? "Set" : "Clear"} ${label}`, { [flag]: enabled })}
      />
      {model.managedFlags.length > 0 && (
        <PanelSection title="Preserved Markers" eyebrow="runtime-owned" count={String(model.managedFlags.length)} density="compact">
          <div className="dungeon-managed-flags">
            {model.managedFlags.map((flag) => <b key={flag.id}>{flag.label}</b>)}
          </div>
        </PanelSection>
      )}
      <CollapsibleSection
        title="Technical Details"
        eyebrow="raw dungeon fields"
        count={String(model.cells.length)}
        density="compact"
        storageKey="maps.dungeon.selectionTechnical.open"
        defaultOpen={false}
      >
        <InfoGrid
          rows={[
            ["Raw values", summarizeRawDungeonValues(model.values)],
            ["Masks", summarizeDungeonMasks(model.values)]
          ]}
        />
      </CollapsibleSection>
    </div>
  );
}
