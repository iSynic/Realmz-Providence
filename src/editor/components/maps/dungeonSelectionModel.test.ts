import { describe, expect, it } from "vitest";
import { DUNGEON_CELL_FLAG_DEFINITIONS } from "../../map/dungeonCellFlags";
import type { MapEntity } from "../../types";
import {
  DUNGEON_FLAG_SECTIONS,
  dungeonFlagDefinitionsForSection,
  resolveDungeonSelection,
  summarizeDungeonMasks
} from "./dungeonSelectionModel";
import type { MapSelection } from "./mapSelectionModel";

const map = {
  id: "dungeon:0",
  levelType: "dungeon",
  index: 0,
  width: 2,
  height: 2,
  tiles: [1, 2, 4, 8]
} as unknown as MapEntity;

describe("dungeonSelectionModel", () => {
  it("assigns every authorable flag to one presentation section", () => {
    const groupedIds = DUNGEON_FLAG_SECTIONS.flatMap((section) => dungeonFlagDefinitionsForSection(section).map((definition) => definition.id));
    expect([...groupedIds].sort()).toEqual(DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => definition.id).sort());
    expect(new Set(groupedIds).size).toBe(groupedIds.length);
  });

  it("uses the current map value for a selected cell", () => {
    const selection = {
      kind: "cell",
      cell: { x: 1, y: 0, tile: 999 },
      triggers: [],
      rects: [],
      records: []
    } as Extract<MapSelection, { kind: "cell" }>;

    const model = resolveDungeonSelection(map, selection);
    expect(model.selectedCellTile).toBe(2);
    expect(model.scopeLabel).toBe("1, 0");
    expect(summarizeDungeonMasks(model.values)).toBe("0x0002");
  });

  it("resolves every cell in a selected dungeon region", () => {
    const selection = {
      kind: "region",
      region: { left: 0, top: 0, right: 1, bottom: 1 }
    } as Extract<MapSelection, { kind: "region" }>;

    const model = resolveDungeonSelection(map, selection);
    expect(model.cells).toHaveLength(4);
    expect(model.values).toEqual([1, 2, 4, 8]);
    expect(model.scopeTitle).toBe("Selected Region");
  });
});
