import { memo, useEffect, useState } from "react";
import { browserReferenceIconUrl } from "../../browser/atlasPaths";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import { isActorOrCreatureIconId } from "../../resourceResolver";
import type { IconEntry, LibraryAsset, MonsterRecord, Project } from "../../types";
import type { CombatLookups } from "./combatLookups";
import { monsterIconTargetSourceStatus, resolveMonsterIconTargetPair, type MonsterIconSourceStatus } from "./iconSetModel";
import { measureCombatWork } from "./performance";

export type MonsterIconResolution = {
  url: string | null;
  libraryAsset?: LibraryAsset | null;
  label: string;
  sourceStatus: MonsterIconSourceStatus;
  width: number | null;
  height: number | null;
};

export type ResolvedBattleMonsterIcon = MonsterIconResolution & {
  resolvedUrl: string | null;
  cacheKey: string;
};

type MonsterIconProps = {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  resolvedIcon?: ResolvedBattleMonsterIcon | null;
  compact?: boolean;
  large?: boolean;
};

export const MonsterIcon = memo(function MonsterIcon({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  resolvedIcon = null,
  compact = false,
  large = false
}: MonsterIconProps) {
  if (resolvedIcon) {
    return <MonsterIconDisplay resolution={resolvedIcon} primaryUrl={resolvedIcon.resolvedUrl} fallbackText={String(monster.id)} compact={compact} large={large} />;
  }
  return (
    <MonsterIconResolved
      monster={monster}
      iconEntries={iconEntries}
      project={project}
      lookups={lookups}
      previewContext={previewContext}
      compact={compact}
      large={large}
    />
  );
}, areMonsterIconPropsEqual);

function MonsterIconResolved({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  compact = false,
  large = false
}: MonsterIconProps) {
  const resolution = measureCombatWork("resolveMonsterIcon", () => resolveMonsterIcon(monster, iconEntries, project, lookups));
  const iconResourceId = monster.iconId ? Math.abs(monster.iconId) : null;
  const scenarioResourceId = resolution.url || resolution.libraryAsset ? null : iconResourceId;
  const scenarioUrl = useResolvedPreviewUrl(null, null, null, {
    ...previewContext,
    project,
    resourceType: "cicn",
    resourceId: scenarioResourceId
  });
  const fallbackUrl = useResolvedPreviewUrl(resolution.url, null, resolution.libraryAsset ?? null, previewContext);
  return <MonsterIconDisplay resolution={resolution} primaryUrl={fallbackUrl} fallbackUrl={scenarioUrl} fallbackText={String(monster.id)} compact={compact} large={large} />;
}

export function MonsterIconDisplay({
  resolution,
  primaryUrl,
  fallbackUrl,
  fallbackText,
  compact,
  large
}: {
  resolution: Pick<MonsterIconResolution, "label">;
  primaryUrl: string | null;
  fallbackUrl?: string | null;
  fallbackText: string;
  compact: boolean;
  large: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [fallbackUrl, primaryUrl]);
  const displayUrl = primaryUrl && primaryUrl !== failedUrl
    ? primaryUrl
    : fallbackUrl && fallbackUrl !== failedUrl
      ? fallbackUrl
      : null;
  const ready = !displayUrl || loadedUrl === displayUrl;
  return (
    <span
      className={`monster-icon-preview${compact ? " compact" : ""}${large ? " large" : ""}`}
      title={resolution.label}
      data-combat-preview="monster-icon"
      data-combat-preview-ready={ready ? "true" : "false"}
    >
      {displayUrl ? (
        <img
          src={displayUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(displayUrl)}
          onError={() => setFailedUrl(displayUrl)}
        />
      ) : (
        <b>{fallbackText}</b>
      )}
    </span>
  );
}

function areMonsterIconPropsEqual(previous: MonsterIconProps, next: MonsterIconProps) {
  return previous.monster === next.monster
    && previous.iconEntries === next.iconEntries
    && previous.lookups === next.lookups
    && previous.resolvedIcon === next.resolvedIcon
    && previous.compact === next.compact
    && previous.large === next.large
    && samePreviewContextInputs(previous.previewContext, next.previewContext)
    && sameProjectIconInputs(previous.project, next.project);
}

