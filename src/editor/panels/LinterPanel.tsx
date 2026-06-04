import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Issue, Project, SelectedEntity } from "../types";
import { SemanticInspector } from "../components/SemanticInspector";
import { selectEntityFromId } from "../utils";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, sourcePassThroughList, unresolvedLinks } from "../semanticGraph";
import { loadScenarioCoverageManifest } from "../scenarioCoverage";
import type { ScenarioCoverageManifest } from "../scenarioCoverage";
import { ScrollArea } from "../ui";
import { TutorialTip } from "../components/TutorialTip";

const LINTER_HELP = "The linter is the pre-export release safety surface. It groups validation errors, resource gaps, unresolved semantic links, source/runtime-cache boundaries, and writer readiness so authors can fix blockers before exporting.";
const RERUN_HELP = "Re-run validation after editing records, assets, maps, or scenario settings. Validation is the quickest way to refresh export blockers and compatibility warnings.";
const LINTER_SUMMARY_HELP = "Blocking export errors should be fixed before exporting. Warnings may still allow export, but they explain compatibility, fallback, pass-through, or source ownership risks.";
const SCENARIO_COVERAGE_HELP = "Scenario Coverage summarizes Providence's corpus and writer-readiness evidence: which scenario containers are understood, authoring-ready, preserved, runtime-only, or still writer-gated.";
const ADVANCED_COVERAGE_HELP = "Advanced coverage details show container-level evidence from the generated coverage manifest. Use this when a warning mentions writer gates, preserved ranges, or runtime state.";
const SEMANTIC_INSPECTOR_HELP = "The semantic inspector shows the selected linter target, its source, summary fields, links, and editability state so you can jump from a warning to the underlying record.";

