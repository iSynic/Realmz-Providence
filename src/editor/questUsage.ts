import { Project, QuestContextRef, QuestLabel, QuestThread, TriggerRecord } from "./types";
import { normalizeStepOpcode } from "./realmzActions";
import { triggerEntityId } from "./utils";
import { contextRefsForQuest, suggestThreadsFromContext } from "./questContext";
import { recognizedQuestContextSources, recognizedQuestThreads, recognizedScenarioContextForProject, type RecognizedScenarioContext } from "./scenarioContext";

export type QuestUsageCategory =
  | "set"
  | "cleared"
  | "tested"
  | "incremented"
  | "required"
  | "branches"
  | "unknown";

export type QuestUsage = {
  key: string;
  questId: number;
  category: QuestUsageCategory;
  label: string;
  detail: string;
  sourceLabel: string;
  sourceKind: string;
  entityId: string | null;
  sortKey: string;
  storySnippets?: string[];
};

export type QuestFlagModel = {
  id: number;
  label: string;
  note: string;
  authored: boolean;
  uses: QuestUsage[];
  counts: Record<QuestUsageCategory, number>;
  warnings: string[];
  contextRefs: QuestContextRef[];
};

export type QuestThreadSuggestion = {
  id: string;
  name: string;
  description: string;
  questIds: number[];
  reason: string;
  contextRefs?: QuestContextRef[];
  evidence?: string[];
};

export type QuestPresentationModel = {
  quests: QuestFlagModel[];
  questById: Map<number, QuestFlagModel>;
  threads: QuestThread[];
  suggestions: QuestThreadSuggestion[];
  recognizedContext: RecognizedScenarioContext | null;
};

const QUEST_CATEGORIES: QuestUsageCategory[] = ["set", "cleared", "tested", "incremented", "required", "branches", "unknown"];

