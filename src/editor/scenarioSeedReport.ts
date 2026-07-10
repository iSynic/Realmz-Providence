import {
  SCENARIO_SEED_SCHEMA_VERSION,
  ScenarioSeedAllocationReport,
  ScenarioSeedDiagnostic
} from "./scenarioSeed";

export type ScenarioSeedAllocationFamilySummary = {
  key: Exclude<keyof ScenarioSeedAllocationReport, "baseTemplate">;
  label: string;
  count: number;
};

export type ScenarioSeedPreflightOutcome = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: ScenarioSeedDiagnostic[];
  allocationSummary: {
    baseTemplate: string;
    total: number;
    families: ScenarioSeedAllocationFamilySummary[];
  } | null;
  reportJson: string;
};

export type ScenarioSeedTemplateSelection = "seed" | "current-project";

const ALLOCATION_FAMILIES: Array<{
  key: Exclude<keyof ScenarioSeedAllocationReport, "baseTemplate">;
  label: string;
}> = [
  { key: "maps", label: "Maps" },
  { key: "regions", label: "Regions" },
  { key: "messages", label: "Strings" },
  { key: "quests", label: "Quests" },
  { key: "actionPoints", label: "Action Points" },
  { key: "extraActionPoints", label: "Extra APs" },
  { key: "simpleEncounters", label: "Simple Encounters" },
  { key: "complexEncounters", label: "Complex Encounters" },
  { key: "thiefEncounters", label: "Rogue Encounters" },
  { key: "timedEncounters", label: "Timed Encounters" },
  { key: "battles", label: "Battles" },
  { key: "monsters", label: "Monsters" },
  { key: "treasures", label: "Treasures" },
  { key: "shops", label: "Shops" },
  { key: "items", label: "Items" },
  { key: "assets", label: "Assets" },
  { key: "spells", label: "Spells" },
  { key: "races", label: "Races" },
  { key: "castes", label: "Castes" }
];

export function createScenarioSeedPreflightOutcome({
  errors,
  warnings,
  diagnostics,
  allocations
}: {
  errors: string[];
  warnings: string[];
  diagnostics: ScenarioSeedDiagnostic[];
  allocations?: ScenarioSeedAllocationReport;
}): ScenarioSeedPreflightOutcome {
  const families = allocations
    ? ALLOCATION_FAMILIES.map(({ key, label }) => ({ key, label, count: allocations[key].length })).filter((family) => family.count > 0)
    : [];
  const allocationSummary = allocations
    ? {
        baseTemplate: allocations.baseTemplate,
        total: families.reduce((total, family) => total + family.count, 0),
        families
      }
    : null;
  const report = {
    reportVersion: 1,
    scenarioSeedSchemaVersion: SCENARIO_SEED_SCHEMA_VERSION,
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics,
    ...(allocations ? { allocations } : {})
  };
  return {
    ok: report.ok,
    errors,
    warnings,
    diagnostics,
    allocationSummary,
    reportJson: JSON.stringify(report, null, 2)
  };
}
