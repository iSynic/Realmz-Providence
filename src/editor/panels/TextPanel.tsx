import { ChevronLeft, ChevronRight, Copy, Eraser, List, MessageSquarePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LibraryCatalog, MessageRecord, OptionLabelRecord, Project, ProjectCommand, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { classicTextByteLength, messageUsageLinks, optionLabelUsageLinks, unsupportedClassicTextChars } from "../contentLinks";

const DIVINITY_TEXT_SEPARATOR = `${" ".repeat(20)}\uf8ff${" ".repeat(20)}`;
type TextAuthoringTab = "strings" | "option-labels";

export function TextPanel({
  project,
  catalog,
  selectedEntity,
  activeEditor = "messages",
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  activeEditor?: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [findCursor, setFindCursor] = useState(0);
  const [resourceQuery, setResourceQuery] = useState("");
  const [textFileStatus, setTextFileStatus] = useState<{ kind: "ok" | "warning"; text: string } | null>(null);
  const [showList, setShowList] = useState(activeEditor === "messages" || activeEditor === "domain");
  const [showReferences, setShowReferences] = useState(activeEditor === "text-resources" || activeEditor === "spell-check");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TextAuthoringTab>(() => activeEditor === "option-labels" ? "option-labels" : "strings");
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const records = useMemo(() => [...(project.messages ?? [])].sort((a, b) => a.id - b.id), [project.messages]);
  const optionRecords = useMemo(() => [...(project.optionLabels ?? [])].sort((a, b) => a.id - b.id), [project.optionLabels]);
  const selectedId = selectedMessageId(selectedEntity, records) ?? records[0]?.id ?? 0;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;
  const effectiveOptionId = selectedOptionId ?? optionRecords[0]?.id ?? 0;
  const selectedOption = optionRecords.find((record) => record.id === effectiveOptionId) ?? null;
  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized));
  }, [query, records]);
  const usageCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const record of records) counts.set(record.id, messageUsageLinks(project, record.id).length);
    return counts;
  }, [project, records]);
  const findMatches = useMemo(() => {
    const normalized = findQuery.trim().toLowerCase();
    if (!normalized) return [];
    return records
      .filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized))
      .map((record) => record.id);
  }, [findQuery, records]);
  const reviewStringIds = useMemo(() => records.filter(isStringReviewCandidate).map((record) => record.id), [records]);
  const nextId = nextMessageId(records);
  const resourceRows = useMemo(() => textReferenceRows(project, catalog, resourceQuery), [catalog, project, resourceQuery]);
  const selectedReference = selectedReferenceId ? resourceRows.find((row) => row.id === selectedReferenceId) ?? null : null;
  const referencePanelOpen = showReferences || selectedReference != null;
  const handleTextFileImport = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    const parts = content.split(DIVINITY_TEXT_SEPARATOR);
    if (parts.length !== records.length) {
      setTextFileStatus({
        kind: "warning",
        text: `Import found ${parts.length.toLocaleString()} string segment${parts.length === 1 ? "" : "s"}, but this project has ${records.length.toLocaleString()} strings. Nothing was changed.`
      });
      return;
    }
    const updates = records.map((record, index) => ({ id: record.id, text: normalizeImportedString(parts[index] ?? "") }));
    onApplyCommand({ kind: "bulkUpdateMessageRecords", label: `Import ${updates.length} strings`, updates });
    setTextFileStatus({ kind: "ok", text: `Imported ${updates.length.toLocaleString()} strings from ${file.name}. Review any maximum-length strings before export.` });
  };

  useEffect(() => {
    if (activeTab === "strings" && !selectedRecord && records.length > 0) {
      onSelectEntity(selectEntityFromId(`message:${records[0].id}`));
    }
  }, [activeTab, onSelectEntity, records, selectedRecord]);

  useEffect(() => {
    if (activeEditor === "text-resources" || activeEditor === "spell-check") {
      setShowReferences(true);
    }
    if (activeEditor === "messages" || activeEditor === "domain") {
      setShowList(true);
      setActiveTab("strings");
    }
    if (activeEditor === "option-labels") {
      setActiveTab("option-labels");
    }
  }, [activeEditor]);

  useEffect(() => {
    if (selectedOptionId == null && optionRecords.length > 0) {
      setSelectedOptionId(optionRecords[0].id);
    }
  }, [optionRecords, selectedOptionId]);

  return (
    <section className="text-workbench">
      <header className="text-workbench-header">
        <div>
          <h1>String Editor</h1>
          <p>Edit scenario strings and two-choice option labels used by Realmz dialogs.</p>
        </div>
        <div className="text-workbench-actions">
          <b>{records.length.toLocaleString()} strings | {optionRecords.length.toLocaleString()} option labels</b>
          <input
            ref={importInputRef}
            type="file"
            accept=".txt,text/plain"
            className="sr-only-file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              void handleTextFileImport(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => exportDivinityTextFile(records)}
            title="Export all strings as a plain text spell-check file with Divinity-style separators."
          >
            Export Text
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => importInputRef.current?.click()}
            title="Import a plain text file previously exported from this Strings editor."
          >
            Import Text
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={resourceRows.length === 0}
            onClick={() => setShowReferences((value) => !value)}
            title="Show or hide readable TEXT, STR#, and style string resources."
          >
            <List size={14} /> {referencePanelOpen ? "Hide References" : "Reference Strings"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              onApplyCommand({ kind: "createTargetRecord", label: `Create String ${nextId}`, recordType: "message", id: nextId });
              onSelectEntity(selectEntityFromId(`message:${nextId}`));
            }}
          >
            <MessageSquarePlus size={14} /> New String {nextId}
          </button>
        </div>
      </header>
      <div className="text-authoring-tabs" role="tablist" aria-label="String editors">
        <button type="button" className={activeTab === "strings" ? "active" : ""} role="tab" aria-selected={activeTab === "strings"} onClick={() => setActiveTab("strings")}>
          Strings
        </button>
        <button type="button" className={activeTab === "option-labels" ? "active" : ""} role="tab" aria-selected={activeTab === "option-labels"} onClick={() => setActiveTab("option-labels")}>
          Option Labels
        </button>
      </div>
      {activeTab === "strings" && (
        <StringNavigator
          records={records}
          selectedId={selectedId}
          findQuery={findQuery}
          findCount={findMatches.length}
          showList={showList}
          onToggleList={() => setShowList((value) => !value)}
          onSelect={(id) => onSelectEntity(selectEntityFromId(`message:${id}`))}
          onFindQueryChange={(value) => {
            setFindQuery(value);
            setFindCursor(0);
          }}
          onFindFirst={() => {
            const first = findMatches[0];
            if (first != null) {
              setFindCursor(0);
              onSelectEntity(selectEntityFromId(`message:${first}`));
            }
          }}
          onFindNext={() => {
            if (!findMatches.length) return;
            const currentIndex = findMatches.indexOf(selectedId);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % findMatches.length : findCursor % findMatches.length;
            setFindCursor(nextIndex);
            onSelectEntity(selectEntityFromId(`message:${findMatches[nextIndex]}`));
          }}
          reviewCount={reviewStringIds.length}
          onFindNextReview={() => {
            const nextReviewId = nextReviewStringId(reviewStringIds, selectedId);
            if (nextReviewId != null) onSelectEntity(selectEntityFromId(`message:${nextReviewId}`));
          }}
        />
      )}
      {textFileStatus && (
        <div className={`text-file-status ${textFileStatus.kind}`}>
          {textFileStatus.text}
        </div>
      )}
      {activeTab === "strings" ? <div className="text-workbench-layout">
        {showList && <aside className="text-message-list-panel">
          <div className="text-search-row">
            <span>{filteredRecords.length.toLocaleString()} shown</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search strings..." />
          </div>
          <div className="text-message-list" role="list" aria-label="Scenario strings">
            {filteredRecords.map((record) => {
              const selected = record.id === selectedId;
              const usageCount = usageCounts.get(record.id) ?? 0;
              const byteLength = classicTextByteLength(record.text);
              return (
                <button
                  key={record.id}
                  type="button"
                  className={selected ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`message:${record.id}`))}
                >
                  <strong>String {record.id}</strong>
                  <span>{record.text || "Empty string"}</span>
                  <small>{usageCount} use{usageCount === 1 ? "" : "s"} | {byteLength}/255 bytes</small>
                </button>
              );
            })}
            {filteredRecords.length === 0 && <p>No strings match this search.</p>}
          </div>
        </aside>}
        <main className="text-editor-surface">
          {selectedRecord ? (
            <MessageEditor
              key={selectedRecord.id}
              project={project}
              record={selectedRecord}
              records={records}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="empty-copy">Create a string to begin authoring text.</div>
          )}
          {referencePanelOpen && (
            <section className="text-reference-panel">
              <header>
                <div>
                  <h2>Reference Strings</h2>
                  <p>Readable TEXT, STR#, and style resources are searchable reference material.</p>
                </div>
                <div className="text-reference-actions">
                  <input value={resourceQuery} onChange={(event) => setResourceQuery(event.currentTarget.value)} placeholder="Search TEXT / STR#..." />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
                    setSelectedReferenceId(null);
                    setShowReferences(false);
                  }}>
                    Hide
                  </button>
                </div>
              </header>
              {selectedReference ? (
                <TextReferenceDetail row={selectedReference} onBack={() => setSelectedReferenceId(null)} onInspect={() => onSelectEntity(selectEntityFromId(selectedReference.id))} />
              ) : (
                <div className="text-reference-grid">
                  {resourceRows.slice(0, 120).map((row) => (
                    <button key={row.id} type="button" onClick={() => setSelectedReferenceId(row.id)}>
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                      <small>{row.source}</small>
                    </button>
                  ))}
                  {resourceRows.length === 0 && <p>No readable strings match this search.</p>}
                </div>
              )}
            </section>
          )}
        </main>
      </div> : (
        <OptionLabelsWorkbench
          project={project}
          records={optionRecords}
          selectedId={effectiveOptionId}
          selectedRecord={selectedOption}
          onSelect={setSelectedOptionId}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
    </section>
  );
}

