import { describe, expect, it } from "vitest";
import { createBrowserProject } from "./browser/project";
import { editorReducer, initialEditorState, type EditorState } from "./store";

describe("editor project history", () => {
  it("undoes and redoes an encounter caller plus ECODE row as one project command", () => {
    const original = createBrowserProject("Encounter history");
    original.simpleEncounters = [{
      id: 3,
      actions: [{ slot: 0, rawCode: 2, id: 5 }],
      choiceResults: [0, 0, 0, 0],
      canBackOut: false,
      maxTimes: 0,
      casteSuccess: 0,
      prompt: 0,
      texts: ["", "", "", ""],
      authored: true,
      provenance: { sourceFile: "Data ED", recordIndex: 3, byteOffset: 1278, byteLength: 426, confidence: "fixture-backed" }
    }];
    original.extracodes = [{ id: 5, values: [4, 8, 0, 0, 0] }];
    let state: EditorState = { ...initialEditorState(false), project: original };

    state = editorReducer(state, {
      type: "applyCommand",
      command: {
        kind: "applyEncounterResultSettings",
        label: "Apply Battle settings",
        recordKind: "simple",
        encounterId: 3,
        slot: 0,
        rawCode: -2,
        rowId: 6,
        edcdValues: [-12, -14, 0, 0, 5]
      }
    });
    const applied = state.project;

    expect(state.past).toHaveLength(1);
    expect(applied?.simpleEncounters[0].actions[0]).toMatchObject({ rawCode: -2, id: 6 });
    expect(applied?.extracodes.find((row) => row.id === 6)?.values).toEqual([-12, -14, 0, 0, 5]);

    state = editorReducer(state, { type: "undo" });
    expect(state.project).toBe(original);
    expect(state.project?.extracodes).toEqual([{ id: 5, values: [4, 8, 0, 0, 0] }]);

    state = editorReducer(state, { type: "redo" });
    expect(state.project).toBe(applied);
    expect(state.project?.simpleEncounters[0].actions[0]).toMatchObject({ rawCode: -2, id: 6 });
  });
});
