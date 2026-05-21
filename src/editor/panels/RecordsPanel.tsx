import { Project, SelectedEntity } from "../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { semanticRecordGroups } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { ScrollArea } from "../ui";

export function RecordsPanel({
  project,
  selectedEntity,
  onSelectEntity
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const records = project?.semanticSchema.records ?? [];
  const groups = semanticRecordGroups(project);
  return (
    <div className="editor-full-panel semantic-workbench">
      <section className="tab-panel records-index">
        <div className="panel-header">
          <span>Record Catalog</span>
          <b>{records.length.toLocaleString()}</b>
        </div>
        <ScrollArea className="alignment-strip" orientation="horizontal" aria-label="Record source groups">
          {groups.map((group) => (
            <article key={group.source.id} className={group.source.origin}>
              <strong>{group.source.name}</strong>
              <span>{group.records.length.toLocaleString()} records</span>
              <small>{group.source.layout ? `${group.source.layout.kind} | ${group.source.layout.recordBytes} bytes` : group.source.origin}</small>
            </article>
          ))}
        </ScrollArea>
        <ScrollArea className="record-table" aria-label="Record Catalog">
          {records.slice(0, 900).map((record) => (
            <article key={record.id} className="record-row">
              <button onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
                <strong>{record.label}</strong>
                <span>{record.type}</span>
                <small>{record.byteRange ? `${record.byteRange.start}..${record.byteRange.endExclusive}` : record.source}</small>
              </button>
              <p>{recordPreview(record.summary)}</p>
              <RecordLinks project={project} id={record.id} onSelectEntity={onSelectEntity} />
            </article>
          ))}
          {!project && <div className="entity-empty">Open a project to inspect record layouts.</div>}
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <ScrollArea className="semantic-right-scroll" aria-label="Record semantic inspector">
          <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        </ScrollArea>
      </aside>
    </div>
  );
}

function RecordLinks({
  project,
  id,
  onSelectEntity
}: {
  project: Project | null;
  id: string;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const links = linksFor(project, id);
  const combined = [...links.outgoing.slice(0, 3), ...links.incoming.slice(0, 3)];
  if (combined.length === 0) return null;
  return (
    <div className="link-chip-row">
      {combined.map((link) => {
        const target = link.from === id ? link.to : link.from;
        return (
          <button key={link.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(target))}>
            {link.kind}: {semanticLabel(project, target)}
          </button>
        );
      })}
    </div>
  );
}

function recordPreview(summary: Record<string, unknown>) {
  const keys = ["name", "preview", "text", "actionCount", "rectCount", "nonzeroBytes", "bytes"];
  return keys
    .filter((key) => summary[key] != null)
    .map((key) => `${key}: ${compactValue(summary[key])}`)
    .join(" | ");
}
