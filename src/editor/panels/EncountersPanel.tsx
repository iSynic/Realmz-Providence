import { Project, SelectedEntity, SemanticEntity } from "../types";
import { compactValue, linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { SemanticInspector } from "../components/SemanticInspector";

const ENCOUNTER_TYPES = ["simple encounter", "complex encounter", "battle", "monster", "shop", "treasure", "thief-encounter", "timed-encounter", "random-region"];

export function EncountersPanel({
  project,
  selectedEntity,
  onSelectEntity
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const entities = project?.semanticSchema.entities.filter((entity) => ENCOUNTER_TYPES.includes(entity.type)) ?? [];
  return (
    <div className="editor-full-panel semantic-workbench">
      <section className="tab-panel record-table-panel">
        <div className="panel-header">
          <span>Encounters, Battles, Shops</span>
          <b>{entities.length.toLocaleString()}</b>
        </div>
        <div className="record-table">
          {entities.map((entity) => (
            <EncounterRow key={entity.id} project={project} entity={entity} onSelectEntity={onSelectEntity} />
          ))}
          {!project && <div className="entity-empty">Open a project to inspect encounters.</div>}
        </div>
      </section>
      <aside className="tab-panel semantic-right">
        <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
      </aside>
    </div>
  );
}

function EncounterRow({
  project,
  entity,
  onSelectEntity
}: {
  project: Project | null;
  entity: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const links = linksFor(project, entity.id).outgoing;
  return (
    <article className="record-row">
      <button onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
        <strong>{entity.label}</strong>
        <span>{entity.type}</span>
        <small>{summaryPreview(entity)}</small>
      </button>
      <div className="link-chip-row">
        {links.slice(0, 6).map((link) => (
          <button key={link.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>
            {link.kind}: {semanticLabel(project, link.to)}
          </button>
        ))}
      </div>
    </article>
  );
}

function summaryPreview(entity: SemanticEntity) {
  for (const key of ["text", "preview", "monsters", "sampleItems", "name"]) {
    if (entity.summary[key] != null) return compactValue(entity.summary[key]);
  }
  return entity.id;
}
