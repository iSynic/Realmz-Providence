import { describe, expect, it } from "vitest";
import { scriptPreviewReferenceModel, type ScriptPreviewTarget } from "./ActionPointDialogs";

describe("scriptPreviewReferenceModel", () => {
  it("describes entity references without navigating", () => {
    const preview: ScriptPreviewTarget = {
      kind: "entity",
      title: "String 12",
      detail: "message target",
      entity: { type: "message", id: "message:12" }
    };

    expect(scriptPreviewReferenceModel(preview)).toEqual({
      key: "entity:message:message:12",
      kind: "summary",
      title: "String 12",
      detail: "message target",
      summary: "Reference message:12"
    });
  });

  it("describes the exact map coordinate", () => {
    const preview: ScriptPreviewTarget = {
      kind: "map-coordinate",
      title: "Bell Depths",
      detail: "36, 47",
      target: { levelType: "dungeon", levelIndex: 1, x: 36, y: 47 }
    };

    expect(scriptPreviewReferenceModel(preview)).toMatchObject({
      key: "map:dungeon:1:36:47",
      kind: "summary",
      summary: "Dungeon level 1 at 36, 47"
    });
  });
});
