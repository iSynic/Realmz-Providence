import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { LibraryEntity, MapEntity } from "../../types";
import { DOMAIN_CONFIG, directDetailForSelection, directRowsForEditor, domainHeaderHelp, matchingEntries } from "./suiteDomainRouting";

function map(id: string, levelType: "land" | "dungeon", index: number): MapEntity {
  return {
    id,
    levelType,
    index,
    name: `${levelType} ${index}`,
    source: levelType === "land" ? "Data LD" : "Data DL",
    width: 2,
    height: 2,
    tiles: [0, 0, 0, 0],
    render: { tilesetId: levelType === "land" ? "landlook-0" : "dungeon-0", landlook: null, mode: levelType === "land" ? "outdoor-landlook" : "dungeon" },
    provenance: { sourceFile: "fixture", recordIndex: index, byteOffset: 0, byteLength: 8, confidence: "fixture-backed" }
  };
}

describe("suite domain routing", () => {
  it("keeps domain configuration tied to author-facing editor families", () => {
    expect(DOMAIN_CONFIG.maps.editors.map((editor) => editor.id)).toContain("land-layout");
    expect(DOMAIN_CONFIG.encounters.editors.map((editor) => editor.id)).toEqual(["simple", "complex", "rogue", "timed"]);
    expect(DOMAIN_CONFIG.economy.editors.filter((editor) => ["bag", "vault"].includes(editor.id)).every((editor) => !editor.createType)).toBe(true);
    expect(domainHeaderHelp("economy")).toContain("Library Workbench");
    expect(domainHeaderHelp("encounters")).toContain("Data ED2");
    expect(domainHeaderHelp("maps")).toBeNull();
  });

  it("separates land and dungeon map rows without changing entity ids", () => {
    const project = createBrowserProject("Domain routes");
    project.maps = [map("land:0", "land", 0), map("dungeon:1", "dungeon", 1)];

    const landEditor = DOMAIN_CONFIG.maps.editors.find((editor) => editor.id === "land")!;
    const dungeonEditor = DOMAIN_CONFIG.maps.editors.find((editor) => editor.id === "dungeon")!;

    expect(directRowsForEditor(project, landEditor).map((row) => row.id)).toEqual(["map:land:0"]);
    expect(directRowsForEditor(project, dungeonEditor).map((row) => row.id)).toEqual(["map:dungeon:1"]);
  });

  it("merges only library entities owned by the selected editor", () => {
    const project = createBrowserProject("Library routes");
    const soundsEditor = DOMAIN_CONFIG.assets.editors.find((editor) => editor.id === "sounds")!;
    const entities = [
      { id: "sound:1", label: "Bell", type: "sound" },
      { id: "picture:1", label: "Portrait", type: "picture" }
    ] as LibraryEntity[];

    expect(matchingEntries(soundsEditor, project, entities).map((entry) => entry.id)).toEqual(["sound:1"]);
  });

  it("resolves direct project details through the shared route registry", () => {
    const project = createBrowserProject("Direct detail");
    expect(directDetailForSelection(project, "contact:info")?.label).toBe("Contact Info");
  });
});
