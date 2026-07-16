import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { EncounterResultTargetPreview } from "./EncounterResultTargetPreview";

vi.mock("../../ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ui")>();
  return {
    ...actual,
    FloatingWorkbenchPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>
  };
});

const project = {
  scenario: { name: "Encounter preview test", projectPath: "" },
  source: { sourcePath: "" },
  triggers: [],
  assets: [
    {
      id: "asset:sound:619",
      kind: "sound",
      resourceId: 619,
      resourceType: "snd ",
      label: "Arrow Hit",
      exportState: "bundled",
      previewPath: "/arrow-hit.wav",
      mimeType: "audio/wav"
    },
    {
      id: "asset:sound:620",
      kind: "sound",
      resourceId: 620,
      resourceType: "snd ",
      label: "Bell Toll",
      exportState: "bundled",
      previewPath: "/bell-toll.wav",
      mimeType: "audio/wav"
    }
  ],
  assetCatalog: { sounds: [], pictures: [], icons: [] }
} as unknown as Project;

function renderSoundPreview(value: number) {
  return renderToStaticMarkup(
    <EncounterResultTargetPreview
      project={project}
      preview={{ slot: 0, opcode: 9, value }}
      previewContext={{}}
      renderRecordPreview={() => null}
      onCreateTarget={() => undefined}
      onChange={() => undefined}
      onClose={() => undefined}
    />
  );
}

describe("EncounterResultTargetPreview", () => {
  it("renders one authoritative sound preview while preserving signed wait behavior", () => {
    const waiting = renderSoundPreview(-619);
    const immediate = renderSoundPreview(620);

    expect(waiting.match(/data-reference-preview-kind="audio"/g)).toHaveLength(1);
    expect(waiting.match(/workbench-reference-audio-action/g)).toHaveLength(1);
    expect(waiting).toContain("Arrow Hit");
    expect(waiting).toMatch(/realmz-target-picker-wait[^]*<input type="checkbox" checked=""/);

    expect(immediate.match(/data-reference-preview-kind="audio"/g)).toHaveLength(1);
    expect(immediate.match(/workbench-reference-audio-action/g)).toHaveLength(1);
    expect(immediate).toContain("Bell Toll");
    expect(immediate).toMatch(/realmz-target-picker-wait[^]*<input type="checkbox"\/></);
  });
});
