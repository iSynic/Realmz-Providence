import { Project, ProjectCommand, ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride } from "../types";
import { defaultCasteName, defaultRaceName, defaultRuleNames } from "../ruleNames";
import { normalizedEditorMetadata } from "./tilePaletteCommands";

export function renameEditorEntity(project: Project, entityId: string, displayName: string) {
  const label = displayName.trim();
  const metadata = normalizedEditorMetadata(project);
  if (!label) {
    if (!(entityId in metadata.displayNames)) return project;
    const displayNames = { ...metadata.displayNames };
    delete displayNames[entityId];
    return { ...project, editorMetadata: { ...metadata, displayNames } };
  }
  return {
    ...project,
    editorMetadata: {
      ...metadata,
      displayNames: {
        ...metadata.displayNames,
        [entityId]: { label, source: "user" as const, updatedAt: new Date().toISOString() }
      }
    }
  };
}

export function updateScenarioStartup(project: Project, fields: Extract<ProjectCommand, { kind: "updateScenarioStartup" }>["fields"]) {
  const name = fields.name?.trim();
  return {
    ...project,
    scenario: {
      ...project.scenario,
      ...fields,
      ...(name ? { name } : {})
    }
  };
}

export function updateScenarioShell(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioShell" }>["changes"]) {
  const shell = {
    ...defaultScenarioShell(project),
    ...(project.scenario.shell ?? {}),
    ...changes,
    trailingBytes: [],
    rawBytes: undefined,
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, shell } };
}

export function updateScenarioSecurityCodes(project: Project, command: Extract<ProjectCommand, { kind: "updateScenarioSecurityCodes" }>) {
  const shell = {
    ...defaultScenarioShell(project),
    ...(project.scenario.shell ?? {}),
    ...command.shellChanges,
    trailingBytes: [],
    rawBytes: undefined,
    authored: true
  };
  const securityBackup = command.backupChanges
    ? {
        ...defaultScenarioShell(project),
        sourceFile: "Data CS",
        ...(project.scenario.securityBackup ?? {}),
        ...command.backupChanges,
        trailingBytes: [],
        rawBytes: undefined,
        authored: true
      }
    : project.scenario.securityBackup;
  return { ...project, scenario: { ...project.scenario, shell, securityBackup } };
}

export function updateScenarioContactInfo(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioContactInfo" }>["changes"]) {
  const contactInfo = {
    ...defaultScenarioContactInfo(project),
    ...(project.scenario.contactInfo ?? {}),
    ...changes,
    payInfo: changes.payInfo ?? project.scenario.contactInfo?.payInfo ?? defaultScenarioContactInfo(project).payInfo,
    titles: changes.titles ?? project.scenario.contactInfo?.titles ?? defaultScenarioContactInfo(project).titles,
    rawBytes: undefined,
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, contactInfo } };
}

export function updateScenarioRestrictions(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioRestrictions" }>["changes"]) {
  const restrictions = {
    ...defaultScenarioRestrictions(),
    ...(project.scenario.restrictions ?? {}),
    ...changes,
    bannedRaces: changes.bannedRaces ?? project.scenario.restrictions?.bannedRaces ?? [],
    bannedCastes: changes.bannedCastes ?? project.scenario.restrictions?.bannedCastes ?? [],
    rawBytes: undefined,
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, restrictions } };
}

export function updateGlobalMacroHook(project: Project, slot: number, door: number) {
  const hooks = project.scenario.globalMacroHooks ?? defaultGlobalMacroHooks();
  const slots = defaultGlobalMacroHooks().slots.map((defaultSlot) => {
    const existing = hooks.slots.find((candidate) => candidate.slot === defaultSlot.slot) ?? defaultSlot;
    return existing.slot === slot ? { ...existing, door } : existing;
  });
  return {
    ...project,
    scenario: {
      ...project.scenario,
      globalMacroHooks: {
        ...hooks,
        slots,
        rawBytes: undefined,
        authored: true
      }
    }
  };
}

export function createSpellOverride(project: Project, id?: number, template?: Partial<ScenarioSpellOverride>) {
  const records = project.spellOverrides ?? [];
  const nextId = id ?? nextSpellOverrideId(records);
  const semanticTemplate = withoutLegacyRuleRawBytes(template ?? {});
  const record = { ...emptySpellOverride(nextId), ...semanticTemplate, id: nextId, authored: true, provenance: authoredProvenance("Data Spell", nextId, nextId * 30, 30) };
  const existing = records.find((candidate) => candidate.id === nextId);
  if (existing) {
    if (!isBlankSpellOverride(existing)) return project;
    return {
      ...project,
      spellOverrides: records.map((candidate) => candidate.id === nextId ? record : candidate).sort((a, b) => a.id - b.id)
    };
  }
  return {
    ...project,
    spellOverrides: [...records, record].sort((a, b) => a.id - b.id)
  };
}

