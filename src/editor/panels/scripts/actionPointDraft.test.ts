import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import type { ScriptActionDefinition } from "./scriptActionCatalog";
import { defaultDraftForProject, edcdDraftValuesEqual } from "./actionPointDraft";

function projectWithEdcdRows(ids: number[]): Project {
  return { extracodes: ids.map((id) => ({ id })) } as Project;
}

function definition(defaultDraft: ScriptActionDefinition["defaultDraft"]): ScriptActionDefinition {
  return { defaultDraft } as ScriptActionDefinition;
}

describe("action point EDCD drafts", () => {
  it("compares normalized five-value settings rows", () => {
    expect(edcdDraftValuesEqual([1, 2], [1, 2, 0, 0, 0])).toBe(true);
    expect(edcdDraftValuesEqual(undefined, [0, 0, 0, 0, 0])).toBe(true);
    expect(edcdDraftValuesEqual([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 9])).toBe(true);
    expect(edcdDraftValuesEqual([1, 2, 3, 4, 5], [1, 2, 3, 4, 6])).toBe(false);
  });

  it("keeps direct action defaults unchanged", () => {
    const draft = defaultDraftForProject(projectWithEdcdRows([0, 1]), definition({ rawCode: 1, id: 7 }));

    expect(draft).toEqual({ rawCode: 1, id: 7 });
  });

  it("allocates the first unused row for parameterized zero-ID defaults", () => {
    const draft = defaultDraftForProject(
      projectWithEdcdRows([0, 2]),
      definition({ rawCode: 58, id: 0, parameters: [0, 0, 0, 0, 0] })
    );

    expect(draft).toEqual({ rawCode: 58, id: 1 });
  });
});
