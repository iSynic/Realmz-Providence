import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import { ScenarioPanel } from "./ScenarioPanel";

describe("ScenarioPanel", () => {
  it("uses shared readiness and technical evidence presentation", () => {
    const project = createBrowserProject("Scenario presentation");
    const markup = renderToStaticMarkup(
      <ScenarioPanel
        project={project}
        onApplyCommand={() => undefined}
        onSelectMap={() => undefined}
        onOpenTool={() => undefined}
      />
    );

    expect(markup).toContain("workbench-validation-gate");
    expect(markup).toContain("Realmz startup package");
    expect(markup).toContain("workbench-collapsible-section");
    expect(markup).toContain("is-collapsed scenario-evidence");
    expect(markup).toContain("Missing Data DD, Data LD, Data RD.");
    expect(markup).not.toContain("scenario-checklist");
    expect(markup).not.toContain("<details class=\"scenario-evidence\"");
  });
});
