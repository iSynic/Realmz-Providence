import { resourcePreviewDataUrlFromBase64 } from "../../browser/resourcePreview";
import {
  iconLibraryEntryKind,
  iconLibraryMonsterPairMetadata,
  isProvidenceIconLibraryEntry,
  type IconLibraryCanvas,
  type IconLibraryFacingMode
} from "../../iconLibrary";
import type { IconEntry, LibraryAsset, LibraryCatalog, MonsterIconOverride, Project } from "../../types";

export const MONSTER_ICON_PAIR_OFFSET = 308;
export const MONSTER_ICON_SET_LIMIT = 127;
const IMPORTED_MONSTER_ICON_BASE_START = 601;

export type MonsterIconSourceStatus = "scenario-override" | "scenario-resource" | "default-art" | "missing-art";

export type CombatIconAsset = {
  previewPath?: string | null;
  label?: string | null;
  resourceId?: number | null;
};

export type MonsterIconPairOption = {
  key: string;
  baseId: number;
  asset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  resourceBase64?: string | null;
  pairedResourceBase64?: string | null;
  referenced?: boolean;
  sourceKind?: "monster-mash" | "providence-library";
  sourceLabel?: string;
  override?: MonsterIconOverride | null;
  facingMode?: IconLibraryFacingMode;
  canvas?: IconLibraryCanvas | null;
};

export type MonsterIconPickerOption = {
  key: string;
  baseId: number;
  asset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  sourceStatus: Exclude<MonsterIconSourceStatus, "missing-art">;
  sourceLabel: string;
};

export type MonsterIconTargetLookups = {
  iconAssetsByAbsId: Map<number, CombatIconAsset>;
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>;
  monsterIconOverridesByTarget: Map<number, MonsterIconOverride>;
};

export function monsterIconSourceStatusLabel(status: MonsterIconSourceStatus) {
  if (status === "scenario-override") return "Scenario override";
  if (status === "scenario-resource") return "Scenario resource";
  if (status === "default-art") return "Default art";
  return "Missing art";
}

export function monsterIconTargetStatusTitle(status: MonsterIconSourceStatus) {
  if (status === "scenario-override") return "Scenario-owned override art. Providence exports this paired cicn set for the target ID.";
  if (status === "scenario-resource") return "Scenario-owned paired cicn resources imported from this project.";
  if (status === "default-art") return "Default Realmz art resolved at runtime. This row is not exported as scenario-owned art unless replaced with an override.";
  return "This target ID has no complete paired art.";
}

export function monsterIconTargetSourceStatus(target: MonsterIconPairOption): Exclude<MonsterIconSourceStatus, "missing-art"> {
  if (target.override) return "scenario-override";
  if (target.asset?.source === "Scenario icon resources" || target.sourceLabel?.toLowerCase().startsWith("scenario")) return "scenario-resource";
  return "default-art";
}

export function monsterIconPickerOptions(
  project: Project,
  lookups: MonsterIconTargetLookups,
  iconEntries: Record<number, IconEntry> = {}
): MonsterIconPickerOption[] {
  return monsterIconTargetPairs(project, lookups, iconEntries).map((target) => ({
    key: target.key,
    baseId: target.baseId,
    asset: target.asset,
    pairedAsset: target.pairedAsset,
    sourceStatus: monsterIconTargetSourceStatus(target),
    sourceLabel: target.sourceLabel ?? target.asset?.label ?? `Icon ${target.baseId}`
  }));
}

export function monsterIconTargetPairs(
  project: Project,
  lookups: MonsterIconTargetLookups,
  iconEntries: Record<number, IconEntry> = {}
): MonsterIconPairOption[] {
  const referencedIconIds = monsterReferencedIconIds(project);
  const referenced = new Set(referencedIconIds);
  const candidates = new Set<number>(referencedIconIds);
  for (const id of lookups.realmzActorIconAssetsByAbsId.keys()) {
    if (isMonsterIconPairBase(id, lookups.realmzActorIconAssetsByAbsId)) candidates.add(id);
  }
  for (const override of project.monsterIconOverrides ?? []) {
    candidates.add(Math.abs(override.targetBaseIconId));
  }
  return [...candidates]
    .filter((baseId) => baseId > 0 && baseId + MONSTER_ICON_PAIR_OFFSET <= 32767)
    .sort((left, right) => left - right)
    .map((baseId) => resolveMonsterIconTargetPair(project, lookups, iconEntries, baseId, referenced.has(baseId)))
    .filter((target): target is MonsterIconPairOption => Boolean(target));
}

