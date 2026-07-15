import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { EncounterRogueReferenceField } from "./EncounterRogueReferenceField";

describe("EncounterRogueReferenceField", () => {
  const project = {
    thiefEncounters: [{ id: 2 }, { id: 5 }]
  } as unknown as Project;

  it("uses the shared searchable reference field for an existing Rogue Encounter", () => {
    const html = renderToStaticMarkup(createElement(EncounterRogueReferenceField, {
      project,
      value: 5,
      onChange: () => undefined,
      onOpen: () => undefined
    }));

    expect(html).toContain("workbench-reference-field");
    expect(html).toContain('aria-label="Search Rogue Encounter target"');
    expect(html).toContain("Rogue Encounter 5");
    expect(html).toContain("Open Rogue Encounter");
    expect(html).not.toContain("<select");
  });

  it("keeps a missing imported Rogue Encounter ID visible", () => {
    const html = renderToStaticMarkup(createElement(EncounterRogueReferenceField, {
      project,
      value: 9,
      onChange: () => undefined
    }));

    expect(html).toContain("is-unresolved");
    expect(html).toContain("Rogue Encounter 9");
    expect(html).toContain("Record 9 is not present in this project.");
  });
});