export function buildQuestPresentation(project: Project, scripts: TriggerRecord[]): QuestPresentationModel {
  const labels = new Map<number, QuestLabel>();
  for (const quest of project.questLabels ?? []) labels.set(quest.id, quest);
  const byId = new Map<number, QuestFlagModel>();
  const seenUses = new Set<string>();
  const rowById = new Map((project.extracodes ?? []).map((row) => [row.id, row.values ?? []]));

  const ensureQuest = (questId: number) => {
    const normalized = normalizeQuestId(questId);
    if (normalized == null) return null;
    const existing = byId.get(normalized);
    if (existing) return existing;
    const label = labels.get(normalized);
    const model: QuestFlagModel = {
      id: normalized,
      label: label?.label?.trim() || `Quest ${normalized}`,
      note: label?.note ?? "",
      authored: Boolean(label),
      uses: [],
      counts: {
        set: 0,
        cleared: 0,
        tested: 0,
        incremented: 0,
        required: 0,
        branches: 0,
        unknown: 0
      },
      warnings: [],
      contextRefs: []
    };
    byId.set(normalized, model);
    return model;
  };

  const addUse = (usage: QuestUsage) => {
    const quest = ensureQuest(usage.questId);
    if (!quest) return;
    const key = usage.key;
    if (seenUses.has(key)) return;
    seenUses.add(key);
    quest.uses.push(usage);
    quest.counts[usage.category] += 1;
  };

  for (const quest of labels.values()) ensureQuest(quest.id);

  for (const trigger of scripts) {
    const triggerLabel = triggerSourceLabel(trigger);
    const triggerId = triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
    for (const action of trigger.actions ?? []) {
      addActionQuestUses(addUse, action, rowById, {
        sourceLabel: triggerLabel,
        sourceKind: trigger.source,
        entityId: triggerId,
        sortKey: `${triggerId}:${action.slot.toString().padStart(2, "0")}`
      });
    }
  }

  for (const encounter of project.simpleEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      addActionQuestUses(addUse, action, rowById, {
        sourceLabel: `Simple Encounter ${encounter.id}`,
        sourceKind: "Data ED",
        entityId: `encounter:simple:${encounter.id}`,
        sortKey: `encounter:simple:${encounter.id}:${action.slot.toString().padStart(2, "0")}`
      });
    }
  }

  for (const encounter of project.complexEncounters ?? []) {
    for (const action of encounter.actions ?? []) {
      addActionQuestUses(addUse, action, rowById, {
        sourceLabel: `Complex Encounter ${encounter.id}`,
        sourceKind: "Data ED2",
        entityId: `encounter:complex:${encounter.id}`,
        sortKey: `encounter:complex:${encounter.id}:${action.slot.toString().padStart(2, "0")}`
      });
    }
  }

  for (const encounter of project.timedEncounters ?? []) {
    if (encounter.requiredQuest < 0) continue;
    addUse({
      key: `timed:${encounter.id}:required:${encounter.requiredQuest}`,
      questId: encounter.requiredQuest,
      category: "required",
      label: "Required by timed encounter",
      detail: `Timed Encounter ${encounter.id} requires quest flag ${encounter.requiredQuest} before it can run Extra Action Point ${encounter.door}.`,
      sourceLabel: `Timed Encounter ${encounter.id}`,
      sourceKind: "Data TD3",
      entityId: `encounter:timed:${encounter.id}`,
      sortKey: `encounter:timed:${encounter.id}`
    });
  }

  for (const link of project.semanticSchema?.links ?? []) {
    const questId = questIdFromSemanticId(link.to);
    if (questId == null) continue;
    const sourceLabel = semanticSourceLabel(link.from);
    const category: QuestUsageCategory = link.kind === "writes_flag" ? "unknown" : "tested";
    addUse({
      key: `semantic:${link.id}:${questId}:${category}`,
      questId,
      category,
      label: link.kind === "writes_flag" ? "Semantic write" : "Semantic read",
      detail: `${sourceLabel} ${link.kind.replace(/_/g, " ")} quest flag ${questId}.`,
      sourceLabel,
      sourceKind: "semantic",
      entityId: link.from,
      sortKey: `semantic:${sourceLabel}:${questId}`
    });
  }

  const recognizedContext = recognizedScenarioContextForProject(project);
  const contextSources = mergeContextSources(recognizedQuestContextSources(project), project.editorMetadata?.questContextSources ?? []);
  const quests = [...byId.values()].map((quest) => ({
    ...quest,
    uses: quest.uses.sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    warnings: questWarnings(quest),
    contextRefs: contextRefsForQuest(quest, contextSources)
  })).sort((a, b) => b.uses.length - a.uses.length || a.id - b.id);
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const threads = mergeQuestThreads(recognizedQuestThreads(project), project.editorMetadata?.questThreads ?? []);
  const derivedSuggestions = suggestQuestThreads(quests, threads);
  const contextSuggestions = suggestThreadsFromContext(quests, threads, contextSources);
  return {
    quests,
    questById,
    threads,
    suggestions: [...contextSuggestions, ...derivedSuggestions].slice(0, 18),
    recognizedContext
  };
}

function mergeContextSources(bundled: ReturnType<typeof recognizedQuestContextSources>, projectSources: ReturnType<typeof recognizedQuestContextSources>) {
  const byId = new Map<string, (typeof bundled)[number]>();
  for (const source of bundled) byId.set(source.id, source);
  for (const source of projectSources) byId.set(source.id, source);
  return [...byId.values()];
}

function mergeQuestThreads(bundled: QuestThread[], projectThreads: QuestThread[]) {
  const projectIds = new Set(projectThreads.map((thread) => thread.id));
  return [
    ...bundled.filter((thread) => !projectIds.has(thread.id)),
    ...projectThreads.map((thread) => ({ ...thread, source: thread.source ?? "user" as const }))
  ];
}

