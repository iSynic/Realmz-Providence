import { describe, expect, it, vi } from "vitest";
import type { MapEntity, ProjectCommand } from "../../types";
import { applyRegionPaintOperation, buildFillRegionOperation } from "./mapRegionUiUtils";

const map = {
  id: "land:0",
  source: "Data LD",
  levelType: "land",
  index: 0,
  name: "Land level 0",
  width: 2,
  height: 2,
  tiles: [1, 2, 3, 4],
  render: { tilesetId: "plains", landlook: 0, mode: "land" }
} as MapEntity;

describe("region paint operations", () => {
  it("builds an inspectable operation before applying its selected changes", () => {
    const operation = buildFillRegionOperation(
      map,
      { left: 0, top: 0, right: 1, bottom: 1 },
      9,
      null,
      "single",
      "all",
      null,
      100
    );

    expect(operation?.changes).toHaveLength(4);
    expect(operation?.changes.map(({ x, y, from, to }) => ({ x, y, from, to }))).toEqual([
      { x: 0, y: 0, from: 1, to: 9 },
      { x: 1, y: 0, from: 3, to: 9 },
      { x: 0, y: 1, from: 2, to: 9 },
      { x: 1, y: 1, from: 4, to: 9 }
    ]);

    const apply = vi.fn<(command: ProjectCommand) => void>();
    applyRegionPaintOperation(map, operation, operation?.changes.slice(0, 2) ?? [], apply);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      kind: "paintTiles",
      label: "Fill region 0,0-1,1",
      cells: operation?.changes.slice(0, 2)
    }));
  });

  it("does not create history when every proposed change is protected", () => {
    const operation = buildFillRegionOperation(
      map,
      { left: 0, top: 0, right: 0, bottom: 0 },
      9,
      null,
      "single",
      "all",
      null,
      100
    );
    const apply = vi.fn<(command: ProjectCommand) => void>();
    applyRegionPaintOperation(map, operation, [], apply);
    expect(apply).not.toHaveBeenCalled();
  });
});
