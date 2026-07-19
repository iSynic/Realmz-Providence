import { MonsterRecord, MonsterSetId, Project } from "./types";

export function allMonsterScenarioIds(project: Project) {
  return uniqueSortedNumbers([
    ...(project.monsters ?? []).map((monster) => monster.id),
    ...(project.monsterSets ?? []).flatMap((set) => set.monsters.map((monster) => monster.id))
  ]);
}

export function authorFacingMonsterScenarioIds(project: Project) {
  const referencedIds = battleReferencedMonsterIds(project);
  const normalTerminatorId = monsterTerminatorId(project.monsters ?? []);
  const ids = new Set<number>();
  addAuthorFacingMonsterIds(ids, project.monsters ?? [], referencedIds, normalTerminatorId);
  for (const set of project.monsterSets ?? []) {
    addAuthorFacingMonsterIds(ids, set.monsters ?? [], referencedIds, normalTerminatorId);
  }
  return uniqueSortedNumbers([...ids]);
}

export function authorFacingMonsterRecordsForSet(project: Project, setId: MonsterSetId) {
  const ids = new Set(authorFacingMonsterScenarioIds(project));
  return monsterRecordsForSet(project, setId)
    .filter((record) => ids.has(record.id))
    .sort((left, right) => left.id - right.id);
}

export function isImportedPostTerminatorMonsterTail(project: Project, monsterId: number) {
  const record = (project.monsters ?? []).find((candidate) => candidate.id === monsterId);
  if (!record?.provenance || record.authored) return false;
  if (battleReferencedMonsterIds(project).has(monsterId)) return false;
  const terminatorId = monsterTerminatorId(project.monsters ?? []);
  return terminatorId !== null && monsterId > terminatorId;
}

export function monsterTerminatorId(records: MonsterRecord[]) {
  const terminator = [...records].sort((left, right) => left.id - right.id).find((record) => record.hitDice === 255);
  return terminator?.id ?? null;
}

export function isZeroBlankMonsterSlot(record: MonsterRecord) {
  return record.hitDice === 0
    && record.agility === 0
    && record.movementMax === 0
    && record.attackCount === 0
    && (record.displayName ?? "").trim() === "";
}

function monsterRecordsForSet(project: Project, setId: MonsterSetId) {
  if (setId === 0) return project.monsters ?? [];
  return (project.monsterSets ?? []).find((set) => set.setId === setId)?.monsters ?? [];
}

function addAuthorFacingMonsterIds(ids: Set<number>, records: MonsterRecord[], referencedIds: Set<number>, familyTerminatorId: number | null) {
  const localTerminatorId = monsterTerminatorId(records);
  const terminatorId = earliestTerminatorId(familyTerminatorId, localTerminatorId);
  for (const record of records) {
    if (referencedIds.has(record.id)) {
      ids.add(record.id);
      continue;
    }
    if (record.authored && !isZeroBlankMonsterSlot(record)) {
      ids.add(record.id);
      continue;
    }
    if (terminatorId !== null && record.id >= terminatorId) continue;
    ids.add(record.id);
  }
}

function earliestTerminatorId(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function battleReferencedMonsterIds(project: Project) {
  const ids = new Set<number>();
  for (const battle of project.battles ?? []) {
    for (const value of battle.grid ?? []) {
      if (value !== 0) ids.add(Math.abs(value));
    }
  }
  return ids;
}

function uniqueSortedNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((left, right) => left - right);
}
