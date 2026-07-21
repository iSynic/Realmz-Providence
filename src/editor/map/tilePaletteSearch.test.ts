import { describe, expect, it } from "vitest";
import type { TileAttributeProfile, TilesetAsset } from "../types";
import { tileMatchesPaletteQuery } from "./tilePaletteSearch";

const plains = {
  id: "landlook-0",
  landlook: 0,
  name: "Plains",
  source: "test",
  available: true,
  imagePath: "plains.png",
  pictId: 300,
  tileWidth: 32,
  tileHeight: 32,
  columns: 20,
  rows: 10,
  custom: false
} satisfies TilesetAsset;

describe("tileMatchesPaletteQuery", () => {
  it("matches semantic labels, categories, notes, and directional terms", () => {
    expect(tileMatchesPaletteQuery(130, "bridge", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(130, "road water", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(38, "narrow stream north south", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(5, "bottom right", plains)).toBe(true);
  });

  it("matches named-tile aliases that are more specific than the visual label", () => {
    expect(tileMatchesPaletteQuery(119, "tree pair", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(61, "solid barrier", plains)).toBe(true);
  });

  it("matches behavior flags using author-facing words", () => {
    const attributes: TileAttributeProfile[] = [{
      tile: 61,
      landlook: 0,
      solidType: 1,
      movementSoundId: null,
      movementCost: null,
      flags: ["solid", "blocks-los"],
      confidence: "source-backed",
      source: "test"
    }];
    expect(tileMatchesPaletteQuery(61, "solid", plains, attributes)).toBe(true);
    expect(tileMatchesPaletteQuery(61, "blocks los", plains, attributes)).toBe(true);
  });

  it("preserves numeric ID searches without assigning unknown semantics", () => {
    expect(tileMatchesPaletteQuery(130, "130", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(999, "999", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(999, "bridge", plains)).toBe(false);
  });

  it("requires every query term to match", () => {
    expect(tileMatchesPaletteQuery(130, "bridge east west", plains)).toBe(true);
    expect(tileMatchesPaletteQuery(130, "bridge north south", plains)).toBe(false);
  });
});
