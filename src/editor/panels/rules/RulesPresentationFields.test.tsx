import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  RulesQueueIconField,
  fastplotTileRect,
  rulesQueueIconOptions,
  rulesQueueIconRawOption,
  rulesQueueIconValueForQuery
} from "./RulesQueueIconField";
import {
  RulesSpellAnimationField,
  rulesSpellAnimationOptions,
  rulesSpellAnimationRawOption,
  rulesSpellAnimationReferences,
  rulesSpellAnimationValueForQuery
} from "./RulesSpellAnimationField";

const ANIMATION_12000: LibraryAsset = {
  id: "animation-12000",
  type: "icon",
  label: "Spell Animation 1",
  source: "Realmz",
  relativePath: "Tacticals.rsrc/cicn_12000.png",
  bytes: 32,
  sha256: "animation-12000",
  resourceType: "cicn",
  resourceId: 12000,
  previewPath: "data:image/png;base64,iVBORw0KGgo="
};

describe("Rules presentation fields", () => {
  it("derives animation choices only from known first frames", () => {
    const references = rulesSpellAnimationReferences([
      ANIMATION_12000,
      { ...ANIMATION_12000, id: "frame-12001", resourceId: 12001 },
      { ...ANIMATION_12000, id: "animation-12032", resourceId: 12032 },
      { ...ANIMATION_12000, id: "animation-12120", resourceId: 12120 },
      { ...ANIMATION_12000, id: "animation-12128", resourceId: 12128 }
    ]);

    expect(references.map((reference) => [reference.value, reference.firstFrameId])).toEqual([
      [1, 12000],
      [5, 12032],
      [16, 12120]
    ]);
  });

  it("keeps the two value-zero animation meanings distinct", () => {
    const cast = rulesSpellAnimationOptions([], "blank-cast")[0];
    const resolution = rulesSpellAnimationOptions([], "default-resolution")[0];

    expect(cast).toMatchObject({ value: 0, label: "Blank Cast Animation" });
    expect(cast.detail).toContain("no cast animation");
    expect(resolution).toMatchObject({ value: 0, label: "Default Resolution Animation" });
    expect(resolution.detail).toContain("cicn 12032-12039");
  });

  it("accepts stored animation values or mapped first-frame IDs", () => {
    expect(rulesSpellAnimationValueForQuery("13")).toBe(13);
    expect(rulesSpellAnimationValueForQuery("12000")).toBe(1);
    expect(rulesSpellAnimationValueForQuery("12032")).toBe(5);
    expect(rulesSpellAnimationValueForQuery("bell")).toBeNull();

    const options = rulesSpellAnimationOptions(
      rulesSpellAnimationReferences([ANIMATION_12000]),
      "blank-cast"
    );
    expect(rulesSpellAnimationRawOption("12000", "blank-cast", options)).toBeNull();
    expect(rulesSpellAnimationRawOption("17", "blank-cast", options)).toMatchObject({ value: 17 });
  });

  it("maps all known queue-icon values to their combat tiles", () => {
    const options = rulesQueueIconOptions("data:image/png;base64,iVBORw0KGgo=");

    expect(options).toHaveLength(201);
    expect(options[0].detail).toContain("no queue icon");
    expect(options[14]).toMatchObject({ value: 14, label: "Queue Icon 14" });
    expect(options[14].detail).toContain("combat tile 214");
    expect(rulesQueueIconValueForQuery("14")).toBe(14);
    expect(rulesQueueIconValueForQuery("214")).toBe(14);
    expect(rulesQueueIconValueForQuery("tile 214")).toBe(14);
    expect(rulesQueueIconValueForQuery("stored 255")).toBe(255);
    const rawOption = rulesQueueIconRawOption("stored 255", options);
    expect(rawOption).toMatchObject({ value: 255 });
    expect(filterReferencePickerOptions(rawOption ? [rawOption, ...options] : options, "stored 255"))
      .toEqual([rawOption]);
    expect(fastplotTileRect(214)).toEqual({ column: 13, row: 10 });
  });

  it("renders compact shared fields with their selected previews", () => {
    const animationHtml = renderToStaticMarkup(
      <RulesSpellAnimationField
        label="Cast Icon"
        value={1}
        assets={[ANIMATION_12000]}
        zeroMode="blank-cast"
        onCommit={vi.fn()}
      />
    );
    const queueHtml = renderToStaticMarkup(
      <RulesQueueIconField
        label="Queue Icon"
        value={14}
        atlasUrl="data:image/png;base64,iVBORw0KGgo="
        onCommit={vi.fn()}
      />
    );

    expect(animationHtml).toContain("workbench-reference-compact-trigger");
    expect(animationHtml).toContain("Animation 1");
    expect(animationHtml).toContain("rules-presentation-preview is-animation");
    expect(queueHtml).toContain("workbench-reference-compact-trigger");
    expect(queueHtml).toContain("Queue Icon 14");
    expect(queueHtml).toContain("rules-presentation-preview is-queue-icon");
  });
});
