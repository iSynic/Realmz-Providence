import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import { ScenarioPanel } from "./ScenarioPanel";

describe("ScenarioPanel", () => {
  it("keeps the authoring surface compact without readiness or technical drawers", () => {
    const project = createBrowserProject("Scenario presentation");
    const markup = renderToStaticMarkup(
      <ScenarioPanel
        project={project}
        onApplyCommand={() => undefined}
        onSelectMap={() => undefined}
        onOpenTool={() => undefined}
      />
    );

    expect(markup).toContain("workbench-form-grid columns-2");
    expect(markup).toContain("workbench-form-field-label");
    expect(markup).not.toContain("Load Readiness");
    expect(markup).not.toContain("Technical Details");
    expect(markup).not.toContain("workbench-validation-gate");
    expect(markup).not.toContain("workbench-collapsible-section");
    expect(markup).not.toContain("scenario-checklist");
    expect(markup).not.toContain("scenario-form-grid");
    expect(markup).not.toContain("Verified evidence and source-ported candidate formulas");
    expect(markup).not.toContain("Verified codes match known official evidence");
  });

  it("assigns Divinity global macros without exposing unproven Global slots", () => {
    const project = createBrowserProject("Scenario hooks");
    const markup = renderToStaticMarkup(
      <ScenarioPanel
        project={project}
        onApplyCommand={() => undefined}
        onSelectMap={() => undefined}
        onOpenTool={() => undefined}
      />
    );

    expect(markup).toContain("Related Editors");
    expect(markup).toContain("Global Macros");
    expect(markup).toContain("Automatic triggers assigned to Extra Action Points");
    expect(markup).toContain("Open Assigned Scripts");
    expect(markup).toContain("Start X-AP");
    expect(markup).toContain("Shop X-AP");
    expect(markup).not.toContain("global-macro:0");
    expect(markup).toContain("workbench-reference-compact-trigger");
    expect(markup.match(/workbench-reference-compact-trigger/g)).toHaveLength(5);
    expect(markup).not.toContain("Divinity Scenario Hub");
    expect(markup).not.toContain("Create Startup Test Macro");
    expect(markup).not.toContain("Reserved slot kept intact");
    expect(markup).not.toContain("seven Divinity-visible slots");
    expect(markup).not.toContain("A value of 0 means no macro");
    expect(markup.indexOf('id="scenario-contact"')).toBeLessThan(markup.indexOf('id="scenario-global-macros"'));
    expect(markup.indexOf('id="scenario-global-macros"')).toBeLessThan(markup.indexOf('id="scenario-restrictions"'));
  });

  it("offers only stock Realmz races and castes as exclusions", () => {
    const project = createBrowserProject("Scenario restrictions");
    project.scenario.restrictions = {
      description: "",
      maxPartyCharacters: 6,
      maxPartyLevel: 0,
      bannedRaces: [1, 30],
      bannedCastes: [2, 29],
      authored: true
    };
    const markup = renderToStaticMarkup(
      <ScenarioPanel
        project={project}
        onApplyCommand={() => undefined}
        onSelectMap={() => undefined}
        onOpenTool={() => undefined}
      />
    );

    expect(markup).toContain("Cathoon");
    expect(markup).toContain("Minstrel");
    expect(markup).not.toContain("Race 20");
    expect(markup).not.toContain("Caste 21");
    expect(markup.match(/type="checkbox"/g)).toHaveLength(39);
  });
});
