import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EncounterActionRow, Project } from "../../types";
import { EncounterResultActionCell, encounterResultIdHelp } from "./EncounterResultActionCell";

const project = {
  messages: [{ id: 15, text: "The tide answers." }],
  triggers: [],
  assetCatalog: {
    tilesets: [],
    pictures: [],
    icons: [],
    sounds: []
  }
} as unknown as Project;

function renderCell(row: EncounterActionRow) {
  return renderToStaticMarkup(
    <EncounterResultActionCell
      project={project}
      recordKind="simple"
      slot={0}
      row={row}
      onUpdate={() => undefined}
      onFocusCode={() => undefined}
      onPreviewTarget={() => undefined}
      onEditSettings={() => undefined}
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

  it("uses Providence hover help instead of a native input title", () => {
    const html = renderCell({ slot: 0, rawCode: 14, id: 1 });

    expect(html).toContain('class="tutorial-tip tutorial-tip-below"');
    expect(html).toMatch(/aria-describedby=":[^\"]+"/);
    expect(html).not.toContain('title="Raw value 1"');
    expect(html).not.toContain('tabindex="0"');
  });

  it("uses contextual manual ID metadata for positive and negative action codes", () => {
    expect(encounterResultIdHelp(project, null, { slot: 0, rawCode: 14, id: 2 })).toEqual({
      title: "14 Pick Characters ID Field",
      body: "Number of characters to pick. Current raw value: 2."
    });
    expect(encounterResultIdHelp(project, null, { slot: 0, rawCode: -14, id: 3 }).body)
      .toBe("Number of characters to pick. Current raw value: 3.");
  });

  it("combines target-field guidance with the resolved target", () => {
    const help = encounterResultIdHelp(project, null, { slot: 0, rawCode: 1, id: -15 });

    expect(help.body).toContain("String Number to Display.");
    expect(help.body).toContain("Current target:");
    expect(help.body).toContain("The tide answers.");
  });

  it("falls back to useful raw-value guidance for undocumented actions", () => {
    expect(encounterResultIdHelp(project, null, { slot: 0, rawCode: 200, id: 7 }).body)
      .toBe("No contextual ID-field description is documented for this action. Current raw value: 7.");
  });

  it("offers Remake progression readiness only for media actions", () => {
    const sound = renderCell({ slot: 0, rawCode: 9, id: 321, mediaRequiredForProgression: true });
    const negativePicture = renderCell({ slot: 0, rawCode: -27, id: 306 });
    const message = renderCell({ slot: 0, rawCode: 1, id: 15 });

    expect(sound).toContain("Required for Remake progression");
    expect(sound).toContain('type="checkbox" checked=""');
    expect(negativePicture).toContain("Required for Remake progression");
    expect(message).not.toContain("Required for Remake progression");
  });

  it("replaces a settings-row number with a contextual settings control", () => {
    const withBattle = {
      ...project,
      battles: [{ id: 4 }, { id: 8 }],
      extracodes: [{ id: 12, values: [4, 8, 0, 0, 0] }]
    } as unknown as Project;
    const html = renderToStaticMarkup(
      <EncounterResultActionCell
        project={withBattle}
        recordKind="simple"
        slot={0}
        row={{ slot: 0, rawCode: 2, id: 12 }}
        onUpdate={() => undefined}
        onFocusCode={() => undefined}
        onPreviewTarget={() => undefined}
        onEditSettings={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Edit result action 0 settings"');
    expect(html).toContain("Battle");
    expect(html).not.toContain('aria-label="Result action 0 ID"');
    expect(html).not.toMatch(/<input[^>]+value="12"/);
  });
});
