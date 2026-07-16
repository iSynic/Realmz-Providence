import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportPanel } from "./ExportPanel";
import { LinterPanel } from "./LinterPanel";

describe("technical readiness panels", () => {
  it("uses shared readiness and empty-state presentation in Export", () => {
    const markup = renderToStaticMarkup(
      <ExportPanel
        project={null}
        exportReport={null}
        benchmark={null}
        desktopRuntime={false}
        onExport={() => undefined}
        onExportProjectJson={() => undefined}
        onBenchmark={() => undefined}
      />
    );

    expect(markup).toContain("workbench-pane-header");
    expect(markup).toContain("workbench-validation-gate is-blocked");
    expect(markup).toContain("No export report yet");
    expect(markup).toContain("No source files available");
    expect(markup).toContain("No export diagnostics");
  });

  it("uses the shared validation gate and empty state in Linter", () => {
    const markup = renderToStaticMarkup(
      <LinterPanel
        project={null}
        issues={[]}
        selectedEntity={null}
        onValidate={() => undefined}
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain("workbench-validation-gate is-blocked");
    expect(markup).toContain("No project loaded");
    expect(markup).toContain("Coverage details are loading");
    expect(markup).toContain("No record selected");
  });
});
