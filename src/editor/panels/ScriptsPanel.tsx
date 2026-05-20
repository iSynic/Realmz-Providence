import { useMemo } from "react";
import { Project, SelectedEntity, SemanticEntity } from "../types";
import { linksFor, selectEntityFromId, semanticLabel } from "../utils";
import { actionSlotEntitiesForScript, schemaEntities, scriptPrimaryCategory } from "../semanticGraph";
import { EntityBrowser } from "../components/EntityBrowser";
import { SemanticInspector } from "../components/SemanticInspector";
import { categoryColor } from "../components/TileSprite";

export function ScriptsPanel({
  project,
  selectedEntity,
  onSelectEntity
}: {
  project: Project | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const scriptEntities = useMemo(
    () => schemaEntities(project).filter((entity) => entity.type === "trigger" || entity.type === "macro"),
    [project]
  );
  const grouped = useMemo(() => {
    const map = new Map<string, SemanticEntity[]>();
    for (const entity of scriptEntities) {
      const category = scriptPrimaryCategory(project, entity);
      const list = map.get(category) ?? [];
      list.push(entity);
      map.set(category, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [scriptEntities]);

  return (
    <div className="editor-full-panel semantic-workbench">
      <aside className="tab-panel semantic-left">
        <EntityBrowser project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
      </aside>
      <section className="tab-panel script-detail">
        <div className="panel-header">
          <span>Triggers And Macros</span>
          <b>{scriptEntities.length.toLocaleString()}</b>
        </div>
        <div className="script-category-grid">
          {grouped.map(([category, entities]) => (
            <section key={category} className="script-category">
              <header>
                <span style={{ color: categoryColor(category) }}>●</span>
                <strong>{category}</strong>
                <b>{entities.length.toLocaleString()}</b>
              </header>
              {entities.slice(0, 18).map((entity) => (
                <ScriptRow key={entity.id} project={project} entity={entity} onSelectEntity={onSelectEntity} />
              ))}
            </section>
          ))}
          {!project && <div className="entity-empty">Open a project to inspect scripts.</div>}
        </div>
      </section>
      <aside className="tab-panel semantic-right">
        <SemanticInspector project={project} selectedEntity={selectedEntity} onSelect={onSelectEntity} />
        <EdcdList project={project} onSelectEntity={onSelectEntity} />
      </aside>
    </div>
  );
}

function ScriptRow({
  project,
  entity,
  onSelectEntity
}: {
  project: Project | null;
  entity: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const links = linksFor(project, entity.id).outgoing;
  const actions = actionSlotEntitiesForScript(project, entity).slice(0, 8);
  return (
    <article className="script-row">
      <button onClick={() => onSelectEntity(selectEntityFromId(entity.id))}>
        <strong>{entity.label}</strong>
        <small>{entity.id}</small>
      </button>
      <div className="action-slot-list">
        {actions.map((slotEntity, index) => {
          const slot = slotEntity.summary as {
            slot?: number;
            code?: number;
            id?: number;
            label?: string;
            category?: string;
            edcdUsage?: { summary?: string; shape?: string };
          };
          const label = slot.edcdUsage?.summary ?? slot.label ?? `opcode ${slot.code}`;
          const title = slot.edcdUsage?.shape ? `${slot.label ?? `opcode ${slot.code}`} · ${slot.edcdUsage.shape}` : label;
          return (
            <button
              key={`${entity.id}-${index}`}
              title={title}
              style={{ borderColor: categoryColor(slot.category ?? "unknown") }}
              onClick={() => onSelectEntity(selectEntityFromId(slotEntity.id))}
            >
              {slot.slot ?? index}: {label}
            </button>
          );
        })}
        {actions.length === 0 && <span>No action slots</span>}
      </div>
      <div className="link-chip-row">
        {links.slice(0, 8).map((link) => (
          <button key={link.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>
            {link.kind}: {semanticLabel(project, link.to)}
          </button>
        ))}
      </div>
    </article>
  );
}

function EdcdList({ project, onSelectEntity }: { project: Project | null; onSelectEntity: (entity: SelectedEntity) => void }) {
  const rows = schemaEntities(project, "edcd-row");
  return (
    <section className="object-inspector">
      <div className="inspector-header">
        <span>EDCD Rows</span>
        <small>{rows.length}</small>
      </div>
      <div className="edcd-grid">
        {rows.slice(0, 180).map((row) => (
          <button key={row.id} onClick={() => onSelectEntity(selectEntityFromId(row.id))}>
            {row.label}: {Array.isArray(row.summary.values) ? row.summary.values.join(", ") : "semantic row"}
          </button>
        ))}
      </div>
    </section>
  );
}
