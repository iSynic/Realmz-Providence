import { describe, expect, it } from "vitest";
import { randomRectEntityId } from "../../map/geometry";
import type { MapEntity, RandomLevel, SemanticEntity } from "../../types";
import {
  filterVisibleMapRecords,
  filterVisibleRandomLevel,
  semanticMapRecordId
} from "./useMapCanvasVisibility";

describe("map canvas visibility", () => {
  it("filters random rectangles by their stable entity IDs", () => {
    const map = { id: "land:0", levelType: "land", index: 0 } as MapEntity;
    const randomLevel = { rects: [{ rectIndex: 1 }, { rectIndex: 2 }] } as RandomLevel;

    expect(filterVisibleRandomLevel(map, randomLevel, false, [])).toBeNull();
    expect(filterVisibleRandomLevel(map, randomLevel, true, [])).toBe(randomLevel);
    expect(filterVisibleRandomLevel(map, randomLevel, true, [randomRectEntityId(map, 2)])?.rects).toEqual([{ rectIndex: 2 }]);
  });

  it("uses semantic and fallback map record identities", () => {
    const records = [
      { id: "map-record:4", summary: { id: 4.8 } },
      { id: "map-record:7", summary: { id: "source-backed" } },
      { id: "message:9", summary: { id: "not-a-map" } }
    ] as unknown as SemanticEntity[];

    expect(semanticMapRecordId(records[0])).toBe(4);
    expect(semanticMapRecordId(records[1])).toBe(7);
    expect(semanticMapRecordId(records[2])).toBeNull();
    expect(filterVisibleMapRecords(records, false, [4])).toEqual([]);
    expect(filterVisibleMapRecords(records, true, [7])).toEqual([records[1]]);
  });
});
