import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MonsterLibraryList } from "./MonsterLibraryList";
import { ScenarioMonsterList } from "./ScenarioMonsterList";

const noop = vi.fn();

describe("Combat list search fields", () => {
  it("uses the shared searchable result contract for Monster Library", () => {
    const html = renderToStaticMarkup(createElement(MonsterLibraryList, {
      entries: [],
      query: "dragon",
      scope: "all",
      scopeCounts: { all: 0, builtIn: 0, custom: 0 },
      selectedId: null,
      selectedIds: [],
      selectionActive: false,
      populateMenuOpen: false,
      dropActive: false,
      hasCustomEntries: false,
      onQuery: noop,
      onScopeChange: noop,
      onTogglePopulateMenu: noop,
      onPopulateStock: noop,
      onPopulateVisible: noop,
      onPopulateCustom: noop,
      onSelect: noop,
      onDragStart: noop,
      onDragEnd: noop,
      onDragOver: noop,
      onDragEnter: noop,
      onDragLeave: noop,
      onDrop: noop,
      isCustom: () => false,
      entryName: () => "Monster",
      entryFacts: () => "",
      renderIcon: () => null
    }));

    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Search monster library"');
    expect(html).toContain("0 monsters");
    expect(html).toContain("Clear search monster library");
  });

  it("uses the same contract for Scenario Monsters", () => {
    const html = renderToStaticMarkup(createElement(ScenarioMonsterList, {
      entries: [],
      query: "undead",
      activeSetId: 0,
      selectedId: null,
      selectionActive: false,
      nextMonsterId: 1,
      dropActive: false,
      iconEntries: {},
      project: {} as never,
      lookups: {} as never,
      previewContext: {} as never,
      onQuery: noop,
      onCreate: noop,
      onSelect: noop,
      onDragStart: noop,
      onDragEnd: noop,
      onDragOver: noop,
      onDragEnter: noop,
      onDragLeave: noop,
      onDrop: noop
    }));

    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Search scenario monsters"');
    expect(html).toContain("0 monsters");
    expect(html).toContain("Clear search scenario monsters");
  });
});
