import { ChevronLeft, ChevronRight, Copy, Eraser, List, MessageSquarePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LibraryCatalog, MessageRecord, Project, ProjectCommand, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { classicTextByteLength, messageUsageLinks, unsupportedClassicTextChars } from "../contentLinks";

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
  const [resourceQuery, setResourceQuery] = useState("");
  const [showList, setShowList] = useState(activeEditor === "messages");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const records = useMemo(() => [...(project.messages ?? [])].sort((a, b) => a.id - b.id), [project.messages]);
  const selectedId = selectedMessageId(selectedEntity, records) ?? records[0]?.id ?? 0;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;
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
  const nextId = nextMessageId(records);
  const resourceRows = useMemo(() => textReferenceRows(project, catalog, resourceQuery), [catalog, project, resourceQuery]);
  const selectedReference = selectedReferenceId ? resourceRows.find((row) => row.id === selectedReferenceId) ?? null : null;

  useEffect(() => {
    if (!selectedRecord && records.length > 0) {
      onSelectEntity(selectEntityFromId(`message:${records[0].id}`));
    }
  }, [onSelectEntity, records, selectedRecord]);

  return (
    <section className="text-workbench">
      <header className="text-workbench-header">
        <div>
          <h1>String Editor</h1>
          <p>Edit Realmz strings used by scripts, encounters, battles, and random areas.</p>
        </div>
        <div className="text-workbench-actions">
          <b>{records.length.toLocaleString()} strings</b>
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
      <StringNavigator
        records={records}
        selectedId={selectedId}
        showList={showList}
        onToggleList={() => setShowList((value) => !value)}
        onSelect={(id) => onSelectEntity(selectEntityFromId(`message:${id}`))}
      />
      <div className="text-workbench-layout">
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
          {(activeEditor === "text-resources" || activeEditor === "spell-check" || resourceRows.length > 0) && (
            <section className="text-reference-panel">
              <header>
                <div>
                  <h2>Reference Strings</h2>
                  <p>Readable TEXT, STR#, and style resources are searchable reference material.</p>
                </div>
                <input value={resourceQuery} onChange={(event) => setResourceQuery(event.currentTarget.value)} placeholder="Search TEXT / STR#..." />
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
      </div>
    </section>
  );
}

function StringNavigator({
  records,
  selectedId,
  showList,
  onToggleList,
  onSelect
}: {
  records: MessageRecord[];
  selectedId: number;
  showList: boolean;
  onToggleList: () => void;
  onSelect: (id: number) => void;
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

function textReferenceRows(project: Project, catalog: LibraryCatalog | null | undefined, query: string) {
  const wantedTypes = new Set(["text-resource", "string-list-resource", "style-resource"]);
  const rows = [
    ...project.semanticSchema.entities.filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary),
      source: "Project",
      preview: textResourcePreview(entity.summary)
    })),
    ...(catalog?.entities ?? []).filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary),
      source: "Library",
      preview: textResourcePreview(entity.summary)
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
