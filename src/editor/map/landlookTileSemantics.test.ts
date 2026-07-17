import { describe, expect, it } from "vitest";
import { landlookTileVisualSemantics } from "./landlookTileSemantics";

describe("reviewed landlook tile connectivity", () => {
  it("exposes cardinal connections for audited streams and roads", () => {
    expect(landlookTileVisualSemantics(38, 0)?.connections).toEqual(["north", "south"]);
    expect(landlookTileVisualSemantics(139, 0)?.connections).toEqual(["east", "south"]);
    expect(landlookTileVisualSemantics(134, 0)?.connections).toEqual(["north", "east", "south", "west"]);
  });

  it("does not transfer aligned slot directions to unrelated castle artwork", () => {
    expect(landlookTileVisualSemantics(139, 4)?.label).toBe("Brown and gold jugs");
    expect(landlookTileVisualSemantics(139, 4)?.connections).toBeUndefined();
  });
});
