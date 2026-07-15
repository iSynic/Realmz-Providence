import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { ItemCatalogWorkbench } from "./ItemCatalogWorkbench";
import { ShopWorkbench } from "./ShopWorkbench";
import { TreasureWorkbench } from "./TreasureWorkbench";

vi.mock("../../ui", async () => {
  const actual = await vi.importActual<typeof import("../../ui")>("../../ui");
  return { ...actual, ScrollArea: ({ children }: { children?: ReactNode }) => children };
});

const noop = vi.fn();
const project = {
  shops: [{ id: 1, inflation: 0, itemIds: new Array(1000).fill(0), quantities: new Array(1000).fill(0) }],
  treasures: [{ id: 1, exp: 0, gold: 0, gems: 0, jewelry: 0, itemIds: new Array(20).fill(0) }]
} as Project;
const commonProps = {
  project,
  catalog: null,
  selectedEntity: null,
  previewContext: {} as never,
  onSelectEntity: noop,
  onApplyCommand: noop
};

describe("Economy search fields", () => {
  it("uses the shared search contract in Items", () => {
    const html = renderToStaticMarkup(createElement(ItemCatalogWorkbench, commonProps));
    expect(html).toContain('aria-label="Search items"');
    expect(html).toContain("0 items");
  });

  it("uses the shared search contract in Shops and Treasure", () => {
    const shopHtml = renderToStaticMarkup(createElement(ShopWorkbench, commonProps));
    const treasureHtml = renderToStaticMarkup(createElement(TreasureWorkbench, commonProps));
    expect(shopHtml).toContain('aria-label="Search shop items"');
    expect(shopHtml).toContain('class="shop-pool-result-count"');
    expect(shopHtml).not.toContain('class="workbench-search-meta"');
    expect(treasureHtml).toContain('aria-label="Search treasure items"');
    expect(shopHtml).toContain("0 items");
    expect(treasureHtml).toContain("0 items");
  });
});
