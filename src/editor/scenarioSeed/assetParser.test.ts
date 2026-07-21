import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseAsset } from "./assetParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed asset parser", () => {
  it("normalizes stock assets with an optional authoring kind", () => {
    const ctx = context();

    expect(parseAsset({
      key: "bell-icon",
      source: "stock",
      resourceType: "cicn",
      resourceId: 401,
      kind: "icon"
    }, "$.assets[0]", ctx)).toEqual({
      key: "bell-icon",
      source: "stock",
      resourceType: "cicn",
      resourceId: 401,
      kind: "icon"
    });
    expect(ctx.errors).toEqual([]);
  });

  it("normalizes custom-library assets with an optional scenario resource ID", () => {
    const ctx = context();

    expect(parseAsset({
      key: "drowned-bell",
      source: "custom-library",
      assetId: "asset-drowned-bell",
      resourceId: 30000
    }, "$.assets[0]", ctx)).toEqual({
      key: "drowned-bell",
      source: "custom-library",
      assetId: "asset-drowned-bell",
      resourceId: 30000
    });
    expect(ctx.errors).toEqual([]);
  });

  it("keeps source-specific fields and asset kinds explicit", () => {
    const ctx = context();

    expect(parseAsset({
      key: "invalid",
      source: "stock",
      resourceType: "PICT",
      resourceId: 30000,
      kind: "video",
      assetId: "not-valid-for-stock"
    }, "$.assets[0]", ctx)).toEqual({
      key: "invalid",
      source: "stock",
      resourceType: "PICT",
      resourceId: 30000
    });
    expect(ctx.errors).toEqual([
      "$.assets[0].assetId is not a supported scenario seed field.",
      "$.assets[0].kind must be picture, icon, special-land-tile, sound, music, text, or other."
    ]);
  });
});
