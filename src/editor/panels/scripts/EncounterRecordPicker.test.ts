import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  EncounterRecordPicker,
  adjacentEncounterRecordId,
  encounterEntityId,
  encounterRecordFamilyLabel,
  encounterRecordLabel,
  encounterRecordPickerOptions,
  encounterRecordsForType
} from "./EncounterRecordPicker";

describe("encounter record picker helpers", () => {
  it("maps each record family to its semantic entity ID", () => {
    expect(encounterEntityId("simpleEncounter", 3)).toBe("encounter:simple:3");
    expect(encounterEntityId("complexEncounter", 4)).toBe("encounter:complex:4");
    expect(encounterEntityId("thiefEncounter", 5)).toBe("thief:5");
    expect(encounterEntityId("timedEncounter", 6)).toBe("time:6");
  });

  it("uses author-facing labels for every record family", () => {
    expect(encounterRecordLabel("simpleEncounter", 1)).toBe("Simple Encounter 1");
    expect(encounterRecordLabel("complexEncounter", 2)).toBe("Complex Encounter 2");
    expect(encounterRecordLabel("thiefEncounter", 3)).toBe("Rogue Encounter 3");
    expect(encounterRecordLabel("timedEncounter", 4)).toBe("Time Encounter 4");
    expect(encounterRecordFamilyLabel("thiefEncounter")).toBe("Rogue Encounter");
  });

  it("returns sorted records without mutating project order", () => {
    const simpleEncounters = [{ id: 8 }, { id: 2 }, { id: 5 }];
    const project = { simpleEncounters } as unknown as Project;

    expect(encounterRecordsForType(project, "simpleEncounter").map((record) => record.id)).toEqual([2, 5, 8]);
    expect(simpleEncounters.map((record) => record.id)).toEqual([8, 2, 5]);
  });

  it("builds complete searchable options for the selected encounter family", () => {
    const project = {
      messages: [{ id: 7, text: "The drowned bell tolls below the reef." }],
      complexEncounters: [
        { id: 12, prompt: 0, texts: [], actions: [], actionResult: 0, wordResult: 0, spellResults: [], itemResults: [] },
        { id: 3, prompt: 7, texts: [], actions: [{ slot: 0, rawCode: 1, id: 7 }], actionResult: 1, wordResult: 0, spellResults: [], itemResults: [] }
      ]
    } as unknown as Project;

    const options = encounterRecordPickerOptions(project, "complexEncounter");
    expect(options.map((option) => option.value)).toEqual([3, 12]);
    expect(options[0].detail).toContain("1 responses | 1 result steps | The drowned bell tolls below the reef.");
    expect(options[0].searchText).toContain("drowned bell");
  });

  it("moves to adjacent records without wrapping at boundaries", () => {
    const records = [{ id: 2 }, { id: 5 }, { id: 8 }];
    expect(adjacentEncounterRecordId(records, 5, -1)).toBe(2);
    expect(adjacentEncounterRecordId(records, 5, 1)).toBe(8);
    expect(adjacentEncounterRecordId(records, 2, -1)).toBeNull();
    expect(adjacentEncounterRecordId(records, 8, 1)).toBeNull();
  });

  it("renders encounter navigation through the shared searchable reference field", () => {
    const project = {
      timedEncounters: [{ id: 2 }, { id: 9 }]
    } as unknown as Project;
    const html = renderToStaticMarkup(createElement(EncounterRecordPicker, {
      project,
      recordType: "timedEncounter",
      id: 9,
      onSelectEntity: () => undefined
    }));

    expect(html).toContain("workbench-reference-compact-trigger");
    expect(html).toContain('aria-label="Search Time Encounter records"');
    expect(html).toContain("Time Encounter 9");
    expect(html).toContain('aria-label="Previous Time Encounter"');
    expect(html).toContain('aria-label="Next Time Encounter"');
    expect(html).toContain("2 of 2");
    expect(html).not.toContain("<select");
  });

  it("disables sequential navigation at the first and last records", () => {
    const project = { simpleEncounters: [{ id: 2 }, { id: 9 }] } as unknown as Project;
    const first = renderToStaticMarkup(createElement(EncounterRecordPicker, {
      project,
      recordType: "simpleEncounter",
      id: 2,
      onSelectEntity: () => undefined
    }));
    const last = renderToStaticMarkup(createElement(EncounterRecordPicker, {
      project,
      recordType: "simpleEncounter",
      id: 9,
      onSelectEntity: () => undefined
    }));

    expect(first).toMatch(/aria-label="Previous Simple Encounter"[^>]*disabled=""/);
    expect(first).not.toMatch(/aria-label="Next Simple Encounter"[^>]*disabled=""/);
    expect(last).not.toMatch(/aria-label="Previous Simple Encounter"[^>]*disabled=""/);
    expect(last).toMatch(/aria-label="Next Simple Encounter"[^>]*disabled=""/);
  });
});
