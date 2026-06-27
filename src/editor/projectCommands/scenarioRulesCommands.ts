import { Project, ProjectCommand, ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride } from "../types";
import { normalizedEditorMetadata } from "./tilePaletteCommands";

export function renameEditorEntity(project: Project, entityId: string, displayName: string) {
  const label = displayName.trim();
  if (!label) return project;
  const metadata = normalizedEditorMetadata(project);
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
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, shell } };
}

export function updateScenarioSecurityCodes(project: Project, command: Extract<ProjectCommand, { kind: "updateScenarioSecurityCodes" }>) {
  const shell = {
    ...defaultScenarioShell(project),
    ...(project.scenario.shell ?? {}),
    ...command.shellChanges,
    authored: true
  };
  const securityBackup = command.backupChanges
    ? {
        ...defaultScenarioShell(project),
        sourceFile: "Data CS",
        ...(project.scenario.securityBackup ?? {}),
        ...command.backupChanges,
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
        authored: true
      }
    }
  };
}

export function createSpellOverride(project: Project, id?: number, template?: Partial<ScenarioSpellOverride>) {
  const nextId = id ?? nextIdFor(project.spellOverrides ?? [], 105);
  if ((project.spellOverrides ?? []).some((record) => record.id === nextId)) return project;
  const record = { ...emptySpellOverride(nextId), ...template, id: nextId, authored: true, provenance: authoredProvenance("Data Spell", nextId, nextId * 30, 30) };
  return {
    ...project,
    spellOverrides: [...(project.spellOverrides ?? []), record].sort((a, b) => a.id - b.id)
  };
}

export function createRaceOverride(project: Project, id?: number, template?: Partial<ScenarioRaceOverride>) {
  const nextId = id ?? nextIdFor(project.raceOverrides ?? [], 70);
  if ((project.raceOverrides ?? []).some((record) => record.id === nextId)) return project;
  const record = { ...emptyRaceOverride(nextId), ...template, id: nextId, authored: true, provenance: authoredProvenance("Data Race", nextId, nextId * 408, 408) };
  return {
    ...project,
    raceOverrides: [...(project.raceOverrides ?? []), record].sort((a, b) => a.id - b.id)
  };
}

export function createCasteOverride(project: Project, id?: number, template?: Partial<ScenarioCasteOverride>) {
  const nextId = id ?? nextIdFor(project.casteOverrides ?? [], 30);
  if ((project.casteOverrides ?? []).some((record) => record.id === nextId)) return project;
  const record = { ...emptyCasteOverride(nextId), ...template, id: nextId, authored: true, provenance: authoredProvenance("Data Caste", nextId, nextId * 576, 576) };
  return {
    ...project,
    casteOverrides: [...(project.casteOverrides ?? []), record].sort((a, b) => a.id - b.id)
  };
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
      record.id === id ? { ...record, ...changes, authored: true } : record
    )
  };
}

export function updateCustomSpellName(project: Project, id: number, displayName: string) {
  return updateRuleOverride<ScenarioSpellOverride>(project, "spellOverrides", id, { displayName });
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
    ],
    rawBytes: new Array(60).fill(0)
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
    rawBytes: new Array(30).fill(0),
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
    rawBytes: new Array(408).fill(0),
    authored: true,
    provenance: authoredProvenance("Data Race", id, id * 408, 408)
  };
}

export function emptyCasteOverride(id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: `Caste ${id + 1}`,
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
    rawBytes: new Array(576).fill(0),
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
