import { useMemo, useState } from "react";
import { Project, SelectedEntity, SemanticRecord } from "../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { semanticRecordGroups } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { TutorialTip } from "../components/TutorialTip";
import {
  EmptyState,
  EntityRow,
  IncrementalListFooter,
  LinkChip,
  PanelHeader,
  ScrollArea,
  SearchField,
  useIncrementalListLimit,
  type WorkbenchTone
} from "../ui";

const RECORD_PAGE_SIZE = 200;

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
  const records = project?.semanticSchema?.records ?? [];
  const groups = semanticRecordGroups(project);
  const [query, setQuery] = useState("");
  const filteredRecords = useMemo(() => filterSemanticRecords(records, query), [query, records]);
  const resetKey = `${query.trim().toLowerCase()}:${records.length}`;
  const [visibleLimit, showMoreRecords] = useIncrementalListLimit(RECORD_PAGE_SIZE, resetKey);
  const visibleRecords = filteredRecords.slice(0, visibleLimit);
  return (
    <div className="editor-full-panel semantic-workbench">
      <section className="tab-panel records-index">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Record Catalog" body={RECORD_CATALOG_HELP} side="below">
              <span>Record Catalog</span>
            </TutorialTip>
          )}
          meta={query ? `${filteredRecords.length.toLocaleString()} / ${records.length.toLocaleString()}` : records.length.toLocaleString()}
        />
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
        <SearchField
          className="records-search"
          value={query}
          onChange={setQuery}
          placeholder="Search labels, types, sources, ranges, or summaries..."
          ariaLabel="Search decoded records"
          resultCount={project ? filteredRecords.length : undefined}
          resultNoun="record"
          disabled={!project}
        />
        <ScrollArea className="record-table" aria-label="Record Catalog">
          {visibleRecords.map((record) => {
            const preview = recordPreview(record.summary);
            const byteRange = record.byteRange ? `${record.byteRange.start}..${record.byteRange.endExclusive}` : "No byte range";
            return (
              <div key={record.id} className="records-entity-entry">
                <EntityRow
                  title={record.label}
                  subtitle={record.type}
                  meta={[record.source, byteRange, preview].filter(Boolean).join(" | ")}
                  selected={selectedEntity?.id === record.id}
                  status={userFacingEditState(record.editState)}
                  statusTone={recordStatusTone(record.editState)}
                  onSelect={() => onSelectEntity(selectEntityFromId(record.id))}
                />
                <RecordLinks project={project} id={record.id} onSelectEntity={onSelectEntity} />
              </div>
            );
          })}
          {project && filteredRecords.length === 0 && (
            <EmptyState
              compact
              title="No matching records"
              body="Try another label, type, source, byte range, or summary value."
            />
          )}
          {!project && (
            <EmptyState
              compact
              title={(
                <TutorialTip title="No Project Loaded" body={RECORD_EMPTY_HELP} side="below">
                  <span>No project loaded</span>
                </TutorialTip>
              )}
              body="Open a project to inspect decoded record layouts."
            />
          )}
          <IncrementalListFooter
            visibleCount={visibleRecords.length}
            totalCount={filteredRecords.length}
            step={RECORD_PAGE_SIZE}
            noun="record"
            onShowMore={showMoreRecords}
          />
        </ScrollArea>
      </section>
      <aside className="tab-panel semantic-right">
        <PanelHeader
          className="panel-header"
          title={(
            <TutorialTip title="Semantic Inspector" body={RECORD_INSPECTOR_HELP} side="below">
              <span>Semantic Inspector</span>
            </TutorialTip>
          )}
        />
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
        <LinkChip label="Links" inert />
      </TutorialTip>
      {combined.map((link) => {
        const target = link.from === id ? link.to : link.from;
        return (
          <LinkChip
            key={link.id}
            label={link.kind}
            detail={semanticLabel(project, target)}
            onClick={() => onSelectEntity(selectEntityFromId(target))}
          />
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

export function filterSemanticRecords(records: SemanticRecord[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return records;
  return records.filter((record) => {
    const byteRange = record.byteRange ? `${record.byteRange.start} ${record.byteRange.endExclusive} ${record.byteRange.length}` : "";
    const summary = Object.entries(record.summary)
      .map(([key, value]) => `${key} ${compactValue(value)}`)
      .join(" ");
    return [record.id, record.label, record.type, record.source, record.editState, record.confidence, byteRange, summary]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function recordStatusTone(editState: SemanticRecord["editState"]): WorkbenchTone {
  if (editState === "editable") return "success";
  if (editState === "blocked") return "blocked";
  return "neutral";
}

function userFacingEditState(editState: SemanticRecord["editState"]) {
  if (editState === "editable") return "Editable";
  if (editState === "blocked") return "Not editable yet";
  return "Read-only";
}
