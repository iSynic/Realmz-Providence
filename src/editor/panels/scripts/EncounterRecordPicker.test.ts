import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  encounterEntityId,
  encounterRecordLabel,
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
  });

  it("returns sorted records without mutating project order", () => {
    const simpleEncounters = [{ id: 8 }, { id: 2 }, { id: 5 }];
    const project = { simpleEncounters } as unknown as Project;

    expect(encounterRecordsForType(project, "simpleEncounter").map((record) => record.id)).toEqual([2, 5, 8]);
    expect(simpleEncounters.map((record) => record.id)).toEqual([8, 2, 5]);
  });
});
