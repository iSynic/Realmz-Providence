import {
  Action,
  ExtraCodeRow,
  MapEntity,
  Project,
  RandomLevel,
  SemanticEntity,
  SemanticLink,
  SemanticRecord,
  SemanticSchema,
  SourceFile,
  TriggerRecord
} from "../types";
import { FIELD_BYTES, RANDLEVEL_BYTES } from "./realmzParser";

export function buildBrowserSemanticSchema(projectParts: {
  scenario: Project["scenario"];
  buffers: Map<string, Uint8Array>;
  sourceFiles: SourceFile[];
  maps: MapEntity[];
  randomLevels: RandomLevel[];
  triggers: TriggerRecord[];
  extracodes: ExtraCodeRow[];
  assetCatalog: Project["assetCatalog"];
  records: Project["records"];
}): SemanticSchema {
  const schema: SemanticSchema = {
    schemaVersion: 3,
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
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, linkCount: 0, diagnosticCount: 0 }
  };

  addSources(schema, projectParts.buffers, projectParts.sourceFiles);
  addScenarioEntity(schema, projectParts.scenario);
  addRecordAlignments(schema, projectParts.records.alignments);
  addSupportingRecords(schema, projectParts.buffers);
  addMaps(schema, projectParts.maps);
  addRandomLevels(schema, projectParts.randomLevels);
  addExtracodes(schema, projectParts.extracodes);
  addTriggers(schema, projectParts.triggers, projectParts.extracodes);
  addTileAssets(schema, projectParts.assetCatalog);
  addRenderProfiles(schema, projectParts.maps, projectParts.assetCatalog);
  addResourceEntities(schema, projectParts.sourceFiles);
  addInferredTargets(schema);
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
  addMenuRecords(schema, buffers.get("Data MENU"));
  addSolidsRecords(schema, buffers.get("Data Solids"));
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
      tableKind: "terrain/contact lookup",
      bytes: 1024
    };
    upsertRecord(schema, browserRecord("Data Solids", index, 1024, "solidity-table", `Solids ${index}`, summary));
    schema.entities.push(browserEntity(`solids:${index}`, "solidity-table", `Solids ${index}`, "Data Solids", `record:Data Solids:${index}`, start, 1024, summary));
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
      label: `EDCD row ${row.id}`,
      editState: "inspect-only",
      byteRange: byteRange(row.id * 10, 10),
      confidence: "source-backed",
      summary: { values: row.values }
    });
    schema.entities.push({
      id,
      type: "edcd-row",
      label: `EDCD row ${row.id}`,
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
      type: trigger.source === "Data ED3" ? "macro" : "trigger",
      label: trigger.source === "Data ED3" ? `Macro ${trigger.recordIndex}` : `Trigger ${trigger.recordIndex}`,
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
        actions: trigger.actions.map((action) => actionSummary(action, edcdRows))
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
        label: `${trigger.source === "Data ED3" ? "Macro" : "Trigger"} ${trigger.recordIndex} action ${action.slot}`,
        editState: "inspect-only",
        confidence: "source-backed",
        source: trigger.source,
        recordRef,
        byteRange: trigger.provenance ? byteRange(trigger.provenance.byteOffset + 8 + action.slot * 2, 2) : null,
        editable: false,
        summary: { trigger: id, ...actionSummary(action, edcdRows) }
      });
      pushLink(schema, id, slotId, "has_action_slot", "source-backed");
      addActionLink(schema, slotId, action.code, action.id, edcdRows);
    }
  }
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

