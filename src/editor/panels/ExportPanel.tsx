import { Download, Gauge } from "lucide-react";
import { BenchmarkReport, ExportReport, Project } from "../types";
import { InfoGrid } from "../components/InfoGrid";
import { ScrollArea } from "../ui";
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

export function ExportPanel({
  project,
  exportReport,
  benchmark,
  onExport,
  onBenchmark
}: {
  project: Project | null;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  onExport: () => void;
  onBenchmark: () => void;
}) {
  const plan = exportPlan(project);
  return (
    <div className="editor-full-panel export-workbench">
      <section className="tab-panel">
        <div className="panel-header">
          <span>Realmz Folder Export</span>
        </div>
        <div className="export-actions">
          <button className="btn btn-primary" disabled={!project} onClick={onExport}>
            <Download size={14} /> Export Scenario Folder
          </button>
          <button className="btn btn-secondary" disabled={!project} onClick={onBenchmark}>
            <Gauge size={14} /> Benchmark Project
          </button>
        </div>
        {exportReport ? (
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
        ) : (
          <p className="empty-copy">No export has been run in this session.</p>
        )}
      </section>
      <section className="tab-panel">
        <div className="panel-header">
          <span>Export Plan</span>
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
              <header>Resource Export Notes</header>
              {exportReport.resourceWarnings.map((warning) => (
                <div key={warning} className="lint-issue warning">! {warning}</div>
              ))}
            </section>
          </ScrollArea>
        ) : null}
        {exportReport?.targetCompatibilityIssues.length ? (
          <ScrollArea className="lint-results compact" aria-label="Target compatibility notes">
            <section>
              <header>Target Compatibility Notes</header>
              {exportReport.targetCompatibilityIssues.map((issue) => (
                <div key={`${issue.target}-${issue.code}-${issue.message}`} className={`lint-issue ${issue.severity}`}>
                  {issue.severity === "error" ? "x" : issue.severity === "warning" ? "!" : "i"} {issue.message}
                </div>
              ))}
            </section>
          </ScrollArea>
        ) : null}
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
          <span>Performance Gate</span>
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
