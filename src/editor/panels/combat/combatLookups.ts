import { useMemo } from "react";
import { authorFacingMonsterScenarioIds } from "../../monsterRecords";
import { isActorOrCreatureIconId } from "../../resourceResolver";
import type { LibraryAsset, LibraryCatalog, MonsterIconOverride, MonsterRecord, MonsterSetId, Project } from "../../types";
import { monsterIconSetTabCount, type CombatIconAsset } from "./iconSetModel";
import { measureCombatWork } from "./performance";

export type CombatWorkbenchTab = "battles" | "monsters" | "iconSet";

export type CombatLookups = {
  monsters: MonsterRecord[];
  monsterById: Map<number, MonsterRecord>;
  monsterSetsById: Map<MonsterSetId, MonsterRecord[]>;
  monsterBySetAndId: Map<MonsterSetId, Map<number, MonsterRecord>>;
  iconAssetsByAbsId: Map<number, CombatIconAsset>;
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>;
  monsterMashAssetsByAbsId: Map<number, LibraryAsset>;
  monsterIconOverridesByTarget: Map<number, MonsterIconOverride>;
  tabCounts: Record<CombatWorkbenchTab, number>;
};

export const MONSTER_SET_OPTIONS: Array<{ id: MonsterSetId; label: string; file: string }> = [
  { id: 0, label: "Normal", file: "Data MD" },
  { id: 1, label: "Monster", file: "Data MD1" },
  { id: -1, label: "Mega", file: "Data MD-1" }
];

type CombatLookupDeps = {
  catalogAssets: LibraryCatalog["assets"] | undefined;
  projectAssets: Project["assets"] | undefined;
  projectBattlesLength: number;
  projectCatalogIcons: Project["assetCatalog"]["icons"] | undefined;
  projectMonsterIconOverrides: Project["monsterIconOverrides"] | undefined;
  projectMonsters: Project["monsters"] | undefined;
  projectMonsterSets: Project["monsterSets"] | undefined;
  projectScenarioIconResources: Project["scenarioIconResources"] | undefined;
};

let combatLookupsCache: { deps: CombatLookupDeps; value: CombatLookups } | null = null;

export function useCombatLookups(project: Project | null, catalog: LibraryCatalog | null): CombatLookups {
  const projectBattlesLength = project?.battles?.length ?? 0;
  const projectMonsters = project?.monsters;
  const projectMonsterSets = project?.monsterSets;
  const projectAssets = project?.assets;
  const projectCatalogIcons = project?.assetCatalog?.icons;
  const projectMonsterIconOverrides = project?.monsterIconOverrides;
  const projectScenarioIconResources = project?.scenarioIconResources;
  const catalogAssets = catalog?.assets;
  return useMemo(() => cachedCombatLookups(project, catalog, {
    catalogAssets,
    projectAssets,
    projectBattlesLength,
    projectCatalogIcons,
    projectMonsterIconOverrides,
    projectMonsters,
    projectMonsterSets,
    projectScenarioIconResources
  }), [
    catalogAssets,
    projectAssets,
    projectBattlesLength,
    projectCatalogIcons,
    projectMonsterIconOverrides,
    projectMonsters,
    projectMonsterSets,
    projectScenarioIconResources
  ]);
}

