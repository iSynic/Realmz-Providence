import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { EncounterActionRow } from "../../types";
import { EncounterResultActionMatrix } from "./EncounterResultActionMatrix";

function renderMatrix(recordKind: "simple" | "complex", actions: EncounterActionRow[]) {
  const project = createBrowserProject(`${recordKind} encounter matrix`);
  project.extracodes = [{ id: 5, values: [-4, -8, 0, 0, 5] }];
  project.battles = [4, 8].map((id) => ({
    id,
    grid: [],
    dist: 0,
    messageBefore: 0,
    messageAfter: 0,
    battleMacro: 0,
    provenance: {
      sourceFile: "Data B",
      recordIndex: id,
      byteOffset: 0,
      byteLength: 0,
      confidence: "fixture-backed" as const
    }
  }));
  return renderToStaticMarkup(
    <EncounterResultActionMatrix
      project={project}
      recordKind={recordKind}
      recordId={3}
      actions={actions}
      title="Result Scripts"
      description="Author all result columns."
      decisionSources={[]}
      selectedResultIndex={0}
      onSelectResult={() => undefined}
      onUpdate={() => undefined}
      onCreateTarget={() => undefined}
      onApplyCommand={() => undefined}
      renderRecordPreview={() => null}
    />
  );
}

describe("EncounterResultActionMatrix", () => {
  it.each(["simple", "complex"] as const)("renders all four results and eight rows for %s encounters", (recordKind) => {
    const html = renderMatrix(recordKind, [
      { slot: 30, rawCode: 1, id: 7 },
      { slot: 31, rawCode: -2, id: 5 }
    ]);

    expect(html).toContain("Result #1");
    expect(html).toContain("Result #4");
    for (let slot = 0; slot < 32; slot += 1) {
      expect(html).toContain(`aria-label="Result action ${slot} opcode"`);
    }
    expect(html).toContain('aria-label="Edit result action 30 settings"');
    expect(html).toContain('aria-label="Edit result action 31 settings"');
    expect(html).toContain("Surprise");
  });
});