export function monsterIconSetTabCount(
  project: Project,
  lookups: MonsterIconTargetLookups,
  iconEntries: Record<number, IconEntry> = {}
) {
  const candidates = new Set<number>(monsterReferencedIconIds(project));
  for (const id of lookups.realmzActorIconAssetsByAbsId.keys()) {
    if (isMonsterIconPairBase(id, lookups.realmzActorIconAssetsByAbsId)) candidates.add(id);
  }
  for (const override of project.monsterIconOverrides ?? []) {
    candidates.add(Math.abs(override.targetBaseIconId));
  }
  const projectIconReferences = projectIconReferenceSet(project);
  const scenarioResourceIds = new Set(
    (project.scenarioIconResources ?? [])
      .filter((resource) => Boolean(resource.resourceBase64))
      .map((resource) => Math.abs(resource.resourceId))
  );
  let count = 0;
  const counted = new Set<number>();
  for (const rawBaseId of candidates) {
    const baseId = normalizedMonsterIconBaseId(rawBaseId);
    if (!baseId || counted.has(baseId)) continue;
    const pairedId = baseId + MONSTER_ICON_PAIR_OFFSET;
    counted.add(baseId);
    if (lookups.monsterIconOverridesByTarget.has(baseId)) {
      count += 1;
      continue;
    }
    if (scenarioResourceIds.has(baseId) && scenarioResourceIds.has(pairedId)) {
      count += 1;
      continue;
    }
    const projectBase = lookups.iconAssetsByAbsId.get(baseId) ?? null;
    const projectPaired = lookups.iconAssetsByAbsId.get(pairedId) ?? null;
    if (projectBase?.previewPath && projectPaired?.previewPath) {
      count += 1;
      continue;
    }
    const entryBase = iconEntries[baseId] ?? iconEntries[-baseId] ?? null;
    const entryPaired = iconEntries[pairedId] ?? iconEntries[-pairedId] ?? null;
    if (entryBase?.url && entryPaired?.url && projectIconReferences.has(baseId) && projectIconReferences.has(pairedId)) {
      count += 1;
      continue;
    }
    if (lookups.realmzActorIconAssetsByAbsId.has(baseId) && lookups.realmzActorIconAssetsByAbsId.has(pairedId)) {
      count += 1;
    }
  }
  return count;
}

