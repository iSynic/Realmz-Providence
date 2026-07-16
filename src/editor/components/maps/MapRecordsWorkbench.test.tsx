import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MapRecord, Project } from "../../types";
import { filterPlayerMapRecords, MapRecordsWorkbench } from "./MapRecordsWorkbench";

function playerMap(overrides: Partial<MapRecord>): MapRecord {
  return {
    id: 0,
    startX: 12,
    startY: 18,
    level: 0,
    pictId: 0,
    iconSize: 32,
    show: 0,
    isDungeon: false,
    rect: { top: 0, left: 0, bottom: 0, right: 0 },
    note: "",
    ...overrides
  };
}

describe("MapRecordsWorkbench", () => {
  it("filters player maps by names, slots, destinations, media, and notes", () => {
    const records = [
      playerMap({ id: 3, primaryName: "Harbor Chart", level: 2, startX: 8, startY: 9 }),
      playerMap({ id: 7, primaryName: "Bell Depths", level: 1, isDungeon: true, pictId: 30128 }),
      playerMap({ id: 9, primaryName: "Keeper Journal", show: -808, note: "Drowned host testimony" })
    ];

    expect(filterPlayerMapRecords(records, "harbor").map((record) => record.id)).toEqual([3]);
    expect(filterPlayerMapRecords(records, "map 7 dungeon 1").map((record) => record.id)).toEqual([7]);
    expect(filterPlayerMapRecords(records, "pict 30128").map((record) => record.id)).toEqual([7]);
    expect(filterPlayerMapRecords(records, "text -808 drowned").map((record) => record.id)).toEqual([9]);
  });

  it("uses the shared searchable browser and stable empty state", () => {
    const project = { maps: [], mapRecords: [] } as unknown as Project;
    const markup = renderToStaticMarkup(
      <MapRecordsWorkbench
        project={project}
        selectedMap={null}
        mapRecords={[]}
        onSelectEntity={() => undefined}
        onApplyCommand={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Search player maps"');
    expect(markup).toContain('aria-label="Player maps"');
    expect(markup).toContain("0 of 0 player maps");
    expect(markup).toContain("No player maps for this level");
  });
});