export function LinterPanel({
  project,
  issues,
  selectedEntity,
  onValidate,
  onSelectEntity
}: {
  project: Project | null;
  issues: Issue[];
  selectedEntity: SelectedEntity | null;
  onValidate: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      const list = map.get(issue.source) ?? [];
      list.push(issue);
      map.set(issue.source, list);
    }
    return [...map.entries()];
  }, [issues]);
  const semanticGroups = useMemo(() => semanticLintGroups(project), [project]);
  const [coverage, setCoverage] = useState<ScenarioCoverageManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadScenarioCoverageManifest()
      .then((manifest) => {
        if (!cancelled) setCoverage(manifest);
      })
      .catch(() => {
        if (!cancelled) setCoverage(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="editor-full-panel lint-workbench">
      <section className="tab-panel lint-panel">
        <div className="panel-header">
          <TutorialTip title="Project Linter" body={LINTER_HELP} side="below">
            <span>Project Linter</span>
          </TutorialTip>
          <TutorialTip title="Re-run Validation" body={RERUN_HELP} side="below">
            <button className="btn btn-primary btn-xs" disabled={!project} onClick={onValidate}>
              Re-run
            </button>
          </TutorialTip>
        </div>
        <TutorialTip title="Validation Summary" body={LINTER_SUMMARY_HELP} side="below">
          <div className="lint-summary">
            {project?.validation.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{project ? (project.validation.ok ? "No blocking export errors" : "Blocking export issues found") : "No project loaded"}</span>
          </div>
        </TutorialTip>
        <ScrollArea className="lint-results" aria-label="Project Linter">
          <ScenarioCoverageSummary coverage={coverage} />
          {semanticGroups.map((group) => (
            <section key={group.title}>
              <header>
                <TutorialTip title={group.title} body={semanticGroupHelp(group.title)} side="below">
                  <span>{group.title}</span>
                </TutorialTip>
              </header>
              {group.rows.map((row) => (
                <LintInsightRow key={row.id} row={row} onSelectEntity={onSelectEntity} />
              ))}
            </section>
          ))}
          {grouped.map(([source, sourceIssues]) => (
            <section key={source}>
              <header>
                <TutorialTip title={source} body={issueSourceHelp(source)} side="below">
                  <span>{source}</span>
                </TutorialTip>
              </header>
              {sourceIssues.map((issue, index) => (
                <LintIssueRow
                  key={`${issue.message}-${index}`}
                  issue={issue}
                  onSelectEntity={onSelectEntity}
                />
              ))}
            </section>
          ))}
          {project && issues.length === 0 && <div className="entity-empty">All checks passed.</div>}
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <div className="panel-header">
          <TutorialTip title="Semantic Inspector" body={SEMANTIC_INSPECTOR_HELP} side="below">
            <span>Semantic Inspector</span>
          </TutorialTip>
        </div>
        <ScrollArea className="semantic-right-scroll" aria-label="Linter semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        </ScrollArea>
      </aside>
    </div>
  );
}

function semanticGroupHelp(title: string) {
  if (title === "Resource Coverage") {
    return "Resource Coverage reports missing resources, resource-fork gaps, and fallback-only assets. Used resource gaps should be reviewed before export because Realmz may display missing art, text, or sound.";
  }
  if (title === "Export Boundaries") {
    return "Export Boundaries separates writer-supported source files from pass-through files, generated runtime caches, and read-only records. Fix the source record rather than editing generated cache data.";
  }
  if (title === "Link Integrity") {
    return "Link Integrity shows semantic references with unresolved endpoints, such as scripts pointing at missing messages, maps, monsters, resources, or macros.";
  }
  return "This linter group collects related release-readiness diagnostics. Open a row to inspect the target record or evidence.";
}

function issueSourceHelp(source: string) {
  const lower = source.toLowerCase();
  if (lower.includes("export")) {
    return "Export issues are release blockers or warnings produced by Providence's current writer and package compatibility checks.";
  }
  if (lower.includes("resource")) {
    return "Resource issues usually mean a record points at missing, fallback-only, malformed, or unsupported resource-fork data.";
  }
  if (lower.includes("scenario")) {
    return "Scenario issues usually affect load readiness: startup shell, contact/restriction data, required files, resource fork availability, or first-start coordinates.";
  }
  if (lower.includes("map")) {
    return "Map issues usually affect Realmz level data, Action Point placement, random areas, special/icon tiles, map records, or tile metadata.";
  }
  if (lower.includes("script") || lower.includes("action")) {
    return "Script issues usually mean an Action Point row, EDCD parameter, or macro target needs a valid linked record before export.";
  }
  return "These validation issues come from the named project area. Open the row to inspect the linked target when available.";
}

function ScenarioCoverageSummary({ coverage }: { coverage: ScenarioCoverageManifest | null }) {
  if (!coverage) {
    return (
      <section className="scenario-coverage-card">
        <header>
          <TutorialTip title="Scenario Coverage" body={SCENARIO_COVERAGE_HELP} side="below">
            <span>Scenario Coverage</span>
          </TutorialTip>
        </header>
        <div className="entity-empty">Coverage details are loading.</div>
      </section>
    );
  }
  const summary = coverage.summary;
  const strict = summary.strictCompleteness;
  return (
    <section className="scenario-coverage-card">
      <header>
        <TutorialTip title="Scenario Coverage" body={SCENARIO_COVERAGE_HELP} side="below">
          <span>Scenario Coverage</span>
        </TutorialTip>
        <small>{summary.scenarioRoots.toLocaleString()} checked scenario roots</small>
      </header>
      <div className="scenario-coverage-metrics">
        {strict ? (
          <>
            <Metric label="Known Semantic Containers" value={`${strict.scenarioSemantics.completeContainers + strict.scenarioSemantics.mixedContainers}/${strict.containerCount}`} />
            <Metric label="Mixed, Not Unknown" value={strict.scenarioSemantics.mixedContainers} />
            <Metric label="Writer Gates Remaining" value={strict.writerProvenData.writerGatedContainers} />
            <Metric label="Package Warnings" value={strict.packageCompatibility.warnings} />
            <Metric label="Functional Authoring" value={summary.functionalAuthoringReadiness ? `${summary.functionalAuthoringReadiness.readySystems}/${summary.functionalAuthoringReadiness.totalSystems}` : "Unknown"} />
          </>
        ) : (
          <>
            <Metric label="Editable" value={summary.editableContainers} />
            <Metric label="Preserved" value={summary.preservedContainers} />
            <Metric label="Runtime State" value={summary.runtimeStateContainers} />
            <Metric label="Needs Format Work" value={summary.needsFormatWork} />
          </>
        )}
        <Metric label="Ignored" value={summary.ignoredNonScenarioFiles} />
      </div>
      <div className="scenario-coverage-note">
        {strict && (
          <>
            Semantic audit: {(strict.scenarioSemantics.completeContainers + strict.scenarioSemantics.mixedContainers).toLocaleString()} / {strict.containerCount.toLocaleString()} tracked container(s) are understood at the scenario boundary; {strict.scenarioSemantics.mixedContainers.toLocaleString()} include known compatibility/runtime ranges that Providence preserves instead of claiming as author-owned fields.
            Writer readiness: {(strict.writerProvenData.fixtureProvenContainers + strict.writerProvenData.partiallyProvenContainers).toLocaleString()} authoring-ready container(s);
            {strict.writerProvenData.partiallyProvenContainers.toLocaleString()} include preserved compatibility/runtime ranges;
            {strict.writerProvenData.writerGatedContainers.toLocaleString()} writer gate(s) remain.
            {strict.strictOutstanding.preservedUnknownContainers.toLocaleString()} preserved unknown container(s);
            {strict.strictOutstanding.targetWarnings.toLocaleString()} package warning(s).
            {" "}
          </>
        )}
        {summary.completeness && (
          <>
            Scenario boundary: {formatCoveragePhrase(summary.completeness.scenarioSemanticOwnership.status)}.
            Resource forks: {summary.completeness.resourceContainerOwnership.parsedResourceForks.toLocaleString()} / {summary.completeness.resourceContainerOwnership.resourceForkFiles.toLocaleString()} parsed.
            Media codecs: {formatCoveragePhrase(summary.completeness.mediaCodecInternals.status)}.
            {" "}
          </>
        )}
        {summary.targetCompatibility && (
          <>
            Targets: {summary.targetCompatibility.macClassicScenarios.toLocaleString()} Mac-style and {summary.targetCompatibility.windowsRealmzScenarios.toLocaleString()} Windows-style scenario(s), {summary.targetCompatibility.targetCompatibilityIssues.toLocaleString()} packaging note(s).
            {" "}
          </>
        )}
        {summary.functionalAuthoringReadiness && (
          <>
            Functional authoring: {formatCoveragePhrase(summary.functionalAuthoringReadiness.status)} across {summary.functionalAuthoringReadiness.readySystems.toLocaleString()} / {summary.functionalAuthoringReadiness.totalSystems.toLocaleString()} blocker-focused system(s).
            {" "}
          </>
        )}
        Action Points: {summary.ed3.recordBytes}-byte Extra Action rows, {summary.ed3.runtimeCallsites ?? "known"} runtime callsite(s).
        Parameters: {summary.edcd.edcdBackedOpcodes ?? "known"} opcode-backed shapes, {summary.edcd.fieldComparisonGaps ?? 0} label gap(s) left.
        {summary.dungeon && (
          <>
            {" "}Dungeons: {summary.dungeon.bits ?? "known"} cell bits, {summary.dungeon.writerSafeBits ?? 0} primitive bit(s), {summary.dungeon.preservedUnknownBits ?? 0} preserved unknown bit(s).
          </>
        )}
      </div>
      {coverage.topRisks.length > 0 && (
        <div className="scenario-coverage-risks">
          {coverage.topRisks.slice(0, 5).map((risk) => (
            <article key={risk.id}>
              <strong>{coverageContainerDisplayName(risk.family)}</strong>
              <span>{coverageRiskLabel(risk)}</span>
            </article>
          ))}
        </div>
      )}
      <details className="scenario-coverage-details">
        <summary>
          <TutorialTip title="Advanced Coverage Details" body={ADVANCED_COVERAGE_HELP} side="below">
            <span>Advanced Details</span>
          </TutorialTip>
        </summary>
        <div className="scenario-coverage-container-list">
          {coverage.containers.slice(0, 12).map((container) => (
            <div key={container.container}>
              <strong>{coverageContainerDisplayName(container.container)}</strong>
              <span>{formatCoverageContainerLabel(container)}</span>
              <small>{container.count.toLocaleString()} scenario(s), {container.sizes.slice(0, 4).join(", ")} byte size(s)</small>
              {container.truth && container.truth.riskFlags.length > 0 && (
                <small>{container.truth.riskFlags.slice(0, 4).join(", ")}</small>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function formatCoveragePhrase(value: string) {
  return value.split("-").join(" ");
}

function coverageRiskLabel(risk: ScenarioCoverageManifest["topRisks"][number]) {
  if (risk.id === "data-ed3-reachability") return "Fixture-proven storage";
  if (risk.id === "data-edcd-rare-shapes") return "Fixture-proven rows";
  if (risk.id === "data-od-and-string-sound") return "Text fixture-proven";
  if (risk.id === "custom-landlook-writers") return "Editable with preserved ranges";
  if (risk.id === "dungeon-writer-safety") return "Editable with runtime state";
  if (risk.status === "Needs packaging work") return "Packaging follow-up";
  if (risk.status === "Needs editor labels") return "Label follow-up";
  if (risk.status === "Needs writer proof") return "Follow-up";
  return risk.status;
}

function coverageContainerDisplayName(container: string) {
  const names: Record<string, string> = {
    "Data ED3": "Extra Action Points",
    "Data EDCD": "Action Step Settings",
    "Data ED": "Simple Encounters",
    "Data ED2": "Complex Encounters",
    "Data TD2": "Rogue Encounters",
    "Data TD3": "Timed Encounters",
    "Data SD2": "Strings",
    "Data OD": "Option Labels",
    "Data SD": "Shops",
    "Data TD": "Treasures",
    "Data BD": "Battles",
    "Data MD": "Monsters",
    "Data MD2": "Map Records",
    "Data DL": "Dungeon Tiles",
    "Data LD": "Land Tiles",
    "Data CS": "Scenario Security",
    "Data CI": "Contact Info",
    "Data RI": "Party Restrictions",
    "Data NI": "Scenario Items"
  };
  if (names[container]) return names[container];
  if (container.includes("Data OD") || container.toLowerCase().includes("strings sound")) return "Option Labels and String Sounds";
  if (container.includes("Data DL") || container.includes("Data DD") || container.includes("Data RDD")) return "Dungeon Files";
  if (container.includes("Data EDCD")) return "Action Step Settings";
  if (container.includes("Data ED3")) return "Extra Action Points";
  return container;
}

function formatTruthLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCoverageContainerLabel(container: ScenarioCoverageManifest["containers"][number]) {
  const readiness = container.truth?.writerReadiness;
  if (!readiness) return container.status;
  if (readiness === "fixture-proven") return "Authoring Ready";
  if (readiness === "partially-proven") {
    if (container.container === "Data DL") return "Editable + Runtime State";
    return "Editable + Preserved Compatibility";
  }
  if (readiness === "writer-gated") return "Needs Writer Proof";
  if (readiness === "read-only") return "Read-only";
  if (readiness === "preserve-only") return "Preserved";
  if (readiness === "not-applicable") {
    if (container.coverageStatus === "runtime-cache") return "Runtime State";
    if (container.coverageStatus === "ignored-non-scenario") return "Ignored";
    if (container.coverageStatus === "understood-resource-container") return "Resource Container";
    return "Not Authoring Data";
  }
  return formatTruthLabel(readiness);
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="scenario-coverage-metric">
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </div>
  );
}

type LintInsight = {
  id: string;
  severity: "warning" | "error";
  message: string;
  detail: string;
  target?: string | null;
};

function LintInsightRow({ row, onSelectEntity }: { row: LintInsight; onSelectEntity: (entity: SelectedEntity) => void }) {
  const content = (
    <>
      {row.severity === "error" ? "x" : "!"} {row.message}
      <small>{row.detail}</small>
    </>
  );
  if (!row.target) return <article className={row.severity}>{content}</article>;
  return (
    <button className={`lint-issue ${row.severity}`} onClick={() => onSelectEntity(selectEntityFromId(row.target!))}>
      {content}
    </button>
  );
}

function semanticLintGroups(project: Project | null) {
  if (!project) return [];
  const gaps = resourceGaps(project);
  const fallbacks = assetFallbacks(project);
  const caches = generatedRuntimeCaches(project);
  const passThrough = sourcePassThroughList(project);
  const unresolved = unresolvedLinks(project);
  const blocked = blockedSemanticObjects(project);
  return [
    {
      title: "Resource Coverage",
      rows: [
        ...gaps.slice(0, 12).map((gap): LintInsight => ({
          id: `gap:${gap.entity.id}`,
          severity: "warning",
          message: `${gap.entity.label} is ${gap.reason}.`,
          detail: `${gap.consumers.length.toLocaleString()} incoming reference(s).`,
          target: gap.entity.id
        })),
        ...fallbacks.slice(0, 8).map((entity): LintInsight => ({
          id: `asset:${entity.id}`,
          severity: "warning",
          message: `${entity.label} is using an asset fallback.`,
          detail: String(entity.summary.reason ?? entity.id),
          target: entity.id
        }))
      ]
    },
    {
      title: "Export Boundaries",
      rows: [
        {
          id: "pass-through",
          severity: "warning" as const,
          message: `${passThrough.length.toLocaleString()} source file(s) will pass through unchanged.`,
          detail: passThrough.slice(0, 8).map((source) => source.name).join(", ") || "No pass-through files."
        },
        {
          id: "runtime-caches",
          severity: "warning" as const,
          message: `${caches.length.toLocaleString()} generated runtime cache model(s) are blocked from authoring.`,
          detail: caches.map((cache) => cache.id.replace("runtime-cache:", "")).join(", ") || "none"
        },
        {
          id: "blocked-objects",
          severity: "warning" as const,
          message: `${blocked.entities.length + blocked.records.length} item(s) are not editable yet.`,
          detail: "These items are visible for review but cannot be written by this exporter."
        }
      ].filter((row) => !row.message.startsWith("0 ") || row.id === "runtime-caches")
    },
    {
      title: "Link Integrity",
      rows: unresolved.slice(0, 16).map((link): LintInsight => ({
        id: `unresolved:${link.id}`,
        severity: "warning",
        message: `${link.kind} has an unresolved endpoint.`,
        detail: `${link.from} -> ${link.to}`,
        target: link.from
      }))
    }
  ].filter((group) => group.rows.length > 0);
}

function LintIssueRow({ issue, onSelectEntity }: { issue: Issue; onSelectEntity: (entity: SelectedEntity) => void }) {
  const target = issue.target ?? (isSemanticId(issue.source) ? issue.source : null);
  const content = (
    <>
      {issue.severity === "error" ? "x" : "!"} {issue.message}
      {target && <small>{target}</small>}
    </>
  );
  if (!target) {
    return <article className={issue.severity}>{content}</article>;
  }
  return (
    <button className={`lint-issue ${issue.severity}`} onClick={() => onSelectEntity(selectEntityFromId(target))}>
      {content}
    </button>
  );
}

function isSemanticId(value: string) {
  return /^(map|trigger|macro|action-slot|random|record|resource|resource-type|asset|render-profile|asset-fallback|runtime-cache|encounter|battle|monster|message|shop|treasure|thief|time|contact|solids|menu|quest-flag):/.test(value);
}
