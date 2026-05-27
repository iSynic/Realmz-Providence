import { ArrowRight, Link2 } from "lucide-react";
import { Project, SelectedEntity } from "../types";
import { compactValue, findSemanticEntity, findSemanticRecord, linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { InfoGrid } from "./InfoGrid";

export function SemanticInspector({
  project,
  selectedEntity,
  onSelect
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelect: (entity: SelectedEntity) => void;
}) {
  const entity = findSemanticEntity(project, selectedEntity);
  const record = findSemanticRecord(project, selectedEntity?.id ?? null) ?? findSemanticRecord(project, entity?.recordRef ?? null);
  const subjectId = entity?.id ?? record?.id ?? selectedEntity?.id ?? null;
  const links = linksFor(project, subjectId);
  const recordSourceName = record?.source?.replace(/^source:file:/, "");
  const diagnostics = project?.semanticSchema.diagnostics.filter(
    (diagnostic) =>
      diagnostic.source === entity?.source ||
      diagnostic.source === record?.source ||
      diagnostic.source === recordSourceName ||
      diagnostic.data?.target === subjectId
  ) ?? [];

  return (
    <section className="object-inspector semantic-inspector">
      <div className="inspector-header">
        <span>Details Inspector</span>
        {(entity || record) && <small>{userFacingEditState(entity?.editState ?? record?.editState ?? (entity?.editable ? "editable" : "inspect-only"))}</small>}
      </div>
      {entity || record ? (
        <>
          <InfoGrid
            rows={[
              ["Label", entity?.label ?? record?.label],
              ["Type", entity?.type ?? record?.type],
              ["Edit State", userFacingEditState(entity?.editState ?? record?.editState ?? (entity?.editable ? "editable" : "inspect-only"))],
              ["Status", userFacingConfidence(entity?.confidence ?? record?.confidence)],
              ["Source", entity?.source ?? record?.source],
              ["Bytes", byteRangeLabel(entity?.byteRange ?? record?.byteRange ?? null)],
              ["Record", entity?.recordRef ? <LinkButton id={entity.recordRef} onSelect={onSelect} /> : record?.id ?? "none"]
            ]}
          />
          <SummaryTable values={entity?.summary ?? record?.summary ?? {}} />
          <LinkList title="Outgoing" links={links.outgoing} direction="outgoing" project={project} onSelect={onSelect} />
          <LinkList title="Incoming" links={links.incoming} direction="incoming" project={project} onSelect={onSelect} />
          {diagnostics.length > 0 && (
            <div className="semantic-diagnostics">
              <strong>Diagnostics</strong>
              {diagnostics.slice(0, 8).map((diagnostic) => (
                <p key={diagnostic.id} className={diagnostic.severity}>{diagnostic.message}</p>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="empty-copy">Select an item, link, map cell, or record.</p>
      )}
    </section>
  );
}

function userFacingEditState(state: string | null | undefined) {
  if (state === "editable") return "Editable";
  if (state === "blocked") return "Not editable yet";
  if (state === "inspect-only") return "Read-only";
  return state ?? "Read-only";
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}

function LinkList({
  title,
  links,
  direction,
  project,
  onSelect
}: {
  title: string;
  links: ReturnType<typeof linksFor>["outgoing"];
  direction: "incoming" | "outgoing";
  project: Project | null;
  onSelect: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="semantic-link-list">
      <strong>{title}</strong>
      {links.slice(0, 24).map((link) => {
        const id = direction === "outgoing" ? link.to : link.from;
        return (
          <button key={link.id} onClick={() => onSelect(selectEntityFromId(id))}>
            <Link2 size={12} />
            <span>{link.kind}</span>
            <ArrowRight size={12} />
            <small>{semanticLabel(project, id)}</small>
          </button>
        );
      })}
      {links.length === 0 && <span className="empty-inline">none</span>}
    </div>
  );
}

function LinkButton({ id, onSelect }: { id: string; onSelect: (entity: SelectedEntity) => void }) {
  return (
    <button className="link-chip" onClick={() => onSelect(selectEntityFromId(id))}>
      {id}
    </button>
  );
}

function SummaryTable({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values).slice(0, 18);
  if (entries.length === 0) return null;
  return (
    <dl className="summary-table">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{compactValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function byteRangeLabel(range: { start: number; length: number; endExclusive: number } | null) {
  if (!range) return "none";
  return `${range.start.toLocaleString()}..${range.endExclusive.toLocaleString()} (${range.length.toLocaleString()} bytes)`;
}
