import { ENTITY_TYPE_LABELS, SELECTABLE_ENTITY_TYPES } from "../constants";
import { Project, SelectedEntity, SemanticEntity } from "../types";
import { selectedEntityForSemantic } from "../utils";
import { ScrollArea } from "../ui";

export function EntityBrowser({
  project,
  selectedEntity,
  onSelect
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelect: (entity: SelectedEntity) => void;
}) {
  const entities = project?.semanticSchema.entities ?? [];
  const groups = SELECTABLE_ENTITY_TYPES.map((type) => ({
    type,
    entities: entities.filter((entity) => entity.type === type)
  })).filter((group) => group.entities.length > 0);

  return (
    <section className="entity-browser">
      <div className="panel-header">
        <span>Project Browser</span>
        <b>{entities.length.toLocaleString()}</b>
      </div>
      <div className="semantic-summary-strip">
        <Metric label="Sources" value={project?.semanticSchema.summary.sourceCount ?? 0} />
        <Metric label="Records" value={project?.semanticSchema.summary.recordCount ?? 0} />
        <Metric label="Links" value={project?.semanticSchema.summary.linkCount ?? 0} />
      </div>
      <ScrollArea className="semantic-entity-list" aria-label="Project Browser">
        {groups.map((group) => (
          <details key={group.type} open={group.type === "map" || group.type === "trigger"}>
            <summary>
              <span>{ENTITY_TYPE_LABELS[group.type] ?? group.type}</span>
              <b>{group.entities.length.toLocaleString()}</b>
            </summary>
            {group.entities.slice(0, 180).map((entity) => (
              <EntityButton
                key={entity.id}
                entity={entity}
                selected={selectedEntity?.id === entity.id}
                onSelect={() => onSelect(selectedEntityForSemantic(entity))}
              />
            ))}
          </details>
        ))}
        {!project && <div className="entity-empty">Import a Realmz scenario to inspect semantic links.</div>}
      </ScrollArea>
    </section>
  );
}

function EntityButton({
  entity,
  selected,
  onSelect
}: {
  entity: SemanticEntity;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`semantic-row${selected ? " selected" : ""}`} onClick={onSelect}>
      <span className={`editability ${entity.editState === "editable" ? "editable" : entity.editState === "blocked" ? "blocked" : "inspect"}`}>
        {entity.editState === "editable" ? "edit" : entity.editState === "blocked" ? "block" : "read"}
      </span>
      <span className="semantic-row-text">
        <strong>{entity.label}</strong>
        <small>{entity.id}</small>
      </span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <b>{value.toLocaleString()}</b>
      <small>{label}</small>
    </span>
  );
}
