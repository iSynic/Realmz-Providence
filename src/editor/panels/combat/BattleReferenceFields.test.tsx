import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { BattleRecord, MessageRecord, TriggerRecord } from "../../types";
import {
  BattleMacroReferenceField,
  BattleRecordReferenceField,
  BattleStringReferenceField,
  battleMacroReferenceOptions,
  battleRecordReferenceOptions,
  battleReferenceRawOption,
  battleStringReferenceOptions
} from "./BattleReferenceFields";

function fixture() {
  const project = createBrowserProject("Battle references");
  project.battles = [
    { id: 2, grid: [0, 7, 0], dist: 4 },
    { id: 5, grid: [8, 9, 0], dist: 12 }
  ] as BattleRecord[];
  project.messages = [
    { id: 12, text: "The drowned bell tolls before battle." },
    { id: 18, text: "The water grows still." }
  ] as MessageRecord[];
  project.triggers = [{
    source: "Data ED3",
    recordIndex: 4,
    actions: [{ slot: 0, rawCode: 1, id: 12 }]
  }] as TriggerRecord[];
  return project;
}

describe("Combat battle reference fields", () => {
  it("builds searchable Battle, String, and Extra Action Point options", () => {
    const project = fixture();
    const battles = battleRecordReferenceOptions(project.battles);
    const strings = battleStringReferenceOptions(project);
    const macros = battleMacroReferenceOptions(project);

    expect(battles.map((option) => option.value)).toEqual([2, 5]);
    expect(battles[1]?.detail).toContain("2 occupied cells");
    expect(strings[0]?.searchText).toContain("drowned bell");
    expect(macros[0]?.detail).toBe("1 action step");
    expect(battleReferenceRawOption("77", strings, "String", "Missing")?.value).toBe(77);
    expect(battleReferenceRawOption("12", strings, "String", "Missing")).toBeNull();
  });

  it("renders shared compact pickers instead of Battle numeric pagers", () => {
    const project = fixture();
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(BattleRecordReferenceField, {
        battles: project.battles,
        value: 2,
        onChange
      }),
      createElement(BattleStringReferenceField, {
        project,
        label: "Before String",
        value: 12,
        onCommit: onChange,
        onSelectEntity: vi.fn()
      }),
      createElement(BattleMacroReferenceField, {
        project,
        value: -4,
        onCommit: onChange,
        onSelectEntity: vi.fn()
      })
    ));

    expect(html).toContain('aria-label="Search battle records"');
    expect(html).toContain('aria-label="Search before string"');
    expect(html).toContain('aria-label="Search battle macro"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Next Battle"');
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain("combat-pager-row");
  });

  it("keeps missing imported string and macro IDs visible", () => {
    const project = fixture();
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(BattleStringReferenceField, {
        project,
        label: "After String",
        value: 77,
        onCommit: vi.fn(),
        onSelectEntity: vi.fn(),
        onCreate: vi.fn()
      }),
      createElement(BattleMacroReferenceField, {
        project,
        value: 91,
        onCommit: vi.fn(),
        onSelectEntity: vi.fn()
      })
    ));

    expect(html).toContain("String 77");
    expect(html).toContain("Extra Action Point 91");
    expect(html).toContain("Positive Battle Macro values are preserved");
  });
});
