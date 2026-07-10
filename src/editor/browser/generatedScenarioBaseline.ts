import type { Project, SourceFile } from "../types";
import {
  DOOR_LEVEL_RECORD_BYTES,
  writeDoorFile,
  writeScenarioShell
} from "./binaryWriters";
import type { BrowserRawSourceFile, BrowserRawSourceSnapshot } from "./fsAccess";
import { sha256Hex } from "./fsAccess";
import { validateBrowserProject } from "./project";
import { writeResourceFork } from "./resourceFork";

const SCENARIO_SUPPORT_BYTES = 600;
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

export async function attachGeneratedScenarioBaseline(
  project: Project,
  capturedAt = new Date().toISOString()
): Promise<{ project: Project; rawSources: BrowserRawSourceSnapshot }> {
  const shell = project.scenario.shell;
  if (!shell) throw new Error("Generated scenarios require scenario shell metadata.");

  const landLevelCount = project.maps.filter((map) => map.levelType === "land").length;
  const dungeonLevelCount = project.maps.filter((map) => map.levelType === "dungeon").length;
  const shellBytes = writeScenarioShell(shell);
  const entries: Array<{ name: string; bytes: Uint8Array; role: string; editable: boolean }> = [
    { name: shell.sourceFile.trim() || project.scenario.name, bytes: shellBytes, role: "supported-binary", editable: true },
    { name: "Scenario", bytes: new Uint8Array(SCENARIO_SUPPORT_BYTES), role: "pass-through", editable: false },
    { name: "Scenario.rsrc", bytes: writeResourceFork([]), role: "resource-fork", editable: false },
    { name: "Data CS", bytes: shellBytes, role: "supported-binary", editable: true },
    {
      name: "Data DD",
      bytes: writeDoorFile(project.triggers, "land", Math.max(1, landLevelCount)),
      role: "supported-binary",
      editable: true
    },
    {
      name: "Data DDD",
      bytes: writeDoorFile(project.triggers, "dungeon", dungeonLevelCount),
      role: "supported-binary",
      editable: true
    },
    { name: "Data NI", bytes: new Uint8Array(SCENARIO_ITEM_TABLE_BYTES), role: "supported-binary", editable: true },
    { name: "Data Solids", bytes: new Uint8Array(TILE_SOLIDS_BYTES), role: "supported-binary", editable: true }
  ];

  for (const name of EMPTY_RUNTIME_TABLES) {
    entries.push({ name, bytes: new Uint8Array(), role: "supported-binary", editable: true });
  }

  const files: BrowserRawSourceFile[] = [];
  for (const entry of entries) {
    files.push({
      name: entry.name,
      relativePath: entry.name,
      originalRelativePath: entry.name,
      bytes: entry.bytes.byteLength,
      sha256: await sha256Hex(entry.bytes),
      role: entry.role,
      editable: entry.editable,
      bytesData: entry.bytes,
      targetPlatform: "windows-realmz",
      captureConfidence: "derived"
    });
  }
  files.sort((left, right) => left.name.localeCompare(right.name));

  const sourceFiles: SourceFile[] = files.map((file) => ({
    name: file.name,
    relativePath: file.relativePath,
    bytes: file.bytes,
    sha256: file.sha256,
    role: file.role,
    editable: file.editable
  }));
  let updatedProject: Project = {
    ...project,
    source: {
      ...project.source,
      sourcePath: project.source.sourcePath || `generated://${project.scenario.name}`,
      rawSourcesDir: "generated-runtime",
      immutable: false,
      files: sourceFiles
    }
  };
  updatedProject = { ...updatedProject, validation: validateBrowserProject(updatedProject) };
  return {
    project: updatedProject,
    rawSources: {
      schemaVersion: 1,
      sourceKind: "generated-scenario-baseline",
      capturedAt,
      rootName: project.scenario.name,
      targetPlatform: "windows-realmz",
      totalBytes: files.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
      files
    }
  };
}

export const GENERATED_SCENARIO_BASELINE_SIZES = {
  doorLevel: DOOR_LEVEL_RECORD_BYTES,
  scenarioSupport: SCENARIO_SUPPORT_BYTES,
  scenarioItems: SCENARIO_ITEM_TABLE_BYTES,
  tileSolids: TILE_SOLIDS_BYTES
} as const;
