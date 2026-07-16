import { useState } from "react";
import { Download, Gauge } from "lucide-react";
import { BenchmarkReport, ExportReport, Project, ScenarioTarget } from "../types";
import { InfoGrid } from "../components/InfoGrid";
import { EmptyState, EntityRow, IssueGroup, PanelHeader, ScrollArea, ValidationGate } from "../ui";
import { TutorialTip } from "../components/TutorialTip";
import {
  assetFallbacks,
  blockedSemanticObjects,
  editableSemanticRecords,
  generatedRuntimeCaches,
  resourceGaps,
  sourceByName,
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
const EXPORT_PLAN_HELP = "Readiness previews the current project boundary before writing: writer-supported records, pass-through files, resource gaps, runtime caches, unresolved links, and blocked objects.";
const EXPORT_SOURCES_HELP = "Export sources show writer-supported source files and pass-through files. Writer-supported files are encoded from project data; pass-through files are copied from the source snapshot.";

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
  const selectedScenarioTarget = desktopRuntime ? target : selectedBrowserScenarioTarget;
  const diagnostics = exportDiagnostics(project, exportReport, {
    browserTarget,
    desktopRuntime,
    plan,
    selectedScenarioTarget
  });
  return (
    <div className="editor-full-panel export-workbench">
      <section className="tab-panel export-artifact-panel">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title={exportTitle} body={EXPORT_WORKBENCH_HELP} side="below">
              <span>{exportTitle}</span>
            </TutorialTip>
          )}
        />
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
        </div>
        <InfoGrid
          rows={[
            ["Artifact", desktopRuntime ? exportTargetLabel(target) : browserTargetLabel(browserTarget)],
            ["Writer", desktopRuntime ? "Desktop folder writer" : "Browser ZIP writer"],
            ["Scenario", project?.scenario.name ?? "No project"],
            ["Diagnostics", diagnostics.length.toLocaleString()]
          ]}
        />
        {exportReport ? (
          <ExportReportSummary report={exportReport} />
        ) : (
          <EmptyState compact title="No export report yet" body="Run an export to inspect written, preserved, and blocked package contents." />
        )}
      </section>
      <section className="tab-panel">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Readiness & Sources" body={EXPORT_PLAN_HELP} side="below">
              <span>Readiness & Sources</span>
            </TutorialTip>
          )}
        />
        <div className="export-readiness-grid">
          <section className="export-readiness-column">
            <h3>Package Readiness</h3>
            <ValidationGate
              ok={Boolean(project) && diagnostics.every((diagnostic) => diagnostic.kind !== "error")}
              title="Selected package target"
              okLabel="Ready to export"
              blockedLabel={project ? "Review export blockers" : "No project loaded"}
              detail={project ? `${diagnostics.length.toLocaleString()} diagnostic note(s) for ${desktopRuntime ? exportTargetLabel(target) : browserTargetLabel(browserTarget)}.` : "Open or import a project before building an export package."}
              issues={diagnostics
                .filter((diagnostic) => diagnostic.kind === "error")
                .slice(0, 8)
                .map((diagnostic, index) => ({
                  id: `export-blocker:${index}`,
                  severity: "error",
                  message: diagnostic.message,
                  detail: diagnostic.detail
                }))}
            />
            <InfoGrid
              rows={[
                ["Writable Records", plan.editableRecords.toLocaleString()],
                ["Writer Sources", plan.exportableSources.length.toLocaleString()],
                ["Pass-through", plan.passThroughFiles.toLocaleString()],
                ["Resource Gaps", plan.resourceGaps.toLocaleString()],
                ["Asset Fallbacks", plan.assetFallbacks.toLocaleString()],
                ["Runtime Caches", plan.runtimeCaches.toLocaleString()],
                ["Unresolved Links", plan.unresolvedLinks.toLocaleString()],
                ["Blocked Objects", plan.blockedObjects.toLocaleString()],
                ["Managed Assets", plan.managedAssets.toLocaleString()]
              ]}
            />
          </section>
          <section className="export-readiness-column">
            <TutorialTip title="Export Sources" body={EXPORT_SOURCES_HELP} side="below">
              <h3>Source Package</h3>
            </TutorialTip>
            <InfoGrid
              rows={[
                ["Encoded Sources", plan.exportableSources.length.toLocaleString()],
                ["Copied Sources", plan.passThroughSources.length.toLocaleString()]
              ]}
            />
            <SourceRows plan={plan} />
          </section>
        </div>
      </section>
      <section className="tab-panel">
        <div className="export-review-grid">
          <section className="export-review-column">
            <PanelHeader
              className="panel-header compact"
              title={(
                <TutorialTip title="Export Diagnostics" body={EXPORT_REPORT_HELP} side="below">
                  <span>Export Diagnostics</span>
                </TutorialTip>
              )}
              meta={diagnostics.length.toLocaleString()}
            />
            <DiagnosticsList diagnostics={diagnostics} />
          </section>
          <section className="export-review-column">
            <BenchmarkSummary benchmark={benchmark} project={project} onBenchmark={onBenchmark} />
          </section>
        </div>
      </section>
    </div>
  );
}

