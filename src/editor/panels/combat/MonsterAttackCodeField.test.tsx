import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filterReferencePickerOptions } from "../../ui";
import { MONSTER_ATTACK_SPECIAL_OPTIONS } from "./monsterReferenceModel";
import {
  MonsterAttackCodePicker,
  monsterAttackCodePickerOptions
} from "./MonsterAttackCodeField";

describe("MonsterAttackCodePicker", () => {
  it("builds searchable attack-code options", () => {
    const options = monsterAttackCodePickerOptions(MONSTER_ATTACK_SPECIAL_OPTIONS, "special attack");

    expect(filterReferencePickerOptions(options, "13 electric").map((option) => option.value)).toEqual([13]);
    expect(filterReferencePickerOptions(options, "drain experience").map((option) => option.value)).toEqual([9]);
  });

  it("uses the shared compact picker for known codes", () => {
    const html = renderToStaticMarkup(createElement(MonsterAttackCodePicker, {
      label: "Special",
      contextLabel: "Attack 1 Special",
      value: 11,
      options: MONSTER_ATTACK_SPECIAL_OPTIONS,
      onCommit: vi.fn()
    }));

    expect(html).toContain('aria-label="Search attack 1 special"');
    expect(html).toContain("11: Fire Damage");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("keeps unusual imported codes explicit", () => {
    const html = renderToStaticMarkup(createElement(MonsterAttackCodePicker, {
      label: "Special",
      contextLabel: "Attack 2 Special",
      value: 91,
      options: MONSTER_ATTACK_SPECIAL_OPTIONS,
      onCommit: vi.fn()
    }));

    expect(html).toContain("Current value 91");
    expect(html).toContain("is-unresolved");
  });
});
