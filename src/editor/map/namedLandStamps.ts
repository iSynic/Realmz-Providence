import { SUPER_TILE_STAMPS, type SuperTileStamp, type SuperTileStampCell } from "./builtInMapStamps";

export const SCENARIO_SEED_NAMED_STAMP_NAMES = [
  "tall-tree",
  "tall-stone-column",
  "sarcophagus",
  "bed",
  "long-table",
  "torture-rack",
  "yellow-bed",
  "tall-purple-throne",
  "stone-gargoyle-west",
  "coffin",
  "purple-altar",
  "open-door-north-wall",
  "open-door-west-wall",
  "open-door-east-wall",
  "dome",
  "yellow-house",
  "small-castle",
  "red-building",
  "temple",
  "gold-hall",
  "stone-arch",
  "stone-hall",
  "wooden-lookout-tower",
  "red-tower",
  "green-gate",
  "gnarled-root"
] as const;

export type ScenarioSeedNamedStampName = typeof SCENARIO_SEED_NAMED_STAMP_NAMES[number];

export type ResolvedNamedLandStamp = {
  id: string;
  name: ScenarioSeedNamedStampName;
  variant: number;
  cells: readonly SuperTileStampCell[];
  width: number;
  height: number;
};

const NAMED_STAMP_IDS: Record<ScenarioSeedNamedStampName, readonly string[]> = {
  "tall-tree": ["tree-pair-151-152", "tree-pair-153-154"],
  "tall-stone-column": ["castle-column-142-143"],
  "sarcophagus": ["castle-sarcophagus-153-154"],
  "bed": ["castle-bed-156-157"],
  "long-table": ["castle-long-table-158-162", "castle-long-table-bottles-158-160-162", "castle-long-table-food-158-161-162"],
  "torture-rack": ["castle-torture-rack-163-164"],
  "yellow-bed": ["castle-yellow-bed-165-166"],
  "tall-purple-throne": ["castle-purple-throne-177-178"],
  "stone-gargoyle-west": ["castle-gargoyle-179-180"],
  "coffin": ["castle-coffin-185-186"],
  "purple-altar": ["castle-purple-object-199-200"],
  "open-door-north-wall": ["castle-open-door-north-wall-187-191"],
  "open-door-west-wall": ["castle-open-door-west-wall-193-195"],
  "open-door-east-wall": ["castle-open-door-east-wall-194-196"],
  "dome": ["structure-dome-91-90"],
  "yellow-house": ["structure-house-75-72"],
  "small-castle": ["structure-castle-93-92"],
  "red-building": ["structure-red-building-64-67"],
  "temple": ["structure-temple-63-60"],
  "gold-hall": ["structure-gold-hall-59-56"],
  "stone-arch": ["structure-arch-52-55"],
  "stone-hall": ["structure-stone-hall-38-37"],
  "wooden-lookout-tower": ["structure-wooden-tower-50-51"],
  "red-tower": ["structure-red-tower-36-33"],
  "green-gate": ["structure-green-gate-30-31"],
  "gnarled-root": ["structure-gnarled-root-25-28"]
};

const NAMED_STAMP_NAME_SET = new Set<string>(SCENARIO_SEED_NAMED_STAMP_NAMES);
const BUILT_IN_STAMPS_BY_ID = new Map(SUPER_TILE_STAMPS.map((stamp) => [stamp.id, stamp]));

export function isScenarioSeedNamedStampName(value: string): value is ScenarioSeedNamedStampName {
  return NAMED_STAMP_NAME_SET.has(value);
}

export function namedLandStampVariants(landlook: number, name: ScenarioSeedNamedStampName): readonly SuperTileStamp[] {
  return NAMED_STAMP_IDS[name]
    .map((id) => BUILT_IN_STAMPS_BY_ID.get(id))
    .filter((stamp): stamp is SuperTileStamp => stamp !== undefined && (!stamp.landlooks || stamp.landlooks.includes(landlook)));
}

export function resolveNamedLandStamp(landlook: number, name: ScenarioSeedNamedStampName, variant = 1): ResolvedNamedLandStamp | null {
  const variants = namedLandStampVariants(landlook, name);
  if (!Number.isInteger(variant) || variant < 1 || variant > variants.length) return null;
  const stamp = variants[variant - 1];
  if (!stamp) return null;
  const maxX = Math.max(...stamp.cells.map((cell) => cell.dx));
  const maxY = Math.max(...stamp.cells.map((cell) => cell.dy));
  return { id: stamp.id, name, variant, cells: stamp.cells, width: maxX + 1, height: maxY + 1 };
}
