import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { defaultGlobalMacroHooks } from "../projectCommands/scenarioRulesCommands";
import {
  buildBrowserSemanticSchemaForProject,
  createBrowserProject,
  normalizeBrowserProject,
  registerBrowserSourceSnapshot,
  validateBrowserProject
} from "./project";
import { expectedAuthoredScenarioManifestFiles } from "./scenarioPackage";
import { parseScenarioBuffers } from "./realmzParser";

describe("browser project native manifest validation", () => {
  it("migrates obsolete complex encounter result aliases into canonical fields", () => {
    const project = createBrowserProject("Legacy complex encounter aliases");
    project.complexEncounters = [{
      id: 0,
      actions: [],
      actionResult: 0,
      wordResult: undefined,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: [0xfe],
      wordResults: [7],
      canBackOut: false,
      thief: false,
      maxTimes: 0,
      casteSuccess: 0,
      thiefSuccess: 0,
      thiefFail: 0,
      prompt: 0,
      texts: [],
      provenance: { sourceFile: "Data ED2", recordIndex: 0, byteOffset: 0, byteLength: 520, confidence: "fixture-backed" }
    } as unknown as Project["complexEncounters"][number]];

    const normalized = normalizeBrowserProject(project).complexEncounters[0];

    expect(normalized.actionResult).toBe(-2);
    expect(normalized.wordResult).toBe(7);
    expect(normalized.choiceResults).toBeUndefined();
    expect(normalized.wordResults).toBeUndefined();
    expect(normalized.groups).toHaveLength(8);
    expect(normalized.spellIds).toHaveLength(10);
    expect(normalized.itemIds).toHaveLength(5);
    expect(normalized.texts).toHaveLength(9);
  });

  it("backfills canonical thief encounter slot arrays", () => {
    const project = createBrowserProject("Legacy thief encounter arrays");
    project.thiefEncounters = [{
      id: 1,
      typeFlags: [true],
      modifiers: [-2],
      successCodes: [],
      failureCodes: [],
      successText: [],
      failureText: [],
      successSounds: [],
      failureSounds: [],
      spell: 17,
      lowDamage: 3,
      highDamage: 9,
      tumblers: 5,
      prompts: [4],
      promptSounds: [],
      provenance: { sourceFile: "Data TD2", recordIndex: 1, byteOffset: 118, byteLength: 118, confidence: "fixture-backed" }
    }];

    const normalized = normalizeBrowserProject(project).thiefEncounters[0];

    expect(normalized.typeFlags).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(normalized.modifiers).toEqual([-2, 0, 0, 0, 0, 0, 0, 0]);
    expect(normalized.successCodes).toHaveLength(8);
    expect(normalized.successText).toHaveLength(8);
    expect(normalized.successSounds).toHaveLength(8);
    expect(normalized.prompts).toEqual([4, 0, 0]);
    expect(normalized.promptSounds).toEqual([0, 0, 0]);
  });

  it("drops legacy timed compatibility fields from the canonical record", () => {
    const project = createBrowserProject("Legacy timed encounter words");
    project.timedEncounters = [{
      id: 0,
      day: 1,
      increment: 2,
      percent: 50,
      door: 3,
      requiredLevel: 0,
      requiredRandomRect: -1,
      requiredX: 10,
      requiredY: 12,
      requiredItem: -1,
      requiredQuest: -1,
      locationKind: "land",
      stuff: [1, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      reservedWords: [21, 22, 23, 24, 25, 26, 27, 28, 29],
      rawBytes: new Array(40).fill(0xa5),
      provenance: { sourceFile: "Data TD3", recordIndex: 0, byteOffset: 0, byteLength: 40, confidence: "fixture-backed" }
    } as unknown as Project["timedEncounters"][number]];

    const normalized = normalizeBrowserProject(project).timedEncounters[0];

    expect("stuff" in normalized).toBe(false);
    expect("reservedWords" in normalized).toBe(false);
    expect("rawBytes" in normalized).toBe(false);
  });

  it("drops legacy random-level compatibility words from the canonical record", () => {
    const project = createBrowserProject("Legacy random-level words");
    project.randomLevels[0] = {
      ...project.randomLevels[0],
      rawValues: new Array(322).fill(0xa5)
    } as unknown as Project["randomLevels"][number];

    const normalized = normalizeBrowserProject(project).randomLevels[0];

    expect("rawValues" in normalized).toBe(false);
  });

  it("migrates legacy map-record markers before dropping embedded raw bytes", () => {
    const project = createBrowserProject("Legacy map-record bytes");
    const input = new Uint8Array(340);
    input.set([0x01, 0x90, 0x00, 0x0c, 0x00, 0x0d]);
    const parsed = parseScenarioBuffers(new Map([["Data MD2", input]])).mapRecords[0];
    project.mapRecords = [{
      ...parsed,
      markers: [],
      rawBytes: Array.from(input)
    } as unknown as Project["mapRecords"][number]];

    const normalized = normalizeBrowserProject(project).mapRecords[0];

    expect(normalized.markers).toHaveLength(10);
    expect(normalized.markers[0]).toEqual({ iconId: 400, x: 12, y: 13 });
    expect("rawBytes" in normalized).toBe(false);
  });

  it("drops legacy land-layout tail bytes from the canonical record", () => {
    const project = createBrowserProject("Legacy land-layout tail");
    project.landLayout = {
      rows: 8,
      cols: 16,
      cells: new Array(128).fill(0),
      trailingBytes: [0xde, 0xad, 0xbe, 0xef],
      authored: false,
      provenance: null
    } as unknown as Project["landLayout"];

    const normalized = normalizeBrowserProject(project).landLayout!;

    expect("trailingBytes" in normalized).toBe(false);
  });

  it("normalizes legacy monster slot arrays into the canonical fixed contract", () => {
    const project = createBrowserProject("Legacy monster arrays");
    const parsed = parseScenarioBuffers(new Map([["Data MD", new Uint8Array(210)]])).monsters[0];
    const legacy = {
      ...parsed,
      typeFlags: [1],
      attacks: [[2, 3]],
      saves: [4],
      spellImmunities: [],
      money: [5],
      spells: [6],
      items: [7],
      underneath: [8],
      conditions: [9]
    };
    project.monsters = [legacy];
    project.monsterSets = [{ sourceFile: "Data MD1", setId: 1, monsters: [legacy] }];

    const normalized = normalizeBrowserProject(project);
    for (const record of [normalized.monsters[0], normalized.monsterSets[0].monsters[0]]) {
      expect(record.typeFlags).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
      expect(record.attacks).toHaveLength(5);
      expect(record.attacks[0]).toEqual([2, 3, 0, 0]);
      expect(record.attacks[4]).toEqual([0, 0, 0, 0]);
      expect(record.saves).toHaveLength(6);
      expect(record.spellImmunities).toHaveLength(6);
      expect(record.money).toEqual([5, 0, 0]);
      expect(record.spells).toHaveLength(10);
      expect(record.items).toHaveLength(6);
      expect(record.underneath).toHaveLength(4);
      expect(record.conditions).toHaveLength(40);
    }
  });

  it("normalizes legacy rule override arrays into canonical fixed contracts", () => {
    const project = createBrowserProject("Legacy rule arrays");
    const parsed = parseScenarioBuffers(new Map([
      ["Data Race", new Uint8Array(408)],
      ["Data Caste", new Uint8Array(576)]
    ]));
    project.raceOverrides = [{
      ...parsed.raceOverrides[0],
      plusMinusToHit: [1],
      ageRange: [[2]],
      ageChange: [[3]],
      spacer: [4]
    }];
    project.casteOverrides = [{
      ...parsed.casteOverrides[0],
      specialAbility: [[5]],
      spellcasters: [[6]],
      victory: [7],
      startItems: [8],
      spacer: [9]
    }];

    const normalized = normalizeBrowserProject(project);
    const race = normalized.raceOverrides[0];
    const caste = normalized.casteOverrides[0];

    expect(race.plusMinusToHit).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(race.ageRange).toHaveLength(5);
    expect(race.ageRange[0]).toEqual([2, 0]);
    expect(race.ageChange[0]).toHaveLength(15);
    expect(race.spacer).toHaveLength(31);
    expect(caste.specialAbility).toHaveLength(2);
    expect(caste.specialAbility[0]).toHaveLength(14);
    expect(caste.spellcasters).toHaveLength(4);
    expect(caste.spellcasters[0]).toEqual([6, 0, 0]);
    expect(caste.victory).toHaveLength(30);
    expect(caste.startItems).toHaveLength(20);
    expect(caste.spacer).toHaveLength(63);
  });

  it("parses player-map markers into canonical semantic slots", () => {
    const bytes = new Uint8Array(340);
    bytes.set([0x01, 0x90, 0x00, 0x0c, 0x00, 0x0d], 0);

    const parsed = parseScenarioBuffers(new Map([["Data MD2", bytes]])).mapRecords[0];

    expect(parsed.markers).toHaveLength(10);
    expect(parsed.markers[0]).toEqual({ iconId: 400, x: 12, y: 13 });
    expect("rawBytes" in parsed).toBe(false);
  });

  it("backfills marker slots when opening legacy browser projects", () => {
    const rawBytes = new Array(340).fill(0);
    rawBytes.splice(0, 6, 0x01, 0x90, 0x00, 0x0c, 0x00, 0x0d);
    const project = createBrowserProject("Legacy Player Map");
    project.mapRecords = [{
      id: 0,
      markers: undefined,
      startX: 0,
      startY: 0,
      level: 0,
      pictId: 0,
      iconSize: 16,
      show: 1,
      isDungeon: false,
      rect: { top: 0, left: 0, bottom: 0, right: 0 },
      note: "",
      rawBytes,
      provenance: { sourceFile: "Data MD2", recordIndex: 0, byteOffset: 0, byteLength: 340, confidence: "source-backed" }
    } as unknown as Project["mapRecords"][number]];

    const markers = normalizeBrowserProject(project).mapRecords[0].markers;

    expect(markers).toHaveLength(10);
    expect(markers[0]).toEqual({ iconId: 400, x: 12, y: 13 });
    expect(markers[1]).toEqual({ iconId: 0, x: 0, y: 0 });
  });

  it("accepts fresh semantic map records without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Player Map Validation");
    project.mapRecords = [{
      id: 0,
      markers: Array.from({ length: 10 }, () => ({ iconId: 0, x: 0, y: 0 })),
      startX: 0,
      startY: 0,
      level: 0,
      pictId: 0,
      iconSize: 16,
      show: 1,
      isDungeon: false,
      rect: { top: 0, left: 0, bottom: 0, right: 0 },
      note: "",
      provenance: { sourceFile: "Data MD2", recordIndex: 0, byteOffset: 0, byteLength: 340, confidence: "confirmed" }
    }];

    const validation = validateBrowserProject(project);

    expect(validation.errors).not.toContain("Map record 0 does not preserve a 340-byte raw record.");
    expect(validation.ok).toBe(true);
  });

  it("backfills scenario-item spare words when opening legacy browser projects", () => {
    const bytes = new Uint8Array(100);
    bytes.set([0xfe, 0xbf], 56);
    const record = parseScenarioBuffers(new Map([["Data NI", bytes]])).scenarioItems[0];
    const project = createBrowserProject("Legacy Scenario Item");
    project.scenarioItems = [{ ...record, spare2: undefined, rawBytes: Array.from(bytes) } as unknown as Project["scenarioItems"][number]];

    const normalized = normalizeBrowserProject(project).scenarioItems[0];
    const spare2 = normalized.spare2;

    expect(spare2).toHaveLength(7);
    expect(spare2[0]).toBe(-321);
    expect(spare2.slice(1)).toEqual(new Array(6).fill(0));
    expect("rawBytes" in normalized).toBe(false);
  });

  it("backfills treasure item slots when opening legacy browser projects", () => {
    const bytes = new Uint8Array(48);
    bytes.set([0xfe, 0xbf], 2);
    const record = parseScenarioBuffers(new Map([["Data TD", bytes]])).treasures[0];
    const project = createBrowserProject("Legacy Treasure");
    project.treasures = [{ ...record, itemIds: [901] }];

    const itemIds = normalizeBrowserProject(project).treasures[0].itemIds;

    expect(itemIds).toHaveLength(20);
    expect(itemIds[0]).toBe(901);
    expect(itemIds[1]).toBe(-321);
    expect(itemIds.slice(2)).toEqual(new Array(18).fill(0));
  });

  it("backfills shop inventories when opening legacy browser projects", () => {
    const bytes = new Uint8Array(3002);
    bytes.set([0xfe, 0xbf], 2);
    bytes[2001] = 7;
    const record = parseScenarioBuffers(new Map([["Data SD", bytes]])).shops[0];
    const project = createBrowserProject("Legacy Shop");
    project.shops = [{ ...record, itemIds: [901], quantities: [3] }];

    const shop = normalizeBrowserProject(project).shops[0];

    expect(shop.itemIds).toHaveLength(1000);
    expect(shop.quantities).toHaveLength(1000);
    expect(shop.itemIds.slice(0, 2)).toEqual([901, -321]);
    expect(shop.quantities.slice(0, 2)).toEqual([3, 7]);
    expect(shop.itemIds.slice(2)).toEqual(new Array(998).fill(0));
    expect(shop.quantities.slice(2)).toEqual(new Array(998).fill(0));
  });

  it("uses the authored compiler manifest instead of source inventory", () => {
    const project = createBrowserProject("Authored Validation");
    project.source.origin = "authored";
    project.source.files.push({
      name: "ANNEX POISON",
      relativePath: "ANNEX POISON",
      bytes: 1,
      sha256: "fixture",
      role: "pass-through",
      editable: false
    });

    const validation = validateBrowserProject(project);
    const expected = expectedAuthoredScenarioManifestFiles(project, "windows-realmz-folder");

    expect(validation.exportableFiles).toEqual(expected);
    expect(validation.passThroughFiles).toEqual([]);
    expect(validation.exportableFiles).toContain("Scenario");
    expect(validation.exportableFiles).toContain("Scenario.rsrc");
    expect(validation.exportableFiles).toContain("Data Solids");
    expect(validation.exportableFiles).not.toContain("ANNEX POISON");
    expect(validation.warnings).not.toContain("Data Solids is missing; special negative tile solidity will remain unknown.");
  });

  it("keeps imported compatibility validation source-driven", () => {
    const project = createBrowserProject("Imported Validation");
    project.source.origin = "imported";
    project.source.files = [
      {
        name: "Data SD2",
        relativePath: "Data SD2",
        bytes: 800,
        sha256: "fixture",
        role: "supported-binary",
        editable: true
      },
      {
        name: "Legacy Notes",
        relativePath: "Legacy Notes",
        bytes: 10,
        sha256: "fixture",
        role: "pass-through",
        editable: false
      }
    ];

    const validation = validateBrowserProject(project);

    expect(validation.exportableFiles).toEqual(["Data SD2"]);
    expect(validation.passThroughFiles).toEqual(["Legacy Notes"]);
    expect(validation.exportableFiles).not.toContain("Scenario.rsrc");
  });

  it("rejects ready managed assets without converted resource bytes", () => {
    const project = createBrowserProject("Missing managed resource bytes");
    project.assets.push(testManagedAsset("missing", "PICT", 30128, ""));

    const validation = validateBrowserProject(project);

    expect(validation.errors).toContain("Managed missing is marked ready but has no converted resourcePath.");
    expect(validation.ok).toBe(false);
  });

  it("rejects conflicting scenario-managed resource keys but ignores custom-library keys", () => {
    const project = createBrowserProject("Managed resource conflicts");
    const first = testManagedAsset("first", "TEXT", -200, "data:text/plain;base64,Zmlyc3Q=");
    const second = testManagedAsset("second", "TEXT", -200, "data:text/plain;base64,c2Vjb25k");
    const library = {
      ...testManagedAsset("library", "TEXT", -200, "data:text/plain;base64,bGlicmFyeQ=="),
      libraryScope: "custom-library" as const
    };
    project.assets.push(first, second, library);

    const validation = validateBrowserProject(project);

    expect(validation.errors).toContain("Managed second conflicts with Managed first at TEXT -200; scenario-managed resource keys must be unique.");
    expect(validation.errors.filter((error) => error.includes("scenario-managed resource keys")).length).toBe(1);
    expect(validation.ok).toBe(false);
  });

  it("ignores authored raw snapshots while indexing canonical maps and managed resources", async () => {
    const project = createBrowserProject("Authored Semantic Boundary");
    project.assets.push({
      id: "managed:TEXT:-200:authored",
      label: "Authored Scrolling Text",
      kind: "text",
      resourceType: "TEXT",
      resourceId: -200,
      fileName: "scrolling-text--200.txt",
      originalPath: "",
      previewPath: "",
      resourcePath: "data:text/plain;base64,Y2Fub25pY2FsIHRleHQ=",
      mimeType: "text/plain",
      bytes: 14,
      sha256: "canonical",
      width: null,
      height: null,
      durationMs: null,
      sampleRate: null,
      channels: null,
      exportState: "ready",
      libraryScope: "scenario",
      provenance: "authored test",
      linkedEntity: "resource:TEXT:-200"
    });
    const poisonTreasure = new Uint8Array(48);
    poisonTreasure[1] = 42;
    poisonTreasure[43] = 99;
    registerBrowserSourceSnapshot(project, {
      capturedAt: "2026-07-18T00:00:00.000Z",
      rootName: "ANNEX POISON",
      totalBytes: poisonTreasure.byteLength,
      files: [{
        name: "Data TD",
        relativePath: "Data TD",
        bytes: poisonTreasure.byteLength,
        sha256: "poison",
        role: "supported-binary",
        editable: true,
        bytesData: poisonTreasure
      }]
    });

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    expect(semanticSchema.entities.some((entity) => entity.id === "map:land:0")).toBe(true);
    expect(semanticSchema.entities.find((entity) => entity.id === "resource:TEXT:-200")).toMatchObject({
      editable: true,
      summary: { managed: true, managedAssetId: "managed:TEXT:-200:authored" }
    });
    expect(semanticSchema.entities.some((entity) => entity.id === "treasure:0")).toBe(false);
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(false);
  });

  it("retains raw-buffer semantic enrichment for imported projects", async () => {
    const project = createBrowserProject("Imported Semantic Boundary");
    project.source.origin = "imported";
    const importedTreasure = new Uint8Array(48);
    importedTreasure[1] = 42;
    importedTreasure[43] = 77;
    const importedMessage = new Uint8Array(256);
    importedMessage[0] = 8;
    importedMessage.set(new TextEncoder().encode("Imported"), 1);
    const importedOptionLabel = new Uint8Array(25);
    importedOptionLabel[0] = 15;
    importedOptionLabel.set(new TextEncoder().encode("Imported option"), 1);
    const importedMonsterDescription = new Uint8Array(256);
    importedMonsterDescription[0] = 16;
    importedMonsterDescription.set(new TextEncoder().encode("Imported monster"), 1);
    const importedBattle = new Uint8Array(346);
    importedBattle[338] = 0xfc;
    const importedMonster = new Uint8Array(210);
    importedMonster[0] = 7;
    importedMonster.set([0x01, 0x41], 98);
    importedMonster.set(new TextEncoder().encode("Imported monster"), 170);
    const importedNormalMonster = new Uint8Array(importedMonster);
    importedNormalMonster.fill(0, 170, 210);
    importedNormalMonster.set(new TextEncoder().encode("Imported normal"), 170);
    const importedMegaMonster = new Uint8Array(importedMonster);
    importedMegaMonster.fill(0, 170, 210);
    importedMegaMonster.set(new TextEncoder().encode("Imported mega"), 170);
    const importedShop = new Uint8Array(3002);
    importedShop.set([0x03, 0x85], 0);
    importedShop[2000] = 3;
    importedShop.set([0x00, 0x78], 3000);
    const importedSimpleEncounter = new Uint8Array(426);
    importedSimpleEncounter[100] = 1;
    importedSimpleEncounter.set([0x00, 0x0c], 104);
    const importedComplexEncounter = new Uint8Array(520);
    importedComplexEncounter[152] = 1;
    importedComplexEncounter[155] = 2;
    importedComplexEncounter.set([0x00, 0x12], 158);
    const importedTimedEncounter = new Uint8Array(40);
    importedTimedEncounter.set([0x00, 0x23], 0);
    importedTimedEncounter.set([0x00, 0x01], 20);
    importedTimedEncounter.set([0x34, 0x56], 22);
    const importedSpell = new Uint8Array(30);
    importedSpell[10] = 41;
    const importedRace = new Uint8Array(408);
    importedRace.set([0x00, 0x0d], 196);
    const importedCaste = new Uint8Array(576);
    importedCaste.set([0x00, 0xde], 384);
    const importedContact = new Uint8Array(4608);
    importedContact.set([16, ...new TextEncoder().encode("Imported contact")], 0);
    const importedRestrictions = new Uint8Array(320);
    importedRestrictions.set([11, ...new TextEncoder().encode("No imported")], 0);
    importedRestrictions[260] = 1;
    const importedBuffers = new Map([
      ["Data TD", importedTreasure],
      ["Data SD2", importedMessage],
      ["Data OD", importedOptionLabel],
      ["Data DES", importedMonsterDescription],
      ["Data BD", importedBattle],
      ["Data MD", importedMonster],
      ["Data MD1", importedNormalMonster],
      ["Data MD-1", importedMegaMonster],
      ["Data SD", importedShop],
      ["Data ED", importedSimpleEncounter],
      ["Data ED2", importedComplexEncounter],
      ["Data TD3", importedTimedEncounter],
      ["Data Spell", importedSpell],
      ["Data Race", importedRace],
      ["Data Caste", importedCaste],
      ["Data CI", importedContact],
      ["Data RI", importedRestrictions]
    ]);
    project.source.files = Array.from(importedBuffers, ([name, bytes]) => ({
      name,
      relativePath: name,
      bytes: bytes.byteLength,
      sha256: "imported",
      role: "supported-binary" as const,
      editable: true
    }));
    registerBrowserSourceSnapshot(project, {
      capturedAt: "2026-07-18T00:00:00.000Z",
      rootName: "Imported Semantic Boundary",
      totalBytes: Array.from(importedBuffers.values()).reduce((total, bytes) => total + bytes.byteLength, 0),
      files: project.source.files.map((file) => ({
        ...file,
        bytesData: importedBuffers.get(file.name)!
      }))
    });

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:0")).toMatchObject({
      editState: "inspect-only",
      confidence: "source-backed",
      editable: false,
      summary: { gold: 77 }
    });
    for (const entityId of [
      "message:0",
      "option-label:0",
      "monster-description:0",
      "battle:0",
      "monster:0",
      "monster-set:1:0",
      "monster-set:-1:0",
      "shop:0",
      "encounter:simple:0",
      "encounter:complex:0",
      "time:0",
      "spell-override:0",
      "race-override:0",
      "caste-override:0",
      "contact:0",
      "restriction:0"
    ]) {
      expect(semanticSchema.entities.find((entity) => entity.id === entityId)).toMatchObject({
        editState: "inspect-only",
        confidence: "source-backed",
        editable: false
      });
      expect(semanticSchema.entities.find((entity) => entity.id === entityId)?.summary.canonical).toBeUndefined();
    }
    expect("reservedWords" in (semanticSchema.entities.find((entity) => entity.id === "time:0")?.summary ?? {})).toBe(false);
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(true);
  });

  it("indexes canonical record collections without exposing sparse compiler slots", async () => {
    const project = createBrowserProject("Canonical Supporting Records");
    project.scenario.shell = {
      ...project.scenario.shell!,
      lookX: 12,
      rawBytes: new Array(320).fill(0xa5),
      trailingBytes: [0xde, 0xad, 0xbe, 0xef],
      authored: false
    };
    const parsed = parseScenarioBuffers(new Map([
      ["Data NI", new Uint8Array(100)],
      ["Data TD", new Uint8Array(48)],
      ["Data TD2", new Uint8Array(118)],
      ["Data TD3", new Uint8Array(40)],
      ["Data SD2", new Uint8Array(256)],
      ["Data OD", new Uint8Array(25)],
      ["Data DES", new Uint8Array(256)],
      ["Data BD", new Uint8Array(346)],
      ["Data MD", new Uint8Array(210)],
      ["Data MD1", new Uint8Array(210)],
      ["Data MD-1", new Uint8Array(210)],
      ["Data SD", new Uint8Array(3002)],
      ["Data ED", new Uint8Array(426)],
      ["Data ED2", new Uint8Array(520)],
      ["Data Spell", new Uint8Array(30)],
      ["Data Race", new Uint8Array(408)],
      ["Data Caste", new Uint8Array(576)]
    ]));
    project.scenario.contactInfo = {
      ...project.scenario.contactInfo!,
      scenarioName: "Canonical contact",
      description: "Canonical contact description",
      authored: false,
      rawBytes: new Array(4608).fill(0xa5)
    };
    project.scenario.restrictions = {
      description: "No giants",
      maxPartyCharacters: 4,
      maxPartyLevel: 20,
      bannedRaces: [1, 30],
      bannedCastes: [2, 29],
      authored: false,
      rawBytes: new Array(320).fill(0xa5)
    };
    project.scenario.globalMacroHooks = {
      ...defaultGlobalMacroHooks(),
      slots: defaultGlobalMacroHooks().slots.map((slot) => slot.slot === 0 ? { ...slot, door: 11 } : slot),
      authored: false,
      rawBytes: new Array(60).fill(0xa5)
    };
    project.scenarioItems = [{
      ...parsed.scenarioItems[0],
      id: 4,
      itemId: 901,
      iconId: 321,
      cost: 45,
      authored: false
    }];
    project.treasures = [{
      ...parsed.treasures[0],
      id: 3,
      itemIds: [901, ...new Array(19).fill(0)],
      gold: 77,
      authored: false,
      rawBytes: new Array(48).fill(0xa5)
    }];
    project.thiefEncounters = [{
      ...parsed.thiefEncounters[0],
      id: 2,
      typeFlags: [true, ...parsed.thiefEncounters[0].typeFlags.slice(1)],
      prompts: [17, 0, 0],
      authored: false,
      rawBytes: new Array(118).fill(0xa5)
    }];
    project.timedEncounters = [{
      ...parsed.timedEncounters[0],
      id: 3,
      day: 5,
      requiredItem: 901,
      requiredQuest: 6,
      locationKind: "land",
      authored: false
    }];
    project.messages = [{
      ...parsed.messages[0],
      id: 5,
      text: "Canonical message",
      authored: false,
      rawBytes: new Array(256).fill(0xa5)
    }];
    project.optionLabels = [{
      ...parsed.optionLabels[0],
      id: 6,
      text: "Canonical option",
      authored: false,
      rawBytes: new Array(25).fill(0xa5)
    }];
    project.monsterDescriptions = [{
      ...parsed.monsterDescriptions[0],
      id: 7,
      text: "Canonical monster description",
      authored: false,
      rawBytes: new Array(256).fill(0xa5)
    }];
    project.battles = [{
      ...parsed.battles[0],
      id: 3,
      grid: [2, ...parsed.battles[0].grid.slice(1)],
      dist: -4,
      messageBefore: 5,
      authored: false,
      rawBytes: new Array(346).fill(0xa5)
    }];
    project.monsters = [{
      ...parsed.monsters[0],
      id: 2,
      hitDice: 7,
      iconId: 321,
      exp: 88,
      displayName: "Canonical monster",
      authored: false,
      rawBytes: new Array(210).fill(0xa5)
    }];
    const normalMonsterSet = parsed.monsterSets.find((set) => set.setId === 1)!;
    const megaMonsterSet = parsed.monsterSets.find((set) => set.setId === -1)!;
    project.monsterSets = [{
      ...normalMonsterSet,
      monsters: [{
        ...normalMonsterSet.monsters[0],
        id: 1,
        iconId: 322,
        deathMacro: 11,
        displayName: "Canonical normal monster",
        authored: false,
        rawBytes: new Array(210).fill(0xa5)
      }]
    }, {
      ...megaMonsterSet,
      monsters: [{
        ...megaMonsterSet.monsters[0],
        id: 2,
        iconId: 323,
        deathMacro: 12,
        displayName: "Canonical mega monster",
        authored: false,
        rawBytes: new Array(210).fill(0xa5)
      }]
    }];
    project.shops = [{
      ...parsed.shops[0],
      id: 2,
      itemIds: [901, ...new Array(999).fill(0)],
      quantities: [3, ...new Array(999).fill(0)],
      inflation: 120,
      authored: false,
      rawBytes: new Array(3002).fill(0xa5)
    }];
    project.simpleEncounters = [{
      ...parsed.simpleEncounters[0],
      id: 2,
      canBackOut: true,
      prompt: 12,
      texts: ["Canonical simple encounter", "", "", ""],
      authored: false,
      rawBytes: new Array(426).fill(0xa5)
    }];
    project.complexEncounters = [{
      ...parsed.complexEncounters[0],
      id: 4,
      thief: true,
      thiefSuccess: 2,
      prompt: 18,
      texts: ["Canonical complex encounter", "", "", "", "", "", "", "", ""],
      authored: false,
      rawBytes: new Array(520).fill(0xa5)
    }];
    project.spellOverrides = [{
      ...parsed.spellOverrides[0],
      id: 16,
      cost: 41,
      authored: false,
      rawBytes: new Array(30).fill(0xa5)
    }];
    project.raceOverrides = [{
      ...parsed.raceOverrides[0],
      id: 2,
      baseMove: 13,
      authored: false,
      rawBytes: new Array(408).fill(0xa5)
    }];
    project.casteOverrides = [{
      ...parsed.casteOverrides[0],
      id: 3,
      startMoney: 222,
      authored: false,
      rawBytes: new Array(576).fill(0xa5)
    }];

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    for (const entityId of [
      "item:901",
      "treasure:3",
      "thief:2",
      "time:3",
      "message:5",
      "option-label:6",
      "monster-description:7",
      "battle:3",
      "monster:2",
      "monster-set:1:1",
      "monster-set:-1:2",
      "shop:2",
      "encounter:simple:2",
      "encounter:complex:4",
      "spell-override:16",
      "race-override:2",
      "caste-override:3",
      "contact:0",
      "restriction:0",
      "global:0"
    ]) {
      const entity = semanticSchema.entities.find((candidate) => candidate.id === entityId);
      expect(entity).toMatchObject({
        editState: "editable",
        confidence: "confirmed",
        editable: true,
        summary: { canonical: true }
      });
      expect(semanticSchema.records.find((record) => record.id === entity?.recordRef)).toMatchObject({
        editState: "editable",
        confidence: "confirmed",
        summary: { canonical: true }
      });
    }
    for (const entityId of [
      "item:800",
      "treasure:0",
      "thief:0",
      "time:0",
      "message:0",
      "option-label:0",
      "monster-description:0",
      "battle:0",
      "monster:0",
      "monster-set:1:0",
      "monster-set:-1:0",
      "shop:0",
      "encounter:simple:0",
      "encounter:complex:0",
      "spell-override:0",
      "race-override:0",
      "caste-override:0"
    ]) {
      expect(semanticSchema.entities.some((entity) => entity.id === entityId)).toBe(false);
    }
    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:3")?.summary.gold).toBe(77);
    expect(semanticSchema.entities.find((entity) => entity.id === "message:5")?.summary.text).toBe("Canonical message");
    expect(semanticSchema.entities.find((entity) => entity.id === "option-label:6")?.summary.text).toBe("Canonical option");
    expect(semanticSchema.entities.find((entity) => entity.id === "option-label:6")?.summary.shortcut).toBe("c");
    expect(semanticSchema.entities.find((entity) => entity.id === "monster-description:7")?.summary.text).toBe("Canonical monster description");
    expect(semanticSchema.entities.find((entity) => entity.id === "battle:3")?.summary.dist).toBe(-4);
    expect(semanticSchema.entities.find((entity) => entity.id === "monster:2")?.summary.name).toBe("Canonical monster");
    expect(semanticSchema.entities.find((entity) => entity.id === "shop:2")?.summary.inflation).toBe(120);
    expect(semanticSchema.entities.find((entity) => entity.id === "encounter:simple:2")?.summary.prompt).toBe(12);
    expect("reservedWords" in (semanticSchema.entities.find((entity) => entity.id === "time:3")?.summary ?? {})).toBe(false);
    expect(semanticSchema.entities.find((entity) => entity.id === "spell-override:16")?.summary.cost).toBe(41);
    expect(semanticSchema.entities.find((entity) => entity.id === "race-override:2")?.summary.baseMove).toBe(13);
    expect(semanticSchema.entities.find((entity) => entity.id === "caste-override:3")?.summary.startMoney).toBe(222);
    expect(semanticSchema.links).toContainEqual(expect.objectContaining({
      from: "encounter:complex:4",
      to: "thief:2",
      kind: "uses_thief_encounter"
    }));
    for (const [from, to, kind] of [
      ["battle:3", "monster:2", "uses_monster"],
      ["battle:3", "message:5", "shows_message_before"],
      ["monster:2", "resource:cicn:321", "uses_resource"],
      ["monster-set:1:1", "resource:cicn:322", "uses_resource"],
      ["monster-set:-1:2", "resource:cicn:323", "uses_resource"],
      ["monster-set:1:1", "macro:11", "calls_macro"],
      ["monster-set:-1:2", "macro:12", "calls_macro"],
      ["global:0", "macro:11", "calls_macro"]
    ]) {
      expect(semanticSchema.links).toContainEqual(expect.objectContaining({ from, to, kind }));
    }
    for (const [name, path] of [
      ["Data NI", "project.json#scenarioItems"],
      ["Data TD", "project.json#treasures"],
      ["Data TD2", "project.json#thiefEncounters"],
      ["Data TD3", "project.json#timedEncounters"],
      ["Data SD2", "project.json#messages"],
      ["Data OD", "project.json#optionLabels"],
      ["Data DES", "project.json#monsterDescriptions"],
      ["Data BD", "project.json#battles"],
      ["Data MD", "project.json#monsters"],
      ["Data MD1", "project.json#monsterSets/1"],
      ["Data MD-1", "project.json#monsterSets/-1"],
      ["Data SD", "project.json#shops"],
      ["Data ED", "project.json#simpleEncounters"],
      ["Data ED2", "project.json#complexEncounters"],
      ["Data Spell", "project.json#spellOverrides"],
      ["Data Race", "project.json#raceOverrides"],
      ["Data Caste", "project.json#casteOverrides"],
      ["Canonical Supporting Records", "project.json#scenario/shell"],
      ["Data CS", "project.json#scenario/shell"],
      ["Data CI", "project.json#scenario/contactInfo"],
      ["Data RI", "project.json#scenario/restrictions"],
      ["Global", "project.json#scenario/globalMacroHooks"]
    ]) {
      expect(semanticSchema.sources.find((source) => source.name === name)).toMatchObject({
        path,
        origin: "authored-source",
        confidence: "confirmed"
      });
    }
    expect(semanticSchema.sources.find((source) => source.name === "Data Spell")?.bytes).toBe(105 * 30);
    expect(semanticSchema.sources.find((source) => source.name === "Data Race")?.bytes).toBe(30 * 408);
    expect(semanticSchema.sources.find((source) => source.name === "Data Caste")?.bytes).toBe(30 * 576);
    expect(semanticSchema.sources.find((source) => source.name === "Canonical Supporting Records")?.bytes).toBe(316);
    expect(semanticSchema.sources.find((source) => source.name === "Data CS")?.bytes).toBe(316);
    expect(semanticSchema.entities.find((entity) => entity.type === "scenario-startup")).toMatchObject({
      editState: "editable",
      confidence: "confirmed",
      editable: true,
      source: "project.json#scenario/shell",
      summary: { lookX: 12, canonical: true }
    });
    expect(semanticSchema.entities.find((entity) => entity.type === "registration-security")).toMatchObject({
      editState: "editable",
      confidence: "confirmed",
      editable: true,
      summary: { canonical: true }
    });
    expect(semanticSchema.entities.find((entity) => entity.id === "contact:0")?.summary.scenarioName).toBe("Canonical contact");
    expect(semanticSchema.entities.find((entity) => entity.id === "restriction:0")?.summary.bannedRaces).toEqual([1, 30]);
    expect(semanticSchema.entities.find((entity) => entity.id === "global:0")?.summary.activeSlots).toEqual([
      expect.objectContaining({ slot: 0, door: 11, sourceBacked: true })
    ]);
  });
});

function testManagedAsset(id: string, resourceType: string, resourceId: number, resourcePath: string): Project["assets"][number] {
  return {
    id: `managed:${id}`,
    label: `Managed ${id}`,
    kind: resourceType === "TEXT" || resourceType === "styl" ? "text" : "picture",
    resourceType,
    resourceId,
    fileName: `${id}.bin`,
    originalPath: "",
    previewPath: "",
    resourcePath,
    mimeType: "application/octet-stream",
    bytes: 1,
    sha256: id,
    width: resourceType === "PICT" ? 32 : null,
    height: resourceType === "PICT" ? 32 : null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: "validation fixture",
    linkedEntity: null
  };
}
