import { useEffect, useRef } from "react";
import { DUNGEON_CELL_FLAG_MASKS } from "../../map/dungeonCellFlags";
import type { EditorState } from "../../store";
import type { DungeonCellFlag, DungeonCellFlagState, TilesetAsset } from "../../types";
import { CollapsibleSection } from "../../ui";
import { TileSwatch } from "../TileSwatch";
import { DUNGEON_FLAG_SECTIONS, dungeonFlagDefinitionsForSection } from "./dungeonSelectionModel";

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

export function DungeonFlagSections({
  atlas,
  selectedTileset,
  icons,
  storageKey,
  stateFor,
  onChange
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  storageKey: string;
  stateFor: (flag: DungeonCellFlag) => DungeonCellFlagState;
  onChange: (flag: DungeonCellFlag, enabled: boolean, label: string) => void;
}) {
  return (
    <>
      {DUNGEON_FLAG_SECTIONS.map((section) => {
        const definitions = dungeonFlagDefinitionsForSection(section);
        const activeCount = definitions.filter((definition) => stateFor(definition.id) !== "off").length;
        return (
          <CollapsibleSection
            key={section.id}
            title={section.title}
            eyebrow={section.eyebrow}
            count={`${activeCount}/${definitions.length}`}
            density="compact"
            storageKey={`${storageKey}.${section.id}.open`}
            defaultOpen={section.defaultOpen}
          >
            <div className="dungeon-flag-grid">
              {definitions.map((definition) => (
                <DungeonFlagToggle
                  key={definition.id}
                  label={definition.label}
                  group={definition.group}
                  state={stateFor(definition.id)}
                  previewTile={DUNGEON_FLAG_PREVIEW_TILES[definition.id]}
                  atlas={atlas}
                  selectedTileset={selectedTileset}
                  icons={icons}
                  onChange={(enabled) => onChange(definition.id, enabled, definition.label)}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </>
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
  state: DungeonCellFlagState;
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
