import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
});
