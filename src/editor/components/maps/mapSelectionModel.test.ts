import { describe, expect, it } from "vitest";
import type { MapEntity, MapRegionSelection, Project, RandomLevel, SelectedEntity, SemanticEntity, TriggerRecord } from "../../types";
import { triggerEntityId } from "../../utils";
import { nextAvailableRandomRectIndex, resolveMapSelection, scriptedTileChangesForCell } from "./mapSelectionModel";

const map = {
  id: "land:0",
  levelType: "land",
  index: 0,
  width: 90,
  height: 90,
  tiles: []
} as unknown as MapEntity;

const trigger = {
  id: "trigger-3",
  source: "Data DD",
  levelType: "land",
  levelIndex: 0,
  recordIndex: 3,
  coordinate: { x: 5, y: 6 },
  actions: []
} as unknown as TriggerRecord;

const rect = {
  rectIndex: 4,
  left: 4,
  top: 5,
  right: 7,
  bottom: 8
} as unknown as RandomLevel["rects"][number];

const mapRecord = {
  id: "player-map:2",
  label: "Player Map 2",
  type: "player map",
  summary: { pictId: 0, show: 0, level: 0, startX: 4, startY: 5, isDungeon: false, iconSize: 32 }
} as unknown as SemanticEntity;

describe("resolveMapSelection", () => {
  it("keeps region selection authoritative", () => {
    const region = { left: 1, top: 2, right: 3, bottom: 4 } as unknown as MapRegionSelection;
    const selection = resolveMapSelection(map, null, { x: 5, y: 6, tile: 10 }, region, [trigger], null, []);
    expect(selection).toEqual({ kind: "region", region });
  });

  it("resolves selected map records before the selected cell", () => {
    const selected = { type: "trigger", id: triggerEntityId("land", 0, 3, "Data DD") } as SelectedEntity;
    const selection = resolveMapSelection(map, selected, { x: 1, y: 1, tile: 10 }, null, [trigger], null, []);
    expect(selection).toEqual({ kind: "trigger", trigger });
  });

  it("aggregates cell Action Points, random rectangles, and map records", () => {
    const randomLevel = { levelType: "land", levelIndex: 0, rects: [rect] } as unknown as RandomLevel;
    const selection = resolveMapSelection(map, null, { x: 5, y: 6, tile: 10 }, null, [trigger], randomLevel, [mapRecord]);
    expect(selection).toMatchObject({
      kind: "cell",
      triggers: [trigger],
      rects: [rect],
      records: [mapRecord]
    });
  });
});

describe("map selection commands", () => {
  it("finds scripted tile changes targeting the selected cell", () => {
    const scriptedTrigger = {
      ...trigger,
      actions: [
        { slot: 2, code: 12, id: 5282, label: "Change Land Tile" },
        { slot: 3, code: 9, id: 99, label: "Play Sound" }
      ]
    } as unknown as TriggerRecord;
    const project = {
      triggers: [scriptedTrigger],
      extracodes: [{ id: 5282, values: [0, 5, 6] }]
    } as unknown as Project;

    expect(scriptedTileChangesForCell(project, map, { x: 5, y: 6 })).toEqual([{
      entityId: triggerEntityId("land", 0, 3, "Data DD"),
      slot: 2,
      label: "Change Land Tile targets 5,6"
    }]);
  });

  it("allocates the first reusable random rectangle slot", () => {
    const project = {
      randomLevels: [{ levelType: "land", levelIndex: 0, rects: [{ rectIndex: 0 }, { rectIndex: 2 }] }]
    } as unknown as Project;
    expect(nextAvailableRandomRectIndex(project, "land", 0)).toBe(1);

    const fullProject = {
      randomLevels: [{ levelType: "land", levelIndex: 0, rects: Array.from({ length: 20 }, (_, rectIndex) => ({ rectIndex })) }]
    } as unknown as Project;
    expect(nextAvailableRandomRectIndex(fullProject, "land", 0)).toBeNull();
  });
});
