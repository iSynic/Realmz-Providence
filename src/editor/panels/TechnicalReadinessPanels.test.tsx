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
    expect(markup).toContain("No package files available");
    expect(markup).toContain("No export diagnostics");
  });

  it("offers the desktop Realmz Remake folder target and summarizes its package report", () => {
    const markup = renderToStaticMarkup(
      <ExportPanel
        project={null}
        exportReport={{
          outputPath: "C:\\Exports\\Dead of Night",
          target: "realmz-remake-folder",
          writtenFiles: ["campaign.json", "classic/maps.json", "media/pictures/pict-32128-proof.png"],
          passThroughFiles: [],
          writtenResources: [],
          preservedResources: 0,
          resourceWarnings: [],
          blockedAssets: [],
          warnings: ["Compatibility note"],
          targetCompatibilityIssues: [],
          targetCompatibility: { blockers: [], warnings: [], notes: [] },
          remakeCounts: {
            maps: 18,
            landMaps: 10,
            dungeonMaps: 8,
            triggers: 2000,
            activeTriggers: 1250,
            extraCodes: 1689,
            messages: 1800,
            battles: 100,
            monsters: 821,
            scenarioItems: 100,
            itemTexts: 100,
            treasures: 100,
            shops: 22,
            simpleEncounters: 7,
            complexEncounters: 102,
            thiefEncounters: 39,
            timedEncounters: 13,
            managedAssets: 3,
            packagedAssetPayloads: 6
          }
        }}
        benchmark={null}
        desktopRuntime
        onExport={() => undefined}
        onExportProjectJson={() => undefined}
        onBenchmark={() => undefined}
      />
    );

    expect(markup).toContain('value="realmz-remake-folder"');
    expect(markup).toContain("Realmz Remake Scenario Folder");
    expect(markup).toContain("Packaged Asset Files");
    expect(markup).toContain(">6<");
    expect(markup).not.toContain("<dt>Preserved Resources</dt>");
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

  it("uses shared issue rows without exposing raw semantic target IDs", () => {
    const markup = renderToStaticMarkup(
      <LinterPanel
        project={null}
        issues={[{
          severity: "warning",
          source: "Scenario authoring",
          message: "A linked record needs review.",
          detail: "Open the owning tool before export.",
          target: "record:Data ED:4",
          provenance: "authored"
        }]}
        selectedEntity={null}
        onValidate={() => undefined}
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain("workbench-issue-row tone-warning");
    expect(markup).toContain("A linked record needs review.");
    expect(markup).toContain("Scenario-authored");
    expect(markup).not.toContain("record:Data ED:4");
  });
});