function addActionQuestUses(
  addUse: (usage: QuestUsage) => void,
  action: { slot: number; rawCode: number; code?: number; id: number },
  rowById: Map<number, number[]>,
  source: { sourceLabel: string; sourceKind: string; entityId: string; sortKey: string }
) {
  const code = normalizeStepOpcode(action.rawCode || action.code || 0);
  const row = rowById.get(Math.max(0, action.id)) ?? [];
  const slotLabel = `slot ${action.slot + 1}`;
  const base = {
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    entityId: source.entityId,
    sortKey: source.sortKey
  };
  if (code === 47) {
    const questId = Math.abs(action.id);
    if (questId === 0) return;
    addUse({
      key: `${source.sortKey}:direct-set:${questId}`,
      questId,
      category: action.id < 0 ? "cleared" : "set",
      label: action.id < 0 ? "Clears quest flag" : "Sets quest flag",
      detail: `${source.sourceLabel} ${slotLabel} ${action.id < 0 ? "clears" : "sets"} quest flag ${questId}.`,
      ...base
    });
    return;
  }
  if (code === 46) {
    const questId = rowValue(row, 0);
    if (questId == null) return;
    addUse({
      key: `${source.sortKey}:branch-on-quest:${questId}`,
      questId,
      category: "tested",
      label: "Branch on quest",
      detail: `${source.sourceLabel} ${slotLabel} tests quest flag ${questId}.`,
      ...base
    });
    addUse({
      key: `${source.sortKey}:branch-target:${questId}`,
      questId,
      category: "branches",
      label: "Branches from quest test",
      detail: branchDetail(row, `${source.sourceLabel} ${slotLabel}`),
      ...base
    });
    return;
  }
  if (code === 76) {
    const questId = rowValue(row, 0);
    if (questId == null) return;
    addUse({
      key: `${source.sortKey}:quest-value:${questId}`,
      questId,
      category: "incremented",
      label: "Changes quest value",
      detail: `${source.sourceLabel} ${slotLabel} changes quest flag ${questId} by ${row[1] ?? 0}.`,
      ...base
    });
    if ((row[3] ?? 0) !== 0) {
      addUse({
        key: `${source.sortKey}:quest-value-branch:${questId}`,
        questId,
        category: "branches",
        label: "Branches from quest value",
        detail: branchDetail(row, `${source.sourceLabel} ${slotLabel}`),
        ...base
      });
    }
    return;
  }
  if (code === 77) {
    const questId = rowValue(row, 0);
    if (questId == null) return;
    addUse({
      key: `${source.sortKey}:quest-branch:${questId}`,
      questId,
      category: "tested",
      label: "Quest value branch",
      detail: `${source.sourceLabel} ${slotLabel} compares quest flag ${questId}.`,
      ...base
    });
    addUse({
      key: `${source.sortKey}:quest-branch-target:${questId}`,
      questId,
      category: "branches",
      label: "Branches from quest value",
      detail: branchDetail(row, `${source.sourceLabel} ${slotLabel}`),
      ...base
    });
    return;
  }
  if (code === 72 || code === 75) {
    const low = rowValue(row, 0);
    const high = rowValue(row, 1);
    if (low == null || high == null) return;
    const range = expandQuestRange(low, high);
    for (const questId of range) {
      addUse({
        key: `${source.sortKey}:quest-range:${low}-${high}:${questId}`,
        questId,
        category: "tested",
        label: "Quest range test",
        detail: `${source.sourceLabel} ${slotLabel} tests a quest range from ${low} to ${high}.`,
        ...base
      });
    }
  }
}

function questWarnings(quest: QuestFlagModel) {
  const warnings: string[] = [];
  const writes = quest.counts.set + quest.counts.cleared + quest.counts.incremented + quest.counts.unknown;
  const reads = quest.counts.tested + quest.counts.required + quest.counts.branches;
  if (reads > 0 && writes === 0) warnings.push("Tested or required, but no decoded script sets this flag.");
  if (writes > 0 && reads === 0) warnings.push("Changed by scripts, but no decoded script tests it.");
  if (quest.counts.incremented > 0 && quest.counts.tested + quest.counts.branches > 0) warnings.push("Looks like a multi-stage quest value or counter.");
  if (!quest.authored && quest.uses.length > 0) warnings.push("No authored label yet.");
  return warnings;
}

