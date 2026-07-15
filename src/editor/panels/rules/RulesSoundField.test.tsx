import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "../../types";
import {
  RulesSoundField,
  rulesSoundRawOption,
  rulesSoundReferenceOptions,
  rulesSoundReferences,
  rulesSoundValueForQuery
} from "./RulesSoundField";

const SOUND_605: LibraryAsset = {
  id: "sound-605",
  type: "sound",
  label: "Spell Chime",
  source: "Realmz",
  relativePath: "Sounds/605.snd",
  bytes: 32,
  sha256: "sound-605",
  resourceType: "snd",
  resourceId: 605,
  previewPath: "data:audio/wav;base64,UklGRg=="
};

describe("Rules sound field", () => {
  it("maps snd assets to stored spell values and removes duplicate resources", () => {
    const references = rulesSoundReferences([
      SOUND_605,
      { ...SOUND_605, id: "duplicate", label: "Duplicate" },
      { ...SOUND_605, id: "icon", resourceType: "cicn" }
    ]);
    const options = rulesSoundReferenceOptions(references);

    expect(references).toHaveLength(1);
    expect(options[0]).toMatchObject({ value: 5, label: "Spell Chime" });
    expect(options[0].detail).toBe("Spell value 5 | snd 605");
  });

  it("accepts either a stored value or a snd resource ID in numeric searches", () => {
    expect(rulesSoundValueForQuery("5")).toBe(5);
    expect(rulesSoundValueForQuery("605")).toBe(5);
    expect(rulesSoundValueForQuery("Spell Chime")).toBeNull();
  });

  it("offers unresolved raw values without duplicating known sounds", () => {
    const options = rulesSoundReferenceOptions(rulesSoundReferences([SOUND_605]));

    expect(rulesSoundRawOption("605", options)).toBeNull();
    expect(rulesSoundRawOption("44", options)).toMatchObject({ value: 44, label: "Sound value 44" });
  });

  it("renders the shared compact picker and audio preview action", () => {
    const html = renderToStaticMarkup(
      <RulesSoundField
        label="Casting Sound"
        value={5}
        assets={[SOUND_605]}
        onCommit={vi.fn()}
      />
    );

    expect(html).toContain("workbench-reference-compact-trigger");
    expect(html).toContain('aria-label="Search casting sound"');
    expect(html).toContain('aria-label="Preview casting sound"');
    expect(html).toContain('data-reference-preview-key="rules-sound-preview:5"');
    expect(html).toContain("Spell Chime");
  });
});
