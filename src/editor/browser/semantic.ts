import {
  Action,
  ExtraCodeRow,
  MapEntity,
  MapRecord,
  Project,
  RandomLevel,
  SemanticEntity,
  SemanticLink,
  SemanticRecord,
  SemanticSchema,
  SourceFile,
  TriggerRecord
} from "../types";
import { FIELD_BYTES, ITEM_BYTES, LAND_LAYOUT_BYTES, MONSTER_DESCRIPTION_BYTES, OPTION_LABEL_BYTES, RANDLEVEL_BYTES } from "./realmzParser";
import { parseResourceFork, type ResourceEntry } from "./library";

export function buildBrowserSemanticSchema(projectParts: {
  scenario: Project["scenario"];
  buffers: Map<string, Uint8Array>;
  sourceFiles: SourceFile[];
  maps: MapEntity[];
  mapRecords: MapRecord[];
  randomLevels: RandomLevel[];
  triggers: TriggerRecord[];
  extracodes: ExtraCodeRow[];
  assetCatalog: Project["assetCatalog"];
  records: Project["records"];
}): SemanticSchema {
  const schema: SemanticSchema = {
    schemaVersion: 4,
    sources: [],
    records: [],
    entities: [],
    links: [],
    reverseLinks: {},
    evidence: [
      {
        id: "browser-import-core",
        confidence: "source-backed",
        source: "browser File System Access API",
        note: "Browser importer mirrors Providence's core map, random-level, trigger, EDCD, and tile-asset summaries."
      }
    ],
    diagnostics: [],
    decoding: { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] },
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, linkCount: 0, diagnosticCount: 0 }
  };

  addSources(schema, projectParts.buffers, projectParts.sourceFiles);
  addScenarioEntity(schema, projectParts.scenario);
  addRecordAlignments(schema, projectParts.records.alignments);
  addSupportingRecords(schema, projectParts.buffers);
  addMaps(schema, projectParts.maps);
  addMapRecords(schema, projectParts.mapRecords, projectParts.maps);
  addRandomLevels(schema, projectParts.randomLevels);
  addExtracodes(schema, projectParts.extracodes);
  addTriggers(schema, projectParts.triggers, projectParts.extracodes);
  addTileAssets(schema, projectParts.assetCatalog);
  addRenderProfiles(schema, projectParts.maps, projectParts.assetCatalog);
  addResourceEntities(schema, projectParts.buffers, projectParts.sourceFiles);
  addInferredTargets(schema);
  classifyEd3Reachability(schema, projectParts.triggers);
  finalize(schema);
  return schema;
}

function addSources(schema: SemanticSchema, buffers: Map<string, Uint8Array>, files: SourceFile[]) {
  const seen = new Set<string>();
  for (const file of files) {
    schema.sources.push({
      id: sourceId(file.name),
      type: isResourceFile(file.name) ? "resource fork" : "file",
      origin: isResourceFile(file.name) ? "resource-fork" : "authored-source",
      name: file.name,
      path: file.relativePath,
      exists: true,
      bytes: file.bytes,
      sha256: file.sha256,
      layout: layoutFor(file.name),
      confidence: "source-backed"
    });
    seen.add(file.name);
  }
  for (const [name, bytes] of buffers) {
    if (seen.has(name)) continue;
    schema.sources.push({
      id: sourceId(name),
      type: isResourceFile(name) ? "resource fork" : "file",
      origin: isResourceFile(name) ? "resource-fork" : "authored-source",
      name,
      path: null,
      exists: true,
      bytes: bytes.byteLength,
      sha256: null,
      layout: layoutFor(name),
      confidence: "source-backed"
    });
  }
}

function addRecordAlignments(schema: SemanticSchema, alignments: Project["records"]["alignments"]) {
  for (const alignment of alignments) {
    for (let index = 0; index < alignment.count; index += 1) {
      schema.records.push({
        id: `record:${alignment.source}:${index}`,
        source: sourceId(alignment.source),
        type: recordTypeFor(alignment.source),
        label: `${alignment.source} #${index}`,
        editState: "inspect-only",
        byteRange: byteRange(index * alignment.recordBytes, alignment.recordBytes),
        confidence: "source-backed",
        summary: {
          source: alignment.source,
          index,
          recordBytes: alignment.recordBytes
        }
      });
    }
  }
}

function addScenarioEntity(schema: SemanticSchema, scenario: Project["scenario"]) {
  const id = `scenario:${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled"}`;
  schema.entities.push({
    id,
    type: "scenario",
    label: scenario.name,
    editState: "inspect-only",
    confidence: "source-backed",
    source: "project.json",
    recordRef: null,
    byteRange: null,
    editable: false,
    summary: { name: scenario.name, projectPath: scenario.projectPath, importedAt: scenario.importedAt }
  });
  if (schema.sources.some((source) => source.id === "source:file:Scenario")) {
    pushLink(schema, id, "source:file:Scenario", "has_source", "source-backed");
  }
  for (const section of [
    {
      suffix: "startup",
      type: "scenario-startup",
      label: "Scenario Startup Information",
      note: "Starting level/position and recommended level metadata; exact field mapping remains inspect-only until writer support is fixture-backed."
    },
    {
      suffix: "restrictions",
      type: "scenario-restriction",
      label: "Scenario Restrictions",
      note: "Character count, race, caste, and level restrictions from Divinity's Scenario Data workflow."
    },
    {
      suffix: "registration",
      type: "registration-security",
      label: "Scenario Security / Registration Codes",
      note: "Legacy registration-code workflow is preserved for inspection; export writing requires fixture-proven codec support."
    },
    {
      suffix: "global-macros",
      type: "global-macro",
      label: "Global Macros",
      note: "Start, death, quit, shop, and temple macro hooks defined by Divinity's Scenario Data workflow."
    }
  ]) {
    schema.entities.push({
      id: `${id}:${section.suffix}`,
      type: section.type,
      label: section.label,
      editState: "inspect-only",
      confidence: "inferred",
      source: "project.json",
      recordRef: null,
      byteRange: null,
      editable: false,
      summary: {
        scenarioId: id,
        name: section.label,
        note: section.note
      }
    });
  }
}

function addSupportingRecords(schema: SemanticSchema, buffers: Map<string, Uint8Array>) {
  addTreasureRecords(schema, buffers.get("Data TD"));
  addThiefRecords(schema, buffers.get("Data TD2"));
  addTimedRecords(schema, buffers.get("Data TD3"));
  addContactRecords(schema, buffers.get("Data CI"));
  addGlobalMacroRecords(schema, buffers.get("Global"));
  addMenuRecords(schema, buffers.get("Data MENU"));
  addSolidsRecords(schema, buffers.get("Data Solids"));
  addItemRecords(schema, buffers.get("Data NI"));
}

function addTreasureRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 48 <= buffer.byteLength; index += 1) {
    const start = index * 48;
    if (start + 48 > buffer.byteLength) break;
    const items = Array.from({ length: 20 }, (_, slot) => ({ slot, id: i16At(buffer, start + slot * 2) })).filter((item) => item.id !== 0);
    const summary = {
      id: index,
      items,
      itemCount: items.length,
      exp: i16At(buffer, start + 40),
      gold: i16At(buffer, start + 42),
      gems: i16At(buffer, start + 44),
      jewelry: i16At(buffer, start + 46),
      preview: `${items.length} items`
    };
    upsertRecord(schema, browserRecord("Data TD", index, 48, "treasure", `Treasure ${index}`, summary));
    schema.entities.push(browserEntity(`treasure:${index}`, "treasure", `Treasure ${index}`, "Data TD", `record:Data TD:${index}`, start, 48, summary));
    for (const item of items) pushLink(schema, `treasure:${index}`, `item:${item.id}`, "gives_item", "source-backed", { slot: item.slot });
  }
}

function addThiefRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 118 <= buffer.byteLength; index += 1) {
    const start = index * 118;
    if (start + 118 > buffer.byteLength) break;
    const summary = {
      id: index,
      typeFlags: Array.from(buffer.slice(start, start + 10)).map((value) => value !== 0),
      modifiers: signedBytes(buffer, start + 10, 8),
      successCodes: signedBytes(buffer, start + 18, 8),
      failureCodes: signedBytes(buffer, start + 26, 8),
      successText: shortArray(buffer, start + 34, 8),
      failureText: shortArray(buffer, start + 50, 8),
      successSounds: shortArray(buffer, start + 66, 8),
      failureSounds: shortArray(buffer, start + 82, 8),
      spell: i16At(buffer, start + 98),
      lowDamage: i16At(buffer, start + 100),
      highDamage: i16At(buffer, start + 102),
      tumblers: i16At(buffer, start + 104),
      prompts: shortArray(buffer, start + 106, 3),
      promptSounds: shortArray(buffer, start + 112, 3)
    };
    upsertRecord(schema, browserRecord("Data TD2", index, 118, "thief-encounter", `Thief ${index}`, summary));
    schema.entities.push(browserEntity(`thief:${index}`, "thief-encounter", `Thief ${index}`, "Data TD2", `record:Data TD2:${index}`, start, 118, summary));
  }
}

function addTimedRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 40 <= buffer.byteLength; index += 1) {
    const start = index * 40;
    if (start + 40 > buffer.byteLength) break;
    const stuff = shortArray(buffer, start + 20, 10);
    const locationKind = stuff[0] === 1 ? "land" : stuff[0] === 2 ? "dungeon" : "any";
    const summary = {
      id: index,
      day: i16At(buffer, start),
      increment: i16At(buffer, start + 2),
      percent: i16At(buffer, start + 4),
      door: i16At(buffer, start + 6),
      requiredLevel: i16At(buffer, start + 8),
      requiredRandomRect: i16At(buffer, start + 10),
      requiredX: i16At(buffer, start + 12),
      requiredY: i16At(buffer, start + 14),
      requiredItem: i16At(buffer, start + 16),
      requiredQuest: i16At(buffer, start + 18),
      stuff,
      locationKind
    };
    upsertRecord(schema, browserRecord("Data TD3", index, 40, "timed-encounter", `Timed Encounter ${index}`, summary));
    schema.entities.push(browserEntity(`time:${index}`, "timed-encounter", `Timed Encounter ${index}`, "Data TD3", `record:Data TD3:${index}`, start, 40, summary));
    if (summary.door > 0) pushLink(schema, `time:${index}`, `macro:${summary.door}`, "calls_macro", "source-backed");
    if (summary.requiredItem > 0) pushLink(schema, `time:${index}`, `item:${summary.requiredItem}`, "requires_item", "source-backed");
    if (summary.requiredQuest >= 0) pushLink(schema, `time:${index}`, `quest-flag:${summary.requiredQuest}`, "reads_flag", "source-backed");
  }
}

function addContactRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 4608 <= buffer.byteLength; index += 1) {
    const start = index * 4608;
    if (start + 4608 > buffer.byteLength) break;
    const summary = {
      id: index,
      scenarioName: pascalSlot(buffer, start, 0),
      version: pascalSlot(buffer, start, 1),
      date: pascalSlot(buffer, start, 2),
      author: pascalSlot(buffer, start, 3),
      email: pascalSlot(buffer, start, 4),
      web: pascalSlot(buffer, start, 5),
      fee: pascalSlot(buffer, start, 6),
      description: pascalSlot(buffer, start, 17)
    };
    upsertRecord(schema, browserRecord("Data CI", index, 4608, "contact-info", summary.scenarioName || `Contact ${index}`, summary));
    schema.entities.push(browserEntity(`contact:${index}`, "contact-info", summary.scenarioName || `Contact ${index}`, "Data CI", `record:Data CI:${index}`, start, 4608, summary));
    if (index === 0) {
      const scenario = schema.entities.find((entity) => entity.type === "scenario");
      if (scenario) pushLink(schema, scenario.id, "contact:0", "has_contact_info", "source-backed");
    }
  }
}

function addGlobalMacroRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 60 <= buffer.byteLength; index += 1) {
    const start = index * 60;
    if (start + 60 > buffer.byteLength) break;
    const slots = Array.from({ length: 30 }, (_, slot) => {
      const door = i16At(buffer, start + slot * 2);
      return {
        slot,
        door,
        label: globalMacroSlotLabel(slot),
        runtimeConsumer: globalMacroSlotRuntimeConsumer(slot),
        sourceBacked: [0, 1, 2, 4, 5].includes(slot)
      };
    });
    const activeSlots = slots.filter((slot) => slot.door !== 0);
    const summary = {
      id: index,
      slots,
      activeSlots,
      preview: `${activeSlots.length} active global macro hook(s)`
    };
    upsertRecord(schema, browserRecord("Global", index, 60, "global-macro", `Global Macro Hooks ${index}`, summary));
    const entityId = `global:${index}`;
    schema.entities.push(browserEntity(entityId, "global-macro", `Global Macro Hooks ${index}`, "Global", `record:Global:${index}`, start, 60, summary));
    for (const slot of activeSlots) {
      if (!slot.sourceBacked || slot.door <= 0) continue;
      pushLink(schema, entityId, `macro:${slot.door}`, "calls_macro", "source-backed", {
        slot: slot.slot,
        field: slot.label,
        door: slot.door
      });
    }
  }
}

function globalMacroSlotLabel(slot: number) {
  switch (slot) {
    case 0:
      return "Start game";
    case 1:
      return "Party death";
    case 2:
      return "End/quit game";
    case 4:
      return "Before shop";
    case 5:
      return "Before temple";
    default:
      return "Preserved slot";
  }
}

function globalMacroSlotRuntimeConsumer(slot: number) {
  switch (slot) {
    case 0:
      return "mainscreeninit/new-game start";
    case 1:
      return "partyloss death/revive path";
    case 2:
      return "end current game";
    case 4:
      return "shop button when shop is available";
    case 5:
      return "shop/temple button when temple is available";
    default:
      return "no source-backed runtime consumer found";
  }
}

function addMenuRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 502 <= buffer.byteLength; index += 1) {
    const start = index * 502;
    if (start + 502 > buffer.byteLength) break;
    const positions = shortArray(buffer, start, 251);
    const menuEntries = positions.map((value, menuIndex) => ({ menuIndex, storedPosition: value, monsterRecord: value - 1 })).filter((entry) => entry.storedPosition > 0);
    const summary = { id: index, positions, menuEntries, entryCount: menuEntries.length, generatedCache: true, sourceOfTruth: "Data MD monster records" };
    upsertRecord(schema, browserRecord("Data MENU", index, 502, "menu-cache", `Menu Cache ${index}`, summary));
    schema.entities.push(browserEntity(`menu:${index}`, "menu-cache", `Menu Cache ${index}`, "Data MENU", `record:Data MENU:${index}`, start, 502, summary));
  }
}

function addSolidsRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  for (let index = 0; index + 1024 <= buffer.byteLength; index += 1) {
    const start = index * 1024;
    if (start + 1024 > buffer.byteLength) break;
    const slice = buffer.slice(start, start + 1024);
    const summary = {
      id: index,
      solidEntries: Array.from(slice).filter((value) => value !== 0).length,
      openEntries: Array.from(slice).filter((value) => value === 0).length,
      tableKind: "special negative tile solidity",
      bytes: 1024
    };
    upsertRecord(schema, browserRecord("Data Solids", index, 1024, "solidity-table", `Solids ${index}`, summary));
    schema.entities.push(browserEntity(`solids:${index}`, "solidity-table", `Solids ${index}`, "Data Solids", `record:Data Solids:${index}`, start, 1024, summary));
  }
}

function itemRecordSummary(index: number, record: Uint8Array, sourceName: string): Record<string, unknown> {
  const baseId = sourceName === "Data NI" ? 800 : 0;
  const itemNumber = baseId + index;
  const categoryIndex = Math.floor(itemNumber / 200);
  const categorySlot = itemNumber % 200;
  const category = itemCategory(categoryIndex);
  const storedId = i16At(record, 2);
  const itemId = storedId !== 0 ? storedId : itemNumber;
  return {
    id: index,
    itemId,
    category,
    categorySlot,
    sourceFile: sourceName,
    scenarioLocal: sourceName === "Data NI",
    divinityEditableRange: itemId >= 900 && itemId <= 999,
    st: i16At(record, 0),
    storedItemId: storedId,
    iconId: i16At(record, 4),
    type: i16At(record, 6),
    blunt: i16At(record, 8),
    hands: i16At(record, 10),
    lu: i16At(record, 12),
    movement: i16At(record, 14),
    ac: i16At(record, 16),
    magicResistance: i16At(record, 18),
    damage: i16At(record, 20),
    spellPoints: i16At(record, 22),
    sound: i16At(record, 24),
    weight: i16At(record, 26),
    cost: i16At(record, 28),
    charge: i16At(record, 30),
    cursedItemId: i16At(record, 32),
    magical: i16At(record, 34),
    itemCat0: i32At(record, 36),
    itemCat1: i32At(record, 40),
    raceRestrictions: i16At(record, 44),
    casteRestrictions: i16At(record, 46),
    specificRace: i16At(record, 48),
    specificCaste: i16At(record, 50),
    raceClassOnly: i16At(record, 52),
    casteClassOnly: i16At(record, 54),
    vSmall: i16At(record, 70),
    vLarge: i16At(record, 72),
    heat: i16At(record, 74),
    cold: i16At(record, 76),
    electric: i16At(record, 78),
    vsUndead: i16At(record, 80),
    vsDemonDevil: i16At(record, 82),
    vsEvil: i16At(record, 84),
    special1: i16At(record, 86),
    special2: i16At(record, 88),
    special3: i16At(record, 90),
    special4: i16At(record, 92),
    special5: i16At(record, 94),
    weightPerCharge: i16At(record, 96),
    dropOnEmpty: i16At(record, 98),
    preview: `${category} ${itemId}, cost ${i16At(record, 28)}, icon ${i16At(record, 4)}`
  };
}

function itemCategory(categoryIndex: number) {
  switch (categoryIndex) {
    case 0:
      return "Weapon";
    case 1:
      return "Armor";
    case 2:
      return "Accessory";
    case 3:
      return "Magic";
    case 4:
      return "Supply / Special";
    default:
      return "Item";
  }
}

function addItemRecords(schema: SemanticSchema, buffer?: Uint8Array) {
  if (!buffer) return;
  const count = Math.floor(buffer.byteLength / ITEM_BYTES);
  for (let index = 0; index < count; index += 1) {
    const start = index * ITEM_BYTES;
    const record = buffer.slice(start, start + ITEM_BYTES);
    const summary = itemRecordSummary(index, record, "Data NI");
    const itemId = typeof summary.itemId === "number" ? summary.itemId : 800 + index;
    const category = typeof summary.category === "string" ? summary.category : "Item";
    const label = `${category} ${itemId}`;
    upsertRecord(schema, browserRecord("Data NI", index, ITEM_BYTES, "item", label, summary));
    schema.entities.push(browserEntity(`item:${itemId}`, "item", label, "Data NI", `record:Data NI:${index}`, start, ITEM_BYTES, summary));
    if (typeof summary.iconId === "number" && summary.iconId !== 0) {
      pushLink(schema, `item:${itemId}`, `resource:cicn:${summary.iconId}`, "uses_resource", "source-backed", { field: "iconId" });
    }
    if (typeof summary.sound === "number" && summary.sound !== 0) {
      pushLink(schema, `item:${itemId}`, `resource:snd :${summary.sound}`, "uses_resource", "source-backed", { field: "sound" });
    }
    const itemType = typeof summary.type === "number" ? summary.type : 0;
    const special1 = typeof summary.special1 === "number" ? summary.special1 : 0;
    const special5 = typeof summary.special5 === "number" ? summary.special5 : -1;
    if ((Math.abs(itemType) === 23 || special1 === -23) && special5 >= 0) {
      pushLink(schema, `item:${itemId}`, `macro:${special5}`, "calls_macro", "source-backed", {
        field: "special5",
        itemType,
        special1,
        reason: "door item activates an Extra Action Point"
      });
    }
  }
}