function StringNavigator({
  records,
  selectedId,
  findQuery,
  findCount,
  showList,
  onToggleList,
  onSelect,
  onFindQueryChange,
  onFindFirst,
  onFindNext,
  reviewCount,
  onFindNextReview
}: {
  records: MessageRecord[];
  selectedId: number;
  findQuery: string;
  findCount: number;
  showList: boolean;
  onToggleList: () => void;
  onSelect: (id: number) => void;
  onFindQueryChange: (value: string) => void;
  onFindFirst: () => void;
  onFindNext: () => void;
  reviewCount: number;
  onFindNextReview: () => void;
}) {
  const selectedIndex = Math.max(0, records.findIndex((record) => record.id === selectedId));
  const previous = records[Math.max(0, selectedIndex - 1)] ?? null;
  const next = records[Math.min(records.length - 1, selectedIndex + 1)] ?? null;
  return (
    <nav className="text-string-navigator" aria-label="String navigator">
      <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!previous || previous.id === selectedId} onClick={() => previous && onSelect(previous.id)} title="Previous string">
        <ChevronLeft size={15} />
      </button>
      <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!next || next.id === selectedId} onClick={() => next && onSelect(next.id)} title="Next string">
        <ChevronRight size={15} />
      </button>
      <label>
        <span>Go To String</span>
        <select value={selectedId} onChange={(event) => onSelect(Number(event.currentTarget.value))}>
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.id}: {record.text || "Empty"}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleList}>
        <List size={14} /> {showList ? "Hide Search List" : "Show Search List"}
      </button>
      <label className="text-find-field">
        <span>Find Occurrence</span>
        <input value={findQuery} onChange={(event) => onFindQueryChange(event.currentTarget.value)} placeholder="Search all strings..." />
      </label>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!findCount} onClick={onFindFirst}>
        Find First
      </button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!findCount} onClick={onFindNext}>
        Find Next {findCount ? `(${findCount})` : ""}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!reviewCount}
        onClick={onFindNextReview}
        title="Find the next string at the Realmz length limit or with characters that need cleanup before export."
      >
        Find Long String {reviewCount ? `(${reviewCount})` : ""}
      </button>
    </nav>
  );
}

