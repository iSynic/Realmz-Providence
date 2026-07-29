import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import { DomainRail } from "./DomainRail";

describe("DomainRail", () => {
  it("presents one current domain in the vertical roving focus order", () => {
    const markup = renderToStaticMarkup(
      <DomainRail
        activeDomain="linter"
        project={null}
        catalog={null}
        activeWorkbench="project"
        issueCount={3}
        onSelectDomain={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Providence domains"');
    expect(markup).toMatch(/aria-current="page" tabindex="0"[^>]*>[^]*Linter/);
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Land &amp; Dungeon");
    expect(markup).toContain("rail-group-world domain-maps");
    expect(markup).toContain("rail-group-world domain-player-maps");
    expect(markup).toContain("rail-group-story domain-scripts");
    expect(markup).toContain("rail-group-release domain-linter active");
  });

  it("shows Scripting only for Remake scenario projects", () => {
    const classicProject = createBrowserProject("Classic Project");
    const classicMarkup = renderToStaticMarkup(
      <DomainRail
        activeDomain="scenario"
        project={classicProject}
        catalog={null}
        activeWorkbench="project"
        issueCount={0}
        onSelectDomain={() => undefined}
      />
    );
    expect(classicMarkup).not.toContain("domain-scripting");

    const remakeMarkup = renderToStaticMarkup(
      <DomainRail
        activeDomain="scenario"
        project={{ ...classicProject, authoringTarget: "remake-enhanced" }}
        catalog={null}
        activeWorkbench="project"
        issueCount={0}
        onSelectDomain={() => undefined}
      />
    );
    expect(remakeMarkup).toContain("domain-scripting");
    expect(remakeMarkup).toContain("Spells, Races &amp; Castes");
  });
});
