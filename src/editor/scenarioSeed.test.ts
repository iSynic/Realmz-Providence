import { describe, expect, it } from "vitest";
import { mapTileIndex } from "./map/geometry";
import { createProjectFromScenarioSeed, parseScenarioSeed } from "./scenarioSeed";

describe("scenario seed parsing", () => {
  it("rejects unknown root properties instead of silently dropping prompt output", () => {
    const result = parseScenarioSeed({
      schemaVersion: 1,
      scenario: { name: "Invalid Seed" },
      unsupportedRecords: []
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("unsupportedRecords");
  });
});

describe("scenario seed compilation", () => {
  it("allocates keyed records and resolves encounter responses deterministically", () => {
    const result = createProjectFromScenarioSeed({
      schemaVersion: 1,
      scenario: { name: "Guardrail Seed" },
      messages: [
        { key: "prompt", text: "A bronze lens fits the empty socket." },
        { key: "opened", text: "The sealed door opens." }
      ],
      items: [{ key: "lens", itemId: 901, identifiedName: "Bronze Lens" }],
      complexEncounters: [{
        key: "sealed-door",
        prompt: "prompt",
        items: [{ item: "lens", result: 2 }],
        results: [{ result: 2, steps: [{ kind: "message", message: "opened" }] }]
      }]
    }, { now: "2026-01-01T00:00:00.000Z" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.allocations.messages).toEqual([
      { key: "prompt", id: 0, explicit: false },
      { key: "opened", id: 1, explicit: false }
    ]);
    expect(result.allocations.complexEncounters).toEqual([
      { key: "sealed-door", id: 0, explicit: false }
    ]);
    expect(result.project.complexEncounters[0]?.prompt).toBe(0);
    expect(result.project.complexEncounters[0]?.itemIds[0]).toBe(901);
    expect(result.project.complexEncounters[0]?.itemResults[0]).toBe(2);
    expect(result.project.complexEncounters[0]?.actions[0]).toMatchObject({ slot: 8, rawCode: 1, id: 1 });
  });

  it("compiles semantic roads into topology-correct endpoint and straight tiles", () => {
    const result = createProjectFromScenarioSeed({
      schemaVersion: 1,
      scenario: { name: "Road Seed" },
      maps: [{
        key: "field",
        levelType: "land",
        index: 0,
        landlook: 0,
        fillTile: 156,
        operations: [{
          kind: "semanticRoad",
          paths: [[{ x: 10, y: 10 }, { x: 12, y: 10 }]]
        }]
      }]
    }, { now: "2026-01-01T00:00:00.000Z" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const map = result.project.maps[0];
    const tileAt = (x: number, y: number) => map.tiles[mapTileIndex(map, x, y)];
    expect([tileAt(10, 10), tileAt(11, 10), tileAt(12, 10)]).toEqual([143, 132, 145]);
  });
});