function addActionLink(schema: SemanticSchema, from: string, code: number, id: number, edcdRows: Map<number, number[]>) {
  if (!id) return;
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
        message: `Browser import action opcode ${code} references missing Data EDCD row ${target}.`,
        data: { actionSlot: from, code, rowId: target, shape: shape.name }
      });
      return;
    }
    addBrowserEdcdLinks(schema, from, code, row);
    return;
  }
  if (code === 1 || code === 19 || code === 62 || code === 71) pushLink(schema, from, `message:${target}`, "shows_message", "source-backed", { opcode: code });
  else if (code === 4) pushLink(schema, from, `encounter:simple:${target}`, "starts_encounter", "source-backed", { opcode: code });
  else if (code === 5) pushLink(schema, from, `encounter:complex:${target}`, "starts_encounter", "source-backed", { opcode: code });
  else if (code === 6) pushLink(schema, from, `shop:${target}`, "opens_shop", "source-backed", { opcode: code });
  else if (code === 8) pushLink(schema, from, `macro:${target}`, "calls_macro", "inferred", { opcode: code });
  else if (code === 10) pushLink(schema, from, `treasure:${target}`, "gives_treasure", "source-backed", { opcode: code });
  else if (code === 27) pushLink(schema, from, `resource:PICT:${target}`, "uses_resource", "source-backed", { opcode: code });
  else if (code === 29 || code === 97) pushLink(schema, from, `map-record:${target}`, "uses_map_record", "source-backed", { opcode: code });
  else if (code === 47) pushLink(schema, from, `quest-flag:${target}`, "writes_flag", "inferred", { opcode: code });
  else if (code === 127) pushLink(schema, from, `monster:${target}`, "uses_monster", "inferred", { opcode: code });
}

