import { useMemo } from "react";
import { randomRectEntityId } from "../../map/geometry";
import type { MapEntity, RandomLevel, SemanticEntity, TriggerRecord } from "../../types";

export function useMapCanvasVisibility({
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  mapRecords,
  showTriggers,
  showRandomRects,
  visibleRandomRectIds,
  showMapRecords,
  visibleMapRecordIds
}: {
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  showTriggers: boolean;
  showRandomRects: boolean;
  visibleRandomRectIds: string[];
  showMapRecords: boolean;
  visibleMapRecordIds: number[];
}) {
  const visibleTriggers = useMemo(
    () => showTriggers ? mapTriggers : [],
    [mapTriggers, showTriggers]
  );
  const visibleRandomLevel = useMemo(
    () => filterVisibleRandomLevel(selectedMap, selectedRandomLevel, showRandomRects, visibleRandomRectIds),
    [selectedMap, selectedRandomLevel, showRandomRects, visibleRandomRectIds]
  );
  const visibleMapRecords = useMemo(
    () => filterVisibleMapRecords(mapRecords, showMapRecords, visibleMapRecordIds),
    [mapRecords, showMapRecords, visibleMapRecordIds]
  );

  return { visibleTriggers, visibleRandomLevel, visibleMapRecords };
}

export function filterVisibleRandomLevel(
  selectedMap: MapEntity | null,
  selectedRandomLevel: RandomLevel | null,
  showRandomRects: boolean,
  visibleRandomRectIds: string[]
) {
  if (!selectedMap || !selectedRandomLevel || !showRandomRects) return null;
  if (visibleRandomRectIds.length === 0) return selectedRandomLevel;
  const visibleIds = new Set(visibleRandomRectIds);
  const rects = selectedRandomLevel.rects.filter((rect) => visibleIds.has(randomRectEntityId(selectedMap, rect.rectIndex)));
  return rects.length > 0 ? { ...selectedRandomLevel, rects } : null;
}

export function filterVisibleMapRecords(
  mapRecords: SemanticEntity[],
  showMapRecords: boolean,
  visibleMapRecordIds: number[]
) {
  if (!showMapRecords) return [];
  if (visibleMapRecordIds.length === 0) return mapRecords;
  const visibleIds = new Set(visibleMapRecordIds);
  return mapRecords.filter((record) => {
    const recordId = semanticMapRecordId(record);
    return recordId != null && visibleIds.has(recordId);
  });
}

export function semanticMapRecordId(record: SemanticEntity) {
  const summaryId = record.summary.id;
  if (typeof summaryId === "number" && Number.isFinite(summaryId)) return Math.trunc(summaryId);
  const match = /^map-record:(-?\d+)$/.exec(record.id);
  return match ? Number(match[1]) : null;
}
