import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapInspectorCollapsedRail, MapInspectorSwitcher } from "./MapInspectorSwitcher";

describe("map inspector navigation", () => {
  it("keeps unavailable selection routes visible but disabled", () => {
    const markup = renderToStaticMarkup(
      <MapInspectorSwitcher
        value="setup"
        hasSelection={false}
        hasDungeonDraw={false}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Choose right sidebar inspector"');
    expect(markup).toContain('<option value="dungeon-draw" disabled="">Dungeon Draw</option>');
    expect(markup).toContain('<option value="selection" disabled="">Selection Inspector</option>');
  });

  it("preserves the compact collapsed inspector affordance", () => {
    const markup = renderToStaticMarkup(
      <MapInspectorCollapsedRail label="Paint" onOpen={vi.fn()} />
    );

    expect(markup).toContain('class="map-context-rail"');
    expect(markup).toContain(">Paint</button>");
  });
});
