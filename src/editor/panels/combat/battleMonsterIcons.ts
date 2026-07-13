import { useEffect, useMemo, useState } from "react";
import { resolvePreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, LibraryAsset, MonsterRecord, Project } from "../../types";
import { battleMonsterIconLookupKey } from "./BattleBoardCanvas";
import type { CombatLookups } from "./combatLookups";
import { resolveMonsterIcon, type ResolvedBattleMonsterIcon } from "./MonsterIconPreview";
import { recordCombatPerf } from "./performance";

const MONSTER_GRID_ART_SIZE = 32;
const MONSTER_PALETTE_TILE_SPAN = 2;
const MONSTER_PALETTE_TILE_SIZE = MONSTER_GRID_ART_SIZE * MONSTER_PALETTE_TILE_SPAN;

const battleMonsterIconUrlCache = new Map<string, Promise<ResolvedBattleMonsterIcon>>();
const battleMonsterResolvedIconUrlCache = new Map<string, ResolvedBattleMonsterIcon>();
const battleMonsterFootprintCache = new Map<string, { width: number; height: number }>();
const battleMonsterPaletteMetricCache = new Map<string, { artSize: { width: number; height: number }; footprintLabel: string }>();
const battleIconSourceKeyTokens = new Map<string, string>();
let battleIconSourceKeyTokenSequence = 0;

export function useBattleIconSourceKey(
  project: Project,
  iconEntries: Record<number, IconEntry>,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext
) {
  const projectAssets = project.assets;
  const projectCatalogIcons = project.assetCatalog?.icons;
  const projectMonsterIconOverrides = project.monsterIconOverrides;
  const projectScenarioIconResources = project.scenarioIconResources;
  const realmzActorIconAssets = lookups.realmzActorIconAssetsByAbsId;
  return useMemo(() => battleIconSourceKey(project, iconEntries, realmzActorIconAssets, previewContext), [
    iconEntries,
    previewContext.desktopRuntime,
    previewContext.projectDir,
    previewContext.workspaceDir,
    project.scenario.name,
    project.source.sourcePath,
    projectAssets,
    projectCatalogIcons,
    projectMonsterIconOverrides,
    projectScenarioIconResources,
    realmzActorIconAssets
  ]);
}

export function useResolvedBattleMonsterIcons(
  monsters: MonsterRecord[],
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext,
  sourceKey: string
) {
  const monsterKey = useMemo(() => uniqueBattleMonsterIconMonsters(monsters).map(battleMonsterIconLookupKey).join("|"), [monsters]);
  const syncCachedIcons = useMemo(() => {
    const cachedIcons: Record<string, ResolvedBattleMonsterIcon> = {};
    for (const monster of uniqueBattleMonsterIconMonsters(monsters)) {
      const cached = battleMonsterResolvedIconUrlCache.get(battleMonsterIconCacheKey(sourceKey, monster));
      if (cached) cachedIcons[battleMonsterIconLookupKey(monster)] = cached;
    }
    return cachedIcons;
  }, [monsterKey, sourceKey]);
  const [resolvedState, setResolvedState] = useState<{ sourceKey: string; icons: Record<string, ResolvedBattleMonsterIcon> }>({ sourceKey: "", icons: {} });
  useEffect(() => {
    let disposed = false;
    const uniqueMonsters = uniqueBattleMonsterIconMonsters(monsters);
    if (uniqueMonsters.length === 0) {
      setResolvedState({ sourceKey, icons: {} });
      return () => {
        disposed = true;
      };
    }
    const cachedIcons: Record<string, ResolvedBattleMonsterIcon> = {};
    const missingMonsters: MonsterRecord[] = [];
    for (const monster of uniqueMonsters) {
      const cached = battleMonsterResolvedIconUrlCache.get(battleMonsterIconCacheKey(sourceKey, monster));
      if (cached) cachedIcons[battleMonsterIconLookupKey(monster)] = cached;
      else missingMonsters.push(monster);
    }
    setResolvedState({ sourceKey, icons: cachedIcons });
    if (missingMonsters.length === 0) {
      return () => {
        disposed = true;
      };
    }
    const started = performance.now();
    Promise.all(missingMonsters.map((monster) => resolveCachedBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext, sourceKey)))
      .then((resolved) => {
        if (disposed) return;
        setResolvedState((current) => {
          if (current.sourceKey !== sourceKey) return current;
          return { sourceKey, icons: { ...current.icons, ...Object.fromEntries(resolved.map((icon) => [icon.cacheKey, icon])) } };
        });
        recordCombatPerf("battleIconUrlResolve", performance.now() - started);
      })
      .catch(() => {
        if (!disposed) setResolvedState((current) => current.sourceKey === sourceKey ? { sourceKey, icons: cachedIcons } : current);
      });
    return () => {
      disposed = true;
    };
  }, [monsterKey, sourceKey]);
  const resolvedIcons = resolvedState.sourceKey === sourceKey ? resolvedState.icons : {};
  return useMemo(() => ({ ...resolvedIcons, ...syncCachedIcons }), [resolvedIcons, syncCachedIcons]);
}

export function monsterBattleFootprintCached(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  sourceKey: string
) {
  const cacheKey = [sourceKey, monster.id, monster.iconId, monster.size, monster.typeFlags?.[6] ?? 0].join(":");
  const cached = battleMonsterFootprintCache.get(cacheKey);
  if (cached) return cached;
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  battleMonsterFootprintCache.set(cacheKey, footprint);
  return footprint;
}

