import { MapEntity, MapHitTarget, RandomLevel, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { selectEntityFromId, triggerEntityId } from "../utils";
import { MapCell, numberSummary, randomRectContainsCell, randomRectEntityId, rectArea, tileValueAt } from "./geometry";

export function hitTestMapTarget({
  map,
  cell,
  triggers,
  randomLevel,
  mapRecords,
  showRandomRects,
  showMapRecords
}: {
  map: MapEntity;
  cell: { x: number; y: number };
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  showRandomRects: boolean;
  showMapRecords: boolean;
}): MapHitTarget {
  const tileCell: MapCell = { ...cell, tile: tileValueAt(map, cell.x, cell.y) };
  const trigger = triggerAt(triggers, cell.x, cell.y);
  if (trigger) {
    return { kind: "trigger", cell: tileCell, trigger, entity: triggerSelection(trigger) };
  }
  const mapRecord = showMapRecords ? mapRecordAt(mapRecords, cell.x, cell.y) : null;
  if (mapRecord) {
    return { kind: "mapRecord", cell: tileCell, record: mapRecord, entity: selectEntityFromId(mapRecord.id) };
  }
  const rect = showRandomRects && randomLevel ? randomRectAt(randomLevel, cell.x, cell.y) : null;
  if (rect) {
    return {
      kind: "randomRect",
      cell: tileCell,
      rect,
      entity: { type: "encounter", id: randomRectEntityId(map, rect.rectIndex) }
    };
  }
  return { kind: "cell", cell: tileCell };
}

export function triggerSelection(trigger: TriggerRecord): SelectedEntity {
  return {
    type: trigger.source === "Data ED3" ? "macro" : "trigger",
    id: triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)
  };
}

export function triggerAt(triggers: TriggerRecord[], x: number, y: number) {
  return triggers.find((trigger) => trigger.coordinate?.x === x && trigger.coordinate.y === y) ?? null;
}

export function randomRectAt(randomLevel: RandomLevel, x: number, y: number) {
  return (
    randomLevel.rects
      .filter((rect) => randomRectContainsCell(rect, x, y))
      .sort((a, b) => rectArea(a) - rectArea(b))[0] ?? null
  );
}

export function mapRecordAt(mapRecords: SemanticEntity[], x: number, y: number) {
  return mapRecords.find((record) => numberSummary(record, "startX") === x && numberSummary(record, "startY") === y) ?? null;
}
