import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapCanvasEmptyState } from "./MapCanvasEmptyState";

describe("map canvas empty state", () => {
  it("offers both map families for an open project", () => {
    const markup = renderToStaticMarkup(<MapCanvasEmptyState hasProject onCreateMap={vi.fn()} />);

    expect(markup).toContain("Create your first map");
    expect(markup).toContain("New Land Map");
    expect(markup).toContain("New Dungeon Map");
  });

  it("does not expose creation actions without a project", () => {
    const markup = renderToStaticMarkup(<MapCanvasEmptyState hasProject={false} onCreateMap={vi.fn()} />);

    expect(markup).toContain("Open a project to begin mapping");
    expect(markup).not.toContain("New Land Map");
  });
});
