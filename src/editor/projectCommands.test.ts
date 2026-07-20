import { describe, expect, it } from "vitest";
import { createBrowserProject } from "./browser/project";
import {
  applyProjectCommand,
  projectCommandChangeCount,
  projectCommandLabel
} from "./projectCommands";
import { emptyBattle, emptyMessage, emptyOptionLabel, emptyScenarioItem, emptyShop, emptyTreasure } from "./projectCommands/targetRecordCommands";
import type { Project, ProjectCommand } from "./types";

describe("project command facade", () => {
  it("drops imported scenario metadata bytes when semantics are authored", () => {
    const project = createBrowserProject("Semantic scenario metadata");
    project.scenario.shell = {
      ...project.scenario.shell!,
      rawBytes: new Array(320).fill(0xa5),
      trailingBytes: [0xde, 0xad, 0xbe, 0xef],
      authored: false
    };
    project.scenario.contactInfo = {
      ...project.scenario.contactInfo!,
      rawBytes: new Array(4608).fill(0xa5),
      authored: false
    };
    project.scenario.restrictions = {
      description: "Imported restrictions",
      maxPartyCharacters: 0,
      maxPartyLevel: 0,
      bannedRaces: [],
      bannedCastes: [],
      rawBytes: new Array(320).fill(0xa5),
      authored: false
    };
    project.scenario.globalMacroHooks = {
      ...applyProjectCommand(project, {
        kind: "updateGlobalMacroHook",
        label: "Seed global hooks",
        slot: 0,
        door: 1
      }).scenario.globalMacroHooks!,
      rawBytes: new Array(60).fill(0xa5),
      authored: false
    };
    project.scenario.securityBackup = {
      ...project.scenario.shell,
      sourceFile: "Data CS",
      rawBytes: new Array(318).fill(0xb6),
      trailingBytes: [0xba, 0xdc],
      authored: false
    };
    project.scenario.supportFile = {
      sourceFile: "Scenario",
      divinityStringEditorSlot: 4,
      divinityStringSoundId: 10,
      rawBytes: new Array(600).fill(0xc7),
      authored: false
    };

    const support = applyProjectCommand(project, {
      kind: "updateStringSound",
      label: "Set string sound",
      messageId: 12,
      soundId: -303
    });
    const shell = applyProjectCommand(support, {
      kind: "updateScenarioShell",
      label: "Author scenario shell",
      changes: { lookX: 12 }
    });
    const security = applyProjectCommand(shell, {
      kind: "updateScenarioSecurityCodes",
      label: "Author scenario security",
      shellChanges: { codeseg1: [1, 2, 3] },
      backupChanges: { codeseg1: [4, 5, 6] }
    });
    const contact = applyProjectCommand(security, {
      kind: "updateScenarioContactInfo",
      label: "Author contact info",
      changes: { author: "Providence" }
    });
    const restrictions = applyProjectCommand(contact, {
      kind: "updateScenarioRestrictions",
      label: "Author restrictions",
      changes: { maxPartyCharacters: 4 }
    });
    const globalHooks = applyProjectCommand(restrictions, {
      kind: "updateGlobalMacroHook",
      label: "Author start hook",
      slot: 0,
      door: 9
    });

    expect(globalHooks.scenario.supportFile).toMatchObject({ divinityStringEditorSlot: 12, divinityStringSoundId: -303, authored: true });
    expect(globalHooks.scenario.supportFile?.rawBytes).toBeUndefined();
    expect(globalHooks.scenario.shell).toMatchObject({ lookX: 12, codeseg1: [1, 2, 3], authored: true });
    expect(globalHooks.scenario.shell?.rawBytes).toBeUndefined();
    expect(globalHooks.scenario.shell?.trailingBytes).toEqual([]);
    expect(globalHooks.scenario.securityBackup).toMatchObject({ codeseg1: [4, 5, 6], authored: true });
    expect(globalHooks.scenario.securityBackup?.rawBytes).toBeUndefined();
    expect(globalHooks.scenario.securityBackup?.trailingBytes).toEqual([]);
    expect(globalHooks.scenario.contactInfo).toMatchObject({ author: "Providence", authored: true });
    expect(globalHooks.scenario.contactInfo?.rawBytes).toBeUndefined();
    expect(globalHooks.scenario.restrictions).toMatchObject({ maxPartyCharacters: 4, authored: true });
    expect(globalHooks.scenario.restrictions?.rawBytes).toBeUndefined();
    expect(globalHooks.scenario.globalMacroHooks).toMatchObject({ authored: true });
    expect(globalHooks.scenario.globalMacroHooks?.slots.find((slot) => slot.slot === 0)?.door).toBe(9);
    expect(globalHooks.scenario.globalMacroHooks?.rawBytes).toBeUndefined();
  });

  it("creates fresh messages from semantic text without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Message");
    project.messages = [{ ...emptyMessage(4), rawBytes: new Array(256).fill(0xa5) } as unknown as Project["messages"][number]];

    const next = applyProjectCommand(project, {
      kind: "updateMessageRecord",
      label: "Create message",
      id: 4,
      changes: { text: "Providence owns this message." }
    });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].text).toBe("Providence owns this message.");
    expect("rawBytes" in next.messages[0]).toBe(false);
  });

  it("creates fresh option labels from semantic text without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Option Label");
    project.optionLabels = [{ ...emptyOptionLabel(4), rawBytes: new Array(25).fill(0xa5) } as unknown as Project["optionLabels"][number]];

    const next = applyProjectCommand(project, {
      kind: "updateOptionLabel",
      label: "Create option label",
      id: 4,
      changes: { text: "Proceed" }
    });

    expect(next.optionLabels).toHaveLength(1);
    expect(next.optionLabels[0].text).toBe("Proceed");
    expect("rawBytes" in next.optionLabels[0]).toBe(false);
  });

  it("creates fresh battles from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Battle");
    project.battles = [{ ...emptyBattle(4), rawBytes: new Array(346).fill(0xa5) } as unknown as Project["battles"][number]];

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create battle",
      recordType: "battle",
      id: 4
    });

    expect(next.battles).toHaveLength(1);
    expect(next.battles[0].grid).toHaveLength(13 * 13);
    expect("rawBytes" in next.battles[0]).toBe(false);
  });

  it("authors monster descriptions without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Monster Description");
    project.monsterDescriptions = [{
      id: 4,
      text: "Imported description",
      rawBytes: new Array(256).fill(0xa5),
      authored: false,
      provenance: { sourceFile: "Data DES", recordIndex: 4, byteOffset: 4 * 256, byteLength: 256, confidence: "fixture-backed" }
    } as unknown as Project["monsterDescriptions"][number]];

    const next = applyProjectCommand(project, {
      kind: "upsertMonsterDescription",
      label: "Author monster description",
      id: 4,
      text: "Providence owns this description."
    });

    expect(next.monsterDescriptions[0].text).toBe("Providence owns this description.");
    expect("rawBytes" in next.monsterDescriptions[0]).toBe(false);
  });

  it("creates fresh simple encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Simple Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create simple encounter",
      recordType: "simpleEncounter",
      id: 4
    });

    expect(next.simpleEncounters).toHaveLength(1);
    expect(next.simpleEncounters[0].texts).toEqual(["", "", "", ""]);
    expect(next.simpleEncounters[0].rawBytes).toBeUndefined();
  });

  it("creates fresh complex encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Complex Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create complex encounter",
      recordType: "complexEncounter",
      id: 4
    });

    expect(next.complexEncounters).toHaveLength(1);
    expect(next.complexEncounters[0].texts).toHaveLength(9);
    expect(next.complexEncounters[0].spellIds).toHaveLength(10);
    expect(next.complexEncounters[0].rawBytes).toBeUndefined();
    expect(next.complexEncounters[0].choiceResults).toBeUndefined();
    expect(next.complexEncounters[0].wordResults).toBeUndefined();
  });

  it("creates fresh thief encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Thief Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create thief encounter",
      recordType: "thiefEncounter",
      id: 4
    });

    expect(next.thiefEncounters).toHaveLength(1);
    expect(next.thiefEncounters[0].typeFlags).toHaveLength(10);
    expect(next.thiefEncounters[0].successCodes).toHaveLength(8);
    expect(next.thiefEncounters[0].prompts).toHaveLength(3);
    expect(next.thiefEncounters[0].rawBytes).toBeUndefined();
  });

  it("creates fresh timed encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Timed Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create timed encounter",
      recordType: "timedEncounter",
      id: 4
    });

    expect(next.timedEncounters).toHaveLength(1);
    expect(next.timedEncounters[0]).toMatchObject({ day: -1, increment: -1, percent: 100, locationKind: "any" });
    expect("reservedWords" in next.timedEncounters[0]).toBe(false);
    expect("rawBytes" in next.timedEncounters[0]).toBe(false);
  });

  it("creates fresh map records from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Player Map");

    const next = applyProjectCommand(project, {
      kind: "createMapRecord",
      label: "Create player map",
      id: 3,
      template: { note: "Canonical map" }
    });

    expect(next.mapRecords).toHaveLength(1);
    expect(next.mapRecords[0].markers).toHaveLength(10);
    expect(next.mapRecords[0].note).toBe("Canonical map");
    expect("rawBytes" in next.mapRecords[0]).toBe(false);
  });

  it("creates fresh scenario items from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Scenario Item");
    project.scenarioItems = [{ ...emptyScenarioItem(4), rawBytes: new Array(100).fill(0xa5) } as unknown as Project["scenarioItems"][number]];

    const next = applyProjectCommand(project, {
      kind: "updateScenarioItemRecord",
      label: "Create scenario item",
      id: 4,
      changes: { itemId: 904, cost: 25 }
    });

    expect(next.scenarioItems).toHaveLength(1);
    expect(next.scenarioItems[0].itemId).toBe(904);
    expect(next.scenarioItems[0].cost).toBe(25);
    expect(next.scenarioItems[0].spare2).toHaveLength(7);
    expect("rawBytes" in next.scenarioItems[0]).toBe(false);
  });

  it("creates fresh treasures from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Treasure");
    project.treasures = [{ ...emptyTreasure(4), rawBytes: new Array(48).fill(0xa5) } as unknown as Project["treasures"][number]];

    const next = applyProjectCommand(project, {
      kind: "updateTreasureRecord",
      label: "Create treasure",
      id: 4,
      changes: { itemIds: [901, ...new Array(19).fill(0)], gold: 25 }
    });

    expect(next.treasures).toHaveLength(1);
    expect(next.treasures[0].gold).toBe(25);
    expect(next.treasures[0].itemIds).toHaveLength(20);
    expect("rawBytes" in next.treasures[0]).toBe(false);
  });

  it("creates fresh shops from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Shop");
    project.shops = [{ ...emptyShop(4), rawBytes: new Array(3002).fill(0xa5) } as unknown as Project["shops"][number]];

    const next = applyProjectCommand(project, {
      kind: "updateShopRecord",
      label: "Create shop",
      id: 4,
      changes: {
        itemIds: [901, ...new Array(999).fill(0)],
        quantities: [3, ...new Array(999).fill(0)],
        inflation: 105
      }
    });

    expect(next.shops).toHaveLength(1);
    expect(next.shops[0].inflation).toBe(105);
    expect(next.shops[0].itemIds).toHaveLength(1000);
    expect(next.shops[0].quantities).toHaveLength(1000);
    expect("rawBytes" in next.shops[0]).toBe(false);
  });

  it("applies an immutable command and exposes history metadata", () => {
    const project = createBrowserProject("Command Facade");
    const originalTile = project.maps[0].tiles[0];
    const command: ProjectCommand = {
      kind: "paintTiles",
      label: "Paint selected tiles",
      mapId: project.maps[0].id,
      cells: [
        { x: 0, y: 0, index: 0, from: originalTile, to: originalTile + 1 },
        { x: 1, y: 0, index: 1, from: project.maps[0].tiles[1], to: originalTile + 1 }
      ]
    };

    const next = applyProjectCommand(project, command);

    expect(next).not.toBe(project);
    expect(project.maps[0].tiles[0]).toBe(originalTile);
    expect(next.maps[0].tiles.slice(0, 2)).toEqual([originalTile + 1, originalTile + 1]);
    expect(projectCommandLabel(command)).toBe("Paint 2 tiles");
    expect(projectCommandChangeCount(command)).toBe(2);
  });

  it("removes an imported scenario resource without deleting fallback or unrelated assets", () => {
    const project = createBrowserProject("Resource Removal");
    project.assetCatalog = {
      ...project.assetCatalog,
      pictures: [
        { id: "picture:scenario:170", resourceType: "PICT", resourceId: 170, name: "Scenario Override", source: "Scenario resource fork", previewPath: "override.png" },
        { id: "picture:realmz:302", resourceType: "PICT", resourceId: 302, name: "Dungeon Top Down", source: "Realmz reference resources", previewPath: "dungeon.png" },
        { id: "picture:scenario:30000", resourceType: "PICT", resourceId: 30000, name: "Scenario Scene", source: "Scenario resource fork", previewPath: "scene.png" }
      ]
    };
    project.semanticSchema.entities = [
      semanticResourceEntity("resource:scenario:170", "Scenario resource fork", 170),
      semanticResourceEntity("resource:realmz:170", "Realmz reference resources", 170),
      semanticResourceEntity("resource:scenario:30000", "Scenario resource fork", 30000)
    ];
    project.semanticSchema.links = [
      semanticResourceLink("link:scenario", "resource:scenario:170", "resource:scenario:30000"),
      semanticResourceLink("link:realmz", "resource:realmz:170", "resource:scenario:30000")
    ];

    const next = applyProjectCommand(project, {
      kind: "removeScenarioResource",
      label: "Remove PICT 170",
      resourceType: "PICT",
      resourceId: 170,
      source: "Scenario resource fork"
    });

    expect(next.assetCatalog.pictures?.map((asset) => `${asset.source}:${asset.resourceId}`)).toEqual([
      "Realmz reference resources:302",
      "Scenario resource fork:30000"
    ]);
    expect(next.semanticSchema.entities.map((entity) => entity.id)).toEqual([
      "resource:realmz:170",
      "resource:scenario:30000"
    ]);
    expect(next.semanticSchema.links.map((link) => link.id)).toEqual(["link:realmz"]);
    expect(next.semanticSchema.reverseLinks).toEqual({
      "resource:realmz:170": { incoming: [], outgoing: ["link:realmz"] },
      "resource:scenario:30000": { incoming: ["link:realmz"], outgoing: [] }
    });
    expect(next.editorMetadata.removedScenarioResources).toEqual([{ resourceType: "PICT", resourceId: 170 }]);
  });
});

function semanticResourceEntity(id: string, source: string, resourceId: number) {
  return {
    id,
    type: "resource",
    label: `PICT ${resourceId}`,
    editState: "inspect-only" as const,
    confidence: "fixture-proven",
    source,
    recordRef: null,
    byteRange: null,
    editable: false,
    summary: { resourceType: "PICT", resourceId }
  };
}

function semanticResourceLink(id: string, from: string, to: string) {
  return {
    id,
    from,
    to,
    kind: "references",
    confidence: "fixture-proven",
    evidence: [],
    metadata: {}
  };
}
