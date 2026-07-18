import { describe, expect, it } from "vitest";
import { normalizeProjectContract, requiresCompatibilityAnnex, resolvedProjectOrigin } from "./projectOrigin";
import type { Project, ProjectSource } from "./types";

function source(overrides: Partial<ProjectSource> = {}): ProjectSource {
  return {
    sourcePath: "",
    rawSourcesDir: "",
    immutable: false,
    files: [],
    ...overrides
  };
}

describe("project origin", () => {
  it("infers schema-v4 origin from legacy source snapshot signals", () => {
    expect(resolvedProjectOrigin(source())).toBe("authored");
    expect(resolvedProjectOrigin(source({ immutable: true }))).toBe("imported");
    expect(resolvedProjectOrigin(source({ files: [{
      name: "Scenario",
      relativePath: "Scenario",
      bytes: 600,
      sha256: "fixture",
      role: "pass-through",
      editable: false
    }] }))).toBe("imported");
  });

  it("treats explicit origin as authoritative over legacy flags", () => {
    const authored = { source: source({ origin: "authored", immutable: true }) } as Pick<Project, "source">;
    const imported = { source: source({ origin: "imported", immutable: false }) } as Pick<Project, "source">;

    expect(requiresCompatibilityAnnex(authored)).toBe(false);
    expect(requiresCompatibilityAnnex(imported)).toBe(true);
  });

  it("upgrades a legacy project contract in memory", () => {
    const project = {
      schemaVersion: 4,
      source: source({ immutable: true })
    } as Project;

    normalizeProjectContract(project);

    expect(project.schemaVersion).toBe(5);
    expect(project.source.origin).toBe("imported");
  });
});