function addMaps(schema: SemanticSchema, maps: MapEntity[]) {
  for (const map of maps) {
    upsertRecord(schema, {
      id: `record:${map.source}:${map.index}`,
      source: sourceId(map.source),
      type: `${map.levelType} field grid`,
      label: map.name,
      editState: "editable",
      byteRange: byteRange(map.index * FIELD_BYTES, FIELD_BYTES),
      confidence: "confirmed",
      summary: { levelType: map.levelType, levelIndex: map.index, width: map.width, height: map.height, render: map.render }
    });
    schema.entities.push({
      id: mapEntityId(map.levelType, map.index),
      type: "map",
      label: map.name,
      editState: "editable",
      confidence: "confirmed",
      source: map.source,
      recordRef: `record:${map.source}:${map.index}`,
      byteRange: byteRange(map.index * FIELD_BYTES, FIELD_BYTES),
      editable: true,
      summary: {
        levelType: map.levelType,
        levelIndex: map.index,
        width: map.width,
        height: map.height,
        tilesetId: map.render.tilesetId,
        landlook: map.render.landlook,
        mode: map.render.mode
      }
    });
  }
}

function addMapRecords(schema: SemanticSchema, mapRecords: MapRecord[], maps: MapEntity[]) {
  const knownMaps = new Set(maps.map((map) => mapEntityId(map.levelType, map.index)));
  for (const record of mapRecords) {
    const recordRef = `record:Data MD2:${record.id}`;
    const iconSlots = Array.from({ length: 10 }, (_, slot) => {
      const offset = slot * 6;
      const iconId = i16Array(record.rawBytes, offset);
      return {
        slot,
        iconId,
        x: i16Array(record.rawBytes, offset + 2),
        y: i16Array(record.rawBytes, offset + 4)
      };
    }).filter((slot) => slot.iconId !== 0);
    const name = record.name || record.primaryName || `Map record ${record.id}`;
    const summary = {
      id: record.id,
      name,
      primaryName: record.primaryName ?? null,
      secondaryName: record.secondaryName ?? null,
      nameSource: record.nameSource ?? null,
      iconSlots,
      startX: record.startX,
      startY: record.startY,
      level: record.level,
      pictId: record.pictId,
      iconSize: record.iconSize,
      show: record.show,
      isDungeon: record.isDungeon,
      rect: record.rect,
      note: record.note
    };
    upsertRecord(schema, browserRecord("Data MD2", record.id, 340, "map record", name, summary));
    const entityId = `map-record:${record.id}`;
    schema.entities.push(browserEntity(entityId, "map record", name, "Data MD2", recordRef, record.id * 340, 340, summary));
    const levelType = record.isDungeon ? "dungeon" : "land";
    const mapId = mapEntityId(levelType, record.level);
    if (knownMaps.has(mapId)) pushLink(schema, entityId, mapId, "describes_map", "source-backed");
    if (record.pictId !== 0) pushLink(schema, entityId, `resource:PICT:${record.pictId}`, "uses_resource", "source-backed", { field: "pictid" });
    for (const icon of iconSlots) {
      pushLink(schema, entityId, `resource:cicn:${icon.iconId}`, "uses_resource", "source-backed", { field: "icon", slot: icon.slot });
    }
  }
}

function addRandomLevels(schema: SemanticSchema, randomLevels: RandomLevel[]) {
  for (const level of randomLevels) {
    const source = level.levelType === "land" ? "Data RD" : "Data RDD";
    const recordRef = `record:${source}:${level.levelIndex}`;
    upsertRecord(schema, {
      id: recordRef,
      source: sourceId(source),
      type: `${level.levelType} random metadata`,
      label: level.id,
      editState: "inspect-only",
      byteRange: byteRange(level.levelIndex * RANDLEVEL_BYTES, RANDLEVEL_BYTES),
      confidence: "source-backed",
      summary: { landlook: level.landlook, isDark: level.isDark, useLos: level.useLos, rectCount: level.rects.length }
    });
    pushLink(schema, recordRef, mapEntityId(level.levelType, level.levelIndex), "configures_map", "source-backed");
    for (const rect of level.rects) {
      const id = `random:${level.levelType}:${level.levelIndex}:${rect.rectIndex}`;
      schema.entities.push({
        id,
        type: "random-region",
        label: `Random rect ${rect.rectIndex} @ ${rect.left},${rect.top}-${rect.right},${rect.bottom}`,
        editState: "inspect-only",
        confidence: "source-backed",
        source,
        recordRef,
        byteRange: byteRange(level.levelIndex * RANDLEVEL_BYTES, RANDLEVEL_BYTES),
        editable: true,
        summary: {
          levelType: level.levelType,
          levelIndex: level.levelIndex,
          rectIndex: rect.rectIndex,
          rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
          percent: rect.percent,
          battleRange: rect.battleRange,
          randomDoors: rect.randomDoors,
          randomDoorPercent: rect.randomDoorPercent,
          sound: rect.sound,
          text: rect.text
        }
      });
      pushLink(schema, id, mapEntityId(level.levelType, level.levelIndex), "contains_region", "source-backed");
      for (const battle of rect.battleRange) {
        if (battle > 0) pushLink(schema, id, `battle:${battle}`, "spawns_battle", "source-backed", { battleRange: rect.battleRange });
      }
      for (const [slot, door] of rect.randomDoors.entries()) {
        if (door <= 0) continue;
        pushLink(schema, id, `macro:${door}`, "calls_macro", "inferred", {
          slot,
          percent: rect.randomDoorPercent[slot] ?? 0,
          cache: level.levelType === "dungeon" ? "CD" : "CL"
        });
        pushLink(schema, id, `runtime-cache:${level.levelType === "dungeon" ? "CD" : "CL"}`, "mutates_cache", "source-backed", {
          reason: "positive random-door percent can be zeroed after firing"
        });
      }
      if (rect.text > 0) pushLink(schema, id, `message:${rect.text}`, "shows_message", "source-backed", { randomRect: rect.rectIndex });
      if (rect.sound > 0) pushLink(schema, id, `resource:snd :${rect.sound}`, "uses_resource", "inferred", { resourceType: "snd " });
    }
  }
}

function addExtracodes(schema: SemanticSchema, rows: ExtraCodeRow[]) {
  for (const row of rows) {
    const id = `record:Data EDCD:${row.id}`;
    upsertRecord(schema, {
      id,
      source: sourceId("Data EDCD"),
      type: "extra-code row",
      label: `Parameter Row ${row.id}`,
      editState: "inspect-only",
      byteRange: byteRange(row.id * 10, 10),
      confidence: "source-backed",
      summary: { values: row.values }
    });
    schema.entities.push({
      id,
      type: "edcd-row",
      label: `Parameter Row ${row.id}`,
      editState: "inspect-only",
      confidence: "source-backed",
      source: "Data EDCD",
      recordRef: null,
      byteRange: byteRange(row.id * 10, 10),
      editable: true,
      summary: { values: row.values }
    });
  }
}

function addTriggers(schema: SemanticSchema, triggers: TriggerRecord[], extracodes: ExtraCodeRow[]) {
  const edcdRows = new Map(extracodes.map((row) => [row.id, row.values]));
  for (const trigger of triggers) {
    if (!trigger.active) continue;
    const id = trigger.source === "Data ED3"
      ? `macro:${trigger.recordIndex}`
      : `trigger:${trigger.levelType ?? "unknown"}:${trigger.levelIndex ?? 0}:${trigger.recordIndex}`;
    const recordRef = `record:${trigger.source}:${trigger.recordIndex}`;
    schema.entities.push({
      id,
      type: trigger.source === "Data ED3" ? "ed3-action-record" : "trigger",
      label: trigger.source === "Data ED3" ? `Imported Extra Action ${trigger.recordIndex}` : `Trigger ${trigger.recordIndex}`,
      editState: "inspect-only",
      confidence: "source-backed",
      source: trigger.source,
      recordRef,
      byteRange: trigger.provenance ? byteRange(trigger.provenance.byteOffset, trigger.provenance.byteLength) : null,
      editable: true,
      summary: {
        source: trigger.source,
        levelType: trigger.levelType,
        levelIndex: trigger.levelIndex,
        recordIndex: trigger.recordIndex,
        coordinate: trigger.coordinate,
        percent: trigger.percent,
        actionCount: trigger.actions.length,
        actions: trigger.actions.map((action) => actionSummary(action, edcdRows)),
        callable: trigger.source !== "Data ED3",
        reachability: trigger.source === "Data ED3" ? "unclassified" : "source-root",
        classification: trigger.source === "Data ED3" ? "needs-runtime-trace" : "map-trigger-root"
      }
    });
    if (trigger.levelType && trigger.levelIndex != null) {
      pushLink(schema, id, mapEntityId(trigger.levelType, trigger.levelIndex), "located_on", "source-backed");
    }
    for (const action of trigger.actions) {
      const slotId = `action-slot:${id}:${action.slot}`;
      schema.entities.push({
        id: slotId,
        type: "action-slot",
        label: `${trigger.source === "Data ED3" ? "Extra Action Point" : "Trigger"} ${trigger.recordIndex} action ${action.slot}`,
        editState: "inspect-only",
        confidence: "source-backed",
        source: trigger.source,
        recordRef,
        byteRange: trigger.provenance ? byteRange(trigger.provenance.byteOffset + 8 + action.slot * 2, 2) : null,
        editable: false,
        summary: { trigger: id, ...actionSummary(action, edcdRows) }
      });
      pushLink(schema, id, slotId, "has_action_slot", "source-backed");
      addActionLink(schema, slotId, action.code, action.id, edcdRows, trigger.levelType, trigger.levelIndex);
      if (action.rawCode !== 0 && actionOptionLooksNoop(action.label)) {
        schema.decoding.dispatcherNoops.push({
          source: trigger.source,
          levelType: trigger.levelType,
          levelIndex: trigger.levelIndex,
          recordIndex: trigger.recordIndex,
          slot: action.slot,
          rawCode: action.rawCode,
          id: action.id,
          message: `Action slot ${action.slot} uses CODE ${action.code} (raw ${action.rawCode}), which Realmz reads but ignores because newland.c has no dispatcher case.`
        });
      }
    }
  }
}