function ExportReportSummary({ report }: { report: ExportReport }) {
  return (
    <TutorialTip title="Export Report" body={EXPORT_REPORT_HELP} side="below">
      <div>
        <InfoGrid
          rows={[
            ["Output", report.outputPath],
            ["Target", exportTargetLabel(report.target)],
            ["Written", report.writtenFiles.join(", ") || "none"],
            ["Pass-through", report.passThroughFiles.length.toLocaleString()],
            ["Resources", report.writtenResources.join(", ") || "none"],
            ["Preserved Resources", report.preservedResources.toLocaleString()],
            ["Blocked Assets", report.blockedAssets.join(", ") || "none"],
            ["Warnings", report.warnings.length.toLocaleString()]
          ]}
        />
      </div>
    </TutorialTip>
  );
}

function SourceRows({ plan }: { plan: ReturnType<typeof exportPlan> }) {
  const rows = [
    ...plan.exportableSources.map((source) => ({
      id: `exportable:${source.name}`,
      name: source.name,
      mode: "writer-supported",
      detail: `${source.bytes.toLocaleString()} source bytes`
    })),
    ...plan.passThroughSources.map((source) => ({
      id: source.id,
      name: source.name,
      mode: "pass-through",
      detail: source.origin
    }))
  ];
  if (rows.length === 0) return <EmptyState compact title="No source files available" body="This project state has no writer-supported or pass-through sources." />;
  return (
    <ScrollArea className="record-table export-source-list" aria-label="Export sources">
      {rows.map((source) => (
        <EntityRow
          key={source.id}
          title={source.name}
          subtitle={source.mode}
          meta={source.detail}
          status={source.mode === "writer-supported" ? "Encoded" : "Copied"}
          statusTone={source.mode === "writer-supported" ? "success" : "info"}
        />
      ))}
    </ScrollArea>
  );
}

function DiagnosticsList({ diagnostics }: { diagnostics: ExportDiagnostic[] }) {
  if (diagnostics.length === 0) return <EmptyState compact title="No export diagnostics" body="The current project and target have no export-facing findings." />;
  return (
    <ScrollArea className="lint-results compact export-diagnostics-list" aria-label="Export diagnostics">
      <IssueGroup
        title="Current findings"
        issues={diagnostics.map((diagnostic, index) => ({
          id: `${diagnostic.kind}:${index}`,
          severity: diagnostic.kind,
          message: diagnostic.message,
          detail: diagnostic.detail
        }))}
      />
    </ScrollArea>
  );
}

