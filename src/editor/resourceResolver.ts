import { LibraryAsset, ManagedAsset, ManagedAssetKind, Project } from "./types";
import { resourceUsageLinks, ContentUsageLink } from "./contentLinks";

export type ResourceOrigin = "scenario" | "realmz-library" | "divinity-reference" | "ui-reference" | "unknown";
export type ResourceExportScope =
  | "ships-with-scenario"
  | "scenario-preview-only"
  | "scenario-blocked"
  | "realmz-built-in-reference"
  | "divinity-reference"
  | "ui-reference"
  | "unknown-advanced";
export type ResourceRole =
  | "scenario-picture"
  | "picture"
  | "sound"
  | "icon"
  | "special-land-tile"
  | "tile-atlas"
  | "text-resource"
  | "string-list"
  | "style"
  | "version"
  | "ui-art"
  | "raw";

export type ResolvedResource = {
  resourceType: string;
  resourceId: number;
  label: string;
  kind: ManagedAssetKind;
  origin: ResourceOrigin;
  exportScope: ResourceExportScope;
  role: ResourceRole;
  available: boolean;
  placeableOnMap: boolean;
  projectAsset: ManagedAsset | null;
  libraryAsset: LibraryAsset | null;
  usageLinks: ContentUsageLink[];
};

export function resourceOrigin(asset: ManagedAsset | LibraryAsset): ResourceOrigin {
  if ("exportState" in asset) return "scenario";
  const text = `${asset.source} ${asset.relativePath} ${asset.label} ${asset.type}`.toLowerCase();
  if (/\b(ui|interface|manual|documentation|screenshot|button|window)\b/.test(text)) return "ui-reference";
  if (text.includes("divinity") && !text.includes("realmz data")) return "divinity-reference";
  if (asset.resourceType === "PICT" || asset.resourceType === "cicn" || asset.resourceType?.trim() === "snd" || asset.resourceType === "TEXT" || asset.resourceType === "STR#") {
    return "realmz-library";
  }
  if (text.includes("realmz")) return "realmz-library";
  return "unknown";
}

export function resourceOriginLabel(origin: ResourceOrigin) {
  if (origin === "scenario") return "Scenario";
  if (origin === "realmz-library") return "Realmz Library";
  if (origin === "divinity-reference") return "Divinity Reference";
  if (origin === "ui-reference") return "UI Reference";
  return "Unknown";
}

export function resourceExportScope(asset: ManagedAsset | LibraryAsset): ResourceExportScope {
  if ("exportState" in asset) {
    if (asset.exportState === "ready") return "ships-with-scenario";
    if (asset.exportState === "blocked") return "scenario-blocked";
    return "scenario-preview-only";
  }
  const origin = resourceOrigin(asset);
  if (origin === "realmz-library") return "realmz-built-in-reference";
  if (origin === "divinity-reference") return "divinity-reference";
  if (origin === "ui-reference") return "ui-reference";
  return "unknown-advanced";
}

export function resourceExportScopeLabel(scope: ResourceExportScope) {
  if (scope === "ships-with-scenario") return "Ships with scenario";
  if (scope === "scenario-preview-only") return "Project preview only";
  if (scope === "scenario-blocked") return "Needs export setup";
  if (scope === "realmz-built-in-reference") return "Reference only - built into Realmz";
  if (scope === "divinity-reference") return "Reference only - Divinity";
  if (scope === "ui-reference") return "UI reference - hidden by default";
  return "Advanced / unknown";
}

export function resourceRole(asset: ManagedAsset | LibraryAsset): ResourceRole {
  if ("exportState" in asset) {
    if (asset.kind === "picture" && asset.resourceType === "PICT" && asset.resourceId >= 30000 && asset.resourceId <= 30128) return "scenario-picture";
    if (asset.kind === "picture") return "picture";
    if (asset.kind === "sound") return "sound";
    if (asset.kind === "icon") return "icon";
    if (asset.kind === "special-land-tile") return "special-land-tile";
    if (asset.kind === "text") return "text-resource";
    return "raw";
  }
  const type = `${asset.type} ${asset.resourceType ?? ""} ${asset.label} ${asset.relativePath}`.toLowerCase();
  if (resourceOrigin(asset) === "ui-reference") return "ui-art";
  if (asset.type === "special-land-tile") return "special-land-tile";
  if (asset.resourceType === "PICT" || asset.type === "picture") return "picture";
  if (asset.resourceType === "cicn" || asset.type.includes("icon")) return "icon";
  if (asset.resourceType?.trim() === "snd" || asset.type === "sound") return "sound";
  if (asset.resourceType === "TEXT" || asset.type === "text-resource" || asset.type === "text") return "text-resource";
  if (asset.resourceType === "STR#" || asset.type === "string-list-resource") return "string-list";
  if (asset.resourceType === "styl" || type.includes("style")) return "style";
  if (asset.resourceType === "vers" || type.includes("version")) return "version";
  if (type.includes("tile atlas") || type.includes("landlook")) return "tile-atlas";
  return "raw";
}

