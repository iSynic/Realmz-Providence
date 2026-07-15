import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset, LibraryCatalog, Project } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  ItemSoundField,
  itemSoundRawOption,
  itemSoundReferenceOptions,
  itemSoundReferences
} from "./ItemSoundField";

const librarySound: LibraryAsset = {
  id: "library-sound-205",
  type: "sound",
  label: "Beacon Chime",
  source: "Realmz",
  relativePath: "Sounds/205.snd",
  bytes: 32,
  sha256: "sound-205",
  resourceType: "snd",
  resourceId: 205,
  previewPath: "data:audio/wav;base64,UklGRg=="
};

const project = {
  scenario: { name: "Sound Test" },
  source: { sourcePath: "sound-test" },
  assets: [{
    id: "scenario-sound-205",
    label: "Scenario Bell",
    kind: "sound",
    resourceType: "snd ",
    resourceId: 205,
    libraryScope: "scenario"
  }],
  assetCatalog: {
    sounds: [{ id: "catalog-sound-206", resourceType: "snd ", resourceId: 206, name: "Door Bell", source: "Scenario resources" }]
  }
} as unknown as Project;

const catalog = { assets: [librarySound] } as LibraryCatalog;

describe("Economy item sound field", () => {
  it("merges scenario, project, and library sound aliases by snd ID", () => {
    const references = itemSoundReferences(project, catalog);
    expect(references.map((reference) => reference.value)).toEqual([205, 206]);
    expect(references[0]?.detail).toContain("Scenario Asset");
    expect(references[0]?.detail).toContain("Realmz");
    expect(references[0]?.searchText).toContain("Beacon Chime");
  });

  it("uses shared term matching and preserves signed raw values", () => {
    const options = itemSoundReferenceOptions(itemSoundReferences(project, catalog));
    expect(filterReferencePickerOptions(options, "door bell").map((option) => option.value)).toEqual([206]);
    expect(itemSoundRawOption("205", options)).toBeNull();
    expect(itemSoundRawOption("-205", options)).toMatchObject({ value: -205 });
  });

  it("renders the shared compact picker and audio preview action", () => {
    const html = renderToStaticMarkup(
      <ItemSoundField
        value={205}
        project={project}
        catalog={catalog}
        previewContext={{} as never}
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('aria-label="Search item sound"');
    expect(html).toContain('aria-label="Preview item sound"');
    expect(html).toContain('data-reference-preview-key="item-sound-preview:205"');
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain(">Play<");
  });
});
