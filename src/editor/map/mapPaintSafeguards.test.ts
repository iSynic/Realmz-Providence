import { describe, expect, it } from "vitest";
import type { MapEntity, PaintCellChange, SmartBrushPlan, TriggerRecord } from "../types";
import { analyzeMapPaintOperation, applyMapPaintImpactToSmartPlan } from "./mapPaintSafeguards";

const map: MapEntity = {
  id: "land:0",
  source: "Data LD",
  levelType: "land",
  index: 0,
  name: "Land level 0",
  width: 4,
  height: 4,
  tiles: Array(16).fill(1),
  render: { tilesetId: "plains", landlook: 0, mode: "outdoor-landlook" },
  provenance: { sourceFile: "fixture", recordIndex: 0, byteOffset: 0, byteLength: 32, confidence: "fixture-backed" }
};

const changes: PaintCellChange[] = [
  { x: 0, y: 0, index: 0, from: 1, to: 60 },
  { x: 1, y: 0, index: 1, from: -15, to: 60 },
  { x: 2, y: 0, index: 2, from: 170, to: 60 },
  { x: 3, y: 0, index: 3, from: 1, to: 60 }
];

const actionPoint: TriggerRecord = {
  id: "Data DD:0:0",
  source: "Data DD",
  levelType: "land",
  levelIndex: 0,
  recordIndex: 0,
  active: true,
  doorid: 0,
  percent: 100,
  coordinate: { x: 3, y: 0 },
  actions: []
};

describe("map paint safeguards", () => {
  it("protects active Action Points, icon-backed tiles, and semantic structures", () => {
    const impact = analyzeMapPaintOperation({
      map,
      changes,
      triggers: [actionPoint],
      tileset: null,
      protectFeatures: true
    });

    expect(impact.allowedChanges).toEqual([changes[0]]);
    expect(impact.protectedChanges.map((change) => change.protectionReason)).toEqual([
      "special-icon",
      "structure",
      "action-point"
    ]);
    expect(impact.protectedCounts).toEqual({ "action-point": 1, "special-icon": 1, structure: 1 });
    expect(impact.sourceComposition).toEqual([
      { tile: 1, count: 2 },
      { tile: -15, count: 1 },
      { tile: 170, count: 1 }
    ]);
  });

  it("reports composition without filtering when protection is disabled", () => {
    const impact = analyzeMapPaintOperation({ map, changes, triggers: [actionPoint], tileset: null, protectFeatures: false });
    expect(impact.allowedChanges).toEqual(changes);
    expect(impact.protectedChanges).toEqual([]);
    expect(impact.requestedCount).toBe(4);
  });

  it("removes protected cells from a Smart Terrain preview and adds them to skipped cells", () => {
    const impact = analyzeMapPaintOperation({ map, changes, triggers: [actionPoint], tileset: null, protectFeatures: true });
    const plan: SmartBrushPlan = {
      cells: changes.map((change) => ({ ...change, role: "center" })),
      skipped: [],
      changedCount: changes.length,
      skippedCount: 0,
      profileConfidence: "reviewed-rules",
      reason: null
    };
    const protectedPlan = applyMapPaintImpactToSmartPlan(plan, impact);
    expect(protectedPlan.cells.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 0, y: 0 }]);
    expect(protectedPlan.skipped).toHaveLength(3);
    expect(protectedPlan.changedCount).toBe(1);
  });
});
