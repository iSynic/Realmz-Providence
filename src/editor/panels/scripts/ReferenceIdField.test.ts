import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { nextAuthorableTargetId } from "./ReferenceIdField";

describe("next authorable target ID", () => {
  it("fills the first positive gap in the selected record family", () => {
    const project = { messages: [{ id: 1 }, { id: 3 }, { id: 4 }] } as unknown as Project;

    expect(nextAuthorableTargetId(project, "message")).toBe(2);
  });

  it("keeps record-family allocation independent", () => {
    const project = {
      simpleEncounters: [{ id: 1 }, { id: 2 }],
      complexEncounters: [{ id: 2 }]
    } as unknown as Project;

    expect(nextAuthorableTargetId(project, "simpleEncounter")).toBe(3);
    expect(nextAuthorableTargetId(project, "complexEncounter")).toBe(1);
  });
});
