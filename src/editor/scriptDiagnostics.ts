import { Ed3ReachabilityRow, Project, TriggerRecord } from "./types";

export type Ed3DiagnosticTone = "ready" | "muted" | "warning";

export type Ed3DiagnosticSummary = {
  recordIndex: number;
  entityId: string;
  classification: string;
  label: string;
  searchTitle: string;
  linterLabel: string;
  badge: string;
  tone: Ed3DiagnosticTone;
  linterSeverity: "warning" | null;
  detail: string;
  reachable: boolean;
  rootType: string | null;
  incomingRefs: number;
  actionCount: number;
  rawSignature: number[];
  evidence: string[];
  promotionRule: string;
};

export const ED3_CLASSIFICATION_ORDER = [
  "source-backed",
  "probable-editor-padding",
  "runtime-mutation-candidate",
  "orphan-authored-content",
  "needs-runtime-trace",
  "unknown"
] as const;

export function ed3ReachabilityFor(project: Project | null, recordIndex: number) {
  if (!project) return null;
  return project.semanticSchema?.decoding?.ed3Reachability?.find((row) => row.recordIndex === recordIndex) ?? null;
}

export function ed3DiagnosticForTrigger(project: Project | null, trigger: TriggerRecord): Ed3DiagnosticSummary | null {
  if (trigger.source !== "Data ED3") return null;
  const row = ed3ReachabilityFor(project, trigger.recordIndex);
  const actionCount = row?.actionCount ?? occupiedStepCount(trigger);
  return ed3DiagnosticSummary(row, {
    recordIndex: trigger.recordIndex,
    entityId: `macro:${trigger.recordIndex}`,
    actionCount,
    rawSignature: trigger.actions
      .filter((action) => action.rawCode !== 0 || action.id !== 0)
      .flatMap((action) => [action.rawCode, action.id])
      .slice(0, 16)
  });
}

export function ed3DiagnosticSummary(
  row: Ed3ReachabilityRow | null | undefined,
  fallback: { recordIndex: number; entityId?: string; actionCount?: number; rawSignature?: number[] }
): Ed3DiagnosticSummary {
  const reachable = Boolean(row?.reachable);
  const classification = reachable ? "source-backed" : row?.classification ?? "unknown";
  const metadata = ed3ClassificationMetadata(classification, row?.rootType);
  return {
    recordIndex: row?.recordIndex ?? fallback.recordIndex,
    entityId: row?.entityId ?? fallback.entityId ?? `macro:${fallback.recordIndex}`,
    classification,
    label: metadata.label,
    searchTitle: metadata.searchTitle,
    linterLabel: metadata.linterLabel,
    badge: metadata.badge,
    tone: metadata.tone,
    linterSeverity: metadata.linterSeverity,
    detail: metadata.detail(row?.actionCount ?? fallback.actionCount ?? 0),
    reachable,
    rootType: row?.rootType ?? null,
    incomingRefs: row?.incomingRefs ?? 0,
    actionCount: row?.actionCount ?? fallback.actionCount ?? 0,
    rawSignature: row?.rawSignature ?? fallback.rawSignature ?? [],
    evidence: row?.evidence ?? [],
    promotionRule: row?.promotionRule ?? "No ED3 reachability row was generated for this record."
  };
}

export function ed3DiagnosticSummaries(project: Project | null) {
  if (!project) return [];
  return (project.triggers ?? [])
    .filter((trigger) => trigger.source === "Data ED3")
    .map((trigger) => ed3DiagnosticForTrigger(project, trigger))
    .filter((summary): summary is Ed3DiagnosticSummary => Boolean(summary))
    .sort((a, b) => a.recordIndex - b.recordIndex);
}

export function ed3ClassificationCounts(summaries: Ed3DiagnosticSummary[]) {
  const counts = new Map<string, number>();
  for (const key of ED3_CLASSIFICATION_ORDER) counts.set(key, 0);
  for (const summary of summaries) counts.set(summary.classification, (counts.get(summary.classification) ?? 0) + 1);
  return counts;
}

