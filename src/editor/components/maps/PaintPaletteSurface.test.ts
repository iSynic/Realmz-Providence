import { describe, expect, it } from "vitest";
import { resolvePaintPaletteMode } from "./PaintPaletteSurface";

describe("resolvePaintPaletteMode", () => {
  it("prefers the current palette mode", () => {
    expect(resolvePaintPaletteMode("docked", JSON.stringify({ mode: "floating" }))).toBe("docked");
    expect(resolvePaintPaletteMode("floating", null)).toBe("floating");
  });

  it("migrates the legacy floating preference", () => {
    expect(resolvePaintPaletteMode(null, JSON.stringify({ mode: "floating", x: 700, y: 120 }))).toBe("floating");
  });

  it("falls back to docked for missing or malformed state", () => {
    expect(resolvePaintPaletteMode(null, null)).toBe("docked");
    expect(resolvePaintPaletteMode(null, "not-json")).toBe("docked");
  });
});
