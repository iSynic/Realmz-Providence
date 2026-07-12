import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { locationKindValue, timedEncounterEligibilitySummary } from "./TimedEncounterShell";

describe("timed encounter helpers", () => {
  it("encodes the confirmed location-kind values", () => {
    expect(locationKindValue("any")).toBe(-1);
    expect(locationKindValue("land")).toBe(1);
    expect(locationKindValue("dungeon")).toBe(2);
  });

  it("summarizes schedule, gates, location, and Extra AP target", () => {
    const record = {
      day: 4,
      increment: 2,
      percent: 75,
      locationKind: "land",
      requiredLevel: 3,
      requiredItem: 900,
      requiredQuest: 12,
      requiredRandomRect: 5,
      requiredX: 20,
      requiredY: 30,
      door: 8
    } as Project["timedEncounters"][number];

    expect(timedEncounterEligibilitySummary(record)).toBe(
      "checked at midnight starting day 4, increment 2; 75% chance; on land level 3; requires item 900; requires quest flag 12; inside random rectangle 5; near 20,30; runs Extra Action Point 8."
    );
  });
});
