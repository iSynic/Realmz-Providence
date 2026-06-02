import { LibraryCatalog, LibraryEntity, Project, SemanticEntity } from "./types";

export type MonsterReferenceOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  summary: string;
  sourceState: string;
  iconId?: number | null;
};

type MonsterEntity = SemanticEntity | LibraryEntity;

export function monsterReferenceOptions(project: Project, catalog?: LibraryCatalog | null): MonsterReferenceOption[] {
  const projectMonsters = new Map((project.monsters ?? []).map((record) => [record.id, record]));
  const entities = [
    ...(catalog?.entities.filter((entity) => entity.type === "monster") ?? [])
  ];
  const ids = new Set<number>();
  const entityById = new Map<number, MonsterEntity>();

  for (const entity of entities) {
    const id = monsterIdFromEntity(entity);
    if (id == null) continue;
    ids.add(id);
    if (!entityById.has(id)) entityById.set(id, entity);
  }

  for (const battle of project.battles ?? []) {
    for (const value of battle.grid) {
      if (value !== 0) ids.add(Math.abs(value));
    }
  }
  for (const monster of project.monsters ?? []) {
    ids.add(monster.id);
  }

  return [...ids]
    .filter((id) => id > 0)
    .map((id) => {
      const record = projectMonsters.get(id);
      const entity = entityById.get(id);
      const usage = monsterUsage(project, id);
      const label = record?.displayName?.trim() || monsterLabel(entity, id);
      const detail = [record ? monsterRecordFacts(record) : monsterEntityFacts(entity), formatMonsterUsage(usage)].filter(Boolean).join(" | ");
      return {
        key: entity?.id ?? `monster:${id}`,
        value: id,
        label: `${label} (${id})`,
        detail: detail || "No decoded usage yet",
        summary: record ? (record.displayName || `Monster ${id}`) : entity ? entitySummary(entity) : "Raw Realmz monster ID",
        sourceState: record ? (record.authored ? "Editable custom monster" : "Imported monster record") : entity ? "Monster record" : "Used by battle records",
        iconId: record?.iconId ?? numericSummaryValue(entity, ["iconId"])
      };
    })
    .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

export function monsterReferenceDetail(project: Project, monsterId: number, catalog?: LibraryCatalog | null) {
  if (monsterId === 0) return "No monster selected.";
  const signNote = monsterId < 0 ? "Placed on the other combat side." : "";
  const option = monsterReferenceOptions(project, catalog).find((candidate) => candidate.value === Math.abs(monsterId));
  const detail = option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : `Raw monster ID ${Math.abs(monsterId)}; no decoded monster record found.`;
  return [detail, signNote].filter(Boolean).join(" | ");
}

function monsterRecordFacts(record: NonNullable<Project["monsters"]>[number]) {
  const parts = [];
  parts.push(`HD ${record.hitDice}`);
  if (record.armor) parts.push(`armor ${record.armor}`);
  if (record.agility) parts.push(`agility ${record.agility}`);
  if (record.staminaMax) parts.push(`stamina ${record.staminaMax}`);
  if (record.exp) parts.push(`${record.exp} victory points`);
  if (record.iconId) parts.push(`icon ${record.iconId}`);
  if (record.deathMacro) parts.push(`death macro ${record.deathMacro}`);
  return parts.join(", ");
}

function monsterIdFromEntity(entity: MonsterEntity) {
  return numericSummaryValue(entity, ["id", "recordIndex"]) ?? trailingNumber(entity.id);
}

function monsterLabel(entity: MonsterEntity | undefined, id: number) {
  const name = typeof entity?.summary.name === "string" ? entity.summary.name.trim() : "";
  if (name) return name;
  if (entity?.label && entity.label !== `Monster ${id}`) return entity.label;
  return `Monster ${id}`;
}

function monsterUsage(project: Project, monsterId: number) {
  let battleSlots = 0;
  for (const battle of project.battles ?? []) {
    battleSlots += battle.grid.filter((value) => Math.abs(value) === monsterId).length;
  }
  return { battleSlots, linkedUses: 0 };
}

function formatMonsterUsage(usage: { battleSlots: number; linkedUses: number }) {
  const parts = [];
  if (usage.battleSlots) parts.push(`${usage.battleSlots} battle slot${usage.battleSlots === 1 ? "" : "s"}`);
  if (usage.linkedUses) parts.push(`${usage.linkedUses} linked use${usage.linkedUses === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function monsterEntityFacts(entity: MonsterEntity | undefined) {
  if (!entity) return "";
  const parts = [];
  const hd = numericSummaryValue(entity, ["hd"]);
  const ac = numericSummaryValue(entity, ["ac"]);
  const dx = numericSummaryValue(entity, ["dx"]);
  const staminaMax = numericSummaryValue(entity, ["staminaMax"]);
  const exp = numericSummaryValue(entity, ["exp"]);
  const iconId = numericSummaryValue(entity, ["iconId"]);
  const deathMacro = numericSummaryValue(entity, ["todoOnDeath"]);
  if (hd != null) parts.push(`HD ${hd}`);
  if (ac != null) parts.push(`AC ${ac}`);
  if (dx != null) parts.push(`DX ${dx}`);
  if (staminaMax != null) parts.push(`stamina ${staminaMax}`);
  if (exp != null) parts.push(`${exp} exp`);
  if (iconId) parts.push(`icon ${iconId}`);
  if (deathMacro) parts.push(`death macro ${deathMacro}`);
  return parts.join(", ");
}

function entitySummary(entity: MonsterEntity) {
  const preview = typeof entity.summary.preview === "string" ? entity.summary.preview : "";
  if (preview) return preview;
  const name = typeof entity.summary.name === "string" ? entity.summary.name.trim() : "";
  return name || `${entity.type} | ${entity.editState}`;
}

function numericSummaryValue(entity: MonsterEntity | undefined, keys: string[]) {
  if (!entity) return null;
  for (const key of keys) {
    const value = entity.summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  }
  return null;
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}
