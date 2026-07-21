import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapPaintProtectionSummary } from "./MapPaintProtectionSummary";

describe("map paint protection control", () => {
  it("renders a compact titled checkbox without operation details", () => {
    const markup = renderToStaticMarkup(
      <MapPaintProtectionSummary enabled onSetEnabled={vi.fn()} />
    );

    expect(markup).toContain('aria-label="Map painting safeguards"');
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain("<strong>Protect Features</strong>");
    expect(markup).not.toContain("will change");
    expect(markup).not.toContain("Original tiles");
  });
});
