import type { ScenarioSeedProjectOptions, ScenarioSeedProjectResult } from "./scenarioSeed/contracts";
import { parseScenarioSeed } from "./scenarioSeed/parser";
import { compileScenarioSeedProject } from "./scenarioSeed/projectCompiler";

export * from "./scenarioSeed/contracts";
export { parseScenarioSeed };

export function createProjectFromScenarioSeed(
  input: unknown,
  options: ScenarioSeedProjectOptions = {}
): ScenarioSeedProjectResult {
  const parsed = parseScenarioSeed(input);
  if (!parsed.ok) {
    return {
      ...parsed,
      diagnostics: parsed.errors.map((message) => ({ severity: "error", code: "parse-error", message }))
    };
  }
  return compileScenarioSeedProject(parsed.seed, options, parsed.warnings);
}
