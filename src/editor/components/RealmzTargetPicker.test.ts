import { describe, expect, it } from "vitest";
import {
  resolveSignedTargetValue,
  signedSoundValueForSelection,
  signedSoundWaitsForCompletion,
  signedTargetBehaviorLabel,
  signedTargetValueForSelection,
  supportsSignedSoundReference,
  targetPickerConfig,
  targetOptionsForOpcode,
  type ScriptTargetOption
} from "./RealmzTargetPicker";
import type { LibraryCatalog, Project } from "../types";
import { filterTargetOptions } from "./realmzTargetPickerSearch";

describe("Realmz target semantics", () => {
  it("preserves signed direct-target behavior when replacing a selection", () => {
    expect(resolveSignedTargetValue(1, -808)).toBe(808);
    expect(signedTargetValueForSelection(1, -808, 12)).toBe(-12);
    expect(signedTargetBehaviorLabel(1, -12)).toBe("no wait");
  });

  it("encodes sound wait behavior without changing the selected resource ID", () => {
    expect(supportsSignedSoundReference(9)).toBe(true);
    expect(signedSoundValueForSelection(200, true)).toBe(-200);
    expect(signedSoundWaitsForCompletion(-200)).toBe(true);
    expect(signedSoundValueForSelection(200, false)).toBe(200);
  });

  it("keeps target picker coverage tied to normalized Realmz opcodes", () => {
    expect(targetPickerConfig(5)?.recordType).toBe("complexEncounter");
    expect(targetPickerConfig(-5)?.recordType).toBe("complexEncounter");
    expect(targetPickerConfig(58)).toBeNull();
  });
});

describe("target option filtering", () => {
  const options: ScriptTargetOption[] = [
    { key: "message:12", value: 12, label: "String 12", detail: "The bell tolls below.", sourceState: "Scenario authored" },
    { key: "message:28", value: 28, label: "String 28", detail: "A salt-crusted key rests here.", compatibility: "Realmz resource" }
  ];

  it("matches numeric IDs and author-facing text", () => {
    expect(filterTargetOptions(options, "28").map((option) => option.value)).toEqual([28]);
    expect(filterTargetOptions(options, "bell").map((option) => option.value)).toEqual([12]);
    expect(filterTargetOptions(options, "scenario authored").map((option) => option.value)).toEqual([12]);
  });
});

describe("asset target ownership", () => {
  const project = {
    assets: [
      { id: "scenario-picture", kind: "picture", libraryScope: "scenario", resourceType: "PICT", resourceId: 30000, label: "Scenario Scene", exportState: "ready", previewPath: "scene.png", mimeType: "image/png" },
      { id: "custom-picture", kind: "picture", libraryScope: "custom-library", resourceType: "PICT", resourceId: 30001, label: "Reusable Scene", exportState: "ready", previewPath: "custom.png", mimeType: "image/png" }
    ],
    assetCatalog: {
      pictures: [
        { resourceType: "PICT", resourceId: 170, name: "Interface Override", source: "Scenario resource fork", previewPath: "override.png" },
        { resourceType: "PICT", resourceId: 30002, name: "Imported Scene", source: "Scenario resource fork", previewPath: "imported.png" }
      ],
      sounds: [],
      icons: [],
      tilesets: []
    },
    semanticSchema: { entities: [] },
    triggers: [],
    maps: []
  } as unknown as Project;
  const catalog = {
    assets: [
      { id: "library-asset:realmz-reference:stock", type: "picture", label: "Stock Picture", source: "library-source:realmz-reference:stock", relativePath: "The Family Jewels.rsrc#PICT:170", bytes: 1, sha256: "a", resourceType: "PICT", resourceId: 170 },
      { id: "library-asset:divinity-import:editor", type: "picture", label: "Divinity Picture", source: "library-source:divinity-import:editor", relativePath: "Divinity.rsrc#PICT:171", bytes: 1, sha256: "b", resourceType: "PICT", resourceId: 171 }
    ]
  } as unknown as LibraryCatalog;

  it("offers scenario-safe pictures and Realmz stock IDs without leaking reusable or Divinity-only media", () => {
    const options = targetOptionsForOpcode(project, 27, catalog);
    expect(options.map((option) => option.key)).toContain("scenario-picture");
    expect(options.map((option) => option.key)).toContain("resource:PICT:30002");
    expect(options.map((option) => option.key)).toContain("library-asset:realmz-reference:stock");
    expect(options.map((option) => option.key)).not.toContain("custom-picture");
    expect(options.map((option) => option.key)).not.toContain("resource:PICT:170");
    expect(options.map((option) => option.key)).not.toContain("library-asset:divinity-import:editor");
  });
});
