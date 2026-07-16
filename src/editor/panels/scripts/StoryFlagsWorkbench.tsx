import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import type { Project, ProjectCommand, QuestThread, SelectedEntity, TriggerRecord } from "../../types";
import { selectEntityFromId } from "../../utils";
import { EmptyState, PanelSection, SearchField } from "../../ui";
import { buildQuestPresentation, questCategoryLabel, QUEST_CATEGORIES, type QuestFlagModel, type QuestUsage } from "../../questUsage";

export function StoryFlagsWorkbench({
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
  const [questSearch, setQuestSearch] = useState("");
  const userThreads = useMemo(() => model.threads.filter((thread) => thread.source !== "bundled"), [model.threads]);
  const selectedThread = userThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedQuest = selectedQuestId == null ? null : model.questById.get(selectedQuestId) ?? null;
  const threadQuests = selectedThread ? selectedThread.questIds.map((id) => model.questById.get(id)).filter(Boolean) as QuestFlagModel[] : [];
  const activeUses = selectedThread
    ? threadQuests.flatMap((quest) => quest.uses.map((usage) => ({ ...usage, questLabel: quest.label }))).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : selectedQuest?.uses.map((usage) => ({ ...usage, questLabel: selectedQuest.label })) ?? [];
  const visibleQuests = useMemo(() => filterQuestFlags(model.quests, questSearch), [model.quests, questSearch]);

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
            <SearchField
              value={questSearch}
              onChange={setQuestSearch}
              placeholder="Search flags..."
              ariaLabel="Search decoded story flags"
              resultCount={visibleQuests.length}
              resultNoun="flag"
            />
            <div className="quest-raw-list">
              {visibleQuests.map((quest) => (
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
              {model.quests.length > 0 && visibleQuests.length === 0 && <small className="empty-copy compact">No story flags match this search.</small>}
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
                    <button type="button" className="btn btn-danger btn-xs icon-only" title="Delete note" aria-label={`Delete ${thread.name}`} onClick={() => onApplyCommand?.({ kind: "deleteQuestThread", label: "Delete author note", threadId: thread.id })}>
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
  const [addQuestSearch, setAddQuestSearch] = useState("");
  const threadIds = new Set(thread.questIds);
  const availableQuests = allQuests.filter((quest) => !threadIds.has(quest.id));
  const visibleAvailableQuests = filterQuestFlags(availableQuests, addQuestSearch);
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
          <SearchField
            value={addQuestSearch}
            onChange={setAddQuestSearch}
            placeholder="Search available flags..."
            ariaLabel="Search flags to add"
            resultCount={visibleAvailableQuests.length}
            resultNoun="flag"
          />
          <div className="quest-add-grid">
            {visibleAvailableQuests.map((quest) => (
              <button key={quest.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddQuest(quest.id)}>
                <Plus size={11} /> {quest.label}
              </button>
            ))}
            {availableQuests.length === 0 && <small className="empty-copy compact">Every known quest flag is already in this thread.</small>}
            {availableQuests.length > 0 && visibleAvailableQuests.length === 0 && <small className="empty-copy compact">No available flags match this search.</small>}
          </div>
        </PanelSection>
      )}
      <QuestUsageTimeline uses={uses} onOpenUsage={onOpenUsage} />
      <ThreadWarnings quests={quests} onApplyCommand={onApplyCommand} />
    </div>
  );
}

export function filterQuestFlags(quests: QuestFlagModel[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return quests;
  return quests.filter((quest) => {
    const searchable = [
      quest.id,
      quest.label,
      quest.note,
      ...quest.uses.flatMap((usage) => [usage.category, usage.label, usage.detail, usage.sourceLabel])
    ].join(" ").toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
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
