import { CheckCircle2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Issue, Project, SelectedEntity } from "../types";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { SemanticInspector } from "../components/SemanticInspector";
import { selectEntityFromId } from "../utils";
import { assetFallbacks, blockedSemanticObjects, entityById, generatedRuntimeCaches, recordById, resourceGaps, sourcePassThroughList, unresolvedLinks } from "../semanticGraph";
import { loadScenarioCoverageManifest, type ScenarioCoverageManifest } from "../scenarioCoverage";
import { PanelHeader, ScrollArea } from "../ui";
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
  const { confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const openLintEntity = useCallback((entity: SelectedEntity) => {
    confirmBeforeDraftDiscard(`open ${entity.id}`, () => onSelectEntity(entity));
  }, [confirmBeforeDraftDiscard, onSelectEntity]);
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
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Project Linter" body={LINTER_HELP} side="below">
              <span>Project Linter</span>
            </TutorialTip>
          )}
          actions={(
            <TutorialTip title="Re-run Validation" body={RERUN_HELP} side="below">
              <button className="btn btn-primary btn-xs" disabled={!project} onClick={onValidate}>
                Re-run
              </button>
            </TutorialTip>
          )}
        />
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
                <LintInsightRow key={row.id} row={row} onSelectEntity={openLintEntity} />
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
                  onSelectEntity={openLintEntity}
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
          {project && issues.length === 0 && <div className="entity-empty">No authoring findings.</div>}
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Semantic Inspector" body={SEMANTIC_INSPECTOR_HELP} side="below">
              <span>Semantic Inspector</span>
            </TutorialTip>
          )}
        />
        <ScrollArea className="semantic-right-scroll" aria-label="Linter semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={openLintEntity} />
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
    return "Script Source Triage separates callable Extra Action Points from imported entries that may be unused, runtime leftovers, or behavior Providence has not proven yet.";
  }
  return "This linter group collects related release-readiness diagnostics. Open a row to inspect the target record or evidence.";
}

