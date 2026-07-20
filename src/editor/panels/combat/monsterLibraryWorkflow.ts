import type { PreviewRuntimeContext } from "../../previewUrls";
import type {
  IconEntry,
  LibraryCatalog,
  MonsterIconOverride,
  MonsterRecord,
  MonsterSetId,
  Project,
  ProjectCommand
} from "../../types";
import { allMonsterScenarioIds } from "../../monsterRecords";
import { isProvidenceMonsterLibraryEntry, monsterLibraryEntryTemplate } from "../../monsterLibrary";
import {
  monsterIconSourcePairs,
  normalizedMonsterIconBaseId,
  resolveMonsterIconTargetPair
} from "./iconSetModel";
import { loadLibraryResourceBase64 } from "./IconPairResources";
import type { CombatLookups } from "./combatLookups";

const MONSTER_RECORD_BYTES = 210;

export type MonsterLibraryCopyEntry = {
  entry: LibraryCatalog["entities"][number];
  id: number;
  template: MonsterRecord;
  description?: string;
  setId?: MonsterSetId;
};

export function scrapbookIndex(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.index === "number" ? entry.summary.index : 0;
}

export function scrapbookName(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.displayName === "string" && entry.summary.displayName ? entry.summary.displayName : entry.label;
}

export function scrapbookFacts(entry: LibraryCatalog["entities"][number]) {
  return `ID ${scrapbookIndex(entry)}, HD ${summaryNumber(entry, "hitDice")}, armor ${summaryNumber(entry, "armor")}, agility ${summaryNumber(entry, "agility")}, icon ${summaryNumber(entry, "iconId")}`;
}

export function scrapbookSearchText(entry: LibraryCatalog["entities"][number]) {
  return `${scrapbookName(entry)} ${scrapbookFacts(entry)} ${scrapbookDescription(entry)} ${entry.source}`;
}

export function scrapbookDescription(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.description === "string" ? entry.summary.description : "";
}

export function visibleMonsterLibraryEntries(catalog: LibraryCatalog | null) {
  return (catalog?.entities ?? []).filter((entry) => {
    if (entry.type !== "monster-scrapbook-entry") return false;
    return isProvidenceMonsterLibraryEntry(entry) || !isBlankBuiltInScrapbookPlaceholder(entry);
  });
}

function isBlankBuiltInScrapbookPlaceholder(entry: LibraryCatalog["entities"][number]) {
  if (isProvidenceMonsterLibraryEntry(entry)) return false;
  const index = scrapbookIndex(entry);
  const name = scrapbookName(entry).trim();
  if (name !== `Monster ${index}`) return false;
  if (scrapbookDescription(entry).trim()) return false;

  const scalarKeys = [
    "hitDice",
    "staminaBonus",
    "agility",
    "movementMax",
    "armor",
    "magicResistance",
    "distance",
    "size",
    "attackCount",
    "magicAttackCount",
    "damageBonus",
    "castPercent",
    "runPercent",
    "surrenderPercent",
    "missilePercent",
    "weapon",
    "iconId",
    "spellPoints",
    "exp"
  ];
  if (scalarKeys.some((key) => summaryNumber(entry, key) !== 0)) return false;

  const arrayKeys = ["money", "spells", "items", "saves", "spellImmunities"];
  if (arrayKeys.some((key) => summaryNumberArray(entry, key).some((value) => value !== 0))) return false;
  if (summaryNumberRows(entry, "attacks").some((row) => row.some((value) => value !== 0))) return false;

  return true;
}

export function monsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const preferredId = preferredMonsterCopyId(project, entry);
  const used = new Set(allMonsterScenarioIds(project));
  if (preferredId > 0 && !used.has(preferredId)) return preferredId;
  return nextAvailableMonsterRecordId([...used].map((id) => ({ id })));
}

