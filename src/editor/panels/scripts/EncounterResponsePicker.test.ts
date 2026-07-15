import { describe, expect, it } from "vitest";
import type { ItemReferenceOption } from "../../itemReferences";
import type { SpellResponseOption } from "./encounterResponseOptions";
import {
  encounterResponseSelection,
  MAGIC_RESPONSE_BLANK_SPELL_ID
} from "./EncounterResponsePicker";

const spellOptions: SpellResponseOption[] = [{
  key: "spell:1401",
  value: 1401,
  label: "Stormglass Ward (1401)",
  detail: "level 4 | class 2 | Realmz reference"
}];

const itemOptions: ItemReferenceOption[] = [{
  key: "item:901",
  value: 901,
  label: "Beacon Lens (901)",
  category: "supply",
  detail: "Scenario item",
  summary: "A clear lens",
  sourceState: "Scenario-authored",
  iconId: null
}];

describe("complex encounter response selections", () => {
  it("treats the Realmz magic sentinel as an empty response", () => {
    expect(encounterResponseSelection("magic", MAGIC_RESPONSE_BLANK_SPELL_ID, spellOptions, itemOptions)).toEqual({
      label: "No spell or scroll selected",
      detail: "This response does not test a spell or scroll.",
      state: "empty"
    });
  });

  it("resolves known spell and item targets with their catalog details", () => {
    expect(encounterResponseSelection("magic", 1401, spellOptions, itemOptions)).toEqual({
      label: "Stormglass Ward (1401)",
      detail: "level 4 | class 2 | Realmz reference",
      state: "resolved"
    });
    expect(encounterResponseSelection("item", 901, spellOptions, itemOptions)).toEqual({
      label: "Beacon Lens",
      detail: "Scenario item | Scenario-authored",
      state: "resolved"
    });
  });

  it("preserves an unresolved imported item ID", () => {
    expect(encounterResponseSelection("item", 733, spellOptions, itemOptions)).toEqual({
      label: "Item 733",
      detail: "Imported item ID 733",
      state: "unresolved"
    });
  });
});
