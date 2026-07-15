import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filterReferencePickerOptions } from "../../ui";
import {
  BattleReferenceRepairDialog,
  battleReferenceReplacementCandidates,
  battleRepairReplacementOptions,
  type BattleReferenceReplacement
} from "./BattleReferenceRepairDialog";

const replacements: BattleReferenceReplacement[] = [
  {
    id: 7,
    label: "Drowned Keeper",
    detail: "Normal, Monster | HD 8, armor 35, agility 14, icon 421"
  },
  {
    id: 12,
    label: "Bell Warden",
    detail: "Normal, Mega | HD 12, armor 48, agility 16, icon 455"
  }
];

describe("BattleReferenceRepairDialog", () => {
  it("describes replacement candidates with names, stats, and set availability", () => {
    const candidates = battleReferenceReplacementCandidates([{
      id: 7,
      active: { id: 7, displayName: "Drowned Keeper", hitDice: 8, armor: 35, agility: 14, iconId: 421 },
      fallback: null,
      normal: { id: 7 },
      monster: { id: 7 },
      mega: null
    }] as Parameters<typeof battleReferenceReplacementCandidates>[0]);

    expect(candidates).toEqual([{
      id: 7,
      label: "Drowned Keeper",
      detail: "Normal, Monster | HD 8, armor 35, agility 14, icon 421"
    }]);
  });

  it("builds replacement search text from names, stats, and set availability", () => {
    const options = battleRepairReplacementOptions(replacements);

    expect(filterReferencePickerOptions(options, "keeper armor 35").map((option) => option.value)).toEqual([7]);
    expect(filterReferencePickerOptions(options, "mega warden").map((option) => option.value)).toEqual([12]);
  });

  it("renders the shared replacement picker instead of a long native select", () => {
    const html = renderToStaticMarkup(createElement(BattleReferenceRepairDialog, {
      action: { kind: "clear", monsterId: 4, setId: 0 },
      references: [{ battleId: 2, slot: 6, row: 1, col: 2, monsterId: 4, rawValue: 4, forcedFriendly: false }],
      replacements,
      onCancel: vi.fn(),
      onClearOnly: vi.fn(),
      onClearPlacements: vi.fn(),
      onReplacePlacements: vi.fn(),
      onSwitchRecordsOnly: vi.fn(),
      onSwitchAndSwapCells: vi.fn()
    }));

    expect(html).toContain('aria-label="Search replacement monster"');
    expect(html).toContain("Drowned Keeper (7)");
    expect(html).toContain("Normal, Monster");
    expect(html).not.toContain("<select");
  });
});