function nextSpellOverrideId(records: ScenarioSpellOverride[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 105; id += 1) {
    const existing = records.find((record) => record.id === id);
    if (!used.has(id) || (existing && isBlankSpellOverride(existing))) return id;
  }
  return records.length;
}

export function createRaceOverride(project: Project, id?: number, template?: Partial<ScenarioRaceOverride>) {
  const nextId = id ?? nextIdFor(project.raceOverrides ?? [], 30);
  if ((project.raceOverrides ?? []).some((record) => record.id === nextId)) return project;
  const displayName = template?.displayName?.trim() || defaultRaceName(nextId);
  const semanticTemplate = withoutLegacyRuleRawBytes(template ?? {});
  const record = { ...emptyRaceOverride(nextId), ...semanticTemplate, displayName, id: nextId, authored: true, provenance: authoredProvenance("Data Race", nextId, nextId * 408, 408) };
  const withName = setRuleName(project, "race", nextId, displayName, true);
  return {
    ...withName,
    raceOverrides: [...(withName.raceOverrides ?? []), record].sort((a, b) => a.id - b.id)
  };
}

export function createCasteOverride(project: Project, id?: number, template?: Partial<ScenarioCasteOverride>) {
  const records = project.casteOverrides ?? [];
  const nextId = id ?? nextCasteOverrideId(records);
  const existing = records.find((record) => record.id === nextId);
  if (existing && !isBlankCasteOverride(existing)) return project;
  const displayName = template?.displayName?.trim() || defaultCasteName(nextId);
  const { rawBytes: _compatibilityBytes, ...semanticTemplate } = template ?? {};
  const record = { ...emptyCasteOverride(nextId), ...semanticTemplate, displayName, id: nextId, authored: true, provenance: authoredProvenance("Data Caste", nextId, nextId * 576, 576) };
  const withName = setRuleName(project, "caste", nextId, displayName, true);
  return {
    ...withName,
    casteOverrides: existing
      ? (withName.casteOverrides ?? []).map((candidate) => candidate.id === nextId ? record : candidate).sort((a, b) => a.id - b.id)
      : [...(withName.casteOverrides ?? []), record].sort((a, b) => a.id - b.id)
  };
}

function nextCasteOverrideId(records: ScenarioCasteOverride[]) {
  for (let id = 0; id < 30; id += 1) {
    const existing = records.find((record) => record.id === id);
    if (!existing || isBlankCasteOverride(existing)) return id;
  }
  return records.length;
}

export function updateRuleOverride<T extends { id: number; authored?: boolean }>(
  project: Project,
  key: "spellOverrides" | "raceOverrides" | "casteOverrides",
  id: number,
  changes: Partial<T>
) {
  const records = (((project[key] as unknown) as T[] | undefined) ?? []);
  return {
    ...project,
    [key]: records.map((record) =>
      key !== "casteOverrides"
        ? withoutLegacyRuleRawBytes(record.id === id ? { ...record, ...changes, authored: true } : record)
        : record.id === id ? { ...record, ...changes, authored: true } : record
    )
  };
}

function withoutLegacyRuleRawBytes<T extends object>(record: T): T {
  const { rawBytes: _legacyRawBytes, ...canonical } = record as T & { rawBytes?: number[] };
  return canonical as T;
}

export function updateCustomSpellName(project: Project, id: number, displayName: string) {
  return updateRuleOverride<ScenarioSpellOverride>(project, "spellOverrides", id, { displayName });
}

export function updateRaceName(project: Project, id: number, displayName: string) {
  return setRuleName(project, "race", id, displayName, true);
}

export function updateCasteName(project: Project, id: number, displayName: string) {
  return setRuleName(project, "caste", id, displayName, true);
}

export function clearRaceOverride(project: Project, id: number) {
  const withRecords = clearRuleOverride(project, "raceOverrides", id);
  return setRuleName(withRecords, "race", id, defaultRaceName(id), true);
}

export function clearCasteOverride(project: Project, id: number) {
  const withRecords = clearRuleOverride(project, "casteOverrides", id);
  return setRuleName(withRecords, "caste", id, defaultCasteName(id), true);
}

