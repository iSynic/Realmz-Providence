import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CloseProjectDialog, ProjectStart } from "./AppStart";

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
    expect(markup).toContain('class="workbench-pane-header project-start-header"');
    expect(markup).toContain('<h1>');
    expect(markup).toContain('role="group" aria-label="Project actions"');
    expect(markup).toContain('role="group" aria-label="Reference actions"');
    expect(markup).toContain('role="status" aria-live="polite">Browser project storage ready');
    expect(markup).toContain("Resume Local");
    expect(markup).not.toContain("Import Scenario");
  });

  it("uses the shared modal structure for project close confirmation", () => {
    const markup = renderToStaticMarkup(
      <CloseProjectDialog
        projectName="Example Project"
        saving={false}
        onSaveAndClose={noop}
        onCloseWithoutSaving={noop}
        onCancel={noop}
      />
    );

    expect(markup).toContain('class="workbench-modal-header"');
    expect(markup).toContain('class="workbench-modal-actions"');
    expect(markup).toContain('aria-labelledby="close-project-title"');
  });
});
