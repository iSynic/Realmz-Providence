import { useState } from "react";
import { Download, Gauge } from "lucide-react";
import { BenchmarkReport, ExportReport, Project, ScenarioTarget } from "../types";
import { InfoGrid } from "../components/InfoGrid";
import { ScrollArea } from "../ui";
import { TutorialTip } from "../components/TutorialTip";
import {
  assetFallbacks,
  blockedSemanticObjects,
  editableSemanticRecords,
  generatedRuntimeCaches,
  resourceGaps,
  sourceByName,
  sourcePassThroughList,
  unresolvedLinks
} from "../semanticGraph";

type BrowserExportTarget = "project-zip" | "mac-classic-scenario-zip" | "windows-realmz-scenario-zip";

const EXPORT_WORKBENCH_HELP = "Desktop export writes a Realmz-compatible scenario folder from the current project and reports what was written, preserved, passed through, blocked, or warned. Browser export downloads either a Providence project ZIP package or a scenario ZIP from the captured raw-source snapshot.";
const EXPORT_TARGET_HELP = "Choose the package shape to write. Portable Providence is useful for internal roundtrips; Mac Classic and Windows Realmz match the target runtime folder conventions.";
const EXPORT_ACTION_HELP = "Desktop Export Scenario Folder runs the writer for the selected target. Browser export downloads the selected ZIP artifact.";
const EXPORT_JSON_HELP = "Download the current project.json directly. This is useful as a small browser backup or for inspecting the project state without extracting the ZIP package.";
const BROWSER_SCENARIO_EXPORT_HELP = "Browser scenario ZIP export packages the captured raw source snapshot and applies browser-supported record and resource updates. The export report calls out project-only labels, resource warnings, and missing raw-source material.";
const BROWSER_EXPORT_TARGET_HELP = "Choose the browser export artifact. Project ZIP is a Providence backup; Mac and Windows scenario ZIPs are Realmz folders built from captured raw sources.";
const BENCHMARK_HELP = "Benchmark Project measures large-scenario UI and validation scale so release candidates do not regress on dense maps, triggers, or Action Settings.";
const EXPORT_REPORT_HELP = "The export report is the release ledger for this session: output folder, target, source files, pass-through files, resource writes, preserved resources, blocked assets, and warnings.";
const EXPORT_PLAN_HELP = "Export Plan previews the current project boundary before writing: writer-supported records, pass-through files, resource gaps, runtime caches, unresolved links, and blocked objects.";
const RESOURCE_NOTES_HELP = "Resource Export Notes explain resource fork entries that were preserved, skipped, blocked, or written with caution. Review used resource warnings before release.";
const TARGET_COMPAT_HELP = "Target Compatibility reports target-specific blockers, warnings, and notes for Mac Classic, Windows Realmz, or portable Providence exports.";
const EXPORT_SOURCES_HELP = "Export sources show writer-supported source files and pass-through files. Writer-supported files are encoded from project data; pass-through files are copied from the source snapshot.";
const PERFORMANCE_GATE_HELP = "Performance Gate is a lightweight release smoke for scale. Run it after importing or editing a large scenario to catch slow validation or canvas-size regressions.";

