import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { LibraryAsset, MonsterRecord } from "../../types";
import { buildCombatLookups } from "./combatLookups";
import { MONSTER_ICON_PAIR_OFFSET, monsterIconPickerOptions } from "./iconSetModel";
import { MonsterIconControl, monsterIconReferenceOptions } from "./MonsterIconControl";

function asset(resourceId: number): LibraryAsset {
  return {
    id: `asset:${resourceId}`,
    type: "icon",
    label: resourceId === 400 ? "Drowned Captain" : `Icon ${resourceId}`,
    source: "realmz-reference:actor-icons",
    relativePath: `realmz-reference/cicn/${resourceId}`,
    bytes: 1,
    sha256: `icon-${resourceId}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,${resourceId}`,
    mimeType: "image/png"
  };
}

function fixture() {
  const project = createBrowserProject("Monster icon picker");
  const monster = { id: 4, iconId: 400, displayName: "Drowned Captain" } as MonsterRecord;
  project.monsters = [monster];
  const catalog = {
    assets: [asset(400), asset(400 + MONSTER_ICON_PAIR_OFFSET)]
  } as never;
  return { project, monster, lookups: buildCombatLookups(project, catalog) };
}

describe("Combat monster icon control", () => {
  it("adapts complete target pairs to shared searchable reference rows", () => {
    const { project, lookups } = fixture();
    const targets = monsterIconPickerOptions(project, lookups);
    const options = monsterIconReferenceOptions(targets, {} as never);

    expect(options).toHaveLength(1);
    expect(options[0]?.value).toBe(400);
    expect(options[0]?.detail).toContain("Default art");
    expect(options[0]?.searchText).toContain("Drowned Captain");
    expect(options[0]?.preview?.kind).toBe("custom");
  });

  it("renders the shared compact picker trigger and no bespoke modal shell", () => {
    const { project, monster, lookups } = fixture();
    const html = renderToStaticMarkup(createElement(MonsterIconControl, {
      monster,
      iconEntries: {},
      project,
      lookups,
      previewContext: {} as never,
      onCommit: vi.fn(),
      onOpenIconSet: vi.fn()
    }));

    expect(html).toContain('aria-label="Search monster icon"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Icon 400");
    expect(html).not.toContain("monster-icon-picker-backdrop");
    expect(html).not.toContain("Choose Monster Icon");
  });
});
