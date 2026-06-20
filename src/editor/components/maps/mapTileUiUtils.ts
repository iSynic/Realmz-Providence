import { TileAttributeFlag } from "../../types";
import { landlookVisualCategoryLabel } from "../../map/landlookTileSemantics";
import { classifyTileValue } from "../../map/tileMetadata";

export function attributeSourceLabel(attributes: ReturnType<typeof classifyTileValue>["attributes"]) {
  if (!attributes) return "Unknown";
  if (attributes.sourceKind === "mapstats") return "Realmz landlook table";
  if (attributes.sourceKind === "data-solids") return "Special tile table";
  if (attributes.sourceKind === "inferred") return "Inferred";
  if (attributes.sourceKind === "preserved") return "Imported";
  return attributes.source || "Unknown";
}

export function yesNo(value: boolean | null | undefined) {
  if (value == null) return "unknown";
  return value ? "yes" : "no";
}

export function solidTypeLabel(value: number | null | undefined) {
  if (value == null) return "unknown";
  if (value === 0) return "clear / passable";
  if (value === 1) return "solid";
  return `solid type ${value}`;
}

export function passabilityLabel(attributes: ReturnType<typeof classifyTileValue>["attributes"]) {
  if (!attributes) return "unknown";
  if (attributes.boatRequirement) return `boat required (${attributes.boatRequirement})`;
  if (attributes.flyFloatRequired) return "fly / float required";
  if (attributes.flags.includes("solid") || (attributes.solidType ?? 0) !== 0) return "blocked";
  return "walkable";
}

export function movementCostLabel(value: number | null | undefined) {
  if (value == null) return "unknown";
  if (value === 0) return "default";
  return value;
}

export function forestTypeLabel(value: number | null | undefined) {
  if (value == null) return "unknown";
  if (value === 0) return "not forest";
  if (value === 1) return "normal forest";
  if (value === 2) return "desert forest";
  if (value === 3) return "mushroom grove";
  return `type ${value}`;
}

export function tileEditableScopeLabel(scope: string | null | undefined) {
  if (scope === "built-in-reference") return "Built into Realmz";
  if (scope === "scenario-custom") return "Scenario Custom";
  if (scope === "special-tile") return "Special Tile Table";
  return "Unknown";
}

export function normalizedCombatBuild(attributes: ReturnType<typeof classifyTileValue>["attributes"]) {
  const rows = attributes?.combatBuild;
  if (!rows || rows.length < 3) return null;
  const normalizedRows = rows.slice(0, 3).map((row) => row.slice(0, 3));
  if (!normalizedRows.every((row) => row.length === 3)) return null;
  if (!normalizedRows.flat().some((value) => value !== 0)) return null;
  return normalizedRows;
}

export function tileAttributeLabel(flag: TileAttributeFlag) {
  switch (flag) {
    case "walkable": return "Walkable";
    case "solid": return "Solid / blocking";
    case "path": return "Runtime path";
    case "visual-path": return "Road art";
    case "shore": return "Shore / water";
    case "boat-required": return "Boat required";
    case "fly-float-required": return "Fly / float required";
    case "blocks-los": return "Blocks LOS";
    case "forest": return "Forest";
    case "combat-build": return "Combat map";
    case "special-icon": return "Special / icon";
    case "unknown-metadata": return "Unknown";
    default: return flag;
  }
}


export function tileAttributeRows(meaning: ReturnType<typeof classifyTileValue>): [string, string | number][] {
  const attributes = meaning.attributes;
  return [
    ["Raw Value", meaning.raw],
    ["Rendered Tile", meaning.renderTile],
    ["Behavior Source", attributeSourceLabel(attributes)],
    ["Visual Group", meaning.visual ? landlookVisualCategoryLabel(meaning.visual.category) : "unknown"],
    ["Visual Confidence", meaning.visual?.confidence ?? "unknown"],
    ["Visual Notes", meaning.visual?.notes ?? "none"],
    ["Solidity", solidTypeLabel(attributes?.solidType)],
    ["Passability", passabilityLabel(attributes)],
    ["Move Sound", attributes?.movementSoundId ?? "unknown"],
    ["Time / Move", movementCostLabel(attributes?.movementCost)],
    ["Shore / Water", yesNo(attributes?.shore)],
    ["Boat Required", attributes?.boatRequirement ?? "unknown"],
    ["Runtime Path", yesNo(attributes?.pathFlag)],
    ["Road Art", meaning.attributeFlags.includes("visual-path") ? "yes" : "no"],
    ["Blocks LOS", yesNo(attributes?.blocksLos)],
    ["Fly / Float", yesNo(attributes?.flyFloatRequired)],
    ["Forest Type", forestTypeLabel(attributes?.forestType)],
    ["Combat Build", normalizedCombatBuild(attributes) ? "3 x 3 expansion" : "none"],
    ["Clear Tile", attributes?.clearLandId ?? "unknown"],
    ["Base Tile", attributes?.baseTile ?? "unknown"],
    ["Tile Scope", tileEditableScopeLabel(attributes?.editableScope)],
    ["Traits", meaning.attributeFlags.map(tileAttributeLabel).join(", ") || "unknown"],
    ["Status", attributes?.confidence ?? "unknown"]
  ];
}
