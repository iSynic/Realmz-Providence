import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo } from "react";
import { Issue, Project, SelectedEntity } from "../types";
import { SemanticInspector } from "../components/SemanticInspector";
import { selectEntityFromId } from "../utils";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, sourcePassThroughList, unresolvedLinks } from "../semanticGraph";
import { ScrollArea } from "../ui";

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

  return (
    <div className="editor-full-panel lint-workbench">
      <section className="tab-panel lint-panel">
        <div className="panel-header">
          <span>Project Linter</span>
          <button className="btn btn-primary btn-xs" disabled={!project} onClick={onValidate}>
            Re-run
          </button>
        </div>
        <div className="lint-summary">
          {project?.validation.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{project ? (project.validation.ok ? "No blocking export errors" : "Blocking export issues found") : "No project loaded"}</span>
        </div>
        <ScrollArea className="lint-results" aria-label="Project Linter">
          {semanticGroups.map((group) => (
            <section key={group.title}>
              <header>{group.title}</header>
              {group.rows.map((row) => (
                <LintInsightRow key={row.id} row={row} onSelectEntity={onSelectEntity} />
              ))}
            </section>
          ))}
          {grouped.map(([source, sourceIssues]) => (
            <section key={source}>
              <header>{source}</header>
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
        <ScrollArea className="semantic-right-scroll" aria-label="Linter semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        </ScrollArea>
      </aside>
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
      title: "Semantic Resource Coverage",
      rows: [
        ...gaps.slice(0, 12).map((gap): LintInsight => ({
          id: `gap:${gap.entity.id}`,
          severity: "warning",
          message: `${gap.entity.label} is ${gap.reason}.`,
          detail: `${gap.consumers.length.toLocaleString()} incoming semantic reference(s).`,
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
          message: `${blocked.entities.length + blocked.records.length} semantic object(s) are blocked from editing.`,
          detail: "Blocked entities are visible for inspection but cannot be written by this exporter."
        }
      ].filter((row) => !row.message.startsWith("0 ") || row.id === "runtime-caches")
    },
    {
      title: "Semantic Link Integrity",
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
