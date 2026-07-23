import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset, LibraryCatalog, Project } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  ItemSoundField,
  itemSoundRawOption,
  itemSoundReferenceOptions,
  itemSoundReferences,
  itemSoundResourceId
} from "./ItemSoundField";

const librarySound: LibraryAsset = {
  id: "library-sound-624",
  type: "sound",
  label: "BomBom",
  source: "Realmz",
  relativePath: "The Family Jewels.rsrc#snd:624",
  bytes: 32,
  sha256: "sound-624",
  resourceType: "snd",
  resourceId: 624,
  previewPath: "data:audio/wav;base64,UklGRg=="
};

const project = {
  scenario: { name: "Sound Test" },
  source: { sourcePath: "sound-test" },
  assets: [{
    id: "scenario-sound-624",
    label: "Scenario Bell",
    kind: "sound",
    resourceType: "snd ",
    resourceId: 624,
    libraryScope: "scenario"
  }],
  assetCatalog: {
    sounds: [{ id: "catalog-sound-625", resourceType: "snd ", resourceId: 625, name: "Door Bell", source: "Scenario resources" }]
  }
} as unknown as Project;

const catalog = { assets: [librarySound] } as LibraryCatalog;

describe("Economy item sound field", () => {
  it("maps snd resources to stored item offsets and merges aliases", () => {
    const references = itemSoundReferences(project, catalog);
    expect(references.map((reference) => reference.value)).toEqual([24, 25]);
    expect(references.map((reference) => reference.resourceId)).toEqual([624, 625]);
    expect(references[0]?.detail).toContain("Scenario Asset");
    expect(references[0]?.detail).toContain("Realmz");
    expect(references[0]?.searchText).toContain("BomBom");
  });

  it("uses shared term matching and accepts stored values or snd IDs", () => {
    const references = itemSoundReferences(project, catalog);
    const options = itemSoundReferenceOptions(references);
    expect(filterReferencePickerOptions(options, "door bell").map((option) => option.value)).toEqual([25]);
    expect(itemSoundRawOption("624", options, references)).toBeNull();
    expect(itemSoundRawOption("644", options, references)).toMatchObject({ value: 44 });
    expect(itemSoundRawOption("-459", options, references)).toMatchObject({ value: -459 });
  });

  it("matches Realmz's signed 16-bit item sound resource lookup", () => {
    expect(itemSoundResourceId(24)).toBe(624);
    expect(itemSoundResourceId(-459)).toBe(141);
    expect(itemSoundResourceId(0)).toBeNull();
  });

  it("renders the shared compact picker and audio preview action", () => {
    const html = renderToStaticMarkup(
      <ItemSoundField
        value={24}
        project={project}
        catalog={catalog}
        previewContext={{} as never}
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('aria-label="Search item sound"');
    expect(html).toContain('aria-label="Preview item sound"');
    expect(html).toContain('data-reference-preview-key="item-sound-preview:24"');
    expect(html).toContain("snd 624");
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain(">Play<");
  });
});
