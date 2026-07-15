import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project, SemanticMappingProgress } from "../types";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  it("announces status changes without making the whole footer live", () => {
    const markup = renderToStaticMarkup(
      <StatusBar
        status="Project saved"
        activeWorkbench="project"
        project={null}
        catalog={null}
        semanticMapping={null}
      />
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('title="Project saved"');
    expect(markup).toContain("Awaiting project");
  });

  it("exposes determinate semantic mapping progress", () => {
    const project = {
      maps: [{ id: 0 }],
      triggers: [{ id: 0 }, { id: 1 }],
      metadata: {}
    } as unknown as Project;
    const semanticMapping = {
      active: true,
      label: "Mapping links",
      detail: "Mapping Action Point links",
      completed: 25,
      total: 100,
      indeterminate: false,
      startedAt: 0,
      updatedAt: 1_000
    } as SemanticMappingProgress;
    const markup = renderToStaticMarkup(
      <StatusBar
        status="Mapping scenario links"
        activeWorkbench="project"
        project={project}
        catalog={null}
        semanticMapping={semanticMapping}
      />
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuenow="25"');
    expect(markup).toContain('--semantic-progress:25%');
  });
});
