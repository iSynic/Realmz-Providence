import type { MapEntity, Project, RandomLevel, SelectedEntity, SemanticEntity, TriggerRecord } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import { scriptedTileChangesForCell } from "./mapSelectionModel";

export function ScriptedChangeSection({
  project,
  map,
  cell,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  map: MapEntity | null;
  cell: { x: number; y: number; tile: number };
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const changes = scriptedTileChangesForCell(project, map, cell);
  if (changes.length === 0) return null;
  return (
    <details className="context-section scripted-change-section" open>
      <summary><span>Scripted Changes</span><b>{changes.length}</b></summary>
      <div className="selection-link-list">
        {changes.map((change) => {
          const selected = selectEntityFromId(change.entityId);
          return (
            <div className="link-chip-group" key={`${change.entityId}:${change.slot}`}>
              <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>
                Slot {change.slot}: {change.label}
              </button>
              <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>
                Scripts/AP
              </button>
            </div>
          );
        })}
      </div>
      <p className="empty-copy compact">These are runtime script effects, not static stamps painted into the map grid.</p>
    </details>
  );
}

export function SelectionLinks({
  map,
  triggers,
  rects,
  records,
  onSelectEntity,
  onOpenScripts
}: {
  map: MapEntity | null;
  triggers: TriggerRecord[];
  rects: RandomLevel["rects"];
  records: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="selection-link-list">
      {triggers.map((trigger) => {
        const selected = selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source));
        return (
          <div className="link-chip-group" key={trigger.id}>
            <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>
              {trigger.actions[0]?.label ?? "Action Point"} #{trigger.recordIndex}
            </button>
            <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>
              Scripts/AP
            </button>
          </div>
        );
      })}
      {map && rects.map((rect) => (
        <button key={rect.rectIndex} className="link-chip" type="button" onClick={() => onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rect.rectIndex}` })}>
          Random Rectangle {rect.rectIndex}
        </button>
      ))}
      {records.map((record) => (
        <button key={record.id} className="link-chip" type="button" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
          {record.label}
        </button>
      ))}
    </div>
  );
}