function issueSourceHelp(source: string) {
  const lower = source.toLowerCase();
  if (lower.includes("export")) {
    return "Export issues are release blockers or warnings produced by Providence's current writer and package compatibility checks.";
  }
  if (lower.includes("authoring")) {
    return "Authoring issues are scenario-owned edits or export checks with a concrete next step for the author.";
  }
  if (lower.includes("import") || lower.includes("refresh")) {
    return "Import refresh issues point at stale or incomplete imported project evidence. Refresh the import when the scenario source is still the authority.";
  }
  if (lower.includes("record")) {
    return "Record warnings come from editable scenario records such as monsters, battles, encounters, shops, treasure, or rules overrides.";
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
    return "Script issues usually mean an Action Point, Action Settings entry, or macro target needs a valid linked record before export.";
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
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const notes = issues.length - errors - warnings;
  if (errors > 0) return `${errors.toLocaleString()} blocker${errors === 1 ? "" : "s"} should be fixed before export.`;
  if (warnings > 0) return `${warnings.toLocaleString()} authoring warning${warnings === 1 ? "" : "s"}; open the owning tool before changing records.`;
  return `${notes.toLocaleString()} supporting note${notes === 1 ? "" : "s"}; review only when it explains an export or preview question.`;
}

function ScenarioCoverageSummary({ coverage }: { coverage: ScenarioCoverageManifest | null }) {
  if (!coverage) {
    return (
      <section className="scenario-coverage-card">
        <PanelHeader
          className="scenario-coverage-header"
          title={(
            <TutorialTip title="Scenario Coverage" body={SCENARIO_COVERAGE_HELP} side="below">
              <span>Scenario Coverage</span>
            </TutorialTip>
          )}
        />
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
      <PanelHeader
        className="scenario-coverage-header"
        title={(
          <TutorialTip title="Scenario Coverage" body={SCENARIO_COVERAGE_HELP} side="below">
            <span>Scenario Coverage</span>
          </TutorialTip>
        )}
        meta={`${summary.scenarioRoots.toLocaleString()} checked scenario roots`}
      />
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
  const missingScenarioResources = gaps.filter((gap) => gap.reason === "scenario resource missing");
  const referenceResourceNotes = gaps.filter((gap) => gap.reason !== "scenario resource missing");
  const fallbacks = assetFallbacks(project);
  const caches = generatedRuntimeCaches(project);
  const passThrough = sourcePassThroughList(project);
  const unresolved = unresolvedLinks(project).filter((link) => isAuthoringLink(project, link));
  const blocked = blockedSemanticObjects(project);
  const ed3Summaries = ed3DiagnosticSummaries(project);
  const ed3Counts = ed3ClassificationCounts(ed3Summaries);
  const ed3Risky = ed3RiskySummaries(ed3Summaries);
  const ed3AuthoringRisk = ed3Risky.filter((summary) => summary.classification === "orphan-authored-content");
  const ed3EvidenceOnly = ed3Risky.filter((summary) => summary.classification !== "orphan-authored-content");
  const edcdUsages = buildEdcdRowUsages(project);
  const edcdCounts = edcdStatusCounts(edcdUsages);
  const edcdActionable = edcdUsages.filter((usage) => usage.status === "missing" || usage.status === "conflict");
  const edcdShared = edcdUsages.filter((usage) => usage.status === "shared");
  return [
    {
      title: "Resource Coverage",
      defaultOpen: missingScenarioResources.length > 0,
      summary: resourceCoverageSummary(missingScenarioResources.length, referenceResourceNotes.length, fallbacks.length),
      rows: [
        ...missingScenarioResources.slice(0, 12).map((gap): LintInsight => ({
          id: `gap:${gap.entity.id}`,
          severity: "warning",
          message: `${gap.entity.label} is ${gap.reason}.`,
          detail: `${gap.consumers.length.toLocaleString()} incoming scenario reference(s). Add the resource to Scenario Assets or change the referring record.`,
          target: gap.entity.id
        })),
        referenceResourceNotes.length > 0 ? {
          id: "reference-resource-summary",
          severity: "info" as const,
          message: `${referenceResourceNotes.length.toLocaleString()} referenced resource${referenceResourceNotes.length === 1 ? "" : "s"} resolve through stock/reference provenance.`,
          detail: "These are not scenario-copy work unless the author intentionally wants bundled custom media."
        } : null,
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
      summary: "These are supporting notes about what Providence writes directly and what it preserves unchanged.",
      rows: [
        {
          id: "pass-through",
          severity: "info" as const,
          message: `${passThrough.length.toLocaleString()} source file${passThrough.length === 1 ? "" : "s"} will be preserved unchanged.`,
          detail: passThrough.length > 0 ? "Providence will keep these files with the scenario package but does not edit them yet." : "No pass-through files."
        },
        {
          id: "runtime-caches",
          severity: "info" as const,
          message: `${caches.length.toLocaleString()} runtime cache model${caches.length === 1 ? "" : "s"} cannot be edited.`,
          detail: "These are generated by Realmz at runtime and are preserved as evidence, not authoring backlog."
        },
        {
          id: "blocked-objects",
          severity: "info" as const,
          message: `${blocked.entities.length + blocked.records.length} item(s) are not editable yet.`,
          detail: "These items are visible for review. They become blockers only if marked edited while still blocked."
        }
      ].filter((row) => !row.message.startsWith("0 "))
    },
    {
      title: "Script Source Triage",
      defaultOpen: ed3AuthoringRisk.length > 0 && ed3AuthoringRisk.length <= 8,
      summary: scriptTriageSummary(ed3Summaries.length, ed3AuthoringRisk.length, ed3EvidenceOnly.length),
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
        ...ed3AuthoringRisk.slice(0, 8).map((summary): LintInsight => ({
          id: `ed3-risk:${summary.recordIndex}`,
          severity: summary.linterSeverity ?? "warning",
          message: `Review Extra Action Point #${summary.recordIndex}.`,
          detail: humanScriptTriageDetail(summary.classification),
          target: summary.entityId
        })),
        ed3AuthoringRisk.length > 8 ? {
          id: "ed3-risk-more",
          severity: "info" as const,
          message: `${(ed3AuthoringRisk.length - 8).toLocaleString()} more possible orphan authored Extra Action Point${ed3AuthoringRisk.length - 8 === 1 ? "" : "s"} need review.`,
          detail: "Use Scripts filters or the developer report when you need entry-by-entry evidence."
        } : null,
        ed3EvidenceOnly.length > 0 ? {
          id: "ed3-evidence-only",
          severity: "info" as const,
          message: `${ed3EvidenceOnly.length.toLocaleString()} imported Extra Action Point${ed3EvidenceOnly.length === 1 ? "" : "s"} remain evidence-only.`,
          detail: "Runtime residue and trace-needed rows are preserved and inspectable in Scripts, but they are not authoring fixes until a call path is proven."
        } : null
      ]
        .filter((row): row is LintInsight => Boolean(row))
    },
    {
      title: "Action Settings",
      defaultOpen: edcdActionable.length > 0 && edcdActionable.length <= 6,
      summary: edcdSettingsSummary(edcdUsages, edcdActionable, edcdShared.length),
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
        ...edcdActionable.slice(0, 8).map((usage): LintInsight => ({
          id: `edcd-risk:${usage.rowId}`,
          severity: "warning",
          message: edcdRiskMessage(usage),
          detail: usage.warnings[0] ?? usage.summary,
          target: usage.exists ? `record:Data EDCD:${usage.rowId}` : undefined
        })),
        edcdActionable.length > 8 ? {
          id: "edcd-risk-more",
          severity: "info" as const,
          message: `${(edcdActionable.length - 8).toLocaleString()} more Action Settings entr${edcdActionable.length - 8 === 1 ? "y" : "ies"} need repair.`,
          detail: "Use Scripts > Action Settings to filter, inspect, duplicate, or repair settings."
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

function isAuthoringLink(project: Project, link: ReturnType<typeof unresolvedLinks>[number]) {
  const fromEntity = entityById(project, link.from);
  if (fromEntity?.editState === "editable") return true;
  const fromRecord = recordById(project, link.from);
  if (fromRecord?.editState === "editable") return true;
  return /^(trigger|macro|action-slot|random|encounter|battle|monster|message|shop|treasure|thief|time|item|spell|race|caste|map-record):/.test(link.from);
}

function resourceCoverageSummary(gapCount: number, referenceCount: number, fallbackCount: number) {
  if (gapCount === 0 && referenceCount === 0 && fallbackCount === 0) return "All referenced resources currently resolve.";
  const parts = [];
  if (gapCount > 0) parts.push(`${gapCount.toLocaleString()} missing scenario resource${gapCount === 1 ? "" : "s"}`);
  if (referenceCount > 0) parts.push(`${referenceCount.toLocaleString()} stock/reference lookup${referenceCount === 1 ? "" : "s"}`);
  if (fallbackCount > 0) parts.push(`${fallbackCount.toLocaleString()} shared-library fallback${fallbackCount === 1 ? "" : "s"}`);
  return `${parts.join("; ")}. Missing scenario resources deserve review; stock/reference lookups are normal unless custom bundled media is intended.`;
}

function scriptTriageSummary(total: number, risky: number, evidenceOnly: number) {
  if (total === 0) return "No unlinked Extra Action Points were found.";
  if (risky === 0) {
    if (evidenceOnly > 0) return `${evidenceOnly.toLocaleString()} imported Extra Action Point${evidenceOnly === 1 ? "" : "s"} remain preserved as evidence, not authoring work.`;
    return "Extra Action Points are either callable, likely padding, or not currently actionable.";
  }
  return `${risky.toLocaleString()} possible orphan authored Extra Action Point${risky === 1 ? "" : "s"} may need review before release.`;
}

function edcdStatusCounts(usages: EdcdRowUsage[]) {
  const counts = new Map<EdcdRowStatus, number>();
  for (const usage of usages) counts.set(usage.status, (counts.get(usage.status) ?? 0) + 1);
  return counts;
}

function edcdSettingsSummary(usages: EdcdRowUsage[], risky: EdcdRowUsage[], sharedCount: number) {
  if (usages.length === 0) return "No Action Settings are present.";
  if (risky.length === 0) {
    const shared = sharedCount > 0 ? ` ${sharedCount.toLocaleString()} shared entr${sharedCount === 1 ? "y is" : "ies are"} informational.` : "";
    return `${usages.length.toLocaleString()} Action Settings entr${usages.length === 1 ? "y" : "ies"} found with no missing or conflicting usage.${shared}`;
  }
  return `${risky.length.toLocaleString()} of ${usages.length.toLocaleString()} Action Settings entr${usages.length === 1 ? "y" : "ies"} need repair.`;
}

function edcdStatusMessage(status: EdcdRowStatus, count: number) {
  if (status === "missing") return `${count.toLocaleString()} referenced Settings ID${count === 1 ? "" : "s"} missing.`;
  if (status === "conflict") return `${count.toLocaleString()} Settings ID${count === 1 ? "" : "s"} used by conflicting action types.`;
  if (status === "shared") return `${count.toLocaleString()} Settings ID${count === 1 ? "" : "s"} shared by multiple steps.`;
  if (status === "unused") return `${count.toLocaleString()} imported Action Settings entr${count === 1 ? "y" : "ies"} currently unused.`;
  return `${count.toLocaleString()} Settings ID${count === 1 ? "" : "s"} used by one step.`;
}

function edcdStatusDetail(status: EdcdRowStatus) {
  if (status === "missing") return "Create the settings or choose a different Settings ID before relying on that step.";
  if (status === "conflict") return "Different action types are reading the same five values differently; duplicate or repair the settings before editing.";
  if (status === "shared") return "Shared settings are valid, but step-specific edits should duplicate them first.";
  if (status === "unused") return "Unused imported settings are preserved, but they are not currently linked from known script flow.";
  return "These settings have one known caller and can be edited from the selected step or Action Settings tab.";
}

function edcdRiskMessage(usage: EdcdRowUsage) {
  if (usage.status === "missing") return `Settings #${usage.rowId} are referenced but missing.`;
  if (usage.status === "conflict") return `Settings #${usage.rowId} have conflicting callers.`;
  if (usage.status === "shared") return `Settings #${usage.rowId} are shared by ${usage.callers.length} steps.`;
  return `Review Settings #${usage.rowId}.`;
}

function ed3SummaryMessage(classification: string, count: number, label: string) {
  if (classification === "source-backed") return `${count.toLocaleString()} callable Extra Action Point${count === 1 ? "" : "s"}.`;
  if (classification === "probable-editor-padding") return `${count.toLocaleString()} likely empty imported Extra Action Point${count === 1 ? "" : "s"}.`;
  if (classification === "runtime-mutation-candidate") return `${count.toLocaleString()} possible runtime leftover Extra Action Point${count === 1 ? "" : "s"}.`;
  if (classification === "orphan-authored-content") return `${count.toLocaleString()} possible orphan authored Extra Action Point${count === 1 ? "" : "s"}.`;
  if (classification === "needs-runtime-trace") return `${count.toLocaleString()} Extra Action Point${count === 1 ? "" : "s"} need runtime confirmation.`;
  return `${count.toLocaleString()} ${label.toLowerCase()} entr${count === 1 ? "y" : "ies"}.`;
}

function ed3SummaryDetail(classification: string, fallback?: string) {
  if (classification === "source-backed") return "These are linked from known scenario flow and can be inspected normally in Scripts.";
  if (classification === "probable-editor-padding") return "These look empty or unused, so Providence counts them but does not list every entry.";
  if (classification === "runtime-mutation-candidate") return "These may be leftover state that Realmz mutates while running a scenario.";
  if (classification === "orphan-authored-content") return "These contain action-like content but no caller Providence can prove yet.";
  if (classification === "needs-runtime-trace") return "These may be real behavior, but need playtesting or deeper tracing before editing confidently.";
  return fallback ?? "Providence preserved these entries but cannot explain them yet.";
}

function humanScriptTriageDetail(classification: string) {
  if (classification === "runtime-mutation-candidate") return "May be runtime state rather than author-authored behavior. Open it before editing.";
  if (classification === "orphan-authored-content") return "Looks authored, but Providence has not found what calls it yet.";
  if (classification === "needs-runtime-trace") return "Could be reachable through behavior Providence has not decoded. Verify before relying on it.";
  return "Imported entry needs review before editing.";
}

function LintIssueRow({ issue, onSelectEntity }: { issue: Issue; onSelectEntity: (entity: SelectedEntity) => void }) {
  const target = issue.target ?? (isSemanticId(issue.source) ? issue.source : null);
  const meta = [issue.provenance ? issueProvenanceLabel(issue.provenance) : null, target].filter(Boolean).join(" | ");
  const content = (
    <>
      {issue.severity === "error" ? "x" : issue.severity === "warning" ? "!" : "i"} {issue.message}
      {issue.detail && <small>{issue.detail}</small>}
      {meta && <small>{meta}</small>}
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

function issueProvenanceLabel(value: NonNullable<Issue["provenance"]>) {
  if (value === "authored") return "Scenario-authored";
  if (value === "imported") return "Imported evidence";
  if (value === "reference") return "Reference";
  if (value === "runtime") return "Runtime evidence";
  return "Export";
}