function actionOptionLooksNoop(label: string) {
  return label === "Dispatcher No-op";
}

function actionSummary(action: Action, edcdRows: Map<number, number[]>) {
  const usage = browserEdcdUsage(action, edcdRows);
  return {
    slot: action.slot,
    code: action.code,
    rawCode: action.rawCode,
    id: action.id,
    label: action.label,
    category: action.category,
    gosub: action.gosub,
    ...(usage ? { edcdUsage: usage } : {})
  };
}

function addActionLink(
  schema: SemanticSchema,
  from: string,
  code: number,
  id: number,
  edcdRows: Map<number, number[]>,
  triggerLevelType: string | null,
  triggerLevelIndex: number | null
) {
  if (code === 0 || id < 0) return;
  const target = Math.abs(id);
  const shape = edcdShape(code);
  if (shape) {
    const row = edcdRows.get(target);
    pushLink(schema, from, `record:Data EDCD:${target}`, "uses_parameter_row", row ? "source-backed" : "inferred", { opcode: code, shape: shape.name });
    if (!row) {
      schema.diagnostics.push({
        id: `diagnostic:browser-missing-edcd:${schema.diagnostics.length}`,
        type: "missing-edcd-row",
        severity: "warning",
        confidence: "source-backed",
        source: null,
        message: `Browser import action opcode ${code} references missing parameter row ${target}.`,
        data: { actionSlot: from, code, rowId: target, shape: shape.name }
      });
      return;
    }
    if (code === 92) {
      const secondaryRowId = target + 1;
      const secondaryRow = edcdRows.get(secondaryRowId);
      pushLink(schema, from, `record:Data EDCD:${secondaryRowId}`, "uses_secondary_parameter_row", secondaryRow ? "source-backed" : "inferred", { opcode: code, shape: "random-region-shape-details" });
      if (!secondaryRow) {
        schema.diagnostics.push({
          id: `diagnostic:browser-missing-edcd-secondary:${schema.diagnostics.length}`,
          type: "missing-secondary-edcd-row",
          severity: "warning",
          confidence: "source-backed",
          source: null,
          message: `Browser import action opcode ${code} references missing secondary parameter row ${secondaryRowId}.`,
          data: { actionSlot: from, code, primaryRowId: target, secondaryRowId }
        });
      }
    }
    addBrowserEdcdLinks(schema, from, code, row, triggerLevelType);
    return;
  }
  if (code === 1 || code === 62 || code === 71) pushLink(schema, from, `message:${target}`, "shows_message", "source-backed", { opcode: code });
  else if (code === 4) pushLink(schema, from, `encounter:simple:${target}`, "starts_encounter", "source-backed", { opcode: code });
  else if (code === 5) pushLink(schema, from, `encounter:complex:${target}`, "starts_encounter", "source-backed", { opcode: code });
  else if (code === 6 || code === 49) pushLink(schema, from, `shop:${target}`, "opens_shop", "source-backed", { opcode: code });
  else if (code === 8) {
    const sameMapTarget = triggerLevelType && triggerLevelIndex != null
      ? `trigger:${triggerLevelType}:${triggerLevelIndex}:${target}`
      : `trigger:current-map:${target}`;
    pushLink(schema, from, sameMapTarget, "copies_action_point", "source-backed", { opcode: code });
  }
  else if (code === 39) pushLink(schema, from, `macro:${target}`, "calls_macro", "inferred", { opcode: code });
  else if (code === 10) pushLink(schema, from, `treasure:${target}`, "gives_treasure", "source-backed", { opcode: code });
  else if (code === 27) pushLink(schema, from, `resource:PICT:${target}`, "uses_resource", "source-backed", { opcode: code });
  else if (code === 29 || code === 97) pushLink(schema, from, `map-record:${target}`, "uses_map_record", "source-backed", { opcode: code });
  else if (code === 47) pushLink(schema, from, `quest-flag:${target}`, "writes_flag", "inferred", { opcode: code });
  else if (code === 127) pushLink(schema, from, `monster:${target}`, "uses_monster", "inferred", { opcode: code });
}

