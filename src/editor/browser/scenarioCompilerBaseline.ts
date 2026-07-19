import type { Project } from "../types";
import { DOOR_LEVEL_RECORD_BYTES, SCENARIO_SUPPORT_FILE_BYTES, writeDoorFile, writeScenarioShell } from "./binaryWriters";
import { writeResourceFork } from "./resourceFork";

const SCENARIO_ITEM_TABLE_BYTES = 200 * 100;
const TILE_SOLIDS_BYTES = 1024;

const EMPTY_RUNTIME_TABLES = [
  "Data DL",
  "Data RDD",
  "Data SD",
  "Data TD2",
  "Data TD3",
  "Data ED",
  "Data ED2",
  "Data MD"
] as const;

export type ScenarioCompilerBaselineFile = {
  path: string;
  bytes: Uint8Array;
};

export function createAuthoredScenarioCompilerBaseline(project: Project): ScenarioCompilerBaselineFile[] {
  const shell = project.scenario.shell;
  if (!shell) throw new Error("Authored scenarios require scenario shell metadata.");

  const landLevelCount = project.maps.filter((map) => map.levelType === "land").length;
  const dungeonLevelCount = project.maps.filter((map) => map.levelType === "dungeon").length;
  const shellBytes = writeScenarioShell(shell);
  return [
    { path: shell.sourceFile.trim() || project.scenario.name, bytes: shellBytes },
    { path: "Scenario", bytes: new Uint8Array(SCENARIO_SUPPORT_FILE_BYTES) },
    { path: "Scenario.rsrc", bytes: writeResourceFork([]) },
    { path: "Data CS", bytes: shellBytes },
    { path: "Data DD", bytes: writeDoorFile(project.triggers, "land", Math.max(1, landLevelCount)) },
    { path: "Data DDD", bytes: writeDoorFile(project.triggers, "dungeon", dungeonLevelCount) },
    { path: "Data NI", bytes: new Uint8Array(SCENARIO_ITEM_TABLE_BYTES) },
    { path: "Data Solids", bytes: new Uint8Array(TILE_SOLIDS_BYTES) },
    ...EMPTY_RUNTIME_TABLES.map((path) => ({ path, bytes: new Uint8Array() }))
  ];
}

export const AUTHORED_SCENARIO_BASELINE_SIZES = {
  doorLevel: DOOR_LEVEL_RECORD_BYTES,
  scenarioSupport: SCENARIO_SUPPORT_FILE_BYTES,
  scenarioItems: SCENARIO_ITEM_TABLE_BYTES,
  tileSolids: TILE_SOLIDS_BYTES
} as const;
