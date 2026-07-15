import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EncounterActionRow, Project } from "../../types";
import { EncounterResultActionCell } from "./EncounterResultActionCell";

const project = {
  messages: [],
  triggers: []
} as unknown as Project;

function renderCell(row: EncounterActionRow) {
  return renderToStaticMarkup(
    <EncounterResultActionCell
      project={project}
      slot={0}
      row={row}
      onUpdate={() => undefined}
      onFocusCode={() => undefined}
      onPreviewTarget={() => undefined}
    />
  );
}

describe("EncounterResultActionCell", () => {
  it("offers one stable browser for empty and unresolved target-bearing actions", () => {
    const empty = renderCell({ slot: 0, rawCode: 1, id: 0 });
    const unresolved = renderCell({ slot: 0, rawCode: 1, id: 9999 });

    expect(empty).toContain('aria-label="Browse result action 0 target"');
    expect(unresolved).toContain('aria-label="Browse result action 0 target"');
    expect(unresolved).not.toContain("encounter-action-create");
  });

  it("reserves the browser column for actions without a target picker", () => {
    const html = renderCell({ slot: 0, rawCode: 3, id: 4 });

    expect(html).toContain("encounter-action-preview-placeholder");
    expect(html).not.toContain('aria-label="Browse result action 0 target"');
  });
});
