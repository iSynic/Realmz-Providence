import { describe, expect, it } from "vitest";
import type { MapEntity, MapPaintIntent } from "../types";
import {
  buildConnectedSelectionClearPlan,
  buildConnectedSelectionFillPlan,
  buildConnectedSelectionReplacePlan,
  connectedSelectionPaintCommand,
  connectedSelectionSmartTerrainCommand
} from "./connectedSelectionActions";

describe("connected selection actions", () => {
  it("fills the selection with deterministic group variation", () => {
    const map = landMap([
      [1, 2],
      [3, 4]
    ]);
    const plan = buildConnectedSelectionFillPlan(map, [{ x: 1, y: 1 }, { x: 0, y: 0 }], paintIntent({
      variation: "cycle-group",
      variationTiles: [7, 8]
    }));

    expect(plan.selectedCount).toBe(2);
    expect(plan.changes.map(({ x, y, from, to }) => ({ x, y, from, to }))).toEqual([
      { x: 0, y: 0, from: 1, to: 7 },
      { x: 1, y: 1, from: 4, to: 8 }
    ]);
  });

  it("replaces only the requested source tile", () => {
    const map = landMap([[1, 2, 1]]);
    const plan = buildConnectedSelectionReplacePlan(
      map,
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      1,
      paintIntent()
    );

    expect(plan.selectedCount).toBe(3);
    expect(plan.changes.map(({ x, from, to }) => ({ x, from, to }))).toEqual([
      { x: 0, from: 1, to: 9 },
      { x: 2, from: 1, to: 9 }
    ]);
  });

  it("clears non-base cells and suppresses no-op commands", () => {
    const map = landMap([[156, 4, 156]]);
    const plan = buildConnectedSelectionClearPlan(
      map,
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      null
    );

    expect(plan.changes).toEqual([{ x: 1, y: 0, index: 1, from: 4, to: 156 }]);
    expect(connectedSelectionPaintCommand(map, "Clear selected cells", plan)?.cells).toHaveLength(1);
    expect(connectedSelectionPaintCommand(map, "Clear selected cells", buildConnectedSelectionClearPlan(map, [{ x: 0, y: 0 }], null))).toBeNull();
  });

  it("deduplicates and ignores invalid selected cells", () => {
    const map = landMap([[1, 1]]);
    const plan = buildConnectedSelectionFillPlan(
      map,
      [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 }],
      paintIntent()
    );

    expect(plan.selectedCount).toBe(1);
    expect(plan.changes).toHaveLength(1);
  });

  it("applies a smart terrain plan as one paint command", () => {
    const map = landMap([[1]]);
    const command = connectedSelectionSmartTerrainCommand(map, "water", {
      cells: [{ x: 0, y: 0, index: 0, from: 1, to: 60, role: "center" }],
      skipped: [],
      changedCount: 1,
      skippedCount: 0,
      profileConfidence: "reviewed-rules",
      reason: null
    });

    expect(command).toEqual({
      kind: "paintTiles",
      mapId: "land:0",
      label: "Apply water terrain to selected cells",
      cells: [{ x: 0, y: 0, index: 0, from: 1, to: 60 }]
    });
  });
});

function paintIntent(overrides: Partial<MapPaintIntent> = {}): MapPaintIntent {
  return {
    selectedTile: 9,
    selectedTileset: null,
    variation: "single",
    activeGroupId: "all",
    variationTiles: null,
    seed: 123,
    ...overrides
  };
}

function landMap(rows: number[][]) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return {
    id: "land:0",
    levelType: "land",
    width,
    height,
    render: { mode: "land-atlas", landlook: 0 },
    tiles: Array.from({ length: width }, (_, x) => rows.map((row) => row[x])).flat()
  } as MapEntity;
}
