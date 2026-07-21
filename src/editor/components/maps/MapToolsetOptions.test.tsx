import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapSelectionToolOptions } from "./MapSelectionToolOptions";
import { MapToolsetModeNotice } from "./MapToolsetModeNotice";

describe("map toolset options", () => {
  it("shows connected matching only for connected tools", () => {
    const markup = renderToStaticMarkup(
      <MapSelectionToolOptions
        activeTool="wand"
        connectedSelectionMode="semantic-family"
        selectionDrawMode="area"
        selectionShapeFill="filled"
        onSetConnectedSelectionMode={vi.fn()}
        onSetSelectionDrawMode={vi.fn()}
        onSetSelectionShapeFill={vi.fn()}
      />
    );

    expect(markup).toContain("Connected Match");
    expect(markup).toContain('aria-label="Magic Wand connected tile match"');
    expect(markup).not.toContain("Selection Shape");
  });

  it("shows shape fill and additive-selection guidance for shaped selections", () => {
    const markup = renderToStaticMarkup(
      <MapSelectionToolOptions
        activeTool="select"
        connectedSelectionMode="exact"
        selectionDrawMode="rectangle"
        selectionShapeFill="outline"
        onSetConnectedSelectionMode={vi.fn()}
        onSetSelectionDrawMode={vi.fn()}
        onSetSelectionShapeFill={vi.fn()}
      />
    );

    expect(markup).toContain("Selection Shape");
    expect(markup).toContain('aria-label="Selection shape fill"');
    expect(markup).toContain("Shift adds to the current selection; Alt subtracts.");
  });

  it("keeps non-canvas guidance in the toolset mode notice", () => {
    const markup = renderToStaticMarkup(
      <MapToolsetModeNotice mode="land-tiles" onReturnToCanvas={vi.fn()} />
    );

    expect(markup).toContain("Land Tiles mode");
    expect(markup).toContain("Return To Canvas Tools");
  });
});
