import { describe, expect, it, vi } from "vitest";
import type { MapEntity, TileAttributeProfile } from "../types";
import { parseLandlookMapstats } from "../browser/realmzParser";
import { drawSecretTileOverlay } from "./drawMapCanvas";
import {
  isConcealedWalkableTerrain,
  isSecretWalkableTile,
  showsCombatClearingOverlay,
  showsHiddenWalkableOverlay
} from "./secrets";

describe("hidden-walkable terrain", () => {
  it("recognizes Trouble in the Sword Lands Custom 2 paths without treating combat-only paths as walkable", () => {
    const attributes = troubleCustom2Attributes();
    expect(attributes[169]).toMatchObject({ landlook: 7, pathFlag: true, solidType: 0 });
    expect(attributes[180]).toMatchObject({ landlook: 7, pathFlag: true, solidType: 2 });
    expect(showsHiddenWalkableOverlay(169, landMap(7), attributes)).toBe(true);
    expect(showsHiddenWalkableOverlay(180, landMap(7), attributes)).toBe(false);
    expect(showsHiddenWalkableOverlay(61, landMap(7), attributes)).toBe(false);
  });

  it("supports scenario-defined path IDs rather than assuming tile 169", () => {
    const attributes = [pathProfile(88, 6), pathProfile(169, 6, 2)];
    expect(showsHiddenWalkableOverlay(88, landMap(6), attributes)).toBe(true);
    expect(showsHiddenWalkableOverlay(169, landMap(6), attributes)).toBe(false);
    expect(showsHiddenWalkableOverlay(88, landMap(7), attributes)).toBe(false);
  });

  it("lets decoded metadata override stock assumptions", () => {
    expect(showsHiddenWalkableOverlay(169, landMap(0), [pathProfile(169, 0, 2)])).toBe(false);
    expect(showsHiddenWalkableOverlay(169, landMap(0), [{ ...pathProfile(169, 0), pathFlag: false }])).toBe(false);
  });

  it("retains reviewed stock paths when their metadata is unavailable", () => {
    for (const landlook of [0, 3, 5, 9, 10]) {
      expect(showsHiddenWalkableOverlay(169, landMap(landlook))).toBe(true);
    }
    expect(showsHiddenWalkableOverlay(96, landMap(4))).toBe(true);
    expect(showsHiddenWalkableOverlay(184, landMap(5))).toBe(true);
    expect(showsHiddenWalkableOverlay(169, landMap(7))).toBe(false);
    expect(showsHiddenWalkableOverlay(169, landMap(4))).toBe(false);
  });

  it("removes note/path bits independently from the secret-state band", () => {
    const attributes = troubleCustom2Attributes();
    for (const flags of [0, 0x2000, 0x4000, 0x6000]) {
      for (const band of [0, 1000, 2000, 3000]) {
        const value = flags | (band + 169);
        expect(isConcealedWalkableTerrain(value, landMap(7), attributes)).toBe(true);
        expect(isSecretWalkableTile(value, landMap(7), attributes)).toBe(band >= 2000);
      }
      expect(showsHiddenWalkableOverlay(flags | 169, landMap(0))).toBe(true);
      expect(showsCombatClearingOverlay(flags | 180, landMap(0))).toBe(true);
    }
  });

  it("does not interpret negative special icons or Data Solids as landlook terrain", () => {
    const attributes = [pathProfile(169, 7)];
    expect(showsHiddenWalkableOverlay(-169, landMap(0), attributes)).toBe(false);
    expect(showsHiddenWalkableOverlay(-1169, landMap(7), attributes)).toBe(false);
    expect(showsHiddenWalkableOverlay(169, landMap(7), [{ ...attributes[0], sourceKind: "data-solids" }])).toBe(false);
  });

  it("rebuilds the classification when tile attributes change", () => {
    const attributes = [pathProfile(88, 7)];
    expect(showsHiddenWalkableOverlay(88, landMap(7), attributes)).toBe(true);
    expect(showsHiddenWalkableOverlay(88, landMap(7), [{ ...attributes[0], solidType: 2 }])).toBe(false);
    expect(showsHiddenWalkableOverlay(88, landMap(7), attributes)).toBe(true);
  });

  it("keeps dungeon secret directions separate from landlook metadata", () => {
    const map = landMap(7);
    map.levelType = "dungeon";
    map.render.mode = "dungeon-top-down";
    expect(showsHiddenWalkableOverlay(169, map, troubleCustom2Attributes())).toBe(false);
    expect(showsHiddenWalkableOverlay(0x0100, map)).toBe(true);
  });

  it("draws custom hidden paths through the renderer shared by the canvas and JPEG export", () => {
    const map = landMap(7);
    map.tiles[2 * 90 + 3] = 169;
    map.tiles[3 * 90 + 3] = 180;
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    drawSecretTileOverlay(ctx, map, 10, {}, troubleCustom2Attributes());
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(25, 31.8);
    expect(ctx.moveTo).toHaveBeenCalledWith(21.8, 35);
  });
});

function troubleCustom2Attributes() {
  // Source rows from Trouble in the Sword Lands/Data Custom 2 BD (20 big-endian shorts per tile).
  const rows = new Map([
    [169, [82, 5, 0, 0, 0, 1, 0, 0, 0, 0, 162, 167, 165, 166, 164, 166, 161, 163, 167, 0]],
    [180, [0, 5, 2, 0, 0, 1, 1, 0, 0, 0, 165, 156, 156, 156, 161, 156, 164, 156, 166, 0]]
  ]);
  const buffer = new Uint8Array(201 * 40 + 4);
  const view = new DataView(buffer.buffer);
  for (const [tile, fields] of rows) {
    fields.forEach((value, index) => view.setInt16(tile * 40 + index * 2, value, false));
  }
  return parseLandlookMapstats(buffer, 7, "Data Custom 2 BD");
}

function pathProfile(tile: number, landlook: number, solidType = 0): TileAttributeProfile {
  return {
    tile, landlook, solidType, movementSoundId: null, movementCost: null,
    pathFlag: true, flags: [solidType === 0 ? "walkable" : "solid", "path"],
    sourceKind: "mapstats", source: "fixture", confidence: "source-backed"
  };
}

function landMap(landlook: number): MapEntity {
  return {
    id: "land:9", levelType: "land", source: "Data LD", index: 9,
    name: "Land level 9", width: 90, height: 90, tiles: Array(8100).fill(156),
    render: { tilesetId: `landlook-${landlook}`, landlook, mode: "outdoor-landlook" },
    provenance: { sourceFile: "fixture", recordIndex: 9, byteOffset: 0, byteLength: 16200, confidence: "fixture-backed" }
  };
}
