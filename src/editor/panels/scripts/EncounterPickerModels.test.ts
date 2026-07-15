import { describe, expect, it } from "vitest";
import type { ItemReferenceOption } from "../../itemReferences";
import type { ScriptTargetOption } from "../../components/RealmzTargetPicker";
import { encounterResponseReferenceOptions } from "./EncounterResponsePicker";
import {
  encounterSoundReferencePreviewModel,
  soundPreviewReferenceOptions,
  withTypedSoundOption
} from "./EncounterResultSoundPreview";

describe("encounter response reference options", () => {
  it("keeps the complete spell response collection plus the empty choice", () => {
    const spells = Array.from({ length: 140 }, (_, index) => ({
      key: `spell:${index + 1}`,
      value: index + 1,
      label: `Spell ${index + 1}`,
      detail: `Class ${index % 6}`
    }));

    const options = encounterResponseReferenceOptions("magic", spells, []);

    expect(options).toHaveLength(141);
    expect(options[0]).toMatchObject({ value: 0, label: "No spell or scroll" });
    expect(options[options.length - 1]?.value).toBe(140);
  });

  it("includes item identity, category, and source in shared search text", () => {
    const item: ItemReferenceOption = {
      key: "item:625",
      value: 625,
      label: "Beacon Lens (625)",
      category: "magic",
      detail: "Scenario item",
      summary: "Focuses the drowned light",
      sourceState: "Authored",
      iconId: null
    };

    const options = encounterResponseReferenceOptions("item", [], [item]);

    expect(options[1]).toMatchObject({
      value: 625,
      label: "Beacon Lens #625",
      searchText: expect.stringContaining("magic")
    });
    expect(options[1].searchText).toContain("Authored");
  });
});

describe("encounter sound reference options", () => {
  it("does not truncate the sound collection", () => {
    const sounds = Array.from({ length: 220 }, (_, index) => soundOption(index + 1));

    expect(soundPreviewReferenceOptions(sounds)).toHaveLength(220);
  });

  it("adds a typed raw sound only when its absolute ID is not already present", () => {
    const stored = [soundOption(624)];
    const typed = soundOption(-624, "typed:624");
    const newTyped = soundOption(-625, "typed:625");

    expect(withTypedSoundOption(stored, typed)).toEqual(stored);
    expect(withTypedSoundOption(stored, newTyped).map((option) => option.value)).toEqual([-625, 624]);
  });

  it("uses one preview model for floating and compact sound controls", () => {
    expect(encounterSoundReferencePreviewModel(soundOption(-624), -624, null)).toMatchObject({
      key: "sound:-624",
      kind: "audio",
      title: "Sound 624",
      src: null,
      state: "unavailable"
    });
    expect(encounterSoundReferencePreviewModel(null, 625, "/sound.wav")).toMatchObject({
      key: "sound:625",
      kind: "audio",
      title: "Sound 625",
      src: "/sound.wav",
      state: "resolved"
    });
  });
});

function soundOption(value: number, key = `sound:${value}`): ScriptTargetOption {
  return {
    key,
    value,
    label: `Sound ${Math.abs(value)}`,
    detail: "Realmz sound",
    sourceState: "Reference"
  };
}
