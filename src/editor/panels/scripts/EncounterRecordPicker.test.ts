import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  EncounterRecordPicker,
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
      complexEncounters: [{ id: 12 }, { id: 3 }]
    } as unknown as Project;

    expect(encounterRecordPickerOptions(project, "complexEncounter")).toEqual([
      {
        key: "complexEncounter:3",
        value: 3,
        label: "Complex Encounter 3",
        detail: "Record 3",
        searchText: "3 Complex Encounter 3 encounter record"
      },
      {
        key: "complexEncounter:12",
        value: 12,
        label: "Complex Encounter 12",
        detail: "Record 12",
        searchText: "12 Complex Encounter 12 encounter record"
      }
    ]);
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

    expect(html).toContain("workbench-reference-field");
    expect(html).toContain('aria-label="Search Time Encounter records"');
    expect(html).toContain("Time Encounter 9");
    expect(html).not.toContain("<select");
  });
});
