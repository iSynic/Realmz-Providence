import type { LevelType, LibraryCatalog, ManagedAssetKind } from "../types";
import type { ScenarioSeedAllocationReport, ScenarioSeedDiagnostic } from "../scenarioSeed";

export type MapTarget = { levelType: LevelType; index: number; x?: number; y?: number };
export type ActionPointTarget = { levelType: LevelType; levelIndex: number; recordIndex: number };
export type ScenarioSeedResolvedAsset = {
  kind: ManagedAssetKind;
  resourceType: string;
  resourceId: number;
  bundled: boolean;
};

export type ScenarioSeedCompilerContext = {
  errors: string[];
  warnings: string[];
  diagnostics: ScenarioSeedDiagnostic[];
  allocations: ScenarioSeedAllocationReport;
  messages: Map<string, number>;
  quests: Map<string, number>;
  battles: Map<string, number>;
  monsters: Map<string, number>;
  treasures: Map<string, number>;
  shops: Map<string, number>;
  items: Map<string, number>;
  assets: Map<string, ScenarioSeedResolvedAsset>;
  simpleEncounters: Map<string, number>;
  complexEncounters: Map<string, number>;
  thiefEncounters: Map<string, number>;
  timedEncounters: Map<string, number>;
  spells: Map<string, number>;
  races: Map<string, number>;
  castes: Map<string, number>;
  actionPoints: Map<string, number>;
  actionPointTargets: Map<string, ActionPointTarget>;
  extraActionPoints: Map<string, number>;
  maps: Map<string, MapTarget>;
  regions: Map<string, MapTarget & { x: number; y: number }>;
  libraryCatalog: LibraryCatalog | null;
};

export function createScenarioSeedCompilerContext(
  baseTemplate = "blank",
  libraryCatalog: LibraryCatalog | null = null
): ScenarioSeedCompilerContext {
  return {
    errors: [],
    warnings: [],
    diagnostics: [],
    allocations: {
      baseTemplate,
      messages: [],
      quests: [],
      battles: [],
      monsters: [],
      treasures: [],
      shops: [],
      items: [],
      assets: [],
      simpleEncounters: [],
      complexEncounters: [],
      thiefEncounters: [],
      timedEncounters: [],
      spells: [],
      races: [],
      castes: [],
      actionPoints: [],
      extraActionPoints: [],
      maps: [],
      regions: []
    },
    messages: new Map(),
    quests: new Map(),
    battles: new Map(),
    monsters: new Map(),
    treasures: new Map(),
    shops: new Map(),
    items: new Map(),
    assets: new Map(),
    simpleEncounters: new Map(),
    complexEncounters: new Map(),
    thiefEncounters: new Map(),
    timedEncounters: new Map(),
    spells: new Map(),
    races: new Map(),
    castes: new Map(),
    actionPoints: new Map(),
    actionPointTargets: new Map(),
    extraActionPoints: new Map(),
    maps: new Map(),
    regions: new Map(),
    libraryCatalog
  };
}

export function addScenarioSeedDiagnostic(
  context: ScenarioSeedCompilerContext,
  severity: "error" | "warning",
  code: string,
  message: string,
  family?: string,
  key?: string
) {
  context.diagnostics.push({ severity, code, message, ...(family ? { family } : {}), ...(key ? { key } : {}) });
  if (severity === "error") context.errors.push(message);
  else context.warnings.push(message);
}
