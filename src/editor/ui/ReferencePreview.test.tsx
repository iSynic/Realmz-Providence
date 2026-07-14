import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferencePreview, type ReferencePreviewRendererRegistry } from "./ReferencePreview";

describe("ReferencePreview", () => {
  it("renders shared text preview structure and metadata", () => {
    const html = renderToStaticMarkup(
      <ReferencePreview preview={{
        key: "message:12",
        kind: "text",
        title: "String 12",
        detail: "Imported",
        text: "The passage leads to the surface."
      }} />
    );

    expect(html).toContain("data-reference-preview-key=\"message:12\"");
    expect(html).toContain("data-reference-preview-kind=\"text\"");
    expect(html).toContain("The passage leads to the surface.");
  });

  it("uses an explicit missing state", () => {
    const html = renderToStaticMarkup(
      <ReferencePreview preview={{
        key: "battle:99",
        kind: "missing",
        title: "Battle 99 is missing",
        body: "Choose an existing battle.",
        state: "missing"
      }} />
    );

    expect(html).toContain("is-missing");
    expect(html).toContain("Battle 99 is missing");
  });

  it("allows domain renderers to replace a built-in renderer", () => {
    const renderers: ReferencePreviewRendererRegistry = {
      summary: (preview) => <output>Domain preview: {preview.summary}</output>
    };
    const html = renderToStaticMarkup(
      <ReferencePreview
        renderers={renderers}
        preview={{ key: "treasure:4", kind: "summary", title: "Treasure 4", summary: "3 items" }}
      />
    );

    expect(html).toContain("Domain preview: 3 items");
  });
});