function BenchmarkSummary({
  benchmark,
  project,
  onBenchmark
}: {
  benchmark: BenchmarkReport | null;
  project: Project | null;
  onBenchmark: () => void;
}) {
  return (
    <>
      <PanelHeader
        className="panel-header compact export-benchmark-header"
        title={(
          <TutorialTip title="Project Benchmark" body={BENCHMARK_HELP} side="below">
            <span>Project Benchmark</span>
          </TutorialTip>
        )}
        actions={(
          <TutorialTip title="Benchmark Project" body={BENCHMARK_HELP} side="below">
            <button className="btn btn-secondary" disabled={!project} onClick={onBenchmark}>
              <Gauge size={14} /> Benchmark Project
            </button>
          </TutorialTip>
        )}
      />
      {benchmark ? (
        <InfoGrid
          rows={[
            ["Maps", benchmark.maps.toLocaleString()],
            ["Triggers", benchmark.triggers.toLocaleString()],
            ["EDCD", benchmark.extracodes.toLocaleString()],
            ["Canvas tiles", benchmark.estimatedCanvasTiles.toLocaleString()],
            ["Validation", `${benchmark.validationMs} ms`],
            ["Result", benchmark.ok ? "Pass" : "Review"]
          ]}
        />
      ) : (
        <EmptyState compact title="No benchmark report yet" body="Run the project benchmark to measure validation and dense-scenario scale." />
      )}
    </>
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

function browserTargetLabel(target: BrowserExportTarget) {
  switch (target) {
    case "mac-classic-scenario-zip":
      return "Mac Classic Scenario ZIP";
    case "windows-realmz-scenario-zip":
      return "Windows Realmz Scenario ZIP";
    case "project-zip":
    default:
      return "Providence Project ZIP";
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

type ExportDiagnostic = {
  kind: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

function exportDiagnostics(
  project: Project | null,
  report: ExportReport | null,
  context: {
    browserTarget: BrowserExportTarget;
    desktopRuntime: boolean;
    plan: ReturnType<typeof exportPlan>;
    selectedScenarioTarget: ScenarioTarget;
  }
): ExportDiagnostic[] {
  const diagnostics: ExportDiagnostic[] = [];
  if (report) {
    diagnostics.push(...report.warnings.map((message) => ({ kind: "warning" as const, message, detail: "Export report warning" })));
    diagnostics.push(...report.resourceWarnings.map((message) => ({ kind: "warning" as const, message, detail: "Resource export note" })));
    diagnostics.push(...report.blockedAssets.map((message) => ({ kind: "warning" as const, message, detail: "Blocked asset" })));
    diagnostics.push(...report.targetCompatibility.blockers.map((issue) => ({ kind: "error" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    diagnostics.push(...report.targetCompatibility.warnings.map((issue) => ({ kind: "warning" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    diagnostics.push(...report.targetCompatibility.notes.map((issue) => ({ kind: "info" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
    return diagnostics;
  }
  if (!project) return diagnostics;
  if (
    !context.desktopRuntime &&
    context.browserTarget !== "project-zip" &&
    !hasGeneratedBrowserBaseline(project) &&
    context.plan.exportableSources.length === 0 &&
    context.plan.passThroughSources.length === 0
  ) {
    diagnostics.push({
      kind: "warning",
      message: "Scenario ZIP export needs a captured raw source snapshot.",
      detail: "Import a Realmz scenario or open a Providence project ZIP that includes raw-sources."
    });
  }
  diagnostics.push(...project.validation.errors.map((message) => ({ kind: "error" as const, message, detail: "Validation blocker" })));
  diagnostics.push(...project.validation.warnings.filter(isExportFacingWarning).map(issueFromPreExportWarning));
  const targetCompatibility = compatibilityForTarget(project.validation.targetCompatibility, context.selectedScenarioTarget);
  diagnostics.push(...targetCompatibility.blockers.map((issue) => ({ kind: "error" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  diagnostics.push(...targetCompatibility.warnings.map((issue) => ({ kind: "warning" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  diagnostics.push(...targetCompatibility.notes.map((issue) => ({ kind: "info" as const, message: issue.message, detail: exportTargetLabel(issue.target) })));
  return diagnostics;
}

function isExportFacingWarning(message: string) {
  return /source|snapshot|export|pass-through|resource|target|unsupported|scenario package|raw/i.test(message);
}

function issueFromPreExportWarning(message: string): ExportDiagnostic {
  if (/preserved source file\(s\) will pass through unchanged/.test(message)) {
    return { kind: "info", message, detail: "Preserved source package note" };
  }
  return { kind: "warning", message, detail: "Pre-export warning" };
}

function compatibilityForTarget(buckets: Project["validation"]["targetCompatibility"], target: ScenarioTarget) {
  return {
    blockers: buckets.blockers.filter((issue) => issue.target === target || issue.target === "providence-portable-folder"),
    warnings: buckets.warnings.filter((issue) => issue.target === target || issue.target === "providence-portable-folder"),
    notes: buckets.notes.filter((issue) => issue.target === target || issue.target === "providence-portable-folder")
  };
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
      exportableSources: [] as ExportPlanSource[],
      passThroughSources: [] as ExportPlanSource[]
    };
  }
  const blocked = blockedSemanticObjects(project);
  const exportableSources = project.validation.exportableFiles
    .map((name) => exportPlanSource(project, name))
    .filter(Boolean) as ExportPlanSource[];
  const passThroughSources = project.validation.passThroughFiles
    .map((name) => exportPlanSource(project, name))
    .filter(Boolean) as ExportPlanSource[];
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

type ExportPlanSource = {
  id: string;
  name: string;
  bytes: number;
  origin: string;
};

function exportPlanSource(project: Project, name: string): ExportPlanSource | null {
  const semanticSource = sourceByName(project, name);
  if (semanticSource) return semanticSource;
  if (!hasGeneratedBrowserBaseline(project)) return null;
  const sourceFile = project.source.files.find((file) => file.name === name);
  if (!sourceFile) return null;
  return {
    id: `source:file:${sourceFile.name}`,
    name: sourceFile.name,
    bytes: sourceFile.bytes,
    origin: "generated Realmz runtime baseline"
  };
}

function hasGeneratedBrowserBaseline(project: Project) {
  return project.source.rawSourcesDir === "generated-runtime" && project.source.files.length > 0;
}