export function ExportPanel({
  project,
  exportReport,
  benchmark,
  desktopRuntime,
  onExport,
  onExportProjectJson,
  onBenchmark
}: {
  project: Project | null;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  desktopRuntime: boolean;
  onExport: (target?: ScenarioTarget) => void;
  onExportProjectJson: () => void;
  onBenchmark: () => void;
}) {
  const [target, setTarget] = useState<ScenarioTarget>("providence-portable-folder");
  const [browserTarget, setBrowserTarget] = useState<BrowserExportTarget>("project-zip");
  const plan = exportPlan(project);
  const exportTitle = desktopRuntime ? "Realmz Folder Export" : "Browser Package Export";
  const exportButtonLabel = desktopRuntime
    ? "Export Scenario Folder"
    : browserTarget === "mac-classic-scenario-zip"
      ? "Download Mac Scenario ZIP"
      : browserTarget === "windows-realmz-scenario-zip"
        ? "Download Windows Scenario ZIP"
        : "Download Project ZIP";
  const exportButtonHelp = !desktopRuntime && browserTarget !== "project-zip" ? BROWSER_SCENARIO_EXPORT_HELP : EXPORT_ACTION_HELP;
  const exportDisabled = !project;
  const selectedBrowserScenarioTarget = browserTargetToScenarioTarget(browserTarget);
  return (
    <div className="editor-full-panel export-workbench">
      <section className="tab-panel">
        <div className="panel-header">
          <TutorialTip title={exportTitle} body={EXPORT_WORKBENCH_HELP} side="below">
            <span>{exportTitle}</span>
          </TutorialTip>
        </div>
        <div className="export-actions">
          {desktopRuntime ? (
            <label className="field compact export-target-field">
              <TutorialTip title="Export Target" body={EXPORT_TARGET_HELP} side="below">
                <span>Target</span>
              </TutorialTip>
              <select value={target} onChange={(event) => setTarget(event.target.value as ScenarioTarget)}>
                <option value="providence-portable-folder">Portable Providence Folder</option>
                <option value="mac-classic-folder">Mac Classic Folder</option>
                <option value="windows-realmz-folder">Windows Realmz Folder</option>
              </select>
            </label>
          ) : (
            <label className="field compact export-target-field">
              <TutorialTip title="Browser Export Type" body={BROWSER_EXPORT_TARGET_HELP} side="below">
                <span>Export Type</span>
              </TutorialTip>
              <select value={browserTarget} onChange={(event) => setBrowserTarget(event.target.value as BrowserExportTarget)}>
                <option value="project-zip">Providence Project ZIP</option>
                <option value="mac-classic-scenario-zip">Mac Classic Scenario ZIP</option>
                <option value="windows-realmz-scenario-zip">Windows Realmz Scenario ZIP</option>
              </select>
            </label>
          )}
          <TutorialTip title={exportButtonLabel} body={exportButtonHelp} side="below">
            <button className="btn btn-primary" disabled={exportDisabled} onClick={() => onExport(desktopRuntime ? target : selectedBrowserScenarioTarget)}>
              <Download size={14} /> {exportButtonLabel}
            </button>
          </TutorialTip>
          {!desktopRuntime ? (
            <TutorialTip title="Download Project JSON" body={EXPORT_JSON_HELP} side="below">
              <button className="btn btn-secondary" disabled={!project} onClick={onExportProjectJson}>
                <Download size={14} /> Download Project JSON
              </button>
            </TutorialTip>
          ) : null}
          <TutorialTip title="Benchmark Project" body={BENCHMARK_HELP} side="below">
            <button className="btn btn-secondary" disabled={!project} onClick={onBenchmark}>
              <Gauge size={14} /> Benchmark Project
            </button>
          </TutorialTip>
        </div>
        {!desktopRuntime ? (
          <TutorialTip title="Browser Scenario ZIP Writer" body={BROWSER_SCENARIO_EXPORT_HELP} side="below">
            <p className="empty-copy browser-export-boundary">
              Browser scenario ZIPs preserve captured raw sources and apply supported record/resource updates. Review the export report for resource warnings, project-only labels, and missing raw-source diagnostics.
            </p>
          </TutorialTip>
        ) : null}
        {exportReport ? (
          <TutorialTip title="Export Report" body={EXPORT_REPORT_HELP} side="below">
            <div>
              <InfoGrid
                rows={[
                  ["Output", exportReport.outputPath],
                  ["Target", exportTargetLabel(exportReport.target)],
                  ["Written", exportReport.writtenFiles.join(", ") || "none"],
                  ["Pass-through", exportReport.passThroughFiles.length.toLocaleString()],
                  ["Resources", exportReport.writtenResources.join(", ") || "none"],
                  ["Preserved Resources", exportReport.preservedResources.toLocaleString()],
                  ["Blocked Assets", exportReport.blockedAssets.join(", ") || "none"],
                  ["Warnings", exportReport.warnings.length.toLocaleString()]
                ]}
              />
            </div>
          </TutorialTip>
        ) : (
          <p className="empty-copy">No export has been run in this session.</p>
        )}
      </section>
      <section className="tab-panel">
        <div className="panel-header">
          <TutorialTip title="Export Plan" body={EXPORT_PLAN_HELP} side="below">
            <span>Export Plan</span>
          </TutorialTip>
        </div>
        <InfoGrid
          rows={[
            ["Writable Records", plan.editableRecords.toLocaleString()],
            ["Pass-through Files", plan.passThroughFiles.toLocaleString()],
            ["Resource Fallbacks", plan.resourceGaps.toLocaleString()],
            ["Asset Fallbacks", plan.assetFallbacks.toLocaleString()],
            ["Runtime Caches", plan.runtimeCaches.toLocaleString()],
            ["Unresolved Links", plan.unresolvedLinks.toLocaleString()],
            ["Blocked Objects", plan.blockedObjects.toLocaleString()],
            ["Managed Assets", plan.managedAssets.toLocaleString()]
          ]}
        />
        {exportReport?.resourceWarnings.length ? (
          <ScrollArea className="lint-results compact" aria-label="Resource export notes">
            <section>
              <header>
                <TutorialTip title="Resource Export Notes" body={RESOURCE_NOTES_HELP} side="below">
                  <span>Resource Export Notes</span>
                </TutorialTip>
              </header>
              {exportReport.resourceWarnings.map((warning) => (
                <div key={warning} className="lint-issue warning">! {warning}</div>
              ))}
            </section>
          </ScrollArea>
        ) : null}
        {exportReport && targetCompatibilityCount(exportReport) > 0 ? (
          <ScrollArea className="lint-results compact" aria-label="Target compatibility notes">
            <section>
              <header>
                <TutorialTip title="Target Compatibility" body={TARGET_COMPAT_HELP} side="below">
                  <span>Target Compatibility</span>
                </TutorialTip>
              </header>
              {exportReport.targetCompatibility.blockers.map((issue) => (
                <div key={`blocker-${issue.target}-${issue.code}-${issue.message}`} className="lint-issue error">
                  x {issue.message}
                </div>
              ))}
              {exportReport.targetCompatibility.warnings.map((issue) => (
                <div key={`warning-${issue.target}-${issue.code}-${issue.message}`} className="lint-issue warning">
                  ! {issue.message}
                </div>
              ))}
              {exportReport.targetCompatibility.notes.map((issue) => (
                <div key={`note-${issue.target}-${issue.code}-${issue.message}`} className="lint-issue info">
                  i {issue.message}
                </div>
              ))}
            </section>
          </ScrollArea>
        ) : null}
        <TutorialTip title="Export Sources" body={EXPORT_SOURCES_HELP} side="below">
          <span className="export-sources-help-label">Export Sources</span>
        </TutorialTip>
        <ScrollArea className="record-table" aria-label="Export sources">
          {plan.exportableSources.map((source) => (
            <article key={source.name} className="record-row">
              <button type="button">
                <strong>{source.name}</strong>
                <span>writer-supported</span>
                <small>{source.bytes.toLocaleString()} source bytes</small>
              </button>
            </article>
          ))}
          {plan.passThroughSources.slice(0, 10).map((source) => (
            <article key={source.id} className="record-row">
              <button type="button">
                <strong>{source.name}</strong>
                <span>pass-through</span>
                <small>{source.origin}</small>
              </button>
            </article>
          ))}
        </ScrollArea>
      </section>
      <section className="tab-panel">
        <div className="panel-header">
          <TutorialTip title="Performance Gate" body={PERFORMANCE_GATE_HELP} side="below">
            <span>Performance Gate</span>
          </TutorialTip>
        </div>
        {benchmark ? (
          <InfoGrid
            rows={[
              ["Maps", benchmark.maps.toLocaleString()],
              ["Triggers", benchmark.triggers.toLocaleString()],
              ["EDCD", benchmark.extracodes.toLocaleString()],
              ["Canvas tiles", benchmark.estimatedCanvasTiles.toLocaleString()],
              ["Validation", `${benchmark.validationMs} ms`]
            ]}
          />
        ) : (
          <p className="empty-copy">Run the benchmark after importing a large scenario.</p>
        )}
      </section>
    </div>
  );
}

