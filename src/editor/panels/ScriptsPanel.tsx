import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Copy, Plus, Trash2, X } from "lucide-react";
import { LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, QuestThread, SelectedEntity, TriggerRecord } from "../types";
import { selectEntityFromId } from "../utils";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { buildEdcdRowUsages, edcdUsageMatchesFilter, edcdUsageStatusTone, edcdUsageToEditorUsage, nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowFilter, type EdcdRowUsage, type EdcdRowCaller } from "../edcdRows";
import { TutorialTip } from "../components/TutorialTip";
import { EmptyState, PanelSection, ScrollArea } from "../ui";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { buildQuestPresentation, questCategoryLabel, QUEST_CATEGORIES, type QuestFlagModel, type QuestUsage } from "../questUsage";
import {
  scriptLabel,
  scriptPanelTitle,
  usePersistentValue
} from "./scripts/scriptInventory";
import {
  SCRIPT_ACTION_DEFINITIONS,
  scriptActionDefinitionFor
} from "./scripts/scriptActionCatalog";
import { actionSlotSelectionId } from "./scripts/actionPointSelection";
import { ActionPointAuthoringPanel } from "./scripts/ActionPointAuthoringPanel";


const SCRIPT_EDITOR_TABS = [
  { id: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { id: "macros", label: "Extra Action Points", title: "Extra Action Points and branch targets." },
  { id: "global-macros", label: "Global Events", title: "Scenario-wide event hooks and startup logic." },
  { id: "quests", label: "Story Flags", title: "Beta story-flag labels, decoded usage, and optional author notes." },
  { id: "settings-rows", label: "Action Settings", title: "Advanced browser for shared or imported action settings." }
];

const SETTINGS_HELP =
  "Action Settings hold the extra fields for actions whose CODE/ID slot is too small. Pick the storage row from its caller when possible; Providence names the fields for the selected action and keeps imported storage stable.";

export function ScriptsPanel({
  project,
  catalog,
  selectedEntity,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onOpenMapCoordinate,
  onApplyCommand,
  activeEditor = "action-points"
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const [, startScriptTransition] = useTransition();
  const { confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const effectiveEditor = activeEditor === "domain"
    ? "action-points"
    : activeEditor === "ed3-evidence"
      ? "macros"
      : activeEditor;
  const handleSelectEntity = useCallback((entity: SelectedEntity) => {
    startScriptTransition(() => onSelectEntity(entity));
  }, [onSelectEntity]);
  const handleApplyCommand = useCallback((command: ProjectCommand) => {
    startScriptTransition(() => onApplyCommand?.(command));
  }, [onApplyCommand]);
  const handleSelectEditor = useCallback((editor: string) => {
    if (editor === effectiveEditor) return;
    confirmBeforeDraftDiscard(`switch to ${scriptPanelTitle(editor)}`, () => onSelectEditor?.(editor));
  }, [confirmBeforeDraftDiscard, effectiveEditor, onSelectEditor]);
  const settingsUsages = useMemo(
    () => project && effectiveEditor === "settings-rows" ? buildEdcdRowUsages(project, catalog) : [],
    [project, catalog, effectiveEditor]
  );
  const handleOpenSettingsCaller = useCallback((caller: EdcdRowCaller) => {
    if (!project) return;
    if (caller.contextKind === "trigger") {
      const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
      if (!trigger) return;
      handleSelectEntity(selectEntityFromId(actionSlotSelectionId(trigger, caller.slot)));
      onSelectEditor?.(scriptEditorForTriggerSource(trigger.source));
      return;
    }
    if (caller.contextKind === "simpleEncounter") {
      handleSelectEntity(selectEntityFromId(`encounter:simple:${caller.triggerRecordIndex}`));
      onSelectEditor?.("simple");
      return;
    }
    handleSelectEntity(selectEntityFromId(`encounter:complex:${caller.triggerRecordIndex}`));
    onSelectEditor?.("complex");
  }, [handleSelectEntity, onSelectEditor, project]);
  const workbench = project && effectiveEditor === "settings-rows" ? (
    <SettingsRowsPanel
      project={project}
      catalog={catalog}
      selectedEntity={selectedEntity}
      usages={settingsUsages}
      onSelectEntity={handleSelectEntity}
      onOpenTool={onOpenTool}
      onOpenCaller={handleOpenSettingsCaller}
      onApplyCommand={handleApplyCommand}
    />
  ) : project && effectiveEditor === "quests" ? (
    <QuestWorkbench
      project={project}
      scripts={project.triggers}
      onSelectEntity={handleSelectEntity}
      onApplyCommand={handleApplyCommand}
    />
  ) : (
    <ActionPointAuthoringPanel
      project={project}
      catalog={catalog}
      activeEditor={effectiveEditor}
      selectedEntity={selectedEntity}
      desktopRuntime={desktopRuntime}
      projectDir={projectDir}
      workspaceDir={workspaceDir}
      onSelectEntity={handleSelectEntity}
      onSelectEditor={onSelectEditor}
      onOpenTool={onOpenTool}
      onOpenMapCoordinate={onOpenMapCoordinate}
      onApplyCommand={handleApplyCommand}
    />
  );
  return (
    <div className="editor-full-panel scripts-workbench">
      <ScriptEditorTabs activeEditor={effectiveEditor} onSelectEditor={handleSelectEditor} />
      {workbench}
    </div>
  );
}

function ScriptEditorTabs({
  activeEditor,
  onSelectEditor
}: {
  activeEditor: string;
  onSelectEditor?: (editor: string) => void;
}) {
  return (
    <div className="script-editor-tabs" role="tablist" aria-label="Action Point Hub sections">
      {SCRIPT_EDITOR_TABS.map((tab) => {
        const selected = activeEditor === tab.id;
        return (
          <button
            key={tab.id}
            className={selected ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.title}
            onClick={() => onSelectEditor?.(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}


function QuestWorkbench({
  project,
  scripts,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  scripts: TriggerRecord[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const model = useMemo(() => buildQuestPresentation(project, scripts), [project, scripts]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<number | null>(null);
  const userThreads = useMemo(() => model.threads.filter((thread) => thread.source !== "bundled"), [model.threads]);
  const selectedThread = userThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedQuest = selectedQuestId == null ? null : model.questById.get(selectedQuestId) ?? null;
  const threadQuests = selectedThread ? selectedThread.questIds.map((id) => model.questById.get(id)).filter(Boolean) as QuestFlagModel[] : [];
  const activeUses = selectedThread
    ? threadQuests.flatMap((quest) => quest.uses.map((usage) => ({ ...usage, questLabel: quest.label }))).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : selectedQuest?.uses.map((usage) => ({ ...usage, questLabel: selectedQuest.label })) ?? [];

  useEffect(() => {
    if (selectedThreadId && !userThreads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(null);
    if (selectedQuestId != null && !model.questById.has(selectedQuestId)) setSelectedQuestId(null);
    if (!selectedThreadId && selectedQuestId == null) {
      if (model.quests[0]) setSelectedQuestId(model.quests[0].id);
      else if (userThreads[0]) setSelectedThreadId(userThreads[0].id);
    }
  }, [model.quests, model.questById, selectedQuestId, selectedThreadId, userThreads]);

  const createThread = () => {
    onApplyCommand?.({ kind: "createQuestThread", label: "Create author note", name: `Author Note ${userThreads.length + 1}` });
  };
  const updateThread = (thread: QuestThread, changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">>) => {
    onApplyCommand?.({ kind: "updateQuestThread", label: "Update author note", threadId: thread.id, changes });
  };
  const addQuestToThread = (thread: QuestThread, questId: number) => {
    updateThread(thread, { questIds: [...thread.questIds, questId] });
  };
  const removeQuestFromThread = (thread: QuestThread, questId: number) => {
    updateThread(thread, { questIds: thread.questIds.filter((id) => id !== questId) });
  };
  return (
    <section className="quest-workbench">
      <header className="settings-rows-header">
        <div>
          <strong>Story Flags</strong>
          <small>Beta view for naming story flags and reviewing where scripts set, test, clear, increment, and branch on them.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createThread}>
            <Plus size={12} /> Author Note
          </button>
        </div>
      </header>
      <div className="quest-workbench-layout">
        <aside className="quest-thread-column">
          <PanelSection title="Decoded Story Flags" eyebrow={`${model.quests.length} known`} density="compact" className="quest-raw-panel">
            <div className="quest-raw-list">
              {model.quests.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className={`quest-raw-row${quest.id === selectedQuest?.id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedThreadId(null);
                    setSelectedQuestId(quest.id);
                  }}
                >
                  <span>
                    <b>{quest.label}</b>
                    <small>Quest {quest.id} | {quest.uses.length} use{quest.uses.length === 1 ? "" : "s"}</small>
                  </span>
                  {quest.warnings.length > 0 && <AlertTriangle size={13} />}
                </button>
              ))}
              {model.quests.length === 0 && <small className="empty-copy compact">No flag labels or decoded quest-flag uses found.</small>}
            </div>
          </PanelSection>
          <PanelSection title="Context Notes" eyebrow={`${userThreads.length} author`} density="compact">
            {userThreads.length === 0 ? (
              <div className="script-tab-note">
                <strong>No author notes yet</strong>
                <small>Create a note if you want to group raw flags or document story meaning for this project.</small>
              </div>
            ) : (
              <div className="quest-card-list">
                {userThreads.map((thread) => (
                  <div key={thread.id} className={`quest-thread-card${thread.id === selectedThread?.id ? " selected" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setSelectedQuestId(null);
                      }}
                    >
                      <strong>{thread.name}</strong>
                      <small>{thread.questIds.length} flag{thread.questIds.length === 1 ? "" : "s"}</small>
                    </button>
                    <button type="button" className="btn btn-danger btn-xs icon-only" title="Delete note" onClick={() => onApplyCommand?.({ kind: "deleteQuestThread", label: "Delete author note", threadId: thread.id })}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PanelSection>
        </aside>
        <main className="quest-detail-panel">
          {selectedThread ? (
            <QuestThreadDetail
              thread={selectedThread}
              quests={threadQuests}
              allQuests={model.quests}
              uses={activeUses}
              onOpenUsage={onSelectEntity}
              onUpdateThread={(changes) => updateThread(selectedThread, changes)}
              onAddQuest={(questId) => addQuestToThread(selectedThread, questId)}
              onRemoveQuest={(questId) => removeQuestFromThread(selectedThread, questId)}
              onApplyCommand={onApplyCommand}
            />
          ) : selectedQuest ? (
            <QuestFlagDetail
              quest={selectedQuest}
              threads={model.threads}
              uses={activeUses}
              onOpenUsage={onSelectEntity}
              onAddToThread={(thread) => addQuestToThread(thread, selectedQuest.id)}
              onApplyCommand={onApplyCommand}
              userThreads={userThreads}
            />
          ) : (
            <EmptyState title="No story flag selected" body="Select a raw Divinity quest flag or create an optional author note." />
          )}
        </main>
      </div>
    </section>
  );
}

function QuestThreadDetail({
  thread,
  quests,
  allQuests,
  uses,
  onOpenUsage,
  onUpdateThread,
  onAddQuest,
  onRemoveQuest,
  onApplyCommand
}: {
  thread: QuestThread;
  quests: QuestFlagModel[];
  allQuests: QuestFlagModel[];
  uses: Array<QuestUsage & { questLabel: string }>;
  onOpenUsage: (entity: SelectedEntity) => void;
  onUpdateThread: (changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">>) => void;
  onAddQuest: (questId: number) => void;
  onRemoveQuest: (questId: number) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const threadIds = new Set(thread.questIds);
  return (
    <div className="quest-detail-grid">
      <PanelSection title={thread.source === "bundled" ? "Curated Note" : "Author Note"} eyebrow={`${thread.questIds.length} flags`} density="compact">
        {thread.source === "bundled" ? (
          <div className="known-thread-summary">
            <strong>{thread.name}</strong>
            <small>{thread.description}</small>
            <span>This bundled beta note is read-only. Create a project author note if you want editable interpretation.</span>
          </div>
        ) : (
          <>
            <label className="field-stack">
              <span>Name</span>
              <input key={`${thread.id}:name`} defaultValue={thread.name} onBlur={(event) => onUpdateThread({ name: event.currentTarget.value })} />
            </label>
            <label className="field-stack">
              <span>Notes</span>
              <textarea key={`${thread.id}:description`} defaultValue={thread.description} rows={3} onBlur={(event) => onUpdateThread({ description: event.currentTarget.value })} />
            </label>
          </>
        )}
        <div className="quest-chip-grid">
          {quests.map((quest) => (
            <span key={quest.id} className="quest-chip">
              {quest.label}
              {thread.source !== "bundled" && <button type="button" title="Remove from thread" onClick={() => onRemoveQuest(quest.id)}><X size={11} /></button>}
            </span>
          ))}
          {quests.length === 0 && <small className="empty-copy compact">{thread.source === "bundled" ? "This note has no matching raw flags in the current decoded view." : "Add raw flags to build this author note."}</small>}
        </div>
      </PanelSection>
      <QuestContextRefsPanel
        title="Attached Context"
        refs={thread.contextRefs ?? []}
        emptyCopy="No imported context is attached to this note."
      />
      {thread.source !== "bundled" && (
        <PanelSection title="Add Flag" eyebrow="raw flags" density="compact">
          <div className="quest-add-grid">
            {allQuests.filter((quest) => !threadIds.has(quest.id)).slice(0, 18).map((quest) => (
              <button key={quest.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddQuest(quest.id)}>
                <Plus size={11} /> {quest.label}
              </button>
            ))}
            {allQuests.every((quest) => threadIds.has(quest.id)) && <small className="empty-copy compact">Every known quest flag is already in this thread.</small>}
          </div>
        </PanelSection>
      )}
      <QuestUsageTimeline uses={uses} onOpenUsage={onOpenUsage} />
      <ThreadWarnings quests={quests} onApplyCommand={onApplyCommand} />
    </div>
  );
}

function QuestFlagDetail({
  quest,
  threads,
  uses,
  onOpenUsage,
  onAddToThread,
  onApplyCommand,
  userThreads
}: {
  quest: QuestFlagModel;
  threads: QuestThread[];
  uses: Array<QuestUsage & { questLabel: string }>;
  onOpenUsage: (entity: SelectedEntity) => void;
  onAddToThread: (thread: QuestThread) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  userThreads: QuestThread[];
}) {
  return (
    <div className="quest-detail-grid">
      <PanelSection title={quest.label} eyebrow={`Quest ${quest.id}`} density="compact">
        <div className="quest-usage-counts">
          {QUEST_CATEGORIES.map((category) => quest.counts[category] > 0 && (
            <span key={category}>{questCategoryLabel(category)} <b>{quest.counts[category]}</b></span>
          ))}
        </div>
        <label className="field-stack">
          <span>Flag Label</span>
          <input
            key={`${quest.id}:label`}
            defaultValue={quest.authored ? quest.label : ""}
            placeholder={`Quest ${quest.id}`}
            onBlur={(event) => {
              const label = event.currentTarget.value.trim();
              if (label) onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest label", quest: { id: quest.id, label, note: quest.note } });
            }}
          />
        </label>
        <label className="field-stack">
          <span>Flag Notes</span>
          <textarea
            key={`${quest.id}:note`}
            defaultValue={quest.note}
            rows={3}
            onBlur={(event) => {
              if (quest.authored || event.currentTarget.value.trim()) {
                onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest note", quest: { id: quest.id, label: quest.label, note: event.currentTarget.value } });
              }
            }}
          />
        </label>
        {!quest.authored && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: quest.id, label: `Quest ${quest.id}` } })}>
            <Plus size={12} /> Create Label
          </button>
        )}
      </PanelSection>
      <PanelSection title="Add To Author Note" eyebrow={`${userThreads.length} saved`} density="compact">
        <div className="quest-add-grid">
          {userThreads.filter((thread) => !thread.questIds.includes(quest.id)).map((thread) => (
            <button key={thread.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddToThread(thread)}>
              <Plus size={11} /> {thread.name}
            </button>
          ))}
          {userThreads.length === 0 && <small className="empty-copy compact">Create an author note first.</small>}
        </div>
      </PanelSection>
      <QuestContextRefsPanel
        title="Nearby Context"
        refs={quest.contextRefs}
        emptyCopy="No attached context is linked to this flag."
      />
      <QuestUsageTimeline uses={uses} onOpenUsage={onOpenUsage} />
      <QuestWarnings warnings={quest.warnings} />
    </div>
  );
}

function QuestContextRefsPanel({ title, refs, emptyCopy }: { title: string; refs: NonNullable<QuestThread["contextRefs"]>; emptyCopy: string }) {
  return (
    <PanelSection title={title} eyebrow={`${refs.length} clue${refs.length === 1 ? "" : "s"}`} density="compact">
      {refs.length === 0 ? (
        <small className="empty-copy compact">{emptyCopy}</small>
      ) : (
        <div className="quest-context-ref-list">
          {refs.map((ref, index) => (
            <div key={`${ref.sourceId}:${ref.sectionId ?? index}`} className="quest-context-ref">
              <strong>{ref.label}</strong>
              {ref.snippet && <small>{ref.snippet}</small>}
              {ref.terms && ref.terms.length > 0 && (
                <div className="quest-context-term-row">
                  {ref.terms.slice(0, 8).map((term) => <span key={term}>{term}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function QuestUsageTimeline({ uses, onOpenUsage }: { uses: Array<QuestUsage & { questLabel: string }>; onOpenUsage: (entity: SelectedEntity) => void }) {
  return (
    <PanelSection title="Flag Flow" eyebrow={`${uses.length} decoded uses`} density="compact" className="quest-flow-panel">
      {uses.length === 0 ? (
        <small className="empty-copy compact">No decoded script uses yet.</small>
      ) : (
        <div className="quest-flow-list">
          {uses.map((usage) => (
            <div key={usage.key} className={`quest-flow-row ${usage.category}`}>
              <span>
                <b>{questCategoryLabel(usage.category)}</b>
                <small>{usage.questLabel} | {usage.sourceLabel}</small>
                <em>{usage.detail}</em>
              </span>
              {usage.entityId && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onOpenUsage(selectEntityFromId(usage.entityId!))}>
                  Open
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function QuestWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <PanelSection title="Warnings" eyebrow={`${warnings.length}`} density="compact">
      <div className="quest-warning-list">
        {warnings.map((warning) => (
          <div key={warning} className="quest-warning-row">
            <AlertTriangle size={13} />
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

function ThreadWarnings({ quests, onApplyCommand }: { quests: QuestFlagModel[]; onApplyCommand?: (command: ProjectCommand) => void }) {
  const warnings = quests.flatMap((quest) => quest.warnings.map((warning) => ({ quest, warning })));
  if (warnings.length === 0) return null;
  return (
    <PanelSection title="Thread Warnings" eyebrow={`${warnings.length}`} density="compact">
      <div className="quest-warning-list">
        {warnings.map(({ quest, warning }) => (
          <div key={`${quest.id}:${warning}`} className="quest-warning-row">
            <AlertTriangle size={13} />
            <span><b>{quest.label}</b>: {warning}</span>
            {!quest.authored && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: quest.id, label: `Quest ${quest.id}` } })}
              >
                Label
              </button>
            )}
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

const EDCD_ROW_FILTERS: Array<{ id: EdcdRowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in-use", label: "In Use" },
  { id: "shared", label: "Shared" },
  { id: "unused", label: "Unused" },
  { id: "missing", label: "Missing" },
  { id: "conflict", label: "Conflicts" }
];

function SettingsRowsPanel({
  project,
  catalog,
  selectedEntity,
  usages,
  onSelectEntity,
  onOpenTool,
  onOpenCaller,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  usages: EdcdRowUsage[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenCaller: (caller: EdcdRowCaller) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [filter, setFilter] = usePersistentValue<EdcdRowFilter>("scripts.edcdRows.filter", "all");
  const [query, setQuery] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [templateOpcode, setTemplateOpcode] = useState<number>(() => SCRIPT_ACTION_DEFINITIONS.find((definition) => definition.edcdShape)?.opcode ?? 2);
  const edcdTemplates = SCRIPT_ACTION_DEFINITIONS.filter((definition) => definition.edcdShape && definition.authoringLevel !== "ignored");
  const selectedEntityRowId = edcdRowIdFromSelectedEntity(selectedEntity);

  useEffect(() => {
    if (selectedEntityRowId == null) return;
    setSelectedRowId(selectedEntityRowId);
    setQuery(String(selectedEntityRowId));
  }, [selectedEntityRowId]);
  const selectedTemplate = scriptActionDefinitionFor(templateOpcode);
  const usageCounts = useMemo(() => {
    const counts = new Map<EdcdRowFilter, number>(EDCD_ROW_FILTERS.map((entry) => [entry.id, 0]));
    for (const usage of usages) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(usage.status, (counts.get(usage.status) ?? 0) + 1);
    }
    return counts;
  }, [usages]);
  const filteredUsages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return usages.filter((usage) => {
      if (!edcdUsageMatchesFilter(usage, filter)) return false;
      if (!normalized) return true;
      return [
        usage.rowId,
        usage.statusLabel,
        usage.summary,
        usage.primaryActionLabel,
        usage.primaryShape,
        usage.possibleShapes.join(" "),
        usage.values.join(" "),
        usage.callers.map((caller) => `${caller.actionLabel} ${callerLabel(project, caller)} ${caller.slot}`).join(" ")
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [filter, query, usages]);
  const selectedUsage = filteredUsages.find((usage) => usage.rowId === selectedRowId)
    ?? usages.find((usage) => usage.rowId === selectedRowId)
    ?? filteredUsages[0]
    ?? usages[0]
    ?? null;
  const selectedShape = selectedUsage?.primaryShape ?? selectedTemplate.edcdShape ?? undefined;
  const selectedOpcode = selectedUsage?.primaryOpcode ?? selectedTemplate.opcode;
  const editorUsage = selectedUsage ? edcdUsageToEditorUsage(selectedUsage, selectedShape) : null;
  const canDelete = selectedUsage?.exists && selectedUsage.status === "unused";
  const duplicateRow = () => {
    if (!selectedUsage) return;
    const nextId = nextUnusedEdcdRowId(project);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Duplicate Settings #${selectedUsage.rowId}`, rowId: nextId, values: selectedUsage.values });
    setSelectedRowId(nextId);
  };
  const createRow = () => {
    const nextId = selectedUsage && !selectedUsage.exists ? selectedUsage.rowId : nextUnusedEdcdRowId(project);
    const values = normalizeEdcdValues(selectedUsage?.exists ? selectedUsage.values : selectedTemplate.defaultDraft.parameters);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Create Settings #${nextId}`, rowId: nextId, values });
    setSelectedRowId(nextId);
  };

  return (
    <section className="settings-rows-workbench">
      <header>
        <div>
          <TutorialTip title="Action Settings" body={SETTINGS_HELP} side="below">
            <strong>Action Settings</strong>
          </TutorialTip>
          <small>Inspect and repair the extra fields used by settings-backed actions.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createRow}>
            <Plus size={12} /> Create From Template
          </button>
        </div>
      </header>
      <div className="settings-rows-layout">
        <aside className="settings-row-list-column">
          <div className="settings-row-filter-panel">
            <input
              className="script-list-filter"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter action settings..."
            />
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Action settings filter">
              {EDCD_ROW_FILTERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={filter === entry.id ? "active" : ""}
                  onClick={() => setFilter(entry.id)}
                >
                  <span>{entry.label}</span>
                  <b>{usageCounts.get(entry.id) ?? 0}</b>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="settings-row-list" aria-label="Action settings">
            {filteredUsages.map((usage) => (
              <button
                key={usage.rowId}
                type="button"
                className={`settings-row-card${usage.rowId === selectedUsage?.rowId ? " selected" : ""} ${edcdUsageStatusTone(usage.status)}`}
                onClick={() => setSelectedRowId(usage.rowId)}
              >
                <span>
                  <strong>Settings #{usage.rowId}</strong>
                  <small>{usage.summary}</small>
                </span>
                <b>{usage.statusLabel}</b>
                <small>{usage.callers.length} caller{usage.callers.length === 1 ? "" : "s"}{usage.primaryShape ? ` | ${usage.primaryShape}` : ""}</small>
              </button>
            ))}
            {filteredUsages.length === 0 && <EmptyState compact title="No action settings" body="No settings match this filter." />}
          </ScrollArea>
        </aside>
        <main className="settings-row-detail">
          {selectedUsage ? (
            <PanelSection
              title={`Settings #${selectedUsage.rowId}`}
              eyebrow={selectedUsage.statusLabel}
              density="compact"
              actions={
                <>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={duplicateRow} disabled={!selectedUsage.exists}>
                    <Copy size={12} /> Duplicate Settings
                  </button>
                  <button type="button" className="btn btn-danger btn-xs" disabled={!canDelete} title={canDelete ? "Delete these unused settings." : "Only unused settings can be deleted here."} onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete Settings #${selectedUsage.rowId}`, rowId: selectedUsage.rowId })}>
                    <Trash2 size={12} /> Delete Unused Settings
                  </button>
                </>
              }
            >
              <div className="settings-row-overview">
                <div className={`settings-row-status ${edcdUsageStatusTone(selectedUsage.status)}`}>
                  <strong>{selectedUsage.statusLabel}</strong>
                  <span>{selectedUsage.exists ? "Stored in project action settings." : "Referenced by a script but not created yet."}</span>
                </div>
                {selectedUsage.warnings.map((warning) => <p key={warning} className="field-warning">{warning}</p>)}
                {selectedUsage.callers.length > 0 && (
                  <div className="settings-row-callers">
                    <strong>Used By</strong>
                    {selectedUsage.callers.map((caller) => (
                      <button key={`${caller.triggerId}-${caller.slot}`} type="button" className="settings-row-caller" onClick={() => onOpenCaller(caller)}>
                        <span>{caller.actionShortLabel}</span>
                        <small>{callerLabel(project, caller)} | step {caller.slot + 1}</small>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedUsage.primaryShape && (
                  <label className="script-required-field">
                    <span>Template</span>
                    <select value={templateOpcode} onChange={(event) => setTemplateOpcode(Number(event.currentTarget.value))}>
                      {edcdTemplates.map((definition) => (
                        <option key={definition.opcode} value={definition.opcode}>{definition.label}</option>
                      ))}
                    </select>
                    <small>Choose a template to interpret or create this row with guided fields.</small>
                  </label>
                )}
              </div>
              <EdcdRowEditor
                project={project}
                catalog={catalog}
                edcdUsage={editorUsage}
                fallbackRowId={selectedUsage.rowId}
                fallbackShape={selectedShape}
                fallbackFieldNames={selectedShape ? edcdFieldNamesForShape(selectedShape) : undefined}
                fallbackInitialValues={selectedUsage.exists ? selectedUsage.values : selectedTemplate.defaultDraft.parameters}
                fallbackOpcode={selectedOpcode}
                parameterLabels={selectedOpcode != null ? scriptActionDefinitionFor(selectedOpcode).parameters : undefined}
                selectedSlotLabel="settings"
                onSelectEntity={onSelectEntity}
                onOpenText={(editor) => onOpenTool?.("text", editor)}
                onApplyCommand={onApplyCommand}
              />
            </PanelSection>
          ) : (
            <EmptyState title="No action settings yet" body="Create settings from a template or add a settings-backed action to a script." />
          )}
        </main>
      </div>
    </section>
  );
}

function callerLabel(project: Project, caller: EdcdRowCaller) {
  if (caller.contextKind === "simpleEncounter") return `Simple Encounter ${caller.triggerRecordIndex}`;
  if (caller.contextKind === "complexEncounter") return `Complex Encounter ${caller.triggerRecordIndex}`;
  const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
  if (!trigger) return `Record ${caller.triggerRecordIndex}`;
  return scriptLabel(project, trigger);
}

function scriptEditorForTriggerSource(source: string) {
  if (source === "Data ED3") return "macros";
  if (source === "Global") return "global-macros";
  return "action-points";
}

function edcdRowIdFromSelectedEntity(entity: SelectedEntity | null) {
  const match = /^record:Data EDCD:(-?\d+)$/.exec(entity?.id ?? "");
  if (!match) return null;
  const rowId = Number(match[1]);
  return Number.isFinite(rowId) ? Math.max(0, Math.trunc(rowId)) : null;
}
