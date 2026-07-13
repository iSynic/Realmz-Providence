import { GENERATED_SMART_TERRAIN_PROFILES } from "../map/generatedSmartTerrainProfiles";
import { tileValueAt } from "../map/geometry";
import { supportsSemanticRoads } from "../map/semanticRoads";
import { normalizeSmartTerrainTile } from "../map/smartTerrainTopology";
import type { MapEntity } from "../types";
import type { ScenarioSeed } from "./contracts";
import { addScenarioSeedDiagnostic, type ScenarioSeedCompilerContext } from "./compilerContext";

export function addScenarioSeedTopologyDiagnostics(seed: ScenarioSeed, context: ScenarioSeedCompilerContext) {
  const placements = (seed.actionPoints ?? []).map((actionPoint, index) => {
    const mapTarget = actionPoint.map === undefined
      ? null
      : typeof actionPoint.map === "number"
        ? { levelType: "land" as const, index: actionPoint.map }
        : context.maps.get(actionPoint.map) ?? null;
    const regionTarget = actionPoint.at === undefined || typeof actionPoint.at !== "string"
      ? null
      : context.regions.get(actionPoint.at) ?? null;
    return {
      key: actionPoint.key ?? `Action Point ${actionPoint.recordIndex ?? index}`,
      levelType: actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land",
      levelIndex: actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0,
      x: actionPoint.x ?? regionTarget?.x ?? mapTarget?.x ?? 0,
      y: actionPoint.y ?? regionTarget?.y ?? mapTarget?.y ?? 0,
      firstStep: actionPoint.steps[0]
    };
  });
  const byCoordinate = new Map(placements.map((placement) => [
    `${placement.levelType}:${placement.levelIndex}:${placement.x}:${placement.y}`,
    placement
  ]));

  for (const [index, actionPoint] of (seed.actionPoints ?? []).entries()) {
    for (const step of actionPoint.steps) {
      if (step.kind !== "teleport") continue;
      const regionTarget = step.at === undefined || typeof step.at !== "string"
        ? null
        : context.regions.get(step.at) ?? null;
      const mapTarget = step.map === undefined
        ? null
        : typeof step.map === "number"
          ? { levelType: "land" as const, index: step.map }
          : context.maps.get(step.map) ?? null;
      const levelType = regionTarget?.levelType ?? mapTarget?.levelType ?? "land";
      const levelIndex = regionTarget?.index ?? mapTarget?.index ?? step.landLevel;
      const x = regionTarget?.x ?? step.x;
      const y = regionTarget?.y ?? step.y;
      if (levelIndex === undefined || x === undefined || y === undefined || levelIndex < 0 || x < 0 || y < 0) continue;
      const target = byCoordinate.get(`${levelType}:${levelIndex}:${x}:${y}`);
      if (!target) continue;
      const source = actionPoint.key ?? `Action Point ${actionPoint.recordIndex ?? index}`;
      const suffix = target.firstStep?.kind === "teleport"
        ? " Its first step teleports again, creating an immediate return or teleport chain."
        : "";
      addScenarioSeedDiagnostic(
        context,
        "warning",
        "teleport-destination-action-point",
        `${source} teleports directly onto ${target.key}.${suffix}`,
        "action point",
        source
      );
    }
  }
}

export function addScenarioSeedMapPlacementDiagnostics(
  seed: ScenarioSeed,
  maps: MapEntity[],
  context: ScenarioSeedCompilerContext
) {
  const warnIfWater = (label: string, levelIndex: number, x: number, y: number) => {
    const map = maps.find((entry) => entry.levelType === "land" && entry.index === levelIndex);
    if (!map || x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    if (map.render.landlook === null || !supportsSemanticRoads(map.render.landlook)) return;
    const profile = GENERATED_SMART_TERRAIN_PROFILES.find((entry) => entry.landlook === map.render.landlook);
    const tile = normalizeSmartTerrainTile(tileValueAt(map, x, y));
    if (tile === null || !profile?.presets.water.family.includes(tile)) return;
    addScenarioSeedDiagnostic(
      context,
      "warning",
      "site-on-water",
      `${label} is placed on water at land level ${levelIndex}, (${x}, ${y}).`,
      "map site",
      label
    );
  };

  if (seed.scenario.start) {
    warnIfWater("Scenario start", seed.scenario.start.landLevel, seed.scenario.start.x, seed.scenario.start.y);
  }
  for (const [index, actionPoint] of (seed.actionPoints ?? []).entries()) {
    const mapTarget = actionPoint.map === undefined
      ? null
      : typeof actionPoint.map === "number"
        ? { levelType: "land" as const, index: actionPoint.map }
        : context.maps.get(actionPoint.map) ?? null;
    const regionTarget = actionPoint.at === undefined || typeof actionPoint.at !== "string"
      ? null
      : context.regions.get(actionPoint.at) ?? null;
    const levelType = actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land";
    if (levelType !== "land") continue;
    warnIfWater(
      actionPoint.key ?? `Action Point ${actionPoint.recordIndex ?? index}`,
      actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0,
      actionPoint.x ?? regionTarget?.x ?? mapTarget?.x ?? 0,
      actionPoint.y ?? regionTarget?.y ?? mapTarget?.y ?? 0
    );
  }
}
