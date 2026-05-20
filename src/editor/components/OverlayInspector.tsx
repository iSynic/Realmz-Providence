import { MapEntity, RandomLevel, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { selectEntityFromId, triggerEntityId } from "../utils";
import { InfoGrid } from "./InfoGrid";

export function OverlayInspector({
  map,
  selectedEntity,
  selectedCell,
  triggers,
  randomLevel,
  mapRecords,
  onSelectEntity
}: {
  map: MapEntity | null;
  selectedEntity: SelectedEntity | null;
  selectedCell: { x: number; y: number; tile: number } | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  if (!map || !selectedEntity) return null;
  const trigger = triggers.find(
    (candidate) =>
      triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id
  );
  if (trigger) {
    return (
      <section className="object-inspector overlay-inspector">
        <div className="inspector-header">
          <span>Selected Trigger</span>
          <small>{trigger.source} #{trigger.recordIndex}</small>
        </div>
        <InfoGrid
          rows={[
            ["Cell", trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "macro"],
            ["Door ID", trigger.doorid],
            ["Percent", trigger.percent],
            ["Actions", trigger.actions.length],
            ["Mode", trigger.active ? "active" : "inactive"]
          ]}
        />
        <div className="action-slot-list padded">
          {trigger.actions.map((action) => (
            <button
              className="link-chip"
              key={`${trigger.id}:${action.slot}`}
              onClick={() => onSelectEntity(selectEntityFromId(selectedEntity.id))}
              title={`raw ${action.rawCode}, id ${action.id}`}
            >
              {action.slot}: {action.label} {action.id ? `#${action.id}` : ""}
            </button>
          ))}
          {trigger.actions.length === 0 && <span className="empty-inline">No action slots.</span>}
        </div>
      </section>
    );
  }

  const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === randomRectEntityId(map, candidate.rectIndex));
  if (rect) {
    return (
      <section className="object-inspector overlay-inspector">
        <div className="inspector-header">
          <span>Random Rectangle</span>
          <small>rect {rect.rectIndex}</small>
        </div>
        <InfoGrid
          rows={[
            ["Bounds", `${rect.left}, ${rect.top} to ${rect.right}, ${rect.bottom}`],
            ["Percent", rect.percent],
            ["Battle Range", rect.battleRange.join(" to ")],
            ["Random Doors", rect.randomDoors.join(", ")],
            ["Sound", rect.sound],
            ["Text", rect.text],
            ["Selected Cell", selectedCell ? `${selectedCell.x}, ${selectedCell.y}` : "none"]
          ]}
        />
      </section>
    );
  }

  const mapRecord = mapRecords.find((record) => record.id === selectedEntity.id);
  if (mapRecord) {
    return (
      <section className="object-inspector overlay-inspector">
        <div className="inspector-header">
          <span>Map Start</span>
          <small>{mapRecord.source}</small>
        </div>
        <InfoGrid
          rows={[
            ["Label", mapRecord.label],
            ["Start", `${summaryNumber(mapRecord, "startX") ?? "?"}, ${summaryNumber(mapRecord, "startY") ?? "?"}`],
            ["Level", summaryNumber(mapRecord, "level") ?? "unknown"],
            ["Dungeon", summaryBool(mapRecord, "isDungeon") ? "yes" : "no"],
            ["Editable", mapRecord.editable ? "yes" : "inspect-only"]
          ]}
        />
      </section>
    );
  }

  return null;
}

function randomRectEntityId(map: MapEntity, rectIndex: number) {
  return `random:${map.levelType}:${map.index}:${rectIndex}`;
}

function summaryNumber(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function summaryBool(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "boolean" ? value : null;
}
