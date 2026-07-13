import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseCaste, parseRace, parseSpell } from "./rulesParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed rules parsers", () => {
  it("normalizes authored spell fields", () => {
    const ctx = context();

    expect(parseSpell({
      key: "cold-flame",
      id: 4,
      displayName: "Cold Flame",
      inCombat: true,
      cost: 7,
      spellClass: 2
    }, "$.spells[0]", ctx)).toEqual({
      key: "cold-flame",
      id: 4,
      displayName: "Cold Flame",
      inCombat: true,
      cost: 7,
      spellClass: 2
    });
    expect(ctx.errors).toEqual([]);
  });

  it("retains race data while reporting range and matrix diagnostics", () => {
    const ctx = context();
    const race = parseRace({
      id: 70,
      displayName: "Island Wight",
      plusMinusToHit: [1, 2],
      ageRange: [[1, 2], [3]],
      unknown: true
    }, "$.races[0]", ctx);

    expect(race).toMatchObject({ id: 70, displayName: "Island Wight", plusMinusToHit: [1, 2] });
    expect(ctx.errors).toEqual([
      "$.races[0].unknown is not a supported scenario seed field.",
      "$.races[0].id must be less than or equal to 69.",
      "$.races[0].plusMinusToHit must contain exactly 8 entries.",
      "$.races[0].ageRange[1] must contain exactly 2 entries.",
      "$.races[0].ageRange must contain exactly 5 rows."
    ]);
  });

  it("accepts keyed caste item references and enforces the fixed slot count", () => {
    const ctx = context();

    expect(parseCaste({
      key: "bell-keeper",
      id: 2,
      startItems: ["beacon-lens", 801],
      moveBonus: 1
    }, "$.castes[0]", ctx)).toMatchObject({
      key: "bell-keeper",
      id: 2,
      startItems: ["beacon-lens", 801],
      moveBonus: 1
    });
    expect(ctx.errors).toEqual([
      "$.castes[0].startItems must contain exactly 20 entries."
    ]);
  });
});