export function samePreviewContextInputs(left: PreviewRuntimeContext, right: PreviewRuntimeContext) {
  return left === right || (
    left.desktopRuntime === right.desktopRuntime
    && left.projectDir === right.projectDir
    && left.workspaceDir === right.workspaceDir
    && left.resourceType === right.resourceType
    && left.resourceId === right.resourceId
    && sameProjectIconInputs(left.project ?? null, right.project ?? null)
  );
}

export function sameProjectIconInputs(left: Project | null | undefined, right: Project | null | undefined) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.scenario.name === right.scenario.name
    && left.source.sourcePath === right.source.sourcePath
    && left.assets === right.assets
    && left.assetCatalog.icons === right.assetCatalog.icons
    && left.monsterIconOverrides === right.monsterIconOverrides
    && left.scenarioIconResources === right.scenarioIconResources;
}

export function resolveMonsterIcon(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups): MonsterIconResolution {
  const iconId = Math.abs(monster.iconId);
  const targetPair = resolveMonsterIconTargetPair(project, lookups, iconEntries, iconId, true);
  if (targetPair?.asset) {
    const targetEntry = iconEntries[monster.iconId] ?? iconEntries[iconId] ?? iconEntries[-iconId] ?? null;
    const width = targetEntry?.image.naturalWidth || targetEntry?.image.width || null;
    const height = targetEntry?.image.naturalHeight || targetEntry?.image.height || null;
    const label = targetPair.override
      ? `cicn ${monster.iconId} overridden by ${targetPair.override.sourceLabel ?? `Source ${targetPair.override.sourceBaseIconId}`}`
      : targetPair.sourceLabel ?? targetPair.asset.label ?? `cicn ${monster.iconId}`;
    const sourceStatus = monsterIconTargetSourceStatus(targetPair);
    if (targetPair.asset.source === "Scenario icon resources") {
      return { url: targetPair.asset.previewPath ?? null, libraryAsset: targetPair.asset.previewPath ? null : targetPair.asset, label, sourceStatus, width, height };
    }
    return { url: null, libraryAsset: targetPair.asset, label, sourceStatus, width, height };
  }
  const entry = iconEntries[monster.iconId] ?? iconEntries[iconId] ?? iconEntries[-iconId];
  if (entry?.url) {
    return {
      url: entry.url,
      label: `cicn ${monster.iconId}`,
      sourceStatus: "scenario-resource",
      width: entry.image.naturalWidth || entry.image.width || null,
      height: entry.image.naturalHeight || entry.image.height || null
    };
  }
  const asset = lookups.iconAssetsByAbsId.get(iconId);
  if (asset?.previewPath) return { url: asset.previewPath, label: asset.label ?? `cicn ${monster.iconId}`, sourceStatus: "scenario-resource", width: null, height: null };
  const projectAsset = project.assetCatalog?.icons?.find((candidate) => Math.abs(candidate.resourceId) === iconId && candidate.previewPath) ?? null;
  if (projectAsset?.previewPath) return { url: projectAsset.previewPath, label: `cicn ${monster.iconId}`, sourceStatus: "scenario-resource", width: null, height: null };
  const realmzActorAsset = lookups.realmzActorIconAssetsByAbsId.get(iconId) ?? null;
  if (realmzActorAsset) return { url: null, libraryAsset: realmzActorAsset, label: realmzActorAsset.label || `cicn ${monster.iconId}`, sourceStatus: "default-art", width: null, height: null };
  if (isActorOrCreatureIconId(iconId)) {
    const referenceUrl = browserReferenceIconUrl(iconId);
    if (referenceUrl) return { url: referenceUrl, label: `cicn ${monster.iconId}`, sourceStatus: "default-art", width: null, height: null };
  }
  return { url: null, label: `No icon preview for cicn ${monster.iconId}`, sourceStatus: "missing-art", width: null, height: null };
}
