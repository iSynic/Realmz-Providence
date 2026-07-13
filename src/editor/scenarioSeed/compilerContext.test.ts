import { describe, expect, it } from "vitest";
import type { LibraryCatalog } from "../types";
import { createScenarioSeedCompilerContext } from "./compilerContext";

describe("scenario seed compiler context", () => {
  it("creates isolated allocation state for each compilation", () => {
    const first = createScenarioSeedCompilerContext("blank");
    const second = createScenarioSeedCompilerContext("template:castle");

    first.messages.set("intro", 4);
    first.allocations.messages.push({ key: "intro", id: 4, explicit: true });

    expect(second.messages.size).toBe(0);
    expect(second.allocations.messages).toEqual([]);
    expect(first.allocations.baseTemplate).toBe("blank");
    expect(second.allocations.baseTemplate).toBe("template:castle");
  });

  it("retains the catalog dependency without populating domain maps", () => {
    const catalog = { metadata: { source: "test" } } as unknown as LibraryCatalog;
    const context = createScenarioSeedCompilerContext("blank", catalog);

    expect(context.libraryCatalog).toBe(catalog);
    expect(context.diagnostics).toEqual([]);
    expect(context.maps.size).toBe(0);
    expect(context.actionPointTargets.size).toBe(0);
  });
});
