import { Project, SelectedEntity } from "../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { semanticRecordGroups } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { TutorialTip } from "../components/TutorialTip";
import { ScrollArea } from "../ui";

const RECORD_CATALOG_HELP =
  "Records is the audit view for decoded scenario data. Use it to inspect source files, fixed-record layouts, byte ranges, summaries, semantic links, and preservation boundaries before changing related authoring fields.";
const SOURCE_GROUPS_HELP =
  "Source groups show where records came from and whether a file has a fixed record layout. This is the quick way to distinguish authored source, resource containers, reference material, and runtime/cache evidence.";
const RECORD_ROWS_HELP =
  "Each row is a decoded semantic record. The byte range is evidence, not an editing field: domain tools own safe edits, while Records explains source, layout, links, and export risk.";
const RECORD_LINKS_HELP =
  "Link chips show incoming and outgoing semantic relationships. Use them before clearing, renumbering, or replacing data that other scripts, maps, encounters, assets, or records may target.";
const RECORD_INSPECTOR_HELP =
  "The Semantic Inspector shows the selected record's details, provenance, links, edit state, and diagnostics. It is the forensic companion to the domain editor.";
const RECORD_EMPTY_HELP =
  "Open or import a project to build the semantic schema. Records depends on decoded project data and is empty until a scenario package is loaded.";

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
          <TutorialTip title="Record Catalog" body={RECORD_CATALOG_HELP} side="below">
            <span>Record Catalog</span>
          </TutorialTip>
          <b>{records.length.toLocaleString()}</b>
        </div>
        <p className="field-help">
          <TutorialTip title="Source Groups" body={SOURCE_GROUPS_HELP} side="below">
            <span>Start with the source strip to understand file family, origin, and fixed-record layout.</span>
          </TutorialTip>
        </p>
        <ScrollArea className="alignment-strip" orientation="horizontal" aria-label="Record source groups">
          {groups.map((group) => (
            <article key={group.source.id} className={group.source.origin}>
              <strong>{group.source.name}</strong>
              <span>{group.records.length.toLocaleString()} records</span>
              <small>{group.source.layout ? `${group.source.layout.kind} | ${group.source.layout.recordBytes} bytes` : group.source.origin}</small>
            </article>
          ))}
        </ScrollArea>
        <p className="field-help">
          <TutorialTip title="Record Rows" body={RECORD_ROWS_HELP} side="below">
            <span>Rows show decoded labels, types, source byte ranges, summaries, and cross-links.</span>
          </TutorialTip>
        </p>
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
          {!project && (
            <div className="entity-empty">
              <TutorialTip title="No Project Loaded" body={RECORD_EMPTY_HELP} side="below">
                <span>Open a project to inspect record layouts.</span>
              </TutorialTip>
            </div>
          )}
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <div className="panel-header">
          <TutorialTip title="Semantic Inspector" body={RECORD_INSPECTOR_HELP} side="below">
            <span>Semantic Inspector</span>
          </TutorialTip>
        </div>
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
      <TutorialTip title="Record Links" body={RECORD_LINKS_HELP} side="below">
        <span className="link-chip">Links</span>
      </TutorialTip>
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