export function managedAssetKindForLibrary(asset: LibraryAsset): ManagedAssetKind {
  if (asset.type === "sound" || asset.resourceType?.trim() === "snd") return "sound";
  if (asset.type === "special-land-tile") return "special-land-tile";
  if (asset.type === "icon" || asset.type === "icon-resource" || asset.type.includes("icon") || asset.resourceType === "cicn") return "icon";
  if (asset.type === "picture" || asset.resourceType === "PICT") return "picture";
  if (asset.type === "text" || asset.resourceType === "TEXT" || asset.resourceType === "STR#") return "text";
  return "other";
}

export function isMapPlaceableLibraryAsset(asset: LibraryAsset) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const origin = resourceOrigin(asset);
  if (origin === "ui-reference" || origin === "divinity-reference") return false;
  return (
    asset.type === "special-land-tile" ||
    asset.relativePath.includes("Land Archive") ||
    asset.label.includes("Special Land") ||
    asset.resourceId < 0 ||
    isActorOrCreatureIconId(Math.abs(asset.resourceId))
  );
}

export function isActorOrCreatureIconId(resourceId: number) {
  return (
    (resourceId >= 379 && resourceId <= 461) ||
    (resourceId >= 464 && resourceId <= 496) ||
    (resourceId >= 500 && resourceId <= 590) ||
    (resourceId >= 600 && resourceId <= 619) ||
    (resourceId >= 692 && resourceId <= 824)
  );
}

export function findLibraryResourceAsset(
  libraryAssets: LibraryAsset[],
  resourceType: string,
  resourceId: number,
  kind?: ManagedAssetKind
) {
  const normalizedType = resourceType.trim().toLowerCase();
  return libraryAssets.find((asset) => {
    if (asset.resourceId !== resourceId) return false;
    if ((asset.resourceType ?? "").trim().toLowerCase() !== normalizedType) return false;
    return kind == null || managedAssetKindForLibrary(asset) === kind;
  }) ?? null;
}

export function resolveResource(
  project: Project | null,
  libraryAssets: LibraryAsset[],
  resourceType: string,
  resourceId: number
): ResolvedResource {
  const normalizedType = resourceType.trim();
  const projectAsset = (project?.assets ?? []).find((asset) => asset.resourceType.trim() === normalizedType && asset.resourceId === resourceId) ?? null;
  const libraryAsset = libraryAssets.find((asset) => asset.resourceType?.trim() === normalizedType && asset.resourceId === resourceId) ?? null;
  const origin = projectAsset ? resourceOrigin(projectAsset) : libraryAsset ? resourceOrigin(libraryAsset) : "unknown";
  const kind = projectAsset ? projectAsset.kind : libraryAsset ? managedAssetKindForLibrary(libraryAsset) : "other";
  const asset = projectAsset ?? libraryAsset;
  return {
    resourceType: normalizedType,
    resourceId,
    label: projectAsset?.label ?? libraryAsset?.label ?? `${normalizedType} ${resourceId}`,
    kind,
    origin,
    exportScope: asset ? resourceExportScope(asset) : "unknown-advanced",
    role: asset ? resourceRole(asset) : "raw",
    available: Boolean(projectAsset || libraryAsset),
    placeableOnMap: Boolean(projectAsset?.kind === "special-land-tile" || (libraryAsset && isMapPlaceableLibraryAsset(libraryAsset))),
    projectAsset,
    libraryAsset,
    usageLinks: project ? resourceUsageLinks(project, normalizedType, resourceId) : []
  };
}
