import { Ed3ReachabilityRow, Project, SemanticLink, TriggerRecord } from "./types";

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

const effectiveReachabilityCache = new WeakMap<Project, Map<number, Ed3ReachabilityRow>>();

export function ed3ReachabilityFor(project: Project | null, recordIndex: number) {
  if (!project) return null;
  return effectiveEd3ReachabilityRows(project).get(recordIndex) ?? null;
}

export function effectiveEd3ReachabilityRows(project: Project | null) {
  if (!project) return new Map<number, Ed3ReachabilityRow>();
  const cached = effectiveReachabilityCache.get(project);
  if (cached) return cached;
  const rows = rebuildEd3ReachabilityRows(project);
  const map = new Map(rows.map((row) => [row.recordIndex, row]));
  effectiveReachabilityCache.set(project, map);
  return map;
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

function rebuildEd3ReachabilityRows(project: Project): Ed3ReachabilityRow[] {
  const ed3Triggers = project.triggers.filter((trigger) => trigger.source === "Data ED3" && trigger.active !== false);
  if (ed3Triggers.length === 0) return [];
  const ed3Ids = new Set(ed3Triggers.map((trigger) => `macro:${trigger.recordIndex}`));
  const semanticLinks = project.semanticSchema?.links ?? [];
  const incoming = new Map<string, SemanticLink[]>();
  for (const link of semanticLinks) {
    if (!ed3Ids.has(link.to)) continue;
    const links = incoming.get(link.to) ?? [];
    links.push(link);
    incoming.set(link.to, links);
  }
  const reachable = new Map<string, { rootType: string; evidence: string[] }>();
  const directIncoming = new Map<string, number>();
  const addDirectIncoming = (target: string) => directIncoming.set(target, (directIncoming.get(target) ?? 0) + 1);
  const setReachableRoot = (target: string, rootType: string, evidence: string[]) => {
    if (!ed3Ids.has(target) || reachable.has(target)) return;
    reachable.set(target, { rootType, evidence });
  };
  for (const [target, links] of incoming) {
    const root = links.find((link) =>
      (isMacroReachabilityLink(link) && !link.from.startsWith("action-slot:macro:")) ||
      (link.kind === "calls_battle_macro" && isNegativeBattleMacroLink(link))
    );
    if (!root) continue;
    setReachableRoot(
      target,
      root.kind === "calls_battle_macro" ? "negative-battle-macro" : ed3RootTypeForLinkSource(root.from),
      [root.id]
    );
  }
  for (const battle of project.battles ?? []) {
    if (!battle.battleMacro || battle.battleMacro >= 0) continue;
    const target = `macro:${Math.abs(battle.battleMacro)}`;
    if (!ed3Ids.has(target)) continue;
    const hasSemanticLink = (incoming.get(target) ?? []).some((link) => link.kind === "calls_battle_macro" && link.from === `battle:${battle.id}`);
    if (!hasSemanticLink) addDirectIncoming(target);
    setReachableRoot(target, "negative-battle-macro", [`battle:${battle.id}:battleMacro`]);
  }
  const addMonsterRoots = (records: Project["monsters"], sourceFile: string) => {
    for (const monster of records ?? []) {
      if (!monster.deathMacro || monster.deathMacro <= 0) continue;
      const target = `macro:${monster.deathMacro}`;
      if (!ed3Ids.has(target)) continue;
      const entityId = sourceFile === "Data MD" ? `monster:${monster.id}` : `monster:${sourceFile}:${monster.id}`;
      const hasSemanticLink = (incoming.get(target) ?? []).some((link) => link.kind === "calls_macro" && link.from === entityId && link.metadata?.field === "deathMacro");
      if (!hasSemanticLink) addDirectIncoming(target);
      setReachableRoot(target, "monster-death-hook", [`${entityId}:deathMacro`]);
    }
  };
  addMonsterRoots(project.monsters ?? [], "Data MD");
  for (const set of project.monsterSets ?? []) {
    addMonsterRoots(set.monsters ?? [], set.sourceFile || (set.setId === 1 ? "Data MD1" : set.setId === -1 ? "Data MD-1" : "Data MD"));
  }
  const queue = Array.from(reachable.keys());
  while (queue.length > 0) {
    const current = queue.shift()!;
    const [, recordIndex] = current.split(":");
    const prefix = `action-slot:macro:${recordIndex}:`;
    for (const link of semanticLinks.filter((candidate) => isMacroReachabilityLink(candidate) && candidate.from.startsWith(prefix))) {
      if (!ed3Ids.has(link.to) || reachable.has(link.to)) continue;
      reachable.set(link.to, { rootType: "recursive-macro-call", evidence: [...(reachable.get(current)?.evidence ?? []), link.id] });
      queue.push(link.to);
    }
  }
  return ed3Triggers.map((trigger) => {
    const entityId = `macro:${trigger.recordIndex}`;
    const root = reachable.get(entityId);
    const actionCount = occupiedStepCount(trigger);
    return {
      recordIndex: trigger.recordIndex,
      entityId,
      classification: root ? "reachable-macro" : nonreachableClassification(trigger, actionCount),
      reachable: Boolean(root),
      pathStatus: root ? "source-backed-root" : "not-source-reachable",
      rootType: root?.rootType ?? null,
      incomingRefs: (incoming.get(entityId)?.length ?? 0) + (directIncoming.get(entityId) ?? 0),
      actionCount,
      rawSignature: trigger.actions.flatMap((action) => [action.rawCode, action.id]),
      evidence: root?.evidence ?? ["effective-ed3-reachability"],
      promotionRule: root
        ? "Promoted from Data ED3 because a source-backed root reaches this record."
        : "Preserved as Data ED3 evidence until source-backed reachability or explicit authoring exists."
    };
  });
}

const MACRO_REACHABILITY_LINK_KINDS = new Set([
  "calls_macro",
  "branches_to",
  "branches_true",
  "branches_false",
  "branches_keep",
  "branches_drop",
  "branches_on_coward",
  "branches_on_revived_loss"
]);

function isMacroReachabilityLink(link: SemanticLink) {
  return MACRO_REACHABILITY_LINK_KINDS.has(link.kind);
}

function isNegativeBattleMacroLink(link: SemanticLink) {
  const rawValue = link.metadata?.rawValue;
  return typeof rawValue === "number" && rawValue < 0;
}

function ed3RootTypeForLinkSource(from: string) {
  if (from.startsWith("action-slot:trigger:")) return "map-trigger-call";
  if (from.startsWith("random:")) return "random-region-door";
  if (from.startsWith("time:")) return "timed-encounter-door";
  if (from.startsWith("item:")) return "door-item-macro";
  if (from.startsWith("monster:")) return "monster-death-hook";
  if (from.startsWith("global:")) return "global-macro-slot";
  return "source-backed-root";
}

function nonreachableClassification(trigger: TriggerRecord, actionCount: number) {
  if (actionCount === 0) return "probable-editor-padding";
  if (trigger.actions.some((action) => {
    const code = Math.abs(Number(action.code || action.rawCode || 0));
    return code === 7 || code === 13;
  })) return "runtime-mutation-candidate";
  if (actionCount >= 2) return "needs-runtime-trace";
  return "orphan-authored-content";
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
