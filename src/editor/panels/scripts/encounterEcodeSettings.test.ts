import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  encounterEcodeActionSummary,
  encounterEcodeSettingsState,
  encounterEcodeTargetRowId
} from "./encounterEcodeSettings";

function projectWithSettings(): Project {
  return {
    triggers: [],
    simpleEncounters: [{ id: 3, actions: [{ slot: 0, rawCode: 2, id: 5 }] }],
    complexEncounters: [{ id: 7, actions: [{ slot: 8, rawCode: 2, id: 5 }] }],
    extracodes: [{ id: 1, values: [0, 0, 0, 0, 0] }, { id: 3, values: [0, 0, 0, 0, 0] }, { id: 5, values: [4, 8, 0, 0, 0] }],
    battles: [{ id: 4 }, { id: 8 }],
    messages: [],
    optionLabels: [],
    maps: [],
    items: [],
    scenarioItems: [],
    treasures: [],
    shops: [],
    monsters: [],
    monsterSets: [],
    assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
  } as unknown as Project;
}

describe("encounter ECODE settings state", () => {
  it("defaults shared settings to a nonzero caller-owned copy", () => {
    const project = projectWithSettings();
    const state = encounterEcodeSettingsState(project, null, project.simpleEncounters[0].actions, 0, 2);

    expect(state).toMatchObject({
      sourceRowId: 5,
      editorRowId: 2,
      initialValues: [4, 8, 0, 0, 0],
      defaultWriteMode: "duplicate",
      allowSharedEdit: true
    });
    expect(encounterEcodeTargetRowId(state!, "duplicate")).toBe(2);
    expect(encounterEcodeTargetRowId(state!, "replace")).toBe(5);
  });

  it("allocates fresh positive settings when changing a direct action to ECODE", () => {
    const project = projectWithSettings();
    const actions = [{ slot: 0, rawCode: 1, id: 42 }];
    const state = encounterEcodeSettingsState(project, null, actions, 0, 2);

    expect(state?.sourceRowId).toBeNull();
    expect(state?.editorRowId).toBe(2);
    expect(state?.editorRowId).toBeGreaterThan(0);
    expect(state?.initialValues).toEqual([0, 0, 0, 0, 0]);
  });

  it("repairs a uniquely referenced missing row in place", () => {
    const project = projectWithSettings();
    project.simpleEncounters[0].actions = [{ slot: 0, rawCode: 2, id: 9 }];
    project.complexEncounters = [];
    const state = encounterEcodeSettingsState(project, null, project.simpleEncounters[0].actions, 0, 2);

    expect(state).toMatchObject({
      sourceRowId: 9,
      editorRowId: 9,
      defaultWriteMode: "replace",
      allowSharedEdit: false
    });
    expect(state?.sourceUsage?.status).toBe("missing");
  });

  it("reserves two contiguous rows for paired opcode 92 settings", () => {
    const project = projectWithSettings();
    project.extracodes = [{ id: 1, values: [0, 0, 0, 0, 0] }, { id: 3, values: [0, 0, 0, 0, 0] }];
    const state = encounterEcodeSettingsState(project, null, [], 0, 92);

    expect(state?.editorRowId).toBe(4);
    expect(state?.secondaryRowId).toBe(5);
    expect(state?.secondaryInitialValues).toEqual([0, 0, 0, 0, 0]);
  });

  it("duplicates a row whose callers interpret it with conflicting ECODE shapes", () => {
    const project = projectWithSettings();
    project.simpleEncounters[0].actions = [{ slot: 0, rawCode: 2, id: 5 }];
    project.complexEncounters[0].actions = [{ slot: 8, rawCode: 15, id: 5 }];
    const state = encounterEcodeSettingsState(project, null, project.simpleEncounters[0].actions, 0, 2);

    expect(state?.sourceUsage?.status).toBe("conflict");
    expect(state?.defaultWriteMode).toBe("duplicate");
    expect(state?.editorRowId).not.toBe(5);
  });

  it("keeps a negative result opcode separate from signed Battle settings", () => {
    const project = projectWithSettings();
    project.extracodes = [{ id: 5, values: [-4, -8, 0, 0, 0] }];
    project.simpleEncounters[0].actions = [{ slot: 0, rawCode: -2, id: 5 }];
    const state = encounterEcodeSettingsState(project, null, project.simpleEncounters[0].actions, 0, -2);

    expect(state?.rawCode).toBe(-2);
    expect(state?.initialValues.slice(0, 2)).toEqual([-4, -8]);
  });

  it("summarizes stored behavior and describes missing settings without exposing the row ID", () => {
    const project = projectWithSettings();

    expect(encounterEcodeActionSummary(project, null, { slot: 0, rawCode: 2, id: 5 })).toContain("Battle");
    expect(encounterEcodeActionSummary(project, null, { slot: 0, rawCode: 2, id: 99 }))
      .toBe("Battle settings need review");
  });
});
