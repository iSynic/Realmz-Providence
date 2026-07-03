import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Issue, Project, SelectedEntity } from "../types";
import { SemanticInspector } from "../components/SemanticInspector";
import { selectEntityFromId } from "../utils";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, sourcePassThroughList, unresolvedLinks } from "../semanticGraph";
import { loadScenarioCoverageManifest } from "../scenarioCoverage";
import type { ScenarioCoverageManifest } from "../scenarioCoverage";
import { ScrollArea } from "../ui";
import { TutorialTip } from "../components/TutorialTip";
import { ED3_CLASSIFICATION_ORDER, ed3ClassificationCounts, ed3DiagnosticSummaries, ed3RiskySummaries } from "../scriptDiagnostics";
import { buildEdcdRowUsages, type EdcdRowStatus, type EdcdRowUsage } from "../edcdRows";

const LINTER_HELP = "The linter is the pre-export release safety surface. It groups validation errors, resource gaps, unresolved semantic links, source/runtime-cache boundaries, and writer readiness so authors can fix blockers before exporting.";
const RERUN_HELP = "Re-run validation after editing records, assets, maps, or scenario settings. Validation is the quickest way to refresh export blockers and compatibility warnings.";
const LINTER_SUMMARY_HELP = "Blocking export errors should be fixed before exporting. Warnings may still allow export, but they explain compatibility, fallback, pass-through, or source ownership risks.";
const SCENARIO_COVERAGE_HELP = "Scenario Coverage summarizes what Providence can safely author today and which areas still need review before export.";
const ADVANCED_COVERAGE_HELP = "Advanced coverage details show container-level evidence from the generated coverage manifest. Use this when a warning mentions writer gates, preserved ranges, or runtime state.";
const SEMANTIC_INSPECTOR_HELP = "The semantic inspector shows the selected linter target, its source, summary fields, links, and editability state so you can jump from a warning to the underlying record.";
const LINTER_ROW_LIMIT = 24;
const EDCD_STATUS_ORDER: EdcdRowStatus[] = ["missing", "conflict", "shared", "unused", "in-use"];

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
  const [semanticGroupsReady, setSemanticGroupsReady] = useState(false);
  const semanticGroups = useMemo(() => semanticGroupsReady ? semanticLintGroups(project) : [], [project, semanticGroupsReady]);
  const [coverage, setCoverage] = useState<ScenarioCoverageManifest | null>(null);

  useEffect(() => {
    setSemanticGroupsReady(false);
    if (!project) return;
    const handle = window.setTimeout(() => setSemanticGroupsReady(true), 120);
    return () => window.clearTimeout(handle);
  }, [project]);

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
            <LinterSection
              key={group.title}
              title={group.title}
              help={semanticGroupHelp(group.title)}
              count={group.rows.length}
              defaultOpen={group.defaultOpen}
              summary={group.summary}
            >
              {group.rows.map((row) => (
                <LintInsightRow key={row.id} row={row} onSelectEntity={onSelectEntity} />
              ))}
            </LinterSection>
          ))}
          {grouped.map(([source, sourceIssues]) => (
            <LinterSection
              key={source}
              title={source}
              help={issueSourceHelp(source)}
              count={sourceIssues.length}
              defaultOpen={sourceIssues.some((issue) => issue.severity === "error")}
              summary={issueGroupSummary(source, sourceIssues)}
            >
              {sourceIssues.slice(0, LINTER_ROW_LIMIT).map((issue, index) => (
                <LintIssueRow
                  key={`${issue.message}-${index}`}
                  issue={issue}
                  onSelectEntity={onSelectEntity}
                />
              ))}
              {sourceIssues.length > LINTER_ROW_LIMIT && (
                <article className="info">
                  Showing {LINTER_ROW_LIMIT.toLocaleString()} of {sourceIssues.length.toLocaleString()} rows.
                  <small>Use search or the owning tool to narrow this group before editing records.</small>
                </article>
              )}
            </LinterSection>
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
  if (title === "Script Source Triage") {
    return "Script Source Triage separates callable Extra Action Points from imported rows that may be unused, runtime leftovers, or behavior Providence has not proven yet.";
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

function LinterSection({
  title,
  help,
  count,
  defaultOpen,
  summary,
  children
}: {
  title: string;
  help: string;
  count: number;
  defaultOpen?: boolean;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <details className="linter-section-details" open={defaultOpen}>
        <summary>
          <TutorialTip title={title} body={help} side="below">
            <span>{title}</span>
          </TutorialTip>
          <small>{count.toLocaleString()}</small>
        </summary>
        {summary && <p className="linter-section-summary">{summary}</p>}
        {children}
      </details>
    </section>
  );
}

function issueGroupSummary(source: string, issues: Issue[]) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  if (errors > 0) return `${errors.toLocaleString()} blocker${errors === 1 ? "" : "s"} should be fixed before export.`;
  if (source.toLowerCase() === "project") return `${warnings.toLocaleString()} project-wide warning${warnings === 1 ? "" : "s"}; expand only when you need the full queue.`;
  return `${warnings.toLocaleString()} warning${warnings === 1 ? "" : "s"}; most can be reviewed from the owning tool.`;
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
  const readyContainers = strict
    ? strict.writerProvenData.fixtureProvenContainers + strict.writerProvenData.partiallyProvenContainers
    : summary.editableContainers;
  const reviewContainers = strict
    ? strict.writerProvenData.partiallyProvenContainers + strict.strictOutstanding.preservedUnknownContainers
    : summary.preservedContainers + summary.needsFormatWork;
  const writerGates = strict ? strict.writerProvenData.writerGatedContainers : summary.needsFormatWork;
  const authoringReady = summary.functionalAuthoringReadiness
    ? `${summary.functionalAuthoringReadiness.readySystems}/${summary.functionalAuthoringReadiness.totalSystems}`
    : "Unknown";
  return (
    <section className="scenario-coverage-card">
      <header>
        <TutorialTip title="Scenario Coverage" body={SCENARIO_COVERAGE_HELP} side="below">
          <span>Scenario Coverage</span>
        </TutorialTip>
        <small>{summary.scenarioRoots.toLocaleString()} checked scenario roots</small>
      </header>
      <div className="scenario-coverage-metrics">
        <Metric label="Ready to Author" value={readyContainers} />
        <Metric label="Needs Review" value={reviewContainers} />
        <Metric label="Writer Blockers" value={writerGates} />
        <Metric label="Package Notes" value={strict ? strict.packageCompatibility.warnings : summary.targetCompatibility?.targetCompatibilityIssues ?? 0} />
        <Metric label="Authoring Systems" value={authoringReady} />
      </div>
      <div className="scenario-coverage-note">
        Providence can safely author the main scenario systems that have fixture coverage, while preserving legacy compatibility data it does not edit directly.
        Use the warning sections below for work that may affect export or in-game behavior. Advanced details are available for developer evidence and format coverage.
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
  severity: "info" | "warning" | "error";
  message: string;
  detail: string;
  target?: string | null;
};

function LintInsightRow({ row, onSelectEntity }: { row: LintInsight; onSelectEntity: (entity: SelectedEntity) => void }) {
  const content = (
    <>
      {row.severity === "error" ? "x" : row.severity === "warning" ? "!" : "i"} {row.message}
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
  const ed3Summaries = ed3DiagnosticSummaries(project);
  const ed3Counts = ed3ClassificationCounts(ed3Summaries);
  const ed3Risky = ed3RiskySummaries(ed3Summaries);
  const edcdUsages = buildEdcdRowUsages(project);
  const edcdCounts = edcdStatusCounts(edcdUsages);
  const edcdRisky = edcdUsages.filter((usage) => ["missing", "shared", "conflict"].includes(usage.status));
  return [
    {
      title: "Resource Coverage",
      defaultOpen: gaps.length > 0,
      summary: resourceCoverageSummary(gaps.length, fallbacks.length),
      rows: [
        ...gaps.slice(0, 12).map((gap): LintInsight => ({
          id: `gap:${gap.entity.id}`,
          severity: "warning",
          message: `${gap.entity.label} is ${gap.reason}.`,
          detail: `${gap.consumers.length.toLocaleString()} incoming reference(s).`,
          target: gap.entity.id
        })),
        fallbacks.length > 0 ? {
          id: "asset-fallback-summary",
          severity: "info" as const,
          message: `${fallbacks.length.toLocaleString()} referenced resource${fallbacks.length === 1 ? "" : "s"} will use Realmz's shared library fallback.`,
          detail: "This is usually fine. Expand Assets only if an image, sound, or text preview looks wrong."
        } : null
      ]
        .filter((row): row is LintInsight => Boolean(row))
    },
    {
      title: "Export Boundaries",
      defaultOpen: false,
      summary: "These are compatibility notes about what Providence writes directly and what it preserves unchanged.",
      rows: [
        {
          id: "pass-through",
          severity: "info" as const,
          message: `${passThrough.length.toLocaleString()} source file${passThrough.length === 1 ? "" : "s"} will be preserved unchanged.`,
          detail: passThrough.length > 0 ? "Providence will keep these files with the scenario package but does not edit them yet." : "No pass-through files."
        },
        {
          id: "runtime-caches",
          severity: "warning" as const,
          message: `${caches.length.toLocaleString()} runtime cache model${caches.length === 1 ? "" : "s"} cannot be edited.`,
          detail: "These are generated by Realmz at runtime and should not be authored directly."
        },
        {
          id: "blocked-objects",
          severity: "warning" as const,
          message: `${blocked.entities.length + blocked.records.length} item(s) are not editable yet.`,
          detail: "These items are visible for review but cannot be written by this exporter."
        }
      ].filter((row) => !row.message.startsWith("0 "))
    },
    {
      title: "Script Source Triage",
      defaultOpen: ed3Risky.length > 0 && ed3Risky.length <= 8,
      summary: scriptTriageSummary(ed3Summaries.length, ed3Risky.length),
      rows: [
        ...ED3_CLASSIFICATION_ORDER
          .map((classification): LintInsight | null => {
            const count = ed3Counts.get(classification) ?? 0;
            if (count === 0) return null;
            const sample = ed3Summaries.find((summary) => summary.classification === classification);
            const label = sample?.linterLabel ?? classification;
            return {
              id: `ed3-summary:${classification}`,
              severity: "info",
              message: ed3SummaryMessage(classification, count, label),
              detail: ed3SummaryDetail(classification, sample?.detail)
            };
          })
          .filter((row): row is LintInsight => Boolean(row)),
        ...ed3Risky.slice(0, 8).map((summary): LintInsight => ({
          id: `ed3-risk:${summary.recordIndex}`,
          severity: summary.linterSeverity ?? "warning",
          message: `Review Extra Action row ${summary.recordIndex}.`,
          detail: humanScriptTriageDetail(summary.classification),
          target: summary.entityId
        })),
        ed3Risky.length > 8 ? {
          id: "ed3-risk-more",
          severity: "info" as const,
          message: `${(ed3Risky.length - 8).toLocaleString()} more imported action row${ed3Risky.length - 8 === 1 ? "" : "s"} need review.`,
          detail: "Use Scripts filters or the developer report when you need row-by-row evidence."
        } : null
      ]
        .filter((row): row is LintInsight => Boolean(row))
    },
    {
      title: "Action Settings Rows",
      defaultOpen: edcdRisky.length > 0 && edcdRisky.length <= 6,
      summary: edcdSettingsSummary(edcdUsages, edcdRisky),
      rows: [
        ...EDCD_STATUS_ORDER
          .map((status): LintInsight | null => {
            const count = edcdCounts.get(status) ?? 0;
            if (count === 0) return null;
            return {
              id: `edcd-status:${status}`,
              severity: status === "missing" || status === "conflict" ? "warning" : "info",
              message: edcdStatusMessage(status, count),
              detail: edcdStatusDetail(status)
            };
          })
          .filter((row): row is LintInsight => Boolean(row)),
        ...edcdRisky.slice(0, 8).map((usage): LintInsight => ({
          id: `edcd-risk:${usage.rowId}`,
          severity: usage.status === "missing" || usage.status === "conflict" ? "warning" : "info",
          message: edcdRiskMessage(usage),
          detail: usage.warnings[0] ?? usage.summary,
          target: usage.exists ? `record:Data EDCD:${usage.rowId}` : undefined
        })),
        edcdRisky.length > 8 ? {
          id: "edcd-risk-more",
          severity: "info" as const,
          message: `${(edcdRisky.length - 8).toLocaleString()} more settings row${edcdRisky.length - 8 === 1 ? "" : "s"} need review.`,
          detail: "Use Scripts > Settings Rows to filter, inspect, duplicate, or repair settings rows."
        } : null
      ].filter((row): row is LintInsight => Boolean(row))
    },
    {
      title: "Link Integrity",
      defaultOpen: unresolved.length > 0 && unresolved.length <= 12,
      summary: `${unresolved.length.toLocaleString()} unresolved link${unresolved.length === 1 ? "" : "s"} found. These are the references most likely to affect author-visible behavior.`,
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

function resourceCoverageSummary(gapCount: number, fallbackCount: number) {
  if (gapCount === 0 && fallbackCount === 0) return "All referenced resources currently resolve.";
  const parts = [];
  if (gapCount > 0) parts.push(`${gapCount.toLocaleString()} missing/problem resource${gapCount === 1 ? "" : "s"}`);
  if (fallbackCount > 0) parts.push(`${fallbackCount.toLocaleString()} shared-library fallback${fallbackCount === 1 ? "" : "s"}`);
  return `${parts.join("; ")}. Missing resources deserve review; fallbacks are often normal Realmz behavior.`;
}

function scriptTriageSummary(total: number, risky: number) {
  if (total === 0) return "No unlinked Extra Action rows were found.";
  if (risky === 0) return "Extra Action rows are either callable, likely padding, or not currently actionable.";
  return `${risky.toLocaleString()} unlinked Extra Action row${risky === 1 ? "" : "s"} may need review before you treat them as intentional scenario behavior.`;
}

function edcdStatusCounts(usages: EdcdRowUsage[]) {
  const counts = new Map<EdcdRowStatus, number>();
  for (const usage of usages) counts.set(usage.status, (counts.get(usage.status) ?? 0) + 1);
  return counts;
}

function edcdSettingsSummary(usages: EdcdRowUsage[], risky: EdcdRowUsage[]) {
  if (usages.length === 0) return "No action settings rows are present.";
  if (risky.length === 0) return `${usages.length.toLocaleString()} action settings row${usages.length === 1 ? "" : "s"} found with no missing, shared, or conflicting row usage.`;
  return `${risky.length.toLocaleString()} of ${usages.length.toLocaleString()} action settings row${usages.length === 1 ? "" : "s"} need author review.`;
}

function edcdStatusMessage(status: EdcdRowStatus, count: number) {
  if (status === "missing") return `${count.toLocaleString()} referenced settings row${count === 1 ? "" : "s"} missing.`;
  if (status === "conflict") return `${count.toLocaleString()} settings row${count === 1 ? "" : "s"} used by conflicting action shapes.`;
  if (status === "shared") return `${count.toLocaleString()} settings row${count === 1 ? "" : "s"} shared by multiple steps.`;
  if (status === "unused") return `${count.toLocaleString()} imported settings row${count === 1 ? "" : "s"} currently unused.`;
  return `${count.toLocaleString()} settings row${count === 1 ? "" : "s"} used by one step.`;
}

function edcdStatusDetail(status: EdcdRowStatus) {
  if (status === "missing") return "Create the row or choose a different settings row before relying on that step.";
  if (status === "conflict") return "Different action types are reading the same five values differently; duplicate or repair the row before editing.";
  if (status === "shared") return "Shared rows are valid, but step-specific edits should duplicate the row first.";
  if (status === "unused") return "Unused imported rows are preserved, but they are not currently linked from known script flow.";
  return "These rows have one known caller and can be edited from the selected step or Settings Rows tab.";
}

function edcdRiskMessage(usage: EdcdRowUsage) {
  if (usage.status === "missing") return `Settings row ${usage.rowId} is referenced but missing.`;
  if (usage.status === "conflict") return `Settings row ${usage.rowId} has conflicting callers.`;
  if (usage.status === "shared") return `Settings row ${usage.rowId} is shared by ${usage.callers.length} steps.`;
  return `Review settings row ${usage.rowId}.`;
}

function ed3SummaryMessage(classification: string, count: number, label: string) {
  if (classification === "source-backed") return `${count.toLocaleString()} callable Extra Action row${count === 1 ? "" : "s"}.`;
  if (classification === "probable-editor-padding") return `${count.toLocaleString()} likely empty imported row${count === 1 ? "" : "s"}.`;
  if (classification === "runtime-mutation-candidate") return `${count.toLocaleString()} possible runtime leftover row${count === 1 ? "" : "s"}.`;
  if (classification === "orphan-authored-content") return `${count.toLocaleString()} possible orphan authored row${count === 1 ? "" : "s"}.`;
  if (classification === "needs-runtime-trace") return `${count.toLocaleString()} row${count === 1 ? "" : "s"} need runtime confirmation.`;
  return `${count.toLocaleString()} ${label.toLowerCase()} row${count === 1 ? "" : "s"}.`;
}

function ed3SummaryDetail(classification: string, fallback?: string) {
  if (classification === "source-backed") return "These are linked from known scenario flow and can be inspected normally in Scripts.";
  if (classification === "probable-editor-padding") return "These look empty or unused, so Providence counts them but does not list every row.";
  if (classification === "runtime-mutation-candidate") return "These may be leftover state that Realmz mutates while running a scenario.";
  if (classification === "orphan-authored-content") return "These contain action-like content but no caller Providence can prove yet.";
  if (classification === "needs-runtime-trace") return "These may be real behavior, but need playtesting or deeper tracing before editing confidently.";
  return fallback ?? "Providence preserved these rows but cannot explain them yet.";
}

function humanScriptTriageDetail(classification: string) {
  if (classification === "runtime-mutation-candidate") return "May be runtime state rather than author-authored behavior. Open it before editing.";
  if (classification === "orphan-authored-content") return "Looks authored, but Providence has not found what calls it yet.";
  if (classification === "needs-runtime-trace") return "Could be reachable through behavior Providence has not decoded. Verify before relying on it.";
  return "Imported row needs review before editing.";
}

function LintIssueRow({ issue, onSelectEntity }: { issue: Issue; onSelectEntity: (entity: SelectedEntity) => void }) {
  const target = issue.target ?? (isSemanticId(issue.source) ? issue.source : null);
  const content = (
    <>
      {issue.severity === "error" ? "x" : issue.severity === "warning" ? "!" : "i"} {issue.message}
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
