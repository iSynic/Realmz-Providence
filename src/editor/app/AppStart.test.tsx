import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectStart } from "./AppStart";

const noop = () => undefined;

describe("ProjectStart", () => {
  it("separates project lifecycle commands from reference-only commands", () => {
    const markup = renderToStaticMarkup(
      <ProjectStart
        desktopRuntime={false}
        projectRoot="Projects"
        browserPreviewStatus="Browser project storage ready"
        onNewProject={noop}
        onOpenProject={noop}
        onResumeProject={noop}
        onLibraryHub={noop}
        onDocuments={noop}
      />
    );

    expect(markup).toContain('aria-labelledby="project-start-title"');
    expect(markup).toContain('role="group" aria-label="Project actions"');
    expect(markup).toContain('role="group" aria-label="Reference actions"');
    expect(markup).toContain("Resume Local");
    expect(markup).not.toContain("Import Scenario");
  });
});