export function resolveMonsterIconTargetPair(
  project: Project,
  lookups: MonsterIconTargetLookups,
  iconEntries: Record<number, IconEntry>,
  rawBaseId: number,
  referenced = false
): MonsterIconPairOption | null {
  const baseId = normalizedMonsterIconBaseId(rawBaseId);
  if (!baseId) return null;
  const pairedId = baseId + MONSTER_ICON_PAIR_OFFSET;
  const override = lookups.monsterIconOverridesByTarget.get(baseId) ?? null;
  if (override) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromBase64(baseId, `${override.sourceLabel ?? `Scenario icon ${baseId}`} base`, override.sourceBaseResourceBase64, `monster-icon-override:${baseId}:base`),
      pairedAsset: previewAssetFromBase64(pairedId, `${override.sourceLabel ?? `Scenario icon ${baseId}`} paired`, override.sourcePairedResourceBase64, `monster-icon-override:${baseId}:paired`),
      resourceBase64: override.sourceBaseResourceBase64,
      pairedResourceBase64: override.sourcePairedResourceBase64,
      referenced,
      override,
      sourceLabel: override.sourceLabel ?? `Scenario icon override ${baseId}`
    };
  }

  const scenarioResourceBase = (project.scenarioIconResources ?? []).find((resource) => Math.abs(resource.resourceId) === baseId) ?? null;
  const scenarioResourcePaired = (project.scenarioIconResources ?? []).find((resource) => Math.abs(resource.resourceId) === pairedId) ?? null;
  if (scenarioResourceBase?.resourceBase64 && scenarioResourcePaired?.resourceBase64) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromBase64(baseId, scenarioResourceBase.label || `Scenario cicn ${baseId}`, scenarioResourceBase.resourceBase64, `scenario-icon-resource:${baseId}:base`, scenarioResourceBase.previewPath ?? null),
      pairedAsset: previewAssetFromBase64(pairedId, scenarioResourcePaired.label || `Scenario cicn ${pairedId}`, scenarioResourcePaired.resourceBase64, `scenario-icon-resource:${baseId}:paired`, scenarioResourcePaired.previewPath ?? null),
      resourceBase64: scenarioResourceBase.resourceBase64,
      pairedResourceBase64: scenarioResourcePaired.resourceBase64,
      referenced,
      sourceLabel: `Scenario resources ${baseId} / ${pairedId}`
    };
  }

  const projectBase = lookups.iconAssetsByAbsId.get(baseId) ?? null;
  const projectPaired = lookups.iconAssetsByAbsId.get(pairedId) ?? null;
  if (projectBase?.previewPath && projectPaired?.previewPath) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromCombatIconAsset(baseId, projectBase, `project-icon:${baseId}:base`),
      pairedAsset: previewAssetFromCombatIconAsset(pairedId, projectPaired, `project-icon:${baseId}:paired`),
      referenced,
      sourceLabel: `Scenario icons ${baseId} / ${pairedId}`
    };
  }

  const entryBase = iconEntries[baseId] ?? iconEntries[-baseId] ?? null;
  const entryPaired = iconEntries[pairedId] ?? iconEntries[-pairedId] ?? null;
  if (entryBase?.url && entryPaired?.url && hasProjectIconReference(project, baseId) && hasProjectIconReference(project, pairedId)) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromUrl(baseId, `Scenario cicn ${baseId}`, entryBase.url, `decoded-project-icon:${baseId}:base`),
      pairedAsset: previewAssetFromUrl(pairedId, `Scenario cicn ${pairedId}`, entryPaired.url, `decoded-project-icon:${baseId}:paired`),
      referenced,
      sourceLabel: `Scenario icons ${baseId} / ${pairedId}`
    };
  }

  const defaultBase = lookups.realmzActorIconAssetsByAbsId.get(baseId) ?? null;
  const defaultPaired = lookups.realmzActorIconAssetsByAbsId.get(pairedId) ?? null;
  if (defaultBase && defaultPaired) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: defaultBase,
      pairedAsset: defaultPaired,
      referenced,
      sourceLabel: defaultBase.label || `Family Jewels ${baseId}`
    };
  }

  return null;
}

export function monsterIconSourcePairs(
  catalog: LibraryCatalog | null,
  lookups: Pick<{ monsterMashAssetsByAbsId: Map<number, LibraryAsset> }, "monsterMashAssetsByAbsId">
): MonsterIconPairOption[] {
  const monsterMashPairs = [...lookups.monsterMashAssetsByAbsId.keys()]
    .filter((baseId) => isMonsterIconPairBase(baseId, lookups.monsterMashAssetsByAbsId))
    .sort((left, right) => left - right)
    .map((baseId) => ({
      key: `monster-mash:${baseId}`,
      baseId,
      asset: lookups.monsterMashAssetsByAbsId.get(baseId) ?? null,
      pairedAsset: lookups.monsterMashAssetsByAbsId.get(baseId + MONSTER_ICON_PAIR_OFFSET) ?? null,
      sourceKind: "monster-mash" as const,
      sourceLabel: `Monster Mash ${baseId}`,
      facingMode: "custom" as const
    }));
  const providencePairs = (catalog?.entities ?? [])
    .filter((entity) => isProvidenceIconLibraryEntry(entity) && iconLibraryEntryKind(entity) === "monster-pair")
    .map((entity) => {
      const number = iconLibraryEntityNumber(entity);
      const asset = catalog?.assets.find((candidate) => candidate.id === `library-asset:providence:icon-library:${number}:base`) ?? null;
      const pairedAsset = catalog?.assets.find((candidate) => candidate.id === `library-asset:providence:icon-library:${number}:paired`) ?? null;
      const baseId = Math.abs(asset?.resourceId ?? 0);
      const metadata = iconLibraryMonsterPairMetadata(entity);
      return {
        key: entity.id,
        baseId,
        asset,
        pairedAsset,
        sourceKind: "providence-library" as const,
        sourceLabel: entity.label || asset?.label || `Providence Icon ${baseId}`,
        facingMode: metadata.facingMode,
        canvas: metadata.canvas
      };
    })
    .filter((source) => source.baseId > 0 && source.pairedAsset);
  return [...monsterMashPairs, ...providencePairs];
}

