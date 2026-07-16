import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField, FormGrid } from "./FormField";
import { PanelHeader } from "./WorkbenchPrimitives";

describe("Workbench primitives", () => {
  it("keeps pane copy, metadata, and actions in stable regions", () => {
    const markup = renderToStaticMarkup(
      <PanelHeader
        leading={<span>Icon</span>}
        eyebrow="Collection"
        title="Item Pool"
        description="Next open slot 4"
        meta="199 items"
        actions={<button type="button">Clear</button>}
      />
    );

    expect(markup).toContain("workbench-pane-header-copy");
    expect(markup).toContain("workbench-pane-header-main");
    expect(markup).toContain("workbench-pane-header-leading");
    expect(markup).toContain("workbench-pane-header-meta");
    expect(markup).toContain("workbench-pane-header-aside");
    expect(markup).toContain("has-actions");
    expect(markup).toContain("199 items");
  });

  it("can own a semantic workbench heading", () => {
    const markup = renderToStaticMarkup(
      <PanelHeader
        headingLevel={1}
        title="Rules"
        description="Scenario rule records"
        meta="Current project"
      />
    );

    expect(markup).toContain("<h1>Rules</h1>");
    expect(markup).toContain("Scenario rule records");
  });

  it("provides stable compact form layout and hint regions", () => {
    const markup = renderToStaticMarkup(
      <FormGrid columns={2}>
        <FormField label="Scenario Name" hint="Used by Realmz.">
          <input defaultValue="Test Scenario" />
        </FormField>
        <FormField label="Description" wide>
          <textarea defaultValue="Description" />
        </FormField>
      </FormGrid>
    );

    expect(markup).toContain("workbench-form-grid columns-2");
    expect(markup).toContain("workbench-form-field-label");
    expect(markup).toContain("workbench-form-field is-wide");
    expect(markup).toContain("Used by Realmz.");
  });
});
