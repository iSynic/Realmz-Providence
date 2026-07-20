import type { Project } from "../types";
import { AUTHORED_EMPTY_RUNTIME_FILES, AUTHORED_SCENARIO_ITEM_RECORDS, AUTHORED_TRIGGER_TABLES } from "../generated/realmzNativeManifestPolicy";
import { DOOR_LEVEL_RECORD_BYTES, SCENARIO_SUPPORT_FILE_BYTES, TILE_SOLIDS_BYTES, writeScenarioShell, writeTileSolids } from "./binaryWriters";
import { MINIMUM_SCENARIO_RESOURCE_FORK_BYTES, writeMinimumScenarioResourceFork } from "./resourceFork";

const SCENARIO_ITEM_TABLE_BYTES = AUTHORED_SCENARIO_ITEM_RECORDS * 100;

export type ScenarioCompilerBaselineFile = {
  path: string;
  bytes: Uint8Array;
};

export function createAuthoredScenarioCompilerBaseline(project: Project): ScenarioCompilerBaselineFile[] {
  const shell = project.scenario.shell;
  if (!shell) throw new Error("Authored scenarios require scenario shell metadata.");

  const shellBytes = writeScenarioShell(shell);
  const triggerTables = AUTHORED_TRIGGER_TABLES.map((table) => {
    const levelCount = project.maps.filter((map) => map.levelType === table.levelType).length;
    return {
      path: table.path,
      bytes: new Uint8Array(Math.max(table.minimumLevels, levelCount) * DOOR_LEVEL_RECORD_BYTES)
    };
  });
  return [
    { path: shell.sourceFile.trim() || project.scenario.name, bytes: shellBytes },
    { path: "Scenario", bytes: new Uint8Array(SCENARIO_SUPPORT_FILE_BYTES) },
    { path: "Scenario.rsrc", bytes: writeMinimumScenarioResourceFork() },
    { path: "Data CS", bytes: shellBytes },
    ...triggerTables,
    { path: "Data NI", bytes: new Uint8Array(SCENARIO_ITEM_TABLE_BYTES) },
    { path: "Data Solids", bytes: writeTileSolids(project.tileAttributes) },
    ...AUTHORED_EMPTY_RUNTIME_FILES.map((path) => ({ path, bytes: new Uint8Array() }))
  ];
}

export const AUTHORED_SCENARIO_BASELINE_SIZES = {
  doorLevel: DOOR_LEVEL_RECORD_BYTES,
  scenarioSupport: SCENARIO_SUPPORT_FILE_BYTES,
  scenarioResourceFork: MINIMUM_SCENARIO_RESOURCE_FORK_BYTES,
  scenarioItems: SCENARIO_ITEM_TABLE_BYTES,
  tileSolids: TILE_SOLIDS_BYTES
} as const;