function suggestQuestThreads(quests: QuestFlagModel[], threads: QuestThread[]) {
  const existing = new Set(threads.map((thread) => normalizedQuestSet(thread.questIds)));
  const suggestions: QuestThreadSuggestion[] = [];
  const usedSuggestionKeys = new Set<string>();
  const addSuggestion = (name: string, description: string, questIds: number[], reason: string) => {
    const unique = [...new Set(questIds.filter((id) => id >= 0))].sort((a, b) => a - b);
    if (unique.length < 2) return;
    const key = normalizedQuestSet(unique);
    if (!key || existing.has(key) || usedSuggestionKeys.has(key)) return;
    usedSuggestionKeys.add(key);
    suggestions.push({
      id: `suggested:${key}`,
      name,
      description,
      questIds: unique,
      reason
    });
  };

  const activeIds = quests.filter((quest) => quest.uses.length > 0).map((quest) => quest.id).sort((a, b) => a - b);
  let run: number[] = [];
  for (const questId of activeIds) {
    if (run.length === 0 || questId === run[run.length - 1] + 1) run.push(questId);
    else {
      addSuggestion(`Flags ${run[0]}-${run[run.length - 1]}`, "Nearby quest ids often represent one Divinity story sequence.", run, "nearby numeric IDs");
      run = [questId];
    }
  }
  addSuggestion(`Flags ${run[0]}-${run[run.length - 1]}`, "Nearby quest ids often represent one Divinity story sequence.", run, "nearby numeric IDs");

  const bySource = new Map<string, { sourceLabel: string; ids: number[] }>();
  for (const quest of quests) {
    for (const usage of quest.uses) {
      const key = usage.entityId ?? usage.sourceLabel;
      const group = bySource.get(key) ?? { sourceLabel: usage.sourceLabel, ids: [] };
      group.ids.push(quest.id);
      bySource.set(key, group);
    }
  }
  for (const group of bySource.values()) {
    const ids = [...new Set(group.ids)];
    addSuggestion(`Possible thread from ${group.sourceLabel}`, `These quest flags are read or written by ${group.sourceLabel}.`, ids, "shared script or encounter");
  }
  return suggestions.slice(0, 12);
}

function normalizedQuestSet(questIds: number[]) {
  return [...new Set(questIds)].sort((a, b) => a - b).join(",");
}

function triggerSourceLabel(trigger: TriggerRecord) {
  if (trigger.source === "Data ED3") return `Extra Action Point ${trigger.recordIndex}`;
  const kind = trigger.levelType === "dungeon" ? "Dungeon" : "Land";
  if (trigger.levelType != null && trigger.levelIndex != null) return `${kind} ${trigger.levelIndex} Action Point ${trigger.recordIndex}`;
  return `Action Point ${trigger.recordIndex}`;
}

function semanticSourceLabel(id: string) {
  if (id.startsWith("action-slot:")) return id.replace(/^action-slot:/, "Action slot ");
  if (id.startsWith("time:")) return `Timed Encounter ${id.replace(/^time:/, "")}`;
  if (id.startsWith("macro:")) return `Extra Action Point ${id.replace(/^macro:/, "")}`;
  if (id.startsWith("trigger:")) return id.replace(/^trigger:/, "Action Point ");
  return id;
}

function branchDetail(row: number[], prefix: string) {
  const mode = row[2] ?? 0;
  const destination = row[3] ?? row[4] ?? 0;
  if (destination === 0) return `${prefix} can branch, but the target row is empty or continues.`;
  const kind = mode === 1 ? "simple encounter" : mode === 2 ? "complex encounter" : "Extra Action Point";
  return `${prefix} can branch to ${kind} ${destination}.`;
}

function rowValue(row: number[], index: number) {
  const value = row[index];
  return normalizeQuestId(value);
}

function normalizeQuestId(value: number | undefined) {
  if (!Number.isFinite(value)) return null;
  const normalized = Math.trunc(value as number);
  return normalized >= 0 ? normalized : null;
}

function expandQuestRange(lowValue: number, highValue: number) {
  const low = Math.max(0, Math.min(lowValue, highValue));
  const high = Math.max(lowValue, highValue);
  if (high - low > 64) return [low, high];
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}

function questIdFromSemanticId(id: string) {
  const match = /^quest-flag:(\d+)$/.exec(id);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function questCategoryLabel(category: QuestUsageCategory) {
  if (category === "set") return "Set";
  if (category === "cleared") return "Cleared";
  if (category === "tested") return "Tested";
  if (category === "incremented") return "Incremented";
  if (category === "required") return "Required";
  if (category === "branches") return "Branches";
  return "Unknown";
}

export { QUEST_CATEGORIES };
