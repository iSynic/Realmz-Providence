import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filterReferencePickerOptions } from "../../ui";
import type { MonsterRecord } from "../../types";
import {
  BattleMonsterSelect,
  battleMonsterSelectOptions
} from "./BattleMonsterReferenceField";

const monsters = [
  {
    id: 0,
    displayName: "Unused Zero",
    hitDice: 0,
    armor: 0,
    agility: 0,
    iconId: 0
  },
  {
    id: 12,
    displayName: "Bell Warden",
    hitDice: 12,
    armor: 48,
    agility: 16,
    iconId: 455
  }
] as MonsterRecord[];

describe("BattleMonsterSelect", () => {
  it("builds searchable placeable-monster options without Monster 0", () => {
    const options = battleMonsterSelectOptions(monsters, 0);

    expect(options.map((option) => option.value)).toEqual([12]);
    expect(filterReferencePickerOptions(options, "warden armor 48 icon 455").map((option) => option.value)).toEqual([12]);
  });

  it("uses the shared compact reference picker for the selected anchor cell", () => {
    const html = renderToStaticMarkup(createElement(BattleMonsterSelect, {
      monsters,
      setId: 0,
      value: 12,
      onCommit: vi.fn()
    }));

    expect(html).toContain('aria-label="Search anchor cell monster"');
    expect(html).toContain("Bell Warden (12)");
    expect(html).not.toContain("<select");
  });

  it("keeps a missing imported placement explicit", () => {
    const html = renderToStaticMarkup(createElement(BattleMonsterSelect, {
      monsters,
      setId: -1,
      value: 99,
      onCommit: vi.fn()
    }));

    expect(html).toContain("Mega Monster 99");
    expect(html).toContain("is-unresolved");
  });
});
