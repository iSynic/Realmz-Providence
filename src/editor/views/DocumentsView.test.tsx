import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentsView } from "./DocumentsView";

describe("DocumentsView", () => {
  it("keeps one current chapter in the desktop navigation tab order", () => {
    const markup = renderToStaticMarkup(<DocumentsView onClose={() => undefined} />);

    expect(markup).toContain('<nav class="documents-nav" aria-label="Manual chapters">');
    expect(markup.match(/data-document-topic="[^"]+"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/data-document-topic="[^"]+"[^>]*aria-current="page" tabindex="0"/);
  });

  it("provides a compact chapter selector without duplicating the search field", () => {
    const markup = renderToStaticMarkup(<DocumentsView onClose={() => undefined} />);

    expect(markup).toContain('class="documents-compact-topic-picker"');
    expect(markup).toContain('aria-label="Current manual chapter"');
    expect(markup.match(/aria-label="Search manual"/g)).toHaveLength(1);
  });
});
