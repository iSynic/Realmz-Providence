import { describe, expect, it } from "vitest";
import type { MapEntity } from "../../types";
import { mapCellDiagnostics, mapCellSummaryRows } from "./mapCellInspectorModel";
import type { MapSelection } from "./mapSelectionModel";

const cellSelection: Extract<MapSelection, { kind: "cell" }> = {
  kind: "cell",
  cell: { x: 12, y: 18, tile: 60 },
  triggers: [],
  rects: [],
  records: []
};

describe("mapCellInspectorModel", () => {
  it("keeps the cell summary focused on identity and linked-record counts", () => {
    expect(mapCellSummaryRows(cellSelection, null, null)).toEqual([
      ["Cell", "12, 18"],
      ["Raw Tile", 60],
      ["Render Tile", "unknown"],
      ["Tile Group", "unknown"],
      ["Special/Icon", "none"],
      ["Action Points", 0],
      ["Random Rects", 0],
      ["Player Maps", 0]
    ]);
  });

  it("reports Action Point markers that have no matching record", () => {
    const map = { levelType: "land", index: 0 } as MapEntity;
    const markerSelection = {
      ...cellSelection,
      cell: { ...cellSelection.cell, tile: 10000 }
    };

    expect(mapCellDiagnostics(markerSelection, map, null)).toContain(
      "Tile looks like an AP marker, but no Action Point record resolves to this cell."
    );
  });
});