export function nextScenarioMonsterIconTargetBaseId(
  sourceBaseIconId: number,
  targets: Array<Pick<MonsterIconPairOption, "baseId" | "override">>
) {
  const occupiedResourceIds = new Set<number>();
  for (const target of targets) {
    if (!target.override) continue;
    const baseId = normalizedMonsterIconBaseId(target.baseId);
    if (!baseId) continue;
    occupiedResourceIds.add(baseId);
    occupiedResourceIds.add(baseId + MONSTER_ICON_PAIR_OFFSET);
  }

  const sourceBaseId = normalizedMonsterIconBaseId(sourceBaseIconId);
  const fromSource = firstAvailableMonsterIconBaseId(sourceBaseId, occupiedResourceIds);
  if (fromSource) return fromSource;
  return firstAvailableMonsterIconBaseId(IMPORTED_MONSTER_ICON_BASE_START, occupiedResourceIds);
}

export function nextImportedMonsterIconBaseId(sources: MonsterIconPairOption[]) {
  const used = new Set(sources.map((source) => Math.abs(source.baseId)));
  for (let baseId = IMPORTED_MONSTER_ICON_BASE_START; baseId + MONSTER_ICON_PAIR_OFFSET <= 32767; baseId += 1) {
    if (!used.has(baseId) && !used.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return baseId;
  }
  return IMPORTED_MONSTER_ICON_BASE_START + used.size;
}

export function normalizedMonsterIconBaseId(baseId: number) {
  const normalized = Math.trunc(Math.abs(baseId));
  return normalized > 0 && normalized + MONSTER_ICON_PAIR_OFFSET <= 32767 ? normalized : 0;
}

export function previewPathFromCicnBase64(resourceBase64: string, fallback: string | null) {
  return resourcePreviewDataUrlFromBase64("cicn", resourceBase64) ?? fallback;
}

function monsterReferencedIconIds(project: Project) {
  return uniqueSortedNumbers([
    ...(project.monsters ?? []).map((monster) => Math.abs(monster.iconId)),
    ...(project.monsterSets ?? []).flatMap((set) => set.monsters.map((monster) => Math.abs(monster.iconId)))
  ]).filter((id) => id > 0);
}

function hasProjectIconReference(project: Project, resourceId: number) {
  return projectIconReferenceSet(project).has(Math.abs(resourceId));
}

function projectIconReferenceSet(project: Project) {
  return new Set([
    ...(project.assetCatalog?.icons ?? []).map((asset) => Math.abs(asset.resourceId)),
    ...(project.scenarioIconResources ?? []).map((resource) => Math.abs(resource.resourceId)),
    ...(project.assets ?? [])
      .filter((asset) => asset.resourceType === "cicn")
      .map((asset) => Math.abs(asset.resourceId))
  ]);
}

function previewAssetFromBase64(resourceId: number, label: string, resourceBase64: string, id: string, fallback: string | null = null): LibraryAsset {
  return previewAssetFromUrl(resourceId, label, previewPathFromCicnBase64(resourceBase64, fallback), id);
}

function previewAssetFromCombatIconAsset(resourceId: number, asset: CombatIconAsset, id: string): LibraryAsset {
  return previewAssetFromUrl(resourceId, asset.label || `cicn ${resourceId}`, asset.previewPath ?? null, id);
}

function previewAssetFromUrl(resourceId: number, label: string, previewPath: string | null, id: string): LibraryAsset {
  return {
    id,
    type: "scenario-monster-icon",
    label,
    source: "Scenario icon resources",
    relativePath: id,
    bytes: 0,
    sha256: `preview:${id}`,
    resourceType: "cicn",
    resourceId,
    previewPath,
    mimeType: "image/png"
  };
}

function firstAvailableMonsterIconBaseId(startBaseId: number, occupiedResourceIds: Set<number>) {
  const start = normalizedMonsterIconBaseId(startBaseId);
  if (!start) return 0;
  for (let baseId = start; baseId + MONSTER_ICON_PAIR_OFFSET <= 32767; baseId += 1) {
    if (!occupiedResourceIds.has(baseId) && !occupiedResourceIds.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return baseId;
  }
  return 0;
}

function iconLibraryEntityNumber(entity: LibraryCatalog["entities"][number]) {
  const value = entity.summary.libraryNumber;
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function isMonsterIconPairBase(baseId: number, assets: Map<number, LibraryAsset>) {
  if (!Number.isInteger(baseId) || baseId <= 0) return false;
  if (!assets.has(baseId) || !assets.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return false;
  return !assets.has(baseId - MONSTER_ICON_PAIR_OFFSET);
}

function uniqueSortedNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value)))]
    .sort((left, right) => left - right);
}
