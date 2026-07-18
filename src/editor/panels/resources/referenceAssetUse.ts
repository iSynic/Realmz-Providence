import type { LibraryAsset, LibraryCatalog, ReferenceAssetScenarioCopyKind } from "../../types";

const MONSTER_ICON_PAIR_OFFSET = 308;

export type ReferenceIconUse =
  | "scenario-item-icon"
  | "item-icon-library"
  | "scenario-monster-icon"
  | "special-land-tile"
  | "scenario-icon";

export type ReferenceMonsterIconPair = {
  base: LibraryAsset & { resourceId: number };
  paired: LibraryAsset & { resourceId: number };
};

export function referenceAssetNeedsUseChoice(asset: LibraryAsset) {
  return asset.resourceType === "cicn" && asset.resourceId != null;
}

export function referenceAssetCopyLabel(asset: LibraryAsset) {
  return referenceAssetNeedsUseChoice(asset) ? "Choose Use..." : "Copy to Scenario Assets";
}

export function findReferenceMonsterIconPair(
  catalog: LibraryCatalog | null | undefined,
  selected: LibraryAsset
): ReferenceMonsterIconPair | null {
  if (!isMonsterMashAsset(selected) || selected.resourceId == null) return null;
  const byId = new Map<number, LibraryAsset & { resourceId: number }>();
  for (const asset of catalog?.assets ?? []) {
    if (!isMonsterMashAsset(asset) || asset.source !== selected.source || asset.resourceId == null) continue;
    byId.set(Math.abs(asset.resourceId), asset as LibraryAsset & { resourceId: number });
  }
  const selectedId = Math.abs(selected.resourceId);
  const candidateBaseIds = [selectedId, selectedId - MONSTER_ICON_PAIR_OFFSET].filter((id) => id > 0);
  for (const baseId of candidateBaseIds) {
    const base = byId.get(baseId);
    const paired = byId.get(baseId + MONSTER_ICON_PAIR_OFFSET);
    if (base && paired && !byId.has(baseId - MONSTER_ICON_PAIR_OFFSET)) return { base, paired };
  }
  return null;
}

export function referenceIconUseDescription(use: ReferenceIconUse) {
  if (use === "scenario-item-icon") return "Copy the cicn into Scenario Assets in the custom item-icon range so it can be selected in Economy > Item Editor.";
  if (use === "item-icon-library") return "Add reusable item art to the Providence Icon Library without changing the current scenario.";
  if (use === "scenario-monster-icon") return "Copy both facing cicn resources into Scenario Assets as this scenario's override for the selected monster icon set.";
  if (use === "special-land-tile") return "Copy the cicn into Scenario Assets with a negative map-tile ID so it can be painted on Land/Dungeon maps.";
  return "Copy the cicn directly into Scenario Assets in the high custom-icon range for a record that reads an icon ID.";
}

export function referenceIconUseScenarioKind(use: ReferenceIconUse): ReferenceAssetScenarioCopyKind | null {
  if (use === "scenario-item-icon" || use === "scenario-icon") return "icon";
  if (use === "special-land-tile") return "special-land-tile";
  return null;
}

function isMonsterMashAsset(asset: LibraryAsset) {
  if (asset.resourceType !== "cicn") return false;
  return `${asset.source} ${asset.label} ${asset.relativePath}`.toLowerCase().includes("monster mash");
}