function addBrowserEdcdLinks(schema: SemanticSchema, from: string, code: number, row: number[]) {
  const value = (index: number) => row[index] ?? 0;
  const addBranch = (mode: number, target: number, kind = "branches_to") => {
    if (target <= 0 || mode === 0 || mode === -1) return;
    if (mode === 1) pushLink(schema, from, `macro:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 2) pushLink(schema, from, `encounter:simple:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
    else if (mode === 3) pushLink(schema, from, `encounter:complex:${target}`, kind, "inferred", { opcode: code, branchMode: mode });
  };
  const addMessage = (id: number) => {
    if (id > 0) pushLink(schema, from, `message:${id}`, "shows_message", "source-backed", { opcode: code });
  };
  const addMacro = (id: number, kind = "calls_macro") => {
    if (id > 0) pushLink(schema, from, `macro:${id}`, kind, "inferred", { opcode: code });
  };
  const addBattleRange = (lowValue: number, highValue: number) => {
    const low = Math.abs(lowValue);
    const high = Math.max(low, Math.abs(highValue));
    const battles = high - low > 32 ? [low, high] : Array.from({ length: high - low + 1 }, (_, index) => low + index);
    for (const battle of battles) pushLink(schema, from, `battle:${battle}`, "starts_battle", "source-backed", { opcode: code });
  };

  if (code === 2 || code === 48 || code === 56 || code === 107) {
    addBattleRange(value(0), value(1));
    addMessage(value(3));
    addMacro(value(2));
  } else if (code === 3) {
    addBranch(value(1), value(2));
    addMessage(value(3));
    addMessage(value(4));
  } else if (code === 7) {
    addMacro(value(2));
    pushLink(schema, from, value(0) === -2 ? "runtime-cache:CE2" : value(0) === -1 ? "runtime-cache:CE" : "runtime-cache:CL", "mutates_cache", "inferred", { opcode: code });
  } else if (code === 12) {
    const levelType = value(4) ? "dungeon" : "land";
    pushLink(schema, from, `map:${levelType}:${Math.max(0, value(0))}`, "mutates_tile", "source-backed", { opcode: code });
    pushLink(schema, from, `runtime-cache:${levelType === "dungeon" ? "CD" : "CL"}`, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 13) {
    const cache = value(3) < 0 ? "runtime-cache:CD" : "runtime-cache:CL";
    pushLink(schema, from, cache, "mutates_trigger", "source-backed", { opcode: code });
    pushLink(schema, from, cache, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 20 || code === 45) {
    pushLink(schema, from, `map:land:${Math.max(0, value(0))}`, "uses_map_record", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CL", "writes_runtime_state", "inferred", { opcode: code });
    addMessage(value(4));
  } else if (code === 23 || code === -23 || code === 92) {
    const levelType = code === -23 || value(2) ? "dungeon" : "land";
    pushLink(schema, from, `random:${levelType}:${Math.max(0, value(0))}:${Math.max(0, value(1))}`, "mutates_random_region", "source-backed", { opcode: code });
    pushLink(schema, from, `runtime-cache:${levelType === "dungeon" ? "CD" : "CL"}`, "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 31) {
    pushLink(schema, from, "runtime-cache:CE", "selects_characters", "inferred", { opcode: code });
    addMacro(value(3), "branches_true");
    addMacro(value(4), "branches_false");
  } else if (code === 38 || code === 42 || code === 58 || code === 59) {
    addBranch(value(2), value(3));
  } else if (code === 46) {
    pushLink(schema, from, `quest-flag:${Math.max(0, value(0))}`, "reads_flag", "source-backed", { opcode: code });
    addBranch(value(2), value(3));
  } else if (code === 47 || code === 76) {
    pushLink(schema, from, `quest-flag:${Math.max(0, value(0))}`, "writes_flag", "source-backed", { opcode: code });
  } else if (code === 57) {
    pushLink(schema, from, `map:land:${Math.max(0, value(2))}`, "changes_rendering", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CL", "mutates_cache", "source-backed", { opcode: code });
  } else if (code === 67) {
    addBranch(value(1), value(3), "branches_true");
    addBranch(value(1), value(4), "branches_false");
  } else if (code === 72 || code === 75) {
    addBranch(value(3), value(4), "branches_false");
  } else if (code === 73) {
    pushLink(schema, from, `shop:${Math.max(0, value(0))}`, "opens_shop", "source-backed", { opcode: code });
  } else if (code === 77 || code === 78) {
    pushLink(schema, from, code === 77 ? `quest-flag:${Math.max(0, value(0))}` : `map-record:${Math.max(0, value(0))}`, "reads_flag", "inferred", { opcode: code });
    addBranch(value(2), value(3), "branches_false");
    addBranch(value(2), value(4), "branches_true");
  } else if (code === 81) {
    pushLink(schema, from, "runtime-cache:CE", "reads_flag", "inferred", { opcode: code });
    addMacro(value(3), "branches_true");
    addMacro(value(4), "branches_false");
  } else if (code === 85) {
    addBranch(value(0), value(3));
    addMessage(value(4));
  } else if (code === 86 || code === 87) {
    addBranch(value(1), value(3), "branches_true");
    addBranch(value(1), value(4), "branches_false");
  } else if (code === 120) {
    pushLink(schema, from, `monster:${Math.max(0, value(1))}`, "uses_monster", "source-backed", { opcode: code });
    if (value(3) > 0) pushLink(schema, from, `resource:cicn:${value(3)}`, "uses_resource", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CE", "mutates_cache", "inferred", { opcode: code });
  } else if (code === 123) {
    for (const monster of row) if (monster > 0) pushLink(schema, from, `monster:${monster}`, "uses_monster", "source-backed", { opcode: code });
  } else if (code === 124 || code === 125) {
    pushLink(schema, from, `monster:${Math.max(0, value(code === 124 ? 1 : 0))}`, "uses_monster", "source-backed", { opcode: code });
    pushLink(schema, from, "runtime-cache:CE", "mutates_encounter_state", "inferred", { opcode: code });
  } else if (code === 126) {
    addMacro(value(3));
    addMacro(value(4));
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
      diagnostics: [`Missing Data EDCD row ${rowId}`],
      summary: `${shape.name}: missing EDCD row`,
      opcode: action.code
    };
  }
  return {
    rowId,
    shape: shape.name,
    fields: shape.fields.map((name, index) => ({ name, value: values[index] ?? 0 })),
    targetHints: [],
    confidence: "source-backed",
    diagnostics: [],
    summary: `${shape.name}: ${shape.fields.map((name, index) => `${name}=${values[index] ?? 0}`).join(", ")}`,
    opcode: action.code
  };
}

function edcdShape(code: number): { name: string; fields: string[] } | null {
  const shape = EDCD_SHAPES[code];
  return shape ?? null;
}

const EDCD_SHAPES: Record<number, { name: string; fields: string[] }> = {
  [-23]: { name: "random-region-mutation", fields: ["level", "randomRegion", "percent", "battleLowOrKeep", "battleHighOrKeep"] },
  2: { name: "battle", fields: ["battleLow", "battleHigh", "soundOrReviveMacro", "message", "bootyMode"] },
  3: { name: "choice", fields: ["replyPolarity", "branchMode", "branchTarget", "promptA", "promptB"] },
  7: { name: "action-data-patching", fields: ["levelOrCache", "targetRecord", "macro", "levelKind", "resultSlot"] },
  12: { name: "tile-mutation", fields: ["level", "xOrDungeonY", "yOrDungeonX", "tileValue", "isDungeon"] },
  13: { name: "trigger-mutation", fields: ["level", "singleTrigger", "percent", "rangeStartWithSign", "rangeEnd"] },
  15: { name: "damage-heal", fields: ["multiplier", "low", "high", "sound", "message"] },
  16: { name: "damage-heal", fields: ["multiplier", "low", "high", "sound", "message"] },
  17: { name: "spell-cast", fields: ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"] },
  18: { name: "spell-cast", fields: ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"] },
  20: { name: "teleport", fields: ["level", "x", "y", "sound", "message"] },
  21: { name: "item-branch", fields: ["item", "branchMode", "missingBehavior", "hasTarget", "missingTarget"] },
  22: { name: "item-mutation", fields: ["item", "maxMatches", "mode", "chargeDelta", "replacementItem"] },
  23: { name: "random-region-mutation", fields: ["level", "randomRegion", "percent", "battleLowOrKeep", "battleHighOrKeep"] },
  30: { name: "ability-check-pick", fields: ["abilityOrAttribute", "adjustment", "sourceSet", "attributeFlag", "unused"] },
  31: { name: "ability-check-branch", fields: ["abilityOrAttribute", "adjustment", "attributeFlag", "successMacro", "failureMacro"] },
  33: { name: "gold", fields: ["amount", "failureMarker", "unused", "unused", "unused"] },
  37: { name: "dungeon-move", fields: ["mode", "xOrDirection", "yOrDirection", "sound", "message"] },
  38: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  39: { name: "extended-door-codes", fields: ["macro", "unused", "unused", "unused", "unused"] },
  41: { name: "encounter-mutation", fields: ["simpleEncounter", "oneBasedChoiceSlot", "unused", "unused", "unused"] },
  42: { name: "percent-branch", fields: ["percent", "successBehavior", "branchMode", "target", "slot"] },
  43: { name: "condition", fields: ["scope", "condition", "durationOrDelta", "sound", "unused"] },
  45: { name: "teleport", fields: ["level", "x", "y", "sound", "message"] },
  46: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  48: { name: "battle-variant", fields: ["battleLow", "battleHigh", "branchOrSound", "message", "extra"] },
  50: { name: "character-selector", fields: ["selector", "gender", "raceCasteOrClass", "unused", "livingOnly"] },
  52: { name: "character-selector", fields: ["selector", "value", "sourceSet", "unused", "unused"] },
  53: { name: "caste-selector", fields: ["exactCaste", "casteGroup", "sourceSet", "unused", "unused"] },
  54: { name: "timed-encounter-mutation", fields: ["timedEncounter", "mode", "dayOrInterval", "hour", "minute"] },
  56: { name: "battle-variant", fields: ["battleLow", "battleHigh", "branchOrSound", "message", "extra"] },
  57: { name: "render-mutation", fields: ["landlook", "isDark", "targetLandLevel", "unused", "unused"] },
  58: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  59: { name: "force-branch", fields: ["testA", "testB", "branchMode", "target", "slot"] },
  60: { name: "party-money-state", fields: ["moneyType", "pickedOnly", "unused", "unused", "unused"] },
  61: { name: "position-shift", fields: ["legacyLevel", "xShift", "yShift", "randomize", "unused"] },
  63: { name: "time-mutation", fields: ["mode", "day", "hour", "minute", "unused"] },
  65: { name: "random-items", fields: ["count", "itemLow", "itemHigh", "unused", "unused"] },
  67: { name: "item-charge-branch", fields: ["item", "branchMode", "minimumCharges", "successTarget", "failureTarget"] },
  68: { name: "fatigue", fields: ["mode", "unused", "percent", "unused", "unused"] },
  69: { name: "spell-flags", fields: ["spellcasting", "monstercasting", "spellcharging", "unused", "unused"] },
  70: { name: "save-restore-position", fields: ["mode", "unused", "unused", "unused", "unused"] },
  72: { name: "range-branch", fields: ["testA", "testB", "falseBehavior", "branchMode", "target"] },
  73: { name: "restricted-shop", fields: ["shop", "range1Low", "range1High", "range2Low", "range2High"] },
  74: { name: "spell-points", fields: ["rollCount", "low", "high", "playSound", "message"] },
  75: { name: "range-branch", fields: ["testA", "testB", "falseBehavior", "branchMode", "target"] },
  76: { name: "quest-value", fields: ["quest", "delta", "branchMode", "threshold", "target"] },
  77: { name: "false-true-branch", fields: ["testA", "testB", "branchMode", "falseTarget", "trueTarget"] },
  78: { name: "false-true-branch", fields: ["testA", "testB", "branchMode", "falseTarget", "trueTarget"] },
  81: { name: "condition-branch", fields: ["condition", "characterSelector", "unused", "trueMacro", "falseMacro"] },
  85: { name: "random-branch", fields: ["branchMode", "rangeLow", "rangeHigh", "sound", "message"] },
  86: { name: "conditional-branch", fields: ["testSelector", "branchModeOrValue", "falseBehavior", "trueTarget", "falseTarget"] },
  87: { name: "conditional-branch", fields: ["testSelector", "branchModeOrValue", "falseBehavior", "trueTarget", "falseTarget"] },
  90: { name: "party-state", fields: ["amount", "scope", "unused", "unused", "unused"] },
  92: { name: "random-region-shape-mutation", fields: ["level", "rect", "isDungeon", "percentDelta", "shapeMode"] },
  103: { name: "boat-camp-state", fields: ["mode", "statusValue", "branchModeOrBehavior", "targetOrValueA", "targetOrValueB"] },
  107: { name: "battle-variant", fields: ["battleLow", "battleHigh", "branchOrSound", "message", "extra"] },
  108: { name: "selected-character-state", fields: ["statSelector", "delta", "unused", "unused", "unused"] },
  120: { name: "combat-monster-mutation", fields: ["targetClass", "monsterId", "count", "replacementIcon", "traitorOverride"] },
  121: { name: "unused-edcd-load", fields: ["unused0", "unused1", "unused2", "unused3", "unused4"] },
  122: { name: "fumble", fields: ["message", "sound", "unused", "unused", "unused"] },
  123: { name: "rout", fields: ["monster1", "monster2", "monster3", "monster4", "monster5"] },
  124: { name: "spawn", fields: ["unused", "monster", "count", "sound", "traitorOverride"] },
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

function addResourceEntities(schema: SemanticSchema, files: SourceFile[]) {
  for (const file of files.filter((source) => source.role === "resource-fork")) {
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
      summary: { bytes: file.bytes, browserInventory: "resource fork present, detailed resource inventory requires Rust importer" }
    });
    schema.diagnostics.push({
      id: `diagnostic:browser-resource-fallback:${file.name}`,
      type: "browser-fallback",
      severity: "warning",
      confidence: "source-backed",
      source: file.name,
      message: `${file.name} was loaded in browser mode; detailed resource fork inventory requires the desktop Rust importer.`,
      data: { target: `resource:${file.name}` }
    });
  }
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
        fallbackSource: "F:\\Realmz shared resources"
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
  "Data SD": ["shop record", 3002],
  "Data SD2": ["message record", 256],
  "Data MD2": ["map record", 340],
  "Data TD": ["treasure", 48],
  "Data TD2": ["thief encounters", 118],
  "Data TD3": ["timed encounters", 40],
  "Data CI": ["scenario contact", 4608],
  "Data MENU": ["monster menu cache", 502],
  "Data Solids": ["solid tile table", 1024]
};