function MessageEditor({
  project,
  record,
  records,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  record: MessageRecord;
  records: MessageRecord[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [text, setText] = useState(record.text);
  const byteLength = classicTextByteLength(text);
  const unsupportedChars = unsupportedClassicTextChars(text);
  const changed = text !== record.text;
  const usages = messageUsageLinks(project, record.id);
  const nextId = nextMessageId(records);
  return (
    <article className="text-message-editor">
      <header>
        <div>
          <span>String {record.id}</span>
          <small>{usages.length} use{usages.length === 1 ? "" : "s"} across this scenario</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              onApplyCommand({ kind: "duplicateMessageRecord", label: `Duplicate String ${record.id}`, fromId: record.id, toId: nextId });
              onSelectEntity(selectEntityFromId(`message:${nextId}`));
            }}
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setText("");
              onApplyCommand({ kind: "deleteTargetRecord", label: `Clear String ${record.id}`, recordType: "message", id: record.id });
            }}
          >
            <Eraser size={12} /> Clear
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!changed || byteLength > 255}
            onClick={() => onApplyCommand({ kind: "updateMessageRecord", label: `Update String ${record.id}`, id: record.id, changes: { text } })}
          >
            Apply String
          </button>
        </div>
      </header>
      <label className="text-message-field">
        <span>Text</span>
        <textarea value={text} onChange={(event) => setText(event.currentTarget.value)} />
      </label>
      <div className={`text-message-status ${byteLength > 255 || unsupportedChars.length ? "warning" : "ok"}`}>
        <span>{byteLength}/255 bytes before export</span>
        {byteLength > 255 && <b>Too long for a Realmz message record.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as ?.</b>}
        {!changed && byteLength <= 255 && unsupportedChars.length === 0 && <b>Ready</b>}
      </div>
      <section className="text-used-by-panel">
        <header>Used By</header>
        <div>
          {usages.map((usage) => (
            <button key={usage.key} type="button" onClick={() => usage.entity && onSelectEntity(usage.entity)}>
              <strong>{usage.label}</strong>
              <small>{usage.detail}</small>
            </button>
          ))}
          {usages.length === 0 && <p>No known references yet.</p>}
        </div>
      </section>
      <details className="advanced-details">
        <summary>Advanced Details</summary>
        <div className="summary-table">
          <div><dt>Record</dt><dd>Data SD2 #{record.id}</dd></div>
          <div><dt>State</dt><dd>{record.authored ? "Editable project string" : "Imported string"}</dd></div>
          <div><dt>Bytes</dt><dd>{record.rawBytes?.length ?? 0} preserved bytes</dd></div>
        </div>
      </details>
    </article>
  );
}

