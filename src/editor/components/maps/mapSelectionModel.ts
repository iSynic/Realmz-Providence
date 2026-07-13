import { mapRecordContainsCell, randomRectContainsCell } from "../../map/geometry";
import type {
  MapEntity,
  MapRegionSelection,
  Project,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TriggerRecord
} from "../../types";
import { triggerEntityId } from "../../utils";

export type MapSelection =
  | { kind: "cell"; cell: { x: number; y: number; tile: number }; triggers: TriggerRecord[]; rects: RandomLevel["rects"]; records: SemanticEntity[] }
  | { kind: "region"; region: MapRegionSelection }
  | { kind: "trigger"; trigger: TriggerRecord }
  | { kind: "random"; rect: RandomLevel["rects"][number] }
  | { kind: "record"; record: SemanticEntity };

export function resolveMapSelection(
  map: MapEntity | null,
  selectedEntity: SelectedEntity | null,
  selectedCell: { x: number; y: number; tile: number } | null,
  selectedRegion: MapRegionSelection | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
): MapSelection | null {
  if (selectedRegion) return { kind: "region", region: selectedRegion };
  if (map && selectedEntity?.id) {
    const trigger = triggers.find((candidate) => triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id);
    if (trigger) return { kind: "trigger", trigger };
    const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === `random:${map.levelType}:${map.index}:${candidate.rectIndex}`);
    if (rect) return { kind: "random", rect };
    const record = mapRecords.find((candidate) => candidate.id === selectedEntity.id);
    if (record) return { kind: "record", record };
  }
  if (!selectedCell) return null;
  return {
    kind: "cell",
    cell: selectedCell,
    triggers: triggers.filter((trigger) => trigger.coordinate?.x === selectedCell.x && trigger.coordinate.y === selectedCell.y),
    rects: randomLevel?.rects.filter((rect) => randomRectContainsCell(rect, selectedCell.x, selectedCell.y)) ?? [],
    records: map ? mapRecords.filter((record) => mapRecordContainsCell(record, map, selectedCell.x, selectedCell.y)) : []
  };
}

export function scriptedTileChangesForCell(project: Project | null, map: MapEntity | null, cell: { x: number; y: number }) {
  if (!project || !map) return [];
  const out: { entityId: string; slot: number; label: string }[] = [];
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions) {
      if (![12, 13, 25].includes(action.code)) continue;
      const edcd = project.extracodes?.find((row) => row.id === action.id);
      const values = edcd?.values ?? [];
      const matches = values[0] === map.index && values[1] === cell.x && values[2] === cell.y;
      if (!matches) continue;
      const entityId = trigger.levelType && trigger.levelIndex != null
        ? triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)
        : `ed3-action-record:${trigger.recordIndex}`;
      out.push({ entityId, slot: action.slot, label: `${action.label} targets ${cell.x},${cell.y}` });
    }
  }
  return out;
}

export function nextAvailableRandomRectIndex(project: Project | null, levelType: MapEntity["levelType"], levelIndex: number) {
  const level = project?.randomLevels?.find((candidate) => candidate.levelType === levelType && candidate.levelIndex === levelIndex);
  const used = new Set((level?.rects ?? []).map((rect) => rect.rectIndex));
  for (let index = 0; index < 20; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}