function addBrowserEdcdLinks(
  schema: SemanticSchema,
  from: string,
  code: number,
  row: number[],
  triggerLevelType: string | null
) {
  const value = (index: number) => row[index] ?? 0;
  const addOneBasedBranch = (mode: number, target: number, kind = "branches_to") => {
    if (target < 0 || mode === 0 || mode === -1) return;
    if (mode === 1) pushLink(schema, from, `macro:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 2) pushLink(schema, from, `encounter:simple:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 3) pushLink(schema, from, `encounter:complex:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
  };
  const addZeroBasedBranch = (mode: number, target: number, kind = "branches_to") => {
    if (target < 0 || mode === -1) return;
    if (mode === 0) pushLink(schema, from, `macro:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 1) pushLink(schema, from, `encounter:simple:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 2) pushLink(schema, from, `encounter:complex:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
  };
  const addForceBranch = (mode: number, target: number, kind = "branches_to") => {
    if (target < 0) return;
    if (mode === 0) pushLink(schema, from, `macro:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
  };
  const addMessage = (id: number) => {
    if (id > 0) pushLink(schema, from, `message:${id}`, "shows_message", "source-backed", { opcode: code });
  };
  const addSound = (id: number) => {
    if (id) pushLink(schema, from, `resource:snd :${id}`, "plays_sound", "source-backed", { opcode: code });
  };
  const addMacro = (id: number, kind = "calls_macro") => {
    if (id > 0) pushLink(schema, from, `macro:${id}`, kind, "inferred", { opcode: code });
  };
  const addMacroAllowZero = (id: number, kind = "calls_macro") => {
    if (id >= 0) pushLink(schema, from, `macro:${id}`, kind, "inferred", { opcode: code });
  };
  const addMacroRange = (lowValue: number, highValue: number, kind = "branches_to") => {
    if (highValue < 0) return;
    const low = Math.max(0, lowValue);
    const high = Math.max(low, highValue);
    const ids = high - low > 32 ? [low, high] : Array.from({ length: high - low + 1 }, (_, index) => low + index);
    for (const id of ids) pushLink(schema, from, `macro:${id}`, kind, "inferred", { opcode: code });
  };
  const addZeroBasedBranchRange = (mode: number, lowValue: number, highValue: number, kind = "branches_to") => {
    if (highValue < 0 || mode === -1) return;
    const low = Math.max(0, lowValue);
    const high = Math.max(low, highValue);
    const ids = high - low > 32 ? [low, high] : Array.from({ length: high - low + 1 }, (_, index) => low + index);
    for (const id of ids) {
      if (mode === 0 && id >= 0) pushLink(schema, from, `macro:${id}`, kind, "inferred", { opcode: code, branchMode: mode });
      else if (mode === 1) pushLink(schema, from, `encounter:simple:${id}`, kind, "inferred", { opcode: code, branchMode: mode });
      else if (mode === 2) pushLink(schema, from, `encounter:complex:${id}`, kind, "inferred", { opcode: code, branchMode: mode });
    }
  };
  const addBattleRange = (lowValue: number, highValue: number) => {
    const low = Math.abs(lowValue);
    const high = Math.max(low, Math.abs(highValue));
    const battles = high - low > 32 ? [low, high] : Array.from({ length: high - low + 1 }, (_, index) => low + index);
    for (const battle of battles) pushLink(schema, from, `battle:${battle}`, "starts_battle", "source-backed", { opcode: code });
  };

  if (code === 2 || code === 48 || code === 56 || code === 107) {
    addBattleRange(value(0), value(1));
    if (code === 56) {
      addMacroAllowZero(value(2), "branches_on_coward");
      addSound(value(3));
      addMessage(value(4));
    } else {
      addSound(value(2));
      if (code === 2 && value(4) === 10) addMacroAllowZero(value(2), "branches_on_revived_loss");
      addMessage(value(3));
      if (code === 48 && value(4) > 0) pushLink(schema, from, `treasure:${value(4)}`, "gives_treasure", "source-backed", { opcode: code });
      if (code === 107) addMacroAllowZero(value(4), "branches_on_coward");
    }
  } else if (code === 3) {
    addOneBasedBranch(value(1), value(2));
    addMessage(value(3));
    addMessage(value(4));
  } else if (code === 7) {
    addMacroAllowZero(value(2));
    pushLink(schema, from, value(0) === -2 ? "runtime-cache:CE2" : value(0) === -1 ? "runtime-cache:CE" : "runtime-cache:CL", "mutates_cache", "inferred", { opcode: code });
  } else if (code === 12) {
    const levelType = value(4) ? "dungeon" : "land";
    pushLink(schema, from, `map:${levelType}:${Math.max(0, value(0))}`, "mutates_tile", "source-backed", { opcode: code });
    pushLink(schema, from, `runtime-cache:${levelType === "dungeon" ? "CD" : "CL"}`, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 13) {
    const cache = value(3) < 0 ? "runtime-cache:CD" : "runtime-cache:CL";
    pushLink(schema, from, cache, "mutates_trigger", "source-backed", { opcode: code });
    pushLink(schema, from, cache, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 19) {
    addMessage(value(0));
    addMessage(value(1));
  } else if (code === 20 || code === 45) {
    const levelType = triggerLevelType === "dungeon" ? "dungeon" : "land";
    pushLink(schema, from, `map:${levelType}:${Math.max(0, value(0))}`, "uses_map_record", "source-backed", { opcode: code });
    pushLink(schema, from, `runtime-cache:${levelType === "dungeon" ? "CD" : "CL"}`, "writes_runtime_state", "inferred", { opcode: code });
    addSound(value(3));
    addMessage(value(4));
  } else if (code === 21) {
    pushLink(schema, from, `treasure:${Math.max(0, value(0))}`, "reads_flag", "source-backed", { opcode: code });
    addZeroBasedBranch(value(1), value(3), "branches_true");
    if (value(2) === 0) addZeroBasedBranch(value(1), value(4), "branches_false");
    else if (value(2) === 2) addMessage(value(4));
  } else if (code === 23 || code === -23 || code === 92) {
    const levelType = code === -23 || value(2) ? "dungeon" : "land";
    pushLink(schema, from, `random:${levelType}:${Math.max(0, value(0))}:${Math.max(0, value(1))}`, "mutates_random_region", "source-backed", { opcode: code });
    pushLink(schema, from, `runtime-cache:${levelType === "dungeon" ? "CD" : "CL"}`, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 31) {
    pushLink(schema, from, "runtime-cache:CE", "selects_characters", "inferred", { opcode: code });
    addMacroAllowZero(value(3), "branches_true");
    addMacroAllowZero(value(4), "branches_false");
  } else if (code === 15 || code === 16) {
    pushLink(schema, from, "runtime-cache:CE", code === 15 ? "alters_character_state" : "alters_party_state", "inferred", { opcode: code });
    addSound(value(3));
    addMessage(Math.abs(value(4)));
  } else if (code === 37) {
    pushLink(schema, from, "runtime-cache:CD", "writes_runtime_state", "inferred", { opcode: code });
  } else if (code === 38 || code === 42 || code === 58 || code === 59) {
    addForceBranch(value(2), value(3));
  } else if (code === 40) {
    addOneBasedBranch(value(1), value(2));
  } else if (code === 46) {
    pushLink(schema, from, `quest-flag:${Math.max(0, value(0))}`, "reads_flag", "source-backed", { opcode: code });
    addForceBranch(value(2), value(3));
  } else if (code === 47 || code === 76) {
    pushLink(schema, from, `quest-flag:${Math.max(0, value(0))}`, "writes_flag", "source-backed", { opcode: code });
    if (code === 76 && value(3) !== 0) addOneBasedBranch(value(2), value(4));
  } else if (code === 51) {
    pushLink(schema, from, `shop:${Math.max(0, value(0))}`, "mutates_shop", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CS", "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 55) {
    addMacroAllowZero(value(3), "branches_true");
    if (value(1) === 1) addMacroAllowZero(value(4), "branches_false");
    else if (value(1) === 2) addMessage(value(4));
  } else if (code === 57) {
    pushLink(schema, from, `map:land:${Math.max(0, value(2))}`, "changes_rendering", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CL", "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 64) {
    addMacroAllowZero(value(3), "branches_true");
    addMacroAllowZero(value(4), "branches_false");
  } else if (code === 67) {
    addZeroBasedBranch(value(1), value(3), "branches_true");
    addZeroBasedBranch(value(1), value(4), "branches_false");
  } else if (code === 72 || code === 75) {
    addZeroBasedBranch(value(3), value(4), "branches_false");
  } else if (code === 73) {
    pushLink(schema, from, `shop:${Math.max(0, value(0))}`, "opens_shop", "source-backed", { opcode: code });
  } else if (code === 43) {
    pushLink(schema, from, "runtime-cache:CE", "alters_character_state", "inferred", { opcode: code });
    addSound(value(3));
  } else if (code === 74) {
    pushLink(schema, from, "runtime-cache:CS", "alters_party_state", "inferred", { opcode: code });
    if (value(3)) addSound(value(1));
    addMessage(value(4));
  } else if (code === 77 || code === 78) {
    pushLink(schema, from, code === 77 ? `quest-flag:${Math.max(0, value(0))}` : `map-record:${Math.max(0, value(0))}`, "reads_flag", "inferred", { opcode: code });
    if (value(3) !== 0) addZeroBasedBranch(value(2), value(3), "branches_false");
    if (value(4) !== 0) addZeroBasedBranch(value(2), value(4), "branches_true");
  } else if (code === 81) {
    pushLink(schema, from, "runtime-cache:CE", "reads_flag", "inferred", { opcode: code });
    addMacroAllowZero(value(3), "branches_true");
    addMacroAllowZero(value(4), "branches_false");
  } else if (code === 85) {
    addZeroBasedBranchRange(value(0), value(1), value(2));
    addSound(value(3));
    addMessage(value(4));
  } else if (code === 86) {
    if (value(3) !== 0) addZeroBasedBranch(value(2), value(3), "branches_true");
    if (value(4) !== 0) addZeroBasedBranch(value(2), value(4), "branches_false");
  } else if (code === 87) {
    addZeroBasedBranch(value(1), value(3), "branches_true");
    if (value(2) === 0) addZeroBasedBranch(value(1), value(4), "branches_false");
    else if (value(2) === 2) addMessage(value(4));
  } else if (code === 106) {
    pushLink(schema, from, "runtime-cache:CL", "changes_rendering", "source-backed", { opcode: code });
  } else if (code === 120) {
    pushLink(schema, from, `monster:${Math.max(0, value(1))}`, "uses_monster", "source-backed", { opcode: code });
    if (value(3) > 0) pushLink(schema, from, `resource:cicn:${value(3)}`, "uses_resource", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CE", "mutates_cache", "inferred", { opcode: code });
  } else if (code === 122) {
    addMessage(value(0));
    addSound(value(1));
  } else if (code === 123) {
    for (const monster of row) if (monster > 0) pushLink(schema, from, `monster:${monster}`, "uses_monster", "source-backed", { opcode: code });
  } else if (code === 124 || code === 125) {
    pushLink(schema, from, `monster:${Math.max(0, value(code === 124 ? 1 : 0))}`, "uses_monster", "source-backed", { opcode: code });
    if (code === 124) addSound(value(3));
    pushLink(schema, from, "runtime-cache:CE", "mutates_encounter_state", "inferred", { opcode: code });
  } else if (code === 126) {
    if (value(2) === 2) addMacroRange(value(3), value(4));
    else addMacroAllowZero(value(3));
  }
}

function browserEdcdUsage(action: Action, edcdRows: Map<number, number[]>) {
  const shape = edcdShape(action.code);
  if (!shape) return null;
  const rowId = Math.abs(action.id);
  const values = edcdRows.get(rowId);
  if (!values) {
    return {
      rowId,
      shape: shape.name,
      fields: [],
      targetHints: [],
      confidence: "source-backed",
      diagnostics: [`Missing parameter row ${rowId}`],
      summary: `${shape.name}: missing parameter row`,
      opcode: action.code
    };
  }
  const diagnostics: string[] = [];
  const secondaryRowId = action.code === 92 ? rowId + 1 : null;
  const secondaryValues = secondaryRowId == null ? null : edcdRows.get(secondaryRowId);
  if (secondaryRowId != null && !secondaryValues) diagnostics.push(`Missing secondary parameter row ${secondaryRowId}`);
  return {
    rowId,
    shape: shape.name,
    fields: shape.fields.map((name, index) => ({ name, value: values[index] ?? 0 })),
    targetHints: [],
    confidence: "source-backed",
    diagnostics,
    summary: `${shape.name}: ${shape.fields.map((name, index) => `${name}=${values[index] ?? 0}`).join(", ")}`,
    opcode: action.code,
    ...(secondaryRowId != null && secondaryValues
      ? {
          secondaryRowId,
          secondaryShape: "random-region-shape-details",
          secondaryFields: RANDOM_REGION_SHAPE_DETAIL_FIELDS.map((name, index) => ({ name, value: secondaryValues[index] ?? 0 }))
        }
      : {})
  };
}

const RANDOM_REGION_SHAPE_DETAIL_FIELDS = ["shapeX1", "shapeY1", "shapeX2", "shapeY2", "shapeFlags"];

function edcdShape(code: number): { name: string; fields: string[] } | null {
  const shape = EDCD_SHAPES[code];
  return shape ?? null;
}

const EDCD_SHAPES: Record<number, { name: string; fields: string[] }> = {
  [-23]: { name: "random-region-mutation", fields: ["level", "randomRegion", "percent", "battleLowOrKeep", "battleHighOrKeep"] },
  2: { name: "battle", fields: ["battleLow", "battleHigh", "soundOrReviveLossMacro", "message", "revivePartyFlag"] },
  3: { name: "choice", fields: ["replyPolarity", "branchMode", "branchTarget", "promptA", "promptB"] },
  7: { name: "action-data-patching", fields: ["levelOrCache", "targetRecord", "macro", "levelKind", "resultSlot"] },
  12: { name: "tile-mutation", fields: ["level", "xOrDungeonY", "yOrDungeonX", "tileValue", "isDungeon"] },
  13: { name: "trigger-mutation", fields: ["level", "singleTrigger", "percent", "rangeStartWithSign", "rangeEnd"] },
  15: { name: "damage-heal", fields: ["multiplier", "low", "high", "sound", "message"] },
  16: { name: "damage-heal", fields: ["multiplier", "low", "high", "sound", "message"] },
  17: { name: "spell-cast", fields: ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"] },
  18: { name: "spell-cast", fields: ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"] },
  19: { name: "random-message", fields: ["messageLow", "messageHigh", "unused", "unused", "unused"] },
  20: { name: "teleport", fields: ["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"] },
  21: { name: "item-branch", fields: ["item", "branchMode", "missingBehavior", "hasTarget", "missingTarget"] },
  22: { name: "item-mutation", fields: ["item", "maxMatches", "mode", "chargeDelta", "replacementItem"] },
  23: { name: "random-region-mutation", fields: ["level", "randomRegion", "percent", "battleLowOrKeep", "battleHighOrKeep"] },
  30: { name: "ability-check-pick", fields: ["signedAbilityOrAttribute", "adjustment", "sourceSet", "attributeFlag", "unused"] },
  31: { name: "ability-check-branch", fields: ["abilityOrAttribute", "adjustment", "attributeFlag", "successMacro", "failureMacro"] },
  33: { name: "gold", fields: ["signedAmount", "failureMarker", "unused", "unused", "unused"] },
  37: { name: "dungeon-move", fields: ["mode", "level", "x", "y", "signedHeading"] },
  38: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  40: { name: "party-condition-branch", fields: ["expectedState", "branchMode", "branchTarget", "condition", "unused"] },
  41: { name: "encounter-mutation", fields: ["simpleEncounter", "oneBasedChoiceSlot", "unused", "unused", "unused"] },
  42: { name: "percent-branch", fields: ["percent", "successBehavior", "branchMode", "target", "slot"] },
  43: { name: "condition", fields: ["scope", "condition", "durationOrDelta", "sound", "unused"] },
  45: { name: "teleport", fields: ["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"] },
  46: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  48: { name: "selective-battle", fields: ["battleLow", "battleHigh", "sound", "message", "treasure"] },
  50: { name: "race-caste-gender-selector", fields: ["selector", "gender", "raceCasteOrClass", "unused", "livingOnly"] },
  52: { name: "character-selector", fields: ["selector", "value", "sourceSet", "unused", "unused"] },
  53: { name: "caste-selector", fields: ["exactCaste", "casteGroup", "sourceSet", "unused", "unused"] },
  54: { name: "timed-encounter-mutation", fields: ["timedEncounter", "percentOrKeep", "incrementOrKeep", "resetDayFlag", "dayOffsetOrKeep"] },
  51: { name: "shop-mutation", fields: ["shop", "inflationDelta", "item", "stockDelta", "unused"] },
  55: { name: "picked-branch", fields: ["pickedSelector", "failureBehavior", "unused", "successMacro", "failureTarget"] },
  56: { name: "battle-outcome-branch", fields: ["battleLow", "battleHigh", "cowardMacro", "sound", "message"] },
  57: { name: "render-mutation", fields: ["landlook", "isDark", "targetLandLevel", "unused", "unused"] },
  58: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  59: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  60: { name: "party-money-state", fields: ["moneyType", "pickedOnly", "unused", "unused", "unused"] },
  61: { name: "position-shift", fields: ["legacyLevel", "xShift", "yShift", "randomize", "unused"] },
  63: { name: "time-mutation", fields: ["mode", "dayOrDelta", "hourOrDelta", "minuteOrDelta", "unused"] },
  64: { name: "game-time-branch", fields: ["dayLimit", "hourLimit", "unused", "successMacro", "failureMacro"] },
  65: { name: "random-items", fields: ["countOrRandomLimit", "itemLow", "itemHigh", "unused", "unused"] },
  67: { name: "item-charge-branch", fields: ["item", "branchMode", "minimumCharges", "successTarget", "failureTarget"] },
  68: { name: "fatigue", fields: ["mode", "unused", "percent", "unused", "unused"] },
  69: { name: "spell-flags", fields: ["spellcasting", "monstercasting", "spellcharging", "unused", "unused"] },
  70: { name: "save-restore-position", fields: ["mode", "unused", "unused", "unused", "unused"] },
  72: { name: "range-branch", fields: ["testA", "testB", "falseBehavior", "branchMode", "target"] },
  73: { name: "restricted-shop", fields: ["shop", "range1Low", "range1High", "range2Low", "range2High"] },
  74: { name: "spell-points", fields: ["signedRollCount", "lowOrSound", "high", "playSound", "message"] },
  75: { name: "range-branch", fields: ["testA", "testB", "falseBehavior", "branchMode", "target"] },
  76: { name: "quest-value", fields: ["quest", "delta", "branchMode", "threshold", "target"] },
  77: { name: "false-true-branch", fields: ["testA", "testB", "branchMode", "falseTarget", "trueTarget"] },
  78: { name: "false-true-branch", fields: ["testA", "testB", "branchMode", "falseTarget", "trueTarget"] },
  81: { name: "condition-branch", fields: ["condition", "characterSelector", "unused", "trueMacro", "falseMacro"] },
  85: { name: "random-branch", fields: ["branchMode", "rangeLow", "rangeHigh", "sound", "message"] },
  86: { name: "misc-conditional-branch", fields: ["testSelector", "signedTestValue", "branchMode", "trueTarget", "falseTarget"] },
  87: { name: "conditional-branch", fields: ["testSelector", "branchModeOrValue", "falseBehavior", "trueTarget", "falseTarget"] },
  90: { name: "party-state", fields: ["amount", "scope", "unused", "unused", "unused"] },
  92: { name: "random-region-shape-mutation", fields: ["level", "rect", "isDungeon", "percentDelta", "shapeMode"] },
  103: { name: "boat-camp-state", fields: ["mode", "statusValue", "branchModeOrBehavior", "targetOrValueA", "targetOrValueB"] },
  106: { name: "dark-level-state", fields: ["darkStatePlusOne", "stopIfAlready", "unused", "unused", "unused"] },
  107: { name: "improved-selective-battle", fields: ["battleLow", "battleHigh", "sound", "message", "cowardMacro"] },
  108: { name: "selected-character-state", fields: ["statSelector", "delta", "unused", "unused", "unused"] },
  120: { name: "combat-monster-mutation", fields: ["targetClass", "monsterId", "count", "replacementIcon", "traitorOverride"] },
  121: { name: "unused-edcd-load", fields: ["unused0", "unused1", "unused2", "unused3", "unused4"] },
  122: { name: "fumble", fields: ["message", "sound", "unused", "unused", "unused"] },
  123: { name: "rout", fields: ["monster1", "monster2", "monster3", "monster4", "monster5"] },
  124: { name: "spawn", fields: ["unused", "monster", "countOrRandomLimit", "sound", "traitorOverride"] },
  125: { name: "destroy-related", fields: ["monsterId", "maxCount", "unused", "unused", "includeTraitorSide"] },
  126: { name: "battle-macro", fields: ["mode", "roundOrPercent", "repeatMode", "macroLow", "macroHigh"] }
};

function addTileAssets(schema: SemanticSchema, assetCatalog: Project["assetCatalog"]) {
  for (const tileset of assetCatalog.tilesets) {
    schema.entities.push({
      id: `asset:tile-atlas:${tileset.id}`,
      type: "tile atlas",
      label: tileset.name,
      editState: tileset.available ? "inspect-only" : "blocked",
      confidence: tileset.available ? "fixture-backed" : "unknown",
      source: tileset.source,
      recordRef: null,
      byteRange: null,
      editable: false,
      summary: {
        landlook: tileset.landlook,
        imagePath: tileset.imagePath,
        pictId: tileset.pictId,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        columns: tileset.columns,
        rows: tileset.rows,
        baseTile: tileset.baseTile ?? null,
        custom: tileset.custom,
        available: tileset.available
      }
    });
  }
}

function addRenderProfiles(schema: SemanticSchema, maps: MapEntity[], assetCatalog: Project["assetCatalog"]) {
  const knownAssets = new Set(assetCatalog.tilesets.map((tileset) => `asset:tile-atlas:${tileset.id}`));
  for (const map of maps) {
    const mapId = mapEntityId(map.levelType, map.index);
    const profileId = `render-profile:${mapId.replace(/:/g, "-")}`;
    schema.entities.push({
      id: profileId,
      type: "render-profile",
      label: `Render profile: ${map.name}`,
      editState: "inspect-only",
      confidence: "source-backed",
      source: map.source,
      recordRef: `record:${map.source}:${map.index}`,
      byteRange: null,
      editable: false,
      summary: {
        mapId,
        mode: map.render.mode,
        tilesetId: map.render.tilesetId,
        landlook: map.render.landlook
      }
    });
    pushLink(schema, mapId, profileId, "has_render_profile", "source-backed");
    const assetId = `asset:tile-atlas:${map.render.tilesetId}`;
    if (knownAssets.has(assetId)) {
      pushLink(schema, profileId, assetId, "renders_with", "fixture-backed", { mapId });
    } else {
      const fallbackId = `asset-fallback:${map.render.tilesetId.replace(/:/g, "-")}`;
      if (!schema.entities.some((entity) => entity.id === fallbackId)) {
        schema.entities.push({
          id: fallbackId,
          type: "asset-fallback",
          label: `Fallback for ${map.render.tilesetId}`,
          editState: "blocked",
          confidence: "unknown",
          source: "browser render asset lookup",
          recordRef: null,
          byteRange: null,
          editable: false,
          summary: { tilesetId: map.render.tilesetId, mapId, reason: "missing browser tile atlas asset" }
        });
      }
      pushLink(schema, profileId, fallbackId, "renders_with", "unknown", { reason: "missing browser tile atlas asset" });
    }
    if (map.render.mode === "dungeon-top-down") {
      pushLink(schema, profileId, "resource:PICT:302", "renders_with", "source-backed", { fallback: "shared Realmz PICT 302 dungeon tiny sprites" });
    }
  }
}

function addResourceEntities(schema: SemanticSchema, buffers: Map<string, Uint8Array>, files: SourceFile[]) {
  const resourceFiles = files.filter((source) => source.role === "resource-fork");
  for (const file of resourceFiles) {
    const resources = parseResourceFork(buffers.get(file.name) ?? new Uint8Array());
    if (resources.length === 0) {
      schema.entities.push({
        id: `resource:${file.name}`,
        type: "resource",
        label: file.name,
        editState: "inspect-only",
        confidence: "source-backed",
        source: file.name,
        recordRef: null,
        byteRange: null,
        editable: false,
        summary: { bytes: file.bytes, browserInventory: "resource fork present, no readable resource members were found" }
      });
      schema.diagnostics.push({
        id: `diagnostic:browser-resource-empty:${file.name}`,
        type: "resource-fork-empty",
        severity: "warning",
        confidence: "source-backed",
        source: file.name,
        message: `${file.name} was loaded in browser mode, but no readable resource members were found.`,
        data: { target: `resource:${file.name}` }
      });
      continue;
    }
    addResourceTypeEntities(schema, file.name, resources);
    addResourceMemberEntities(schema, file.name, resources);
  }
}

function addResourceTypeEntities(schema: SemanticSchema, sourceName: string, resources: ResourceEntry[]) {
  const byType = new Map<string, { count: number; totalBytes: number; minId: number; maxId: number; named: number; ids: number[]; names: Array<{ id: number; name: string }> }>();
  for (const resource of resources) {
    const current = byType.get(resource.resourceType) ?? {
      count: 0,
      totalBytes: 0,
      minId: resource.id,
      maxId: resource.id,
      named: 0,
      ids: [],
      names: []
    };
    current.count += 1;
    current.totalBytes += resource.length;
    current.minId = Math.min(current.minId, resource.id);
    current.maxId = Math.max(current.maxId, resource.id);
    if (resource.name) {
      current.named += 1;
      if (current.names.length < 8) current.names.push({ id: resource.id, name: resource.name });
    }
    if (current.ids.length < 24) current.ids.push(resource.id);
    byType.set(resource.resourceType, current);
  }
  for (const [resourceType, summary] of byType) {
    const existing = schema.entities.find((entity) => entity.id === resourceTypeId(resourceType) && entity.type === "resource type");
    if (existing) {
      existing.summary = {
        ...existing.summary,
        count: Number(existing.summary.count ?? 0) + summary.count,
        totalBytes: Number(existing.summary.totalBytes ?? 0) + summary.totalBytes,
        minId: Math.min(Number(existing.summary.minId ?? summary.minId), summary.minId),
        maxId: Math.max(Number(existing.summary.maxId ?? summary.maxId), summary.maxId),
        named: Number(existing.summary.named ?? 0) + summary.named,
        ids: [...((existing.summary.ids as number[] | undefined) ?? []), ...summary.ids].slice(0, 24),
        names: [...((existing.summary.names as Array<{ id: number; name: string }> | undefined) ?? []), ...summary.names].slice(0, 8)
      };
      continue;
    }
    schema.entities.push({
      id: resourceTypeId(resourceType),
      type: "resource type",
      label: `Resource type ${resourceType}`,
      editState: "inspect-only",
      confidence: "source-backed",
      source: sourceName,
      recordRef: null,
      byteRange: null,
      editable: false,
      summary: { type: resourceType, ...summary }
    });
  }
}

function addResourceMemberEntities(schema: SemanticSchema, sourceName: string, resources: ResourceEntry[]) {
  const seen = new Map<string, number>();
  for (const resource of resources) {
    const baseId = resourceEntityId(resource.resourceType, resource.id);
    const duplicate = seen.get(baseId) ?? 0;
    seen.set(baseId, duplicate + 1);
    const entityId = duplicate === 0 ? baseId : `${baseId}:${duplicate + 1}`;
    const summary = {
      type: resource.resourceType,
      resourceType: resource.resourceType,
      resourceId: resource.id,
      name: resource.name,
      attributes: resource.attributes,
      bytes: resource.length,
      refOffset: resource.refOffset,
      nameOffset: resource.nameOffset,
      dataRelativeOffset: resource.dataRelativeOffset,
      offset: resource.offset,
      preview: hexPreview(resource.data, 20),
      scenarioSupplied: true
    };
    Object.assign(summary, {
      previewStatus: "metadata-only",
      previewMimeType: resourcePreviewMimeType(resource.resourceType),
      previewDataUrl: null,
      previewSummary: {},
      previewDiagnostics: []
    });
    const recordId = `record:${entityId}`;
    schema.records.push({
      id: recordId,
      source: sourceId(sourceName),
      type: "resource",
      label: resourceLabel(resource),
      editState: "inspect-only",
      byteRange: byteRange(resource.offset, resource.length),
      confidence: "source-backed",
      summary
    });
    schema.entities.push({
      id: entityId,
      type: "resource",
      label: resourceLabel(resource),
      editState: "inspect-only",
      confidence: "source-backed",
      source: sourceName,
      recordRef: recordId,
      byteRange: byteRange(resource.offset, resource.length),
      editable: false,
      summary
    });
    pushLink(schema, entityId, resourceTypeId(resource.resourceType), "member_of_resource_type", "source-backed");
  }
}

function resourceTypeId(resourceType: string) {
  return `resource-type:${resourceType}`;
}

function resourceEntityId(resourceType: string, resourceId: number) {
  return `resource:${resourceType}:${resourceId}`;
}

function resourceLabel(resource: ResourceEntry) {
  return resource.name ? `${resource.resourceType} ${resource.id}: ${resource.name}` : `${resource.resourceType} ${resource.id}`;
}

function hexPreview(bytes: Uint8Array, limit: number) {
  return Array.from(bytes.slice(0, limit)).map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function addInferredTargets(schema: SemanticSchema) {
  const existing = new Set(schema.entities.map((entity) => entity.id));
  for (const link of schema.links) {
    if (existing.has(link.to) || link.to.startsWith("record:")) continue;
    const entity = inferredEntity(link.to);
    if (!entity) continue;
    schema.entities.push(entity);
    existing.add(entity.id);
  }
  addInferredResourceTypes(schema, existing);
}

function inferredEntity(id: string): SemanticEntity | null {
  const [prefix] = id.split(":");
  const labels: Record<string, [string, string]> = {
    message: ["message", "Message"],
    battle: ["battle", "Battle"],
    encounter: ["simple encounter", "Encounter"],
    shop: ["shop", "Shop"]
  };
  if (id.startsWith("quest-flag:")) {
    return inferred(id, "quest flag", `Quest flag ${id.replace("quest-flag:", "")}`);
  }
  if (id.startsWith("resource:")) {
    const [, resourceType = "unknown", resourceId = ""] = id.split(":");
    return {
      id,
      type: "resource",
      label: `Resource ${resourceType} ${resourceId}`,
      editState: "inspect-only",
      confidence: "inferred",
      source: "browser semantic links",
      recordRef: null,
      byteRange: null,
      editable: false,
      summary: {
        referenceOnly: true,
        type: resourceType,
        resourceType,
        resourceId,
        scenarioSupplied: false,
        sharedFallback: ["PICT", "cicn", "STR#", "snd ", "TEXT", "styl", "vers"].includes(resourceType),
        fallbackSource: "bundled Realmz shared resources"
      }
    };
  }
  const label = labels[prefix];
  const parts = id.split(":");
  return label ? inferred(id, label[0], `${label[1]} ${parts[parts.length - 1]}`) : null;
}

function addInferredResourceTypes(schema: SemanticSchema, existing: Set<string>) {
  for (const resource of schema.entities.filter((entity) => entity.type === "resource")) {
    const resourceType = typeof resource.summary.resourceType === "string" ? resource.summary.resourceType : null;
    if (!resourceType) continue;
    const typeId = `resource-type:${resourceType}`;
    if (!existing.has(typeId)) {
      schema.entities.push({
        id: typeId,
        type: "resource type",
        label: `Resource type ${resourceType}`,
        editState: "inspect-only",
        confidence: "inferred",
        source: "browser semantic links",
        recordRef: null,
        byteRange: null,
        editable: false,
        summary: { type: resourceType, referenceOnly: true }
      });
      existing.add(typeId);
    }
    if (!schema.links.some((link) => link.from === resource.id && link.to === typeId && link.kind === "member_of_resource_type")) {
      pushLink(schema, resource.id, typeId, "member_of_resource_type", "inferred");
    }
  }
}

function classifyEd3Reachability(schema: SemanticSchema, triggers: TriggerRecord[]) {
  const ed3Triggers = triggers.filter((trigger) => trigger.source === "Data ED3" && trigger.active);
  if (ed3Triggers.length === 0) return;
  const ed3Ids = new Set(ed3Triggers.map((trigger) => `macro:${trigger.recordIndex}`));
  const incoming = new Map<string, SemanticLink[]>();
  for (const link of schema.links) {
    if (!ed3Ids.has(link.to)) continue;
    const links = incoming.get(link.to) ?? [];
    links.push(link);
    incoming.set(link.to, links);
  }
  const reachable = new Map<string, { rootType: string; evidence: string[] }>();
  for (const [target, links] of incoming) {
    const root = links.find(
      (link) =>
        (isMacroReachabilityLink(link) && !link.from.startsWith("action-slot:macro:")) ||
        (link.kind === "calls_battle_macro" && isNegativeBattleMacroLink(link))
    );
    if (root) {
      reachable.set(target, {
        rootType: root.kind === "calls_battle_macro" ? "negative-battle-macro" : browserRootType(root.from),
        evidence: [root.id]
      });
    }
  }
  const queue = Array.from(reachable.keys());
  while (queue.length > 0) {
    const current = queue.shift()!;
    const [, recordIndex] = current.split(":");
    const prefix = `action-slot:macro:${recordIndex}:`;
    for (const link of schema.links.filter((candidate) => isMacroReachabilityLink(candidate) && candidate.from.startsWith(prefix))) {
      if (!ed3Ids.has(link.to) || reachable.has(link.to)) continue;
      reachable.set(link.to, { rootType: "recursive-macro-call", evidence: [...(reachable.get(current)?.evidence ?? []), link.id] });
      queue.push(link.to);
    }
  }
  const debtCounts = new Map<string, number>();
  for (const trigger of ed3Triggers) {
    const entityId = `macro:${trigger.recordIndex}`;
    const root = reachable.get(entityId);
    const actionCount = trigger.actions.filter((action) => action.rawCode !== 0 || action.id !== 0).length;
    const classification = root ? "reachable-macro" : browserNonreachableClassification(trigger, actionCount);
    if (!root) debtCounts.set(classification, (debtCounts.get(classification) ?? 0) + 1);
    const authorLabel = browserExtraActionClassification(root?.rootType ?? null, classification, Boolean(root));
    const row = {
      recordIndex: trigger.recordIndex,
      entityId,
      classification,
      reachable: Boolean(root),
      pathStatus: root ? "source-backed-root" : "not-source-reachable",
      rootType: root?.rootType ?? null,
      incomingRefs: incoming.get(entityId)?.length ?? 0,
      actionCount,
      rawSignature: trigger.actions.flatMap((action) => [action.rawCode, action.id]),
      evidence: root?.evidence ?? ["browser-import-core"],
      promotionRule: root
        ? "Promoted from Data ED3 because a source-backed root reaches this record."
        : "Preserved as Data ED3 evidence until source-backed reachability or explicit authoring exists."
    };
    schema.decoding.ed3Reachability.push(row);
    const entity = schema.entities.find((candidate) => candidate.id === entityId);
    if (entity) {
      entity.type = row.reachable ? "macro" : "ed3-action-record";
      entity.label = `${authorLabel} ${trigger.recordIndex}`;
      entity.editable = row.reachable;
      entity.summary.callable = row.reachable;
      entity.summary.reachability = row.pathStatus;
      entity.summary.classification = row.classification;
      entity.summary.incomingRefs = row.incomingRefs;
      entity.summary.promotionRule = row.promotionRule;
    }
  }
  for (const [group, claimCount] of debtCounts) {
    schema.decoding.confidenceDebt.push({
      group,
      confidence: "inferred",
      impact: "Non-reachable Data ED3 rows are preserved and inspectable but not offered as callable macros.",
      claimCount,
      nextStep: "Use source-backed links, runtime traces, or explicit duplicate/promote authoring before editing."
    });
  }
}

function browserExtraActionClassification(rootType: string | null, classification: string, reachable: boolean) {
  if (!reachable) {
    if (classification === "probable-editor-padding") return "Imported Empty Slot";
    return "Imported Extra Action";
  }
  if (rootType?.includes("global")) return "Global Macro";
  if (rootType?.includes("random")) return "Random Encounter Action";
  if (rootType?.includes("time")) return "Timed Encounter Action";
  if (rootType?.includes("battle") || rootType?.includes("monster") || rootType?.includes("item")) return "Battle / Monster / Item Action";
  return "Callable Extra Action Point";
}

const MACRO_REACHABILITY_LINK_KINDS = new Set([
  "calls_macro",
  "branches_to",
  "branches_true",
  "branches_false",
  "branches_keep",
  "branches_drop",
  "branches_on_coward",
  "branches_on_revived_loss"
]);

function isMacroReachabilityLink(link: SemanticLink) {
  return MACRO_REACHABILITY_LINK_KINDS.has(link.kind);
}

function isNegativeBattleMacroLink(link: SemanticLink) {
  const rawValue = link.metadata?.rawValue;
  return typeof rawValue === "number" && rawValue < 0;
}

function browserRootType(from: string) {
  if (from.startsWith("action-slot:trigger:")) return "map-trigger-call";
  if (from.startsWith("random:")) return "random-region-door";
  if (from.startsWith("time:")) return "timed-encounter-door";
  if (from.startsWith("item:")) return "door-item-macro";
  if (from.startsWith("monster:")) return "monster-death-hook";
  if (from.startsWith("global:")) return "global-macro-slot";
  return "source-backed-root";
}

function browserNonreachableClassification(trigger: TriggerRecord, actionCount: number) {
  if (actionCount === 0) return "probable-editor-padding";
  if (trigger.actions.some((action) => action.code === 7 || action.code === 13)) return "runtime-mutation-candidate";
  if (actionCount >= 2) return "needs-runtime-trace";
  return "orphan-authored-content";
}

function inferred(id: string, type: string, label: string): SemanticEntity {
  return {
    id,
    type,
    label,
    editState: "inspect-only",
    confidence: "inferred",
    source: "browser semantic links",
    recordRef: null,
    byteRange: null,
    editable: false,
    summary: {}
  };
}

function finalize(schema: SemanticSchema) {
  schema.reverseLinks = {};
  for (const link of schema.links) {
    schema.reverseLinks[link.from] ??= { incoming: [], outgoing: [] };
    schema.reverseLinks[link.to] ??= { incoming: [], outgoing: [] };
    schema.reverseLinks[link.from].outgoing.push(link.id);
    schema.reverseLinks[link.to].incoming.push(link.id);
  }
  schema.summary = {
    sourceCount: schema.sources.length,
    recordCount: schema.records.length,
    entityCount: schema.entities.length,
    linkCount: schema.links.length,
    diagnosticCount: schema.diagnostics.length
  };
}

function pushLink(
  schema: SemanticSchema,
  from: string,
  to: string,
  kind: string,
  confidence: string,
  metadata: Record<string, unknown> = {}
) {
  schema.links.push({
    id: `link:${schema.links.length}`,
    from,
    to,
    kind,
    confidence,
    evidence: ["browser-import-core"],
    metadata
  });
}

function upsertRecord(schema: SemanticSchema, record: SemanticRecord) {
  const index = schema.records.findIndex((candidate) => candidate.id === record.id);
  if (index === -1) schema.records.push(record);
  else schema.records[index] = { ...schema.records[index], ...record };
}

function browserRecord(source: string, index: number, recordBytes: number, type: string, label: string, summary: Record<string, unknown>): SemanticRecord {
  return {
    id: `record:${source}:${index}`,
    source: sourceId(source),
    type,
    label,
    editState: "inspect-only",
    byteRange: byteRange(index * recordBytes, recordBytes),
    confidence: "source-backed",
    summary
  };
}

function browserEntity(
  id: string,
  type: string,
  label: string,
  source: string,
  recordRef: string,
  start: number,
  length: number,
  summary: Record<string, unknown>
): SemanticEntity {
  return {
    id,
    type,
    label,
    editState: "inspect-only",
    confidence: "source-backed",
    source,
    recordRef,
    byteRange: byteRange(start, length),
    editable: false,
    summary
  };
}

function i16At(buffer: Uint8Array, offset: number) {
  if (offset + 2 > buffer.byteLength) return 0;
  const value = (buffer[offset] << 8) | buffer[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}

function i32At(buffer: Uint8Array, offset: number) {
  if (offset + 4 > buffer.byteLength) return 0;
  const value = (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
  return value | 0;
}

function i16Array(buffer: number[] | undefined, offset: number) {
  if (!buffer || offset + 2 > buffer.length) return 0;
  const value = ((buffer[offset] ?? 0) << 8) | (buffer[offset + 1] ?? 0);
  return value & 0x8000 ? value - 0x10000 : value;
}

function shortArray(buffer: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => i16At(buffer, offset + index * 2));
}

function signedBytes(buffer: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = buffer[offset + index] ?? 0;
    return value > 127 ? value - 256 : value;
  });
}

function pascalSlot(buffer: Uint8Array, base: number, slot: number) {
  const start = base + slot * 256;
  if (start >= buffer.byteLength) return "";
  const length = Math.min(buffer[start] ?? 0, Math.max(0, buffer.byteLength - start - 1), 255);
  return decodeClassicText(buffer.slice(start + 1, start + 1 + length));
}

function decodeClassicText(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceId(name: string) {
  return `source:file:${name}`;
}

function mapEntityId(levelType: string, index: number) {
  return `map:${levelType}:${index}`;
}

function byteRange(start: number, length: number) {
  return { start, length, endExclusive: start + length };
}

function isResourceFile(name: string) {
  return name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function resourcePreviewMimeType(resourceType: string) {
  if (resourceType === "PICT") return "image/pict";
  if (resourceType === "cicn") return "image/cicn";
  if (resourceType === "snd ") return "audio/x-mac-snd";
  if (resourceType === "TEXT" || resourceType === "STR#" || resourceType === "styl") return "text/plain";
  return "application/octet-stream";
}

function layoutFor(name: string) {
  const layout = LAYOUTS[name];
  return layout ? { kind: layout[0], recordBytes: layout[1] } : null;
}

function recordTypeFor(source: string) {
  return layoutFor(source)?.kind ?? "binary record";
}

const LAYOUTS: Record<string, [string, number]> = {
  "Data LD": ["land field grid", FIELD_BYTES],
  "Data DL": ["dungeon field grid", FIELD_BYTES],
  "Data DD": ["land trigger/action table", 4000],
  "Data DDD": ["dungeon trigger/action table", 4000],
  "Data RD": ["land random metadata", RANDLEVEL_BYTES],
  "Data RDD": ["dungeon random metadata", RANDLEVEL_BYTES],
  "Data ED3": ["macro trigger/action table", 40],
  "Data EDCD": ["extra-code row", 10],
  "Data ED": ["simple encounter", 426],
  "Data ED2": ["complex encounter", 520],
  "Data BD": ["battle record", 346],
  "Data MD": ["monster record", 210],
  "Data MD1": ["alternate monster set", 210],
  "Data MD-1": ["alternate monster set", 210],
  "Data DES": ["monster description", MONSTER_DESCRIPTION_BYTES],
  "Data SD": ["shop record", 3002],
  "Data SD2": ["message record", 256],
  "Data OD": ["option label", OPTION_LABEL_BYTES],
  "Data MD2": ["map record", 340],
  "Data TD": ["treasure", 48],
  "Data TD2": ["thief encounters", 118],
  "Data TD3": ["timed encounters", 40],
  "Data CI": ["scenario contact", 4608],
  "Data RI": ["scenario restrictions", 320],
  "Data CS": ["scenario security backup", 316],
  "Global": ["global macro hooks", 60],
  "Data MENU": ["monster menu cache", 502],
  "Data Solids": ["solid tile table", 1024],
  "Data NI": ["scenario item table", ITEM_BYTES],
  "Layout": ["outdoor land layout", LAND_LAYOUT_BYTES]
};
