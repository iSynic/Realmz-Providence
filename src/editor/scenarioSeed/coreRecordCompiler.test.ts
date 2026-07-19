import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import type { ManagedAsset } from "../types";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import type { ScenarioSeed } from "./contracts";
import { compileScenarioSeedAssets, compileScenarioSeedCoreRecords } from "./coreRecordCompiler";

const customIcon: ManagedAsset = {
  id: "asset:workspace:wight-icon",
  label: "Wight Icon",
  kind: "icon",
  resourceType: "cicn",
  resourceId: 0,
  fileName: "wight.cicn",
  originalPath: "library/wight.cicn",
  previewPath: "",
  resourcePath: "",
  mimeType: "application/octet-stream",
  bytes: 32,
  sha256: "wight-icon",
  width: 32,
  height: 32,
  durationMs: null,
  sampleRate: null,
  channels: null,
  exportState: "ready",
  libraryScope: "custom-library",
  provenance: "test custom library",
  linkedEntity: null
};

describe("scenario seed core record compiler", () => {
  it("registers assets before resolving record references and compiles each core domain", () => {
    const context = createScenarioSeedCompilerContext();
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Core Records" },
      assets: [
        { key: "stock-item-icon", source: "stock", resourceType: "cicn", resourceId: 300 },
        { key: "wight-icon", source: "custom-library", assetId: customIcon.id, resourceId: 30126 }
      ],
      messages: [{ id: 4, text: "The bell answers." }],
      optionLabels: [{ id: 2, text: "Proceed" }],
      quests: [{ id: 5, label: "Wake the Bell", note: "Optional" }],
      items: [{ id: 5, itemId: 805, icon: "stock-item-icon", identifiedName: "Bell Clapper", description: "Cold bronze." }],
      monsters: [{ id: 3, name: "Bell Wight", icon: "wight-icon", hitDice: 4, variants: "copyAll" }],
      battles: [{ id: 1, placements: [{ x: 1, y: 2, monster: 3 }] }],
      treasures: [{ id: 2, itemIds: [805], gold: 12 }],
      shops: [{ id: 3, stock: [{ itemId: 805, quantity: 2 }] }],
      spells: [{ id: 0, displayName: "Bell Ward", cost: 4 }],
      races: [{ id: 29, displayName: "Stoneborn", baseMove: 9 }],
      castes: [{ id: 10, displayName: "Bell Warden", startItems: [805] }]
    };

    const assets = compileScenarioSeedAssets(seed.assets, [customIcon], context);
    expect(assets).toHaveLength(1);
    if (!assets) throw new Error("Expected explicit asset input to produce an asset collection.");
    expect(assets[0]).toMatchObject({ resourceId: 30126, libraryScope: "scenario" });
    expect(context.assets.get("stock-item-icon")).toMatchObject({ resourceId: 300, bundled: false });
    expect(context.assets.get("wight-icon")).toMatchObject({ resourceId: 30126, bundled: true });

    const base = createBrowserProject("Core Records");
    const compiled = compileScenarioSeedCoreRecords({ ...base, assets }, seed, context);

    expect(compiled.messages).toEqual([expect.objectContaining({ id: 4, text: "The bell answers." })]);
    expect(compiled.optionLabels).toEqual([expect.objectContaining({ id: 2, text: "Proceed", authored: true })]);
    expect(compiled.optionLabels[0].rawBytes).toBeUndefined();
    expect(compiled.questLabels).toEqual([{ id: 5, label: "Wake the Bell", note: "Optional" }]);
    expect(compiled.scenarioItems[0]).toMatchObject({ id: 5, itemId: 805, iconId: 300 });
    expect(compiled.itemTexts[0]).toMatchObject({ itemId: 805, identifiedName: "Bell Clapper" });
    expect(compiled.monsters[0]).toMatchObject({ id: 3, iconId: 30126, hitDice: 4 });
    expect(compiled.monsters[0]?.rawBytes).toBeUndefined();
    expect(compiled.monsterDescriptions[0]?.rawBytes).toBeUndefined();
    expect(compiled.monsterSets.find((set) => set.setId === -1)?.monsters[0]).toMatchObject({ id: 3, hitDice: 4 });
    expect(compiled.monsterSets.find((set) => set.setId === 1)?.monsters[0]).toMatchObject({ id: 3, hitDice: 4 });
    expect(compiled.monsterSets.flatMap((set) => set.monsters).every((record) => record.rawBytes === undefined)).toBe(true);
    expect(compiled.battles[0]?.grid[2 * 13 + 1]).toBe(3);
    expect(compiled.battles[0]?.rawBytes).toBeUndefined();
    expect(compiled.treasures[0]).toMatchObject({ id: 2, gold: 12, itemIds: expect.arrayContaining([805]) });
    expect(compiled.shops[0]).toMatchObject({ id: 3, inflation: 0 });
    expect(compiled.shops[0]?.itemIds[0]).toBe(805);
    expect(compiled.shops[0]?.quantities[0]).toBe(2);
    expect(compiled.spellOverrides[0]).toMatchObject({ id: 0, displayName: "Bell Ward", cost: 4 });
    expect(compiled.raceOverrides[0]).toMatchObject({ id: 29, displayName: "Stoneborn", baseMove: 9, rawBytes: [] });
    expect(compiled.casteOverrides[0]?.startItems[0]).toBe(805);
  });

  it("preserves template domains that are absent from the seed", () => {
    const context = createScenarioSeedCompilerContext("template");
    const base = createBrowserProject("Template");
    const battles = base.battles;
    const monsters = base.monsters;
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Template" },
      messages: [{ id: 1, text: "Only messages change." }]
    };

    const compiled = compileScenarioSeedCoreRecords(base, seed, context);

    expect(compiled).not.toBe(base);
    expect(compiled.battles).toBe(battles);
    expect(compiled.monsters).toBe(monsters);
    expect(compiled.messages).toEqual([expect.objectContaining({ id: 1, text: "Only messages change." })]);
    expect(base.messages).not.toEqual(compiled.messages);
  });
});