export function ed3RiskySummaries(summaries: Ed3DiagnosticSummary[]) {
  return summaries.filter((summary) => summary.linterSeverity);
}

export function ed3RootTypeLabel(rootType: string | null | undefined) {
  const value = rootType ?? "";
  if (value.includes("global")) return "Source-backed global event";
  if (value.includes("random")) return "Source-backed random encounter action";
  if (value.includes("time")) return "Source-backed timed encounter action";
  if (value.includes("battle")) return "Source-backed battle action";
  if (value.includes("monster")) return "Source-backed monster action";
  if (value.includes("item")) return "Source-backed item action";
  if (value.includes("recursive")) return "Source-backed recursive macro";
  return "Source-backed Extra Action Point";
}

export function ed3ReportRows(project: Project | null) {
  return ed3DiagnosticSummaries(project).map((summary) => ({
    recordIndex: summary.recordIndex,
    label: summary.label,
    classification: summary.classification,
    reachable: summary.reachable,
    rootType: summary.rootType,
    incomingRefs: summary.incomingRefs,
    actionCount: summary.actionCount,
    rawSignature: summary.rawSignature,
    evidence: summary.evidence,
    promotionRule: summary.promotionRule,
    detail: summary.detail
  }));
}

function ed3ClassificationMetadata(classification: string, rootType: string | null | undefined) {
  if (classification === "source-backed") {
    const label = ed3RootTypeLabel(rootType);
    return {
      label,
      searchTitle: label.replace("Source-backed ", ""),
      linterLabel: "Source-backed Extra Action Point",
      badge: "Callable",
      tone: "ready" as const,
      linterSeverity: null,
      detail: (actionCount: number) => `Source-backed call path found; ${formatStepCount(actionCount)}.`
    };
  }
  if (classification === "probable-editor-padding") {
    return {
      label: "Likely empty padding",
      searchTitle: "Likely Padding",
      linterLabel: "Likely Padding",
      badge: "Padding",
      tone: "muted" as const,
      linterSeverity: null,
      detail: () => "No occupied steps and no source-backed caller. This is probably an unused imported ED3 slot."
    };
  }
  if (classification === "runtime-mutation-candidate") {
    return {
      label: "Possible runtime mutation residue",
      searchTitle: "Runtime Residue",
      linterLabel: "Runtime Residue",
      badge: "Runtime",
      tone: "warning" as const,
      linterSeverity: "warning" as const,
      detail: () => "Contains action-state mutation opcodes but no source-backed caller. Treat as preserved imported evidence until runtime use is proven."
    };
  }
  if (classification === "orphan-authored-content") {
    return {
      label: "Possible orphan authored action",
      searchTitle: "Orphan Extra Action",
      linterLabel: "Orphan Authored",
      badge: "Orphan",
      tone: "warning" as const,
      linterSeverity: "warning" as const,
      detail: () => "Has authored-looking content but no known caller. It may be unused, stale, or reached by behavior Providence has not decoded yet."
    };
  }
  if (classification === "needs-runtime-trace") {
    return {
      label: "Needs runtime trace",
      searchTitle: "Needs Runtime Trace",
      linterLabel: "Needs Trace",
      badge: "Trace",
      tone: "warning" as const,
      linterSeverity: "warning" as const,
      detail: () => "Multiple occupied steps but no source-backed caller. Confirm with Realmz runtime behavior before treating it as callable."
    };
  }
  return {
    label: "Unclassified imported action row",
    searchTitle: "Unclassified Action Row",
    linterLabel: "Unclassified",
    badge: "Unknown",
    tone: "muted" as const,
    linterSeverity: null,
    detail: () => "Providence preserved this imported row but does not yet have enough context to explain whether it is used."
  };
}

function occupiedStepCount(trigger: TriggerRecord) {
  return trigger.actions.filter((action) => action.rawCode !== 0 || action.id !== 0).length;
}

function formatStepCount(actionCount: number) {
  return `${actionCount} occupied step${actionCount === 1 ? "" : "s"}`;
}