export function preferredMonsterCopyId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const preferred = typeof entry.summary.preferredScenarioMonsterId === "number"
    ? Math.trunc(entry.summary.preferredScenarioMonsterId)
    : scrapbookIndex(entry);
  if (preferred > 0) return preferred;
  return nextAvailableMonsterRecordId(allMonsterScenarioIds(project).map((id) => ({ id })));
}

export function nextAvailableMonsterRecordId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.max(1, used.size + 1);
}

export function scrapbookEntryForMonsterId(catalog: LibraryCatalog | null, monsterId: number) {
  return (catalog?.entities ?? []).find((entry) => entry.type === "monster-scrapbook-entry" && scrapbookIndex(entry) === monsterId) ?? null;
}

export function copyMonsterLibraryEntryToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  const template = monsterRecordFromLibraryEntry(entry, id);
  onApplyCommand?.({
    kind: "createMonsterFromTemplate",
    label: `Copy ${scrapbookName(entry)} to Monster ${id}`,
    id,
    template,
    description: scrapbookDescription(entry)
  });
}

export function copyScrapbookMonsterToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  copyMonsterLibraryEntryToScenario(entry, id, onApplyCommand);
}

export async function materializeMonsterLibraryIconOverrides(
  entries: MonsterLibraryCopyEntry[],
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext,
  onApplyCommand?: (command: ProjectCommand) => void
) {
  if (!onApplyCommand || entries.length === 0) return [] as MonsterIconOverride[];
  const overrides: MonsterIconOverride[] = [];
  const seenTargets = new Set<number>();
  for (const entry of entries) {
    const override = await monsterIconOverrideForLibraryCopy(entry.entry, entry.template, project, catalog, lookups, iconEntries, previewContext);
    if (!override) continue;
    const targetBaseIconId = normalizedMonsterIconBaseId(override.targetBaseIconId);
    if (!targetBaseIconId || seenTargets.has(targetBaseIconId)) continue;
    seenTargets.add(targetBaseIconId);
    overrides.push(override);
  }
  for (const override of overrides) {
    onApplyCommand({
      kind: "upsertMonsterIconOverride",
      label: `Materialize monster icon ${override.targetBaseIconId} from ${override.sourceLabel ?? `Source ${override.sourceBaseIconId}`}`,
      override
    });
  }
  return overrides;
}

export async function monsterIconOverrideForLibraryCopy(
  entry: LibraryCatalog["entities"][number],
  template: MonsterRecord,
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext
): Promise<MonsterIconOverride | null> {
  const targetBaseIconId = normalizedMonsterIconBaseId(template.iconId);
  if (!targetBaseIconId) return null;
  const targetPair = resolveMonsterIconTargetPair(project, lookups, iconEntries, targetBaseIconId, true);
  if (targetPair) return null;
  const source = monsterIconSourcePairs(catalog, lookups).find((candidate) => candidate.baseId === targetBaseIconId);
  if (!source?.asset || !source.pairedAsset || !source.sourceKind) return null;
  try {
    const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
      loadLibraryResourceBase64(source.asset, previewContext, catalog),
      loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
    ]);
    if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) return null;
    return {
      targetBaseIconId,
      sourceBaseIconId: source.baseId,
      sourceKind: source.sourceKind,
      sourceLabel: source.sourceLabel ?? source.asset.label ?? scrapbookName(entry),
      sourceBaseResourceBase64,
      sourcePairedResourceBase64
    };
  } catch {
    return null;
  }
}

export function monsterRecordFromLibraryEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const template = monsterLibraryEntryTemplate(entry);
  if (template) {
    return {
      ...template,
      id,
      displayName: template.displayName || scrapbookName(entry),
      authored: true
    };
  }
  return monsterRecordFromScrapbookEntry(entry, id);
}

function monsterRecordFromScrapbookEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const rawSource = summaryNumberArray(entry, "rawBytes");
  const hasRaw = rawSource.length >= MONSTER_RECORD_BYTES;
  const rawBytes = fixedNumberArray(rawSource, MONSTER_RECORD_BYTES);
  const byte = (offset: number, fallbackKey?: string) => hasRaw ? rawBytes[offset] ?? 0 : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;
  const signed = (offset: number, fallbackKey?: string) => signedByte(byte(offset, fallbackKey));
  const short = (offset: number, fallbackKey?: string) => hasRaw ? i16At(rawBytes, offset) : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;

  return {
    id,
    hitDice: byte(0, "hitDice"),
    staminaBonus: byte(1, "staminaBonus"),
    agility: byte(2, "agility"),
    nameId: byte(3),
    movementMax: byte(4, "movementMax"),
    armor: signed(5, "armor"),
    magicResistance: signed(6, "magicResistance"),
    distance: signed(7, "distance"),
    traitor: signed(8),
    size: signed(9, "size"),
    typeFlags: hasRaw ? Array.from({ length: 8 }, (_, index) => signedByte(rawBytes[10 + index] ?? 0)) : new Array(8).fill(0),
    attackCount: signed(18, "attackCount"),
    magicAttackCount: signed(19, "magicAttackCount"),
    attacks: hasRaw
      ? Array.from({ length: 5 }, (_, row) => Array.from({ length: 4 }, (_, slot) => signedByte(rawBytes[20 + row * 4 + slot] ?? 0)))
      : Array.from({ length: 5 }, (_, row) => fixedNumberArray(summaryNumberRows(entry, "attacks")[row], 4)),
    damageBonus: signed(40, "damageBonus"),
    castPercent: signed(41, "castPercent"),
    runPercent: signed(42, "runPercent"),
    surrenderPercent: signed(43, "surrenderPercent"),
    missilePercent: signed(44, "missilePercent"),
    canSummon: signed(45, "canSummon"),
    saves: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[46 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "saves"), 6),
    spellImmunities: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[52 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "spellImmunities"), 6),
    money: hasRaw ? Array.from({ length: 3 }, (_, index) => i16At(rawBytes, 58 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "money"), 3),
    spells: hasRaw ? Array.from({ length: 10 }, (_, index) => i16At(rawBytes, 64 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "spells"), 10),
    items: hasRaw ? Array.from({ length: 6 }, (_, index) => i16At(rawBytes, 84 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "items"), 6),
    weapon: short(96, "weapon"),
    iconId: short(98, "iconId"),
    spellPoints: short(100, "spellPoints"),
    exp: short(102, "exp"),
    stamina: short(104, "stamina"),
    staminaMax: short(106, "staminaMax"),
    underneath: hasRaw ? Array.from({ length: 4 }, (_, index) => i16At(rawBytes, 108 + index * 2)) : new Array(4).fill(0),
    target: signed(116),
    guarding: signed(117),
    notOnMenu: hasRaw ? (rawBytes[118] ?? 0) !== 0 : false,
    beenAttacked: signed(119),
    movement: signed(120),
    magicToHit: signed(121, "magicToHit"),
    conditions: hasRaw ? Array.from({ length: 40 }, (_, index) => signedByte(rawBytes[122 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "conditions"), 40),
    lr: signed(162),
    up: signed(163),
    attackNum: signed(164),
    bonusAttack: signed(165),
    deathMacro: short(166, "deathMacro"),
    maxSpellPoints: short(168, "maxSpellPoints"),
    displayName: scrapbookName(entry),
    authored: true
  };
}

export function summaryNumber(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function summaryNumberArray(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

export function summaryNumberRows(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value)
    ? value.map((row) => Array.isArray(row) ? row.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [])
    : [];
}

export function fixedNumberArray(values: number[] | undefined, length: number) {
  return Array.from({ length }, (_, index) => Number(values?.[index] ?? 0));
}

function signedByte(value: number) {
  const byte = value & 0xff;
  return byte > 0x7f ? byte - 0x100 : byte;
}

function i16At(bytes: number[], offset: number) {
  const high = bytes[offset] ?? 0;
  const low = bytes[offset + 1] ?? 0;
  const value = ((high & 0xff) << 8) | (low & 0xff);
  return value & 0x8000 ? value - 0x10000 : value;
}