function OptionLabelsWorkbench({
  project,
  records,
  selectedId,
  selectedRecord,
  onSelect,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  records: OptionLabelRecord[];
  selectedId: number;
  selectedRecord: OptionLabelRecord | null;
  onSelect: (id: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized));
  }, [query, records]);
  const selectedIndex = Math.max(0, records.findIndex((record) => record.id === selectedId));
  const previous = records[Math.max(0, selectedIndex - 1)] ?? null;
  const next = records[Math.min(records.length - 1, selectedIndex + 1)] ?? null;
  const nextId = nextOptionLabelId(records);
  return (
    <>
      <nav className="text-string-navigator" aria-label="Option label navigator">
        <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!previous || previous.id === selectedId} onClick={() => previous && onSelect(previous.id)} title="Previous option label">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!next || next.id === selectedId} onClick={() => next && onSelect(next.id)} title="Next option label">
          <ChevronRight size={15} />
        </button>
        <label>
          <span>Go To Label</span>
          <select value={selectedId} onChange={(event) => onSelect(Number(event.currentTarget.value))}>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.id}: {record.text || "Empty"}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowList((value) => !value)}>
          <List size={14} /> {showList ? "Hide Search List" : "Show Search List"}
        </button>
        <label className="text-find-field">
          <span>Search Labels</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search option labels..." />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            onApplyCommand({ kind: "createOptionLabel", label: `Create Option Label ${nextId}`, id: nextId });
            onSelect(nextId);
          }}
        >
          <MessageSquarePlus size={14} /> New Label {nextId}
        </button>
      </nav>
      <div className="text-workbench-layout">
        {showList && (
          <aside className="text-message-list-panel">
            <div className="text-search-row">
              <span>{filteredRecords.length.toLocaleString()} shown</span>
              <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search option labels..." />
            </div>
            <div className="text-message-list" role="list" aria-label="Option labels">
              {filteredRecords.map((record) => {
                const selected = record.id === selectedId;
                const usages = optionLabelUsageLinks(project, record.id);
                const byteLength = classicTextByteLength(record.text);
                return (
                  <button key={record.id} type="button" className={selected ? "selected" : ""} onClick={() => onSelect(record.id)}>
                    <strong>Option Label {record.id}</strong>
                    <span>{record.text || "Empty label"}</span>
                    <small>{usages.length} use{usages.length === 1 ? "" : "s"} | {byteLength}/24 bytes</small>
                  </button>
                );
              })}
              {filteredRecords.length === 0 && <p>No option labels match this search.</p>}
            </div>
          </aside>
        )}
        <main className="text-editor-surface">
          {selectedRecord ? (
            <OptionLabelEditor
              key={selectedRecord.id}
              project={project}
              record={selectedRecord}
              records={records}
              onSelect={onSelect}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="empty-copy">Create an option label to begin authoring two-choice dialog labels.</div>
          )}
        </main>
      </div>
    </>
  );
}

