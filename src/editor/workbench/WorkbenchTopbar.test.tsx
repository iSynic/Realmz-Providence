import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchTopbar } from "./WorkbenchTopbar";

const noop = () => undefined;

describe("WorkbenchTopbar", () => {
  it("presents Project and Library as one exclusive workbench switch", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchTopbar
        activeWorkbench="library"
        title="Realmz Providence"
        subtitle="Library Workbench"
        runtimeLabel="Browser"
        runtimeLive
        dirty={false}
        editing={false}
        importAllowed={false}
        canOpenProject
        canCloseProject={false}
        canImportScenario={false}
        browserPreviewStatus="Unavailable"
        undoLabel={null}
        redoLabel={null}
        canUndo={false}
        canRedo={false}
        canSave={false}
        canExport={false}
        tutorialEnabled={false}
        canNavigateBack={false}
        canNavigateForward={false}
        onLibrary={noop}
        onProject={noop}
        onDocuments={noop}
        onDivinityManual={noop}
        onGlobalSearch={noop}
        onNavigateBack={noop}
        onNavigateForward={noop}
        onToggleTutorial={noop}
        onNewProject={noop}
        onOpenProject={noop}
        onCloseProject={noop}
        onImportScenario={noop}
        onUndo={noop}
        onRedo={noop}
        onSave={noop}
        onExport={noop}
      />
    );

    expect(markup).toContain('aria-label="Active workbench"');
    expect(markup).toContain('role="toolbar" aria-label="Project and application actions"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('role="group" aria-label="Undo and redo"');
    expect(markup).toMatch(/aria-pressed="false"[^>]*><span><svg[^>]*>[\s\S]*?Project/);
    expect(markup).toMatch(/aria-pressed="true"[^>]*><span><svg[^>]*>[\s\S]*?Library/);
    expect(markup).not.toContain("Library Workbench</span></button>");
  });
});