export function monsterPaletteMetricsCached(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  sourceKey: string
) {
  const cacheKey = [sourceKey, monster.id, monster.iconId, monster.size, monster.typeFlags?.[6] ?? 0].join(":");
  const cached = battleMonsterPaletteMetricCache.get(cacheKey);
  if (cached) return cached;
  const footprint = monsterBattleFootprintCached(monster, iconEntries, project, lookups, sourceKey);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const artSize = resolution.width && resolution.height
    ? {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.width)),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.height))
    }
    : {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.width * MONSTER_GRID_ART_SIZE)),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.height * MONSTER_GRID_ART_SIZE))
    };
  const metrics = { artSize, footprintLabel: `${formatGridSpan(footprint.width)} x ${formatGridSpan(footprint.height)} grid tile art` };
  battleMonsterPaletteMetricCache.set(cacheKey, metrics);
  return metrics;
}

export function monsterBattleFootprintLabel(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  return `${formatGridSpan(footprint.width)} x ${formatGridSpan(footprint.height)} grid tile art`;
}

function uniqueBattleMonsterIconMonsters(monsters: MonsterRecord[]) {
  const byKey = new Map<string, MonsterRecord>();
  for (const monster of monsters) byKey.set(battleMonsterIconLookupKey(monster), monster);
  return [...byKey.values()];
}

function battleIconSourceKey(
  project: Project,
  iconEntries: Record<number, IconEntry>,
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>,
  previewContext: PreviewRuntimeContext
) {
  const iconEntryKey = Object.entries(iconEntries)
    .map(([id, entry]) => `${id}:${entry.url ?? ""}:${entry.image?.naturalWidth || entry.image?.width || 0}x${entry.image?.naturalHeight || entry.image?.height || 0}`)
    .sort()
    .join(",");
  const projectIconKey = [
    ...(project.assets ?? [])
      .filter((asset) => asset.resourceType === "cicn")
      .map((asset) => `${asset.id}:${asset.resourceId ?? ""}:${asset.previewPath ?? ""}`),
    ...(project.assetCatalog?.icons ?? []).map((asset) => `${asset.resourceId}:${asset.previewPath ?? ""}:${asset.name ?? ""}`),
    ...(project.scenarioIconResources ?? []).map((resource) => `${resource.resourceId}:${resource.previewPath ?? ""}:${resource.resourceBase64?.length ?? 0}`),
    ...(project.monsterIconOverrides ?? []).map((override) => `${override.targetBaseIconId}:${override.sourceKind}:${override.sourceBaseIconId}:${override.sourceBaseResourceBase64?.length ?? 0}:${override.sourcePairedResourceBase64?.length ?? 0}`),
    ...[...realmzActorIconAssetsByAbsId.entries()].map(([id, asset]) => `${id}:${asset.source}:${asset.relativePath}:${asset.previewPath ?? ""}`)
  ].sort().join("|");
  return compactBattleIconSourceKey([
    previewContext.desktopRuntime ? "desktop" : "browser",
    previewContext.projectDir ?? "",
    previewContext.workspaceDir ?? "",
    project.scenario.name,
    project.source.sourcePath,
    iconEntryKey,
    projectIconKey
  ].join("\n"));
}

function compactBattleIconSourceKey(sourceKey: string) {
  const cached = battleIconSourceKeyTokens.get(sourceKey);
  if (cached) return cached;
  const next = `battle-icons:${++battleIconSourceKeyTokenSequence}`;
  battleIconSourceKeyTokens.set(sourceKey, next);
  return next;
}

function resolveCachedBattleMonsterIcon(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext,
  sourceKey: string
) {
  const cacheKey = battleMonsterIconCacheKey(sourceKey, monster);
  const resolved = battleMonsterResolvedIconUrlCache.get(cacheKey);
  if (resolved) return Promise.resolve(resolved);
  const cached = battleMonsterIconUrlCache.get(cacheKey);
  if (cached) return cached;
  const request = resolveBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext).then((icon) => {
    battleMonsterResolvedIconUrlCache.set(cacheKey, icon);
    return icon;
  });
  battleMonsterIconUrlCache.set(cacheKey, request);
  return request;
}

function battleMonsterIconCacheKey(sourceKey: string, monster: MonsterRecord) {
  return `${sourceKey}\n${battleMonsterIconLookupKey(monster)}`;
}

async function resolveBattleMonsterIcon(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext
): Promise<ResolvedBattleMonsterIcon> {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const directUrl = await resolvePreviewUrl(resolution.url, null, resolution.libraryAsset ?? null, previewContext);
  const iconResourceId = monster.iconId ? Math.abs(monster.iconId) : null;
  const fallbackUrl = directUrl || !iconResourceId
    ? null
    : await resolvePreviewUrl(null, null, null, {
      ...previewContext,
      project,
      resourceType: "cicn",
      resourceId: iconResourceId
    });
  return {
    ...resolution,
    resolvedUrl: directUrl ?? fallbackUrl,
    cacheKey: battleMonsterIconLookupKey(monster)
  };
}

function monsterBattleFootprint(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  if (resolution.width && resolution.height) {
    return {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SPAN, Math.ceil(resolution.width / MONSTER_GRID_ART_SIZE))),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SPAN, Math.ceil(resolution.height / MONSTER_GRID_ART_SIZE)))
    };
  }
  const size = Number.isFinite(monster.size) ? monster.size : 1;
  if (size === 1) return { width: 1, height: 2 };
  if (size === 2) return { width: 2, height: 1 };
  if (size >= 3 || monster.typeFlags?.[6]) return { width: 2, height: 2 };
  return { width: 1, height: 1 };
}

function formatGridSpan(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
