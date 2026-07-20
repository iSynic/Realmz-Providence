import type { Project, ScenarioTarget } from "../types";
import { AUTHORED_RUNTIME_BASELINE_FILES, AUTHORED_SCENARIO_ITEM_RECORDS, AUTHORED_STARTUP_FILES, AUTHORED_TRIGGER_TABLES } from "../generated/realmzNativeManifestPolicy";
import { DOOR_LEVEL_RECORD_BYTES, ITEM_RECORD_BYTES, SCENARIO_SUPPORT_FILE_BYTES, TILE_SOLIDS_BYTES, writeScenarioShell, writeTileSolids } from "./binaryWriters";
import { MINIMUM_SCENARIO_RESOURCE_FORK_BYTES, writeMinimumScenarioResourceFork } from "./resourceFork";

const SCENARIO_ITEM_TABLE_BYTES = AUTHORED_SCENARIO_ITEM_RECORDS * ITEM_RECORD_BYTES;

export type ScenarioCompilerBaselineFile = {
  path: string;
  bytes: Uint8Array;
};

export function createAuthoredScenarioCompilerBaseline(project: Project, target: ScenarioTarget): ScenarioCompilerBaselineFile[] {
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
    { path: AUTHORED_STARTUP_FILES.scenarioSupport, bytes: new Uint8Array(SCENARIO_SUPPORT_FILE_BYTES) },
    { path: AUTHORED_STARTUP_FILES.resourceForkByTarget[target], bytes: writeMinimumScenarioResourceFork() },
    { path: AUTHORED_STARTUP_FILES.securityBackup, bytes: shellBytes },
    ...triggerTables,
    { path: AUTHORED_STARTUP_FILES.scenarioItems, bytes: new Uint8Array(SCENARIO_ITEM_TABLE_BYTES) },
    { path: AUTHORED_STARTUP_FILES.tileSolids, bytes: writeTileSolids(project.tileAttributes) },
    ...AUTHORED_RUNTIME_BASELINE_FILES.map((file) => ({ path: file.path, bytes: new Uint8Array() }))
  ];
}

export const AUTHORED_SCENARIO_BASELINE_SIZES = {
  doorLevel: DOOR_LEVEL_RECORD_BYTES,
  scenarioSupport: SCENARIO_SUPPORT_FILE_BYTES,
  scenarioResourceFork: MINIMUM_SCENARIO_RESOURCE_FORK_BYTES,
  scenarioItems: SCENARIO_ITEM_TABLE_BYTES,
  tileSolids: TILE_SOLIDS_BYTES
} as const;