function OptionLabelEditor({
  project,
  record,
  records,
  onSelect,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  record: OptionLabelRecord;
  records: OptionLabelRecord[];
  onSelect: (id: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [text, setText] = useState(record.text);
  const byteLength = classicTextByteLength(text);
  const unsupportedChars = unsupportedClassicTextChars(text);
  const changed = text !== record.text;
  const usages = optionLabelUsageLinks(project, record.id);
  const shortcut = optionLabelShortcut(text);
  const duplicateShortcut = shortcut ? records.some((candidate) => candidate.id !== record.id && optionLabelShortcut(candidate.text) === shortcut) : false;
  const nextId = nextOptionLabelId(records);
  return (
    <article className="text-message-editor">
      <header>
        <div>
          <span>Option Label {record.id}</span>
          <small>{usages.length} use{usages.length === 1 ? "" : "s"} across two-choice dialogs</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              onApplyCommand({ kind: "duplicateOptionLabel", label: `Duplicate Option Label ${record.id}`, fromId: record.id, toId: nextId });
              onSelect(nextId);
            }}
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setText("");
              onApplyCommand({ kind: "clearOptionLabel", label: `Clear Option Label ${record.id}`, id: record.id });
            }}
          >
            <Eraser size={12} /> Clear
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!changed || byteLength > 24}
            onClick={() => onApplyCommand({ kind: "updateOptionLabel", label: `Update Option Label ${record.id}`, id: record.id, changes: { text } })}
          >
            Apply Label
          </button>
        </div>
      </header>
      <label className="text-message-field option-label-field">
        <span>Option Label</span>
        <input value={text} onChange={(event) => setText(event.currentTarget.value)} />
      </label>
      <div className={`text-message-status ${byteLength > 24 || unsupportedChars.length || duplicateShortcut ? "warning" : "ok"}`}>
        <span>{byteLength}/24 bytes before export</span>
        {shortcut && <span>Shortcut: {shortcut.toUpperCase()}</span>}
        {!shortcut && <b>First visible character becomes the keyboard shortcut.</b>}
        {duplicateShortcut && <b>Another option label uses this shortcut.</b>}
        {byteLength > 24 && <b>Too long for a Realmz option label.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as ?.</b>}
        {!changed && byteLength <= 24 && unsupportedChars.length === 0 && !duplicateShortcut && <b>Ready</b>}
      </div>
      <section className="text-used-by-panel">
        <header>Used By</header>
        <div>
          {usages.map((usage) => (
            <button key={usage.key} type="button" onClick={() => usage.entity && onSelectEntity(usage.entity)} disabled={!usage.entity}>
              <strong>{usage.label}</strong>
              <small>{usage.detail}</small>
            </button>
          ))}
          {usages.length === 0 && <p>No known two-choice references yet.</p>}
        </div>
      </section>
      <details className="advanced-details">
        <summary>Advanced Details</summary>
        <div className="summary-table">
          <div><dt>Record</dt><dd>Data OD #{record.id}</dd></div>
          <div><dt>State</dt><dd>{record.authored ? "Editable option label" : "Imported option label"}</dd></div>
          <div><dt>Bytes</dt><dd>{record.rawBytes?.length ?? 0} preserved bytes</dd></div>
        </div>
      </details>
    </article>
  );
}