function targetCompatibilityCount(report: ExportReport) {
  return (
    report.targetCompatibility.blockers.length +
    report.targetCompatibility.warnings.length +
    report.targetCompatibility.notes.length
  );
}

function exportTargetLabel(target: ExportReport["target"]) {
  switch (target) {
    case "mac-classic-folder":
      return "Mac Classic Folder";
    case "windows-realmz-folder":
      return "Windows Realmz Folder";
    case "providence-portable-folder":
      return "Portable Providence Folder";
    default:
      return target;
  }
}

function browserTargetToScenarioTarget(target: BrowserExportTarget): ScenarioTarget {
  switch (target) {
    case "mac-classic-scenario-zip":
      return "mac-classic-folder";
    case "windows-realmz-scenario-zip":
      return "windows-realmz-folder";
    case "project-zip":
    default:
      return "providence-portable-folder";
  }
}

function exportPlan(project: Project | null) {
  if (!project) {
    return {
      editableRecords: 0,
      passThroughFiles: 0,
      resourceGaps: 0,
      assetFallbacks: 0,
      runtimeCaches: 0,
      unresolvedLinks: 0,
      blockedObjects: 0,
      managedAssets: 0,
      exportableSources: [] as NonNullable<ReturnType<typeof sourceByName>>[],
      passThroughSources: [] as ReturnType<typeof sourcePassThroughList>
    };
  }
  const blocked = blockedSemanticObjects(project);
  const exportableSources = project.validation.exportableFiles
    .map((name) => sourceByName(project, name))
    .filter(Boolean) as NonNullable<ReturnType<typeof sourceByName>>[];
  const passThroughSources = sourcePassThroughList(project);
  return {
    editableRecords: editableSemanticRecords(project).length,
    passThroughFiles: project.validation.passThroughFiles.length,
    resourceGaps: resourceGaps(project).length,
    assetFallbacks: assetFallbacks(project).length,
    runtimeCaches: generatedRuntimeCaches(project).length,
    unresolvedLinks: unresolvedLinks(project).length,
    blockedObjects: blocked.entities.length + blocked.records.length,
    managedAssets: project.assets.length,
    exportableSources,
    passThroughSources
  };
}