function setRuleName(project: Project, family: "race" | "caste", id: number, displayName: string, authored: boolean) {
  const label = displayName.trim() || (family === "race" ? defaultRaceName(id) : defaultCasteName(id));
  const ruleNames = defaultRuleNames(project.ruleNames);
  if (family === "race") {
    const raceNames = [...ruleNames.raceNames];
    raceNames[id] = label;
    return {
      ...project,
      ruleNames: { ...ruleNames, raceNames, authored: ruleNames.authored || authored },
      raceOverrides: (project.raceOverrides ?? []).map((record) => record.id === id ? { ...record, displayName: label } : record)
    };
  }
  const casteNames = [...ruleNames.casteNames];
  casteNames[id] = label;
  return {
    ...project,
    ruleNames: { ...ruleNames, casteNames, authored: ruleNames.authored || authored },
    casteOverrides: (project.casteOverrides ?? []).map((record) => record.id === id ? { ...record, displayName: label } : record)
  };
}

export function clearRuleOverride(
  project: Project,
  key: "spellOverrides" | "raceOverrides" | "casteOverrides",
  id: number
) {
  return {
    ...project,
    [key]: ((project[key] as Array<{ id: number }> | undefined) ?? []).filter((record) => record.id !== id)
  };
}

export function nextIdFor(records: Array<{ id: number }>, maxExclusive: number) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < maxExclusive; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}

function isBlankSpellOverride(record: ScenarioSpellOverride) {
  if (record.authored) return false;
  const name = record.displayName?.trim() ?? "";
  const genericName = !name || name === `Custom Spell ${record.id}` || /^Level \d+ Spell \d+$/.test(name);
  if (!genericName) return false;
  return (
    record.range1 === 0 &&
    record.range2 === 0 &&
    record.queueIcon === 0 &&
    record.toHitBonus === 0 &&
    record.saveBonus === 0 &&
    record.fixedTargetNum === 0 &&
    record.canRotate === 0 &&
    record.saveAdjust === 0 &&
    record.cannot === 0 &&
    record.resistAdjust === 0 &&
    record.cost === 0 &&
    record.damage1 === 0 &&
    record.damage2 === 0 &&
    record.powerDamage1 === 0 &&
    record.powerDamage2 === 0 &&
    record.duration1 === 0 &&
    record.duration2 === 0 &&
    record.powerDuration1 === 0 &&
    record.powerDuration2 === 0 &&
    record.spellLook1 === 0 &&
    record.spellLook2 === 0 &&
    record.sound1 === 0 &&
    record.sound2 === 0 &&
    record.targetType === 0 &&
    record.size === 0 &&
    record.special === 0 &&
    record.damageType === 0 &&
    (record.spellClass === 0 || record.spellClass === 4) &&
    !record.inCombat &&
    !record.inCamp
  );
}

function isBlankCasteOverride(record: ScenarioCasteOverride) {
  if (record.authored) return false;
  return (
    allZeroMatrix(record.specialAbility) &&
    allZero(record.drvBonus) &&
    allZero(record.attBonus) &&
    allZeroMatrix(record.spellcasters) &&
    allZero(record.minMax) &&
    allZero(record.conditions) &&
    record.canUseMissile === 0 &&
    record.getsMissileBonus === 0 &&
    allZero(record.stamina) &&
    allZero(record.strength) &&
    allZero(record.dodge) &&
    allZero(record.toHit) &&
    allZero(record.missile) &&
    allZero(record.hand2Hand) &&
    record.casteClass === 0 &&
    record.minimumAgeGroup === 0 &&
    record.moveBonus === 0 &&
    record.magRes === 0 &&
    record.twoHand === 0 &&
    record.maxStaminaBonus === 0 &&
    record.bonusAttacks === 0 &&
    record.maxAttacks === 0 &&
    allZero(record.victory) &&
    record.startMoney === 0 &&
    allZero(record.startItems) &&
    allZero(record.attacks) &&
    allZero(record.itemTypes) &&
    record.defaultIcon === 0 &&
    record.maxSpellsAttacks === 0 &&
    record.spellsSoFar === 0
  );
}

function allZero(values: readonly number[] | null | undefined) {
  return (values ?? []).every((value) => value === 0);
}

function allZeroMatrix(values: readonly (readonly number[])[] | null | undefined) {
  return (values ?? []).every((row) => allZero(row));
}

export function defaultScenarioShell(project: Project) {
  return {
    sourceFile: project.scenario.name || "Scenario",
    recLevel: 1,
    maxLevel: 999,
    landLevel: project.maps.find((map) => map.levelType === "land")?.index ?? 0,
    lookX: 0,
    lookY: 0,
    creatorUser: "",
    codeseg1: new Array(20).fill(0),
    codeseg2: new Array(20).fill(0),
    trailingBytes: []
  };
}

export function defaultScenarioContactInfo(project: Project) {
  return {
    scenarioName: project.scenario.name,
    version: "",
    date: "",
    author: "",
    email: "",
    web: "",
    fee: "",
    payInfo: ["", "", "", "", ""],
    titles: ["", "", "", "", ""],
    description: ""
  };
}