export function buildCombatLookups(project: Project | null, catalog: LibraryCatalog | null): CombatLookups {
  if (!project) return emptyCombatLookups();

  const monsters = [...(project.monsters ?? [])].sort((left, right) => left.id - right.id);
  const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));
  const monsterSetsById = new Map<MonsterSetId, MonsterRecord[]>([[0, monsters]]);
  const monsterBySetAndId = new Map<MonsterSetId, Map<number, MonsterRecord>>([[0, monsterById]]);
  for (const option of MONSTER_SET_OPTIONS) {
    if (option.id === 0) continue;
    const set = (project.monsterSets ?? []).find((candidate) => candidate.setId === option.id);
    const setMonsters = [...(set?.monsters ?? [])].sort((left, right) => left.id - right.id);
    monsterSetsById.set(option.id, setMonsters);
    monsterBySetAndId.set(option.id, new Map(setMonsters.map((monster) => [monster.id, monster])));
  }

  const iconAssetsByAbsId = new Map<number, CombatIconAsset>();
  const realmzActorIconAssetsByAbsId = new Map<number, LibraryAsset>();
  const monsterMashAssetsByAbsId = new Map<number, LibraryAsset>();
  const monsterIconOverridesByTarget = new Map<number, MonsterIconOverride>();
  for (const override of project.monsterIconOverrides ?? []) {
    if (Number.isInteger(override.targetBaseIconId)) {
      monsterIconOverridesByTarget.set(Math.abs(override.targetBaseIconId), override);
    }
  }
  const addIconAsset = (asset: CombatIconAsset | null | undefined) => {
    if (!asset?.previewPath || asset.resourceId == null) return;
    const key = Math.abs(asset.resourceId);
    if (!iconAssetsByAbsId.has(key)) iconAssetsByAbsId.set(key, asset);
  };
  for (const asset of project.assets ?? []) {
    if (asset.resourceType === "cicn") addIconAsset(asset);
  }
  for (const asset of project.assetCatalog?.icons ?? []) {
    if (asset.resourceType === "cicn") addIconAsset(asset);
  }
  for (const asset of catalog?.assets ?? []) {
    if (isRealmzActorOrCreatureIconLibraryAsset(asset)) {
      const key = Math.abs(asset.resourceId);
      if (!realmzActorIconAssetsByAbsId.has(key)) realmzActorIconAssetsByAbsId.set(key, asset);
    }
    if (!isMonsterMashLibraryAsset(asset)) continue;
    const key = Math.abs(asset.resourceId);
    if (!monsterMashAssetsByAbsId.has(key)) monsterMashAssetsByAbsId.set(key, asset);
  }
  const iconSetTargetCount = measureCombatWork("monsterIconSetTabCount", () => monsterIconSetTabCount(project, {
    iconAssetsByAbsId,
    realmzActorIconAssetsByAbsId,
    monsterIconOverridesByTarget
  }));
  return {
    monsters,
    monsterById,
    monsterSetsById,
    monsterBySetAndId,
    iconAssetsByAbsId,
    realmzActorIconAssetsByAbsId,
    monsterMashAssetsByAbsId,
    monsterIconOverridesByTarget,
    tabCounts: {
      battles: project.battles?.length ?? 0,
      monsters: authorFacingMonsterScenarioIds(project).length,
      iconSet: iconSetTargetCount
    }
  };
}

function cachedCombatLookups(project: Project | null, catalog: LibraryCatalog | null, deps: CombatLookupDeps) {
  if (combatLookupsCache && sameCombatLookupDeps(combatLookupsCache.deps, deps)) return combatLookupsCache.value;
  const value = measureCombatWork("useCombatLookups", () => buildCombatLookups(project, catalog));
  combatLookupsCache = { deps, value };
  return value;
}

function sameCombatLookupDeps(left: CombatLookupDeps, right: CombatLookupDeps) {
  return left.catalogAssets === right.catalogAssets
    && left.projectAssets === right.projectAssets
    && left.projectBattlesLength === right.projectBattlesLength
    && left.projectCatalogIcons === right.projectCatalogIcons
    && left.projectMonsterIconOverrides === right.projectMonsterIconOverrides
    && left.projectMonsters === right.projectMonsters
    && left.projectMonsterSets === right.projectMonsterSets
    && left.projectScenarioIconResources === right.projectScenarioIconResources;
}

function emptyCombatLookups(): CombatLookups {
  return {
    monsters: [],
    monsterById: new Map(),
    monsterSetsById: new Map([[0, []]]),
    monsterBySetAndId: new Map([[0, new Map()]]),
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: new Map(),
    monsterIconOverridesByTarget: new Map(),
    tabCounts: { battles: 0, monsters: 0, iconSet: 0 }
  };
}

function isRealmzActorOrCreatureIconLibraryAsset(asset: LibraryAsset): asset is LibraryAsset & { resourceId: number } {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  if (!isActorOrCreatureIconId(Math.abs(asset.resourceId))) return false;
  if (isMonsterMashLibraryAsset(asset)) return false;
  const text = `${asset.source} ${asset.label} ${asset.relativePath}`.toLowerCase();
  return text.includes(":realmz:") || text.includes("realmz-reference") || text.includes("the family jewels");
}

function isMonsterMashLibraryAsset(asset: LibraryAsset): asset is LibraryAsset & { resourceId: number } {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const text = `${asset.source} ${asset.label} ${asset.relativePath}`.toLowerCase();
  return text.includes("monster mash");
}
