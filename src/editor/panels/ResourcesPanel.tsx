import { Project, SelectedEntity } from "../types";
import { compactValue, selectEntityFromId, semanticLabel } from "../utils";
import { resourceConsumers, resourceGaps, resourceMembersForType, schemaEntities } from "../semanticGraph";
import { SemanticInspector } from "../components/SemanticInspector";
import { tileColor } from "../components/TileSprite";

export function ResourcesPanel({
  project,
  selectedEntity,
  onSelectEntity
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const resourceTypes = schemaEntities(project, "resource type");
  const resources = schemaEntities(project).filter((entity) => entity.type === "resource" || entity.type === "runtime-cache" || entity.type === "asset-fallback" || entity.type === "render-profile");
  const tileAtlases = schemaEntities(project, "tile atlas");
  const gaps = resourceGaps(project);
  return (
    <div className="editor-full-panel semantic-workbench">
      <section className="tab-panel resource-browser">
        <div className="panel-header">
          <span>Resource Fork Inventory</span>
          <b>{resources.length.toLocaleString()}</b>
        </div>
        <div className="resource-type-grid">
          {resourceTypes.map((entity) => {
            const members = resourceMembersForType(project, entity.id);
            return (
              <button key={entity.id} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
                <strong>{String(entity.summary.type ?? entity.label)}</strong>
                <span>{members.length.toLocaleString()} resources</span>
                <small>{String(entity.summary.totalBytes ?? 0)} bytes</small>
              </button>
            );
          })}
        </div>
        {gaps.length > 0 && (
          <div className="lint-results compact">
            <section>
              <header>Resource Fallbacks</header>
              {gaps.slice(0, 8).map((gap) => (
                <button key={gap.entity.id} className="lint-issue warning" onClick={() => onSelectEntity(selectEntityFromId(gap.entity.id))}>
                  ! {gap.entity.label} uses {gap.reason}
                  <small>{gap.consumers.length.toLocaleString()} semantic consumers</small>
                </button>
              ))}
            </section>
          </div>
        )}
        <div className="resource-list">
          {resources.slice(0, 500).map((entity) => {
            const consumers = resourceConsumers(project, entity.id);
            return (
              <button key={entity.id} onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
                <strong>{entity.label}</strong>
                <span>{resourceStatus(entity)} | {consumers.length.toLocaleString()} refs</span>
                <small>{entity.id}</small>
              </button>
            );
          })}
          {!project && <div className="entity-empty">Open a project to inspect resources.</div>}
        </div>
      </section>
      <section className="tab-panel atlas-browser">
        <div className="panel-header">
          <span>Tile Atlases</span>
          <b>{tileAtlases.length.toLocaleString()}</b>
        </div>
        <div className="asset-grid compact">
          {tileAtlases.map((asset) => (
            <article key={asset.id} className="asset-card">
              <div className="asset-swatch" style={{ background: tileColor(numberSummary(asset.summary.landlook)) }}>
                <span>{asset.editState === "blocked" ? "missing" : "ready"}</span>
              </div>
              <strong>{asset.label}</strong>
              <span>{semanticLabel(project, asset.id)}</span>
              <small>{asset.source}{asset.summary.pictId ? ` | PICT ${asset.summary.pictId}` : ""}</small>
              {asset.summary.imagePath != null && <small>{compactValue(asset.summary.imagePath)}</small>}
            </article>
          ))}
        </div>
      </section>
      <aside className="tab-panel semantic-right">
        <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
      </aside>
    </div>
  );
}

function resourceStatus(entity: { type: string; editState: string; summary: Record<string, unknown> }) {
  if (entity.summary.sharedFallback) return "shared fallback";
  if (entity.summary.referenceOnly) return "reference only";
  if (entity.type === "runtime-cache") return "generated cache";
  if (entity.type === "asset-fallback") return "missing asset";
  return entity.editState;
}

function numberSummary(value: unknown) {
  return typeof value === "number" ? value : 0;
}