export function defaultScenarioRestrictions() {
  return {
    description: "",
    maxPartyCharacters: 0,
    maxPartyLevel: 0,
    bannedRaces: [],
    bannedCastes: []
  };
}

export function defaultGlobalMacroHooks() {
  return {
    slots: [
      { slot: 0, label: "Start", door: 0, sourceBacked: true, runtimeConsumer: "mainscreeninit/new-game start" },
      { slot: 1, label: "Death", door: 0, sourceBacked: true, runtimeConsumer: "partyloss death/revive path" },
      { slot: 2, label: "Quit", door: 0, sourceBacked: true, runtimeConsumer: "end current game" },
      { slot: 3, label: "Reserved", door: 0, sourceBacked: false, runtimeConsumer: "reserved" },
      { slot: 4, label: "Shop", door: 0, sourceBacked: true, runtimeConsumer: "shop button when a shop is available" },
      { slot: 5, label: "Temple", door: 0, sourceBacked: true, runtimeConsumer: "shop/temple button when a temple is available" },
      { slot: 6, label: "Reserved", door: 0, sourceBacked: false, runtimeConsumer: "reserved" }
    ]
  };
}

export function emptySpellOverride(id: number): ScenarioSpellOverride {
  return {
    id,
    range1: 0,
    range2: 0,
    queueIcon: 0,
    toHitBonus: 0,
    saveBonus: 0,
    fixedTargetNum: 0,
    canRotate: 0,
    saveAdjust: 0,
    cannot: 0,
    resistAdjust: 0,
    cost: 0,
    damage1: 0,
    damage2: 0,
    powerDamage1: 0,
    powerDamage2: 0,
    duration1: 0,
    duration2: 0,
    powerDuration1: 0,
    powerDuration2: 0,
    spellLook1: 0,
    spellLook2: 0,
    sound1: 0,
    sound2: 0,
    targetType: 0,
    size: 0,
    special: 0,
    damageType: 0,
    spellClass: 4,
    inCombat: false,
    inCamp: false,
    displayName: `Custom Spell ${id}`,
    description: "",
    authored: true,
    provenance: authoredProvenance("Data Spell", id, id * 30, 30)
  };
}

export function emptyRaceOverride(id: number): ScenarioRaceOverride {
  return {
    id,
    displayName: `Race ${id}`,
    plusMinusToHit: new Array(8).fill(0),
    specialAbility: new Array(14).fill(0),
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    spare: new Array(8).fill(0),
    conditions: new Array(40).fill(0),
    maxAge: 70,
    doesNotDie: 0,
    baseMove: 12,
    magRes: 0,
    twoHand: 0,
    missile: 0,
    numOfAttacks: [2, 4],
    canCaste: new Array(30).fill(0),
    ageRange: [[14, 17], [18, 21], [22, 35], [36, 49], [50, 70]],
    ageChange: Array.from({ length: 5 }, () => new Array(15).fill(0)),
    canRegenerate: 0,
    defaultIconSet: 0,
    itemTypes: [0, 0],
    descriptors: 0,
    spacer: new Array(31).fill(0),
    authored: true,
    provenance: authoredProvenance("Data Race", id, id * 408, 408)
  };
}

export function emptyCasteOverride(id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: `Caste ${id}`,
    specialAbility: [new Array(14).fill(0), new Array(14).fill(0)],
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    spellcasters: Array.from({ length: 4 }, () => new Array(3).fill(0)),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    conditions: new Array(40).fill(0),
    canUseMissile: 0,
    getsMissileBonus: 0,
    stamina: [0, 0],
    strength: [0, 0],
    dodge: [0, 0],
    toHit: [0, 0],
    missile: [0, 0],
    hand2Hand: [0, 0],
    spare1: [0, 0],
    spare2: [0, 0],
    casteClass: 0,
    minimumAgeGroup: 0,
    moveBonus: 0,
    magRes: 0,
    twoHand: 0,
    maxStaminaBonus: 0,
    bonusAttacks: 0,
    maxAttacks: 0,
    victory: new Array(30).fill(0),
    startMoney: 0,
    startItems: new Array(20).fill(0),
    attacks: new Array(10).fill(0),
    itemTypes: [0, 0],
    defaultIcon: 0,
    maxSpellsAttacks: 0,
    spellsSoFar: 0,
    spacer: new Array(63).fill(0),
    authored: true,
    provenance: authoredProvenance("Data Caste", id, id * 576, 576)
  };
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number) {
  return {
    sourceFile,
    recordIndex,
    byteOffset,
    byteLength,
    confidence: "inferred" as const
  };
}