function selectedMessageId(selectedEntity: SelectedEntity | null, records: MessageRecord[]) {
  if (selectedEntity?.id.startsWith("message:")) {
    const id = Number(selectedEntity.id.slice("message:".length));
    if (Number.isInteger(id)) return id;
  }
  return records[0]?.id ?? null;
}

function TextReferenceDetail({
  row,
  onBack,
  onInspect
}: {
  row: TextReferenceRow;
  onBack: () => void;
  onInspect: () => void;
}) {
  return (
    <article className="text-reference-detail">
      <header>
        <div>
          <strong>{row.label}</strong>
          <small>{row.source}</small>
        </div>
        <div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onBack}>Back To Search</button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onInspect}>Inspect Details</button>
        </div>
      </header>
      <p>{row.detail}</p>
      {row.preview && <pre>{row.preview}</pre>}
      {!row.preview && <p>This resource has no readable preview yet.</p>}
    </article>
  );
}

type TextReferenceRow = {
  id: string;
  label: string;
  detail: string;
  source: string;
  preview: string;
};

function nextMessageId(records: MessageRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}

function nextOptionLabelId(records: OptionLabelRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}

function optionLabelShortcut(text: string) {
  return text
    .split("")
    .find((char) => char.trim().length > 0)
    ?.toLowerCase() ?? "";
}

function isStringReviewCandidate(record: MessageRecord) {
  return classicTextByteLength(record.text) >= 255 || unsupportedClassicTextChars(record.text).length > 0;
}

function nextReviewStringId(ids: number[], selectedId: number) {
  if (ids.length === 0) return null;
  const directIndex = ids.indexOf(selectedId);
  if (directIndex >= 0) return ids[(directIndex + 1) % ids.length];
  return ids.find((id) => id > selectedId) ?? ids[0];
}

function normalizeImportedString(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function exportDivinityTextFile(records: MessageRecord[]) {
  const content = records.map((record) => record.text ?? "").join(DIVINITY_TEXT_SEPARATOR);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Export Text.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function textReferenceRows(project: Project, catalog: LibraryCatalog | null | undefined, query: string) {
  const wantedTypes = new Set(["text-resource", "string-list-resource", "style-resource"]);
  const rows = [
    ...project.semanticSchema.entities.filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary ?? {}),
      source: "Project",
      preview: textResourcePreview(entity.summary ?? {})
    })),
    ...(catalog?.entities ?? []).filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary ?? {}),
      source: "Library",
      preview: textResourcePreview(entity.summary ?? {})
    }))
  ];
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => `${row.label} ${row.detail} ${row.source}`.toLowerCase().includes(normalized));
}

function textResourceDetail(summary: Record<string, unknown>) {
  const resourceId = typeof summary.resourceId === "number" ? `#${summary.resourceId}` : "";
  const preview = typeof summary.textPreview === "string" ? summary.textPreview : "";
  const count = typeof summary.stringCount === "number" ? `${summary.stringCount} strings` : "";
  return [resourceId, count, preview].filter(Boolean).join(" | ") || "Readable reference";
}

function textResourcePreview(summary: Record<string, unknown>) {
  if (typeof summary.textPreview === "string") return summary.textPreview;
  if (typeof summary.preview === "string") return summary.preview;
  return "";
}
