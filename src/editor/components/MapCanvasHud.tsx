import type { CSSProperties } from "react";
import { EditorTool, MapEntity, MapHudAnchor, RandomLevel, SemanticEntity, TriggerRecord } from "../types";
import { mapRecordContainsCell, mapRecordTerrainFootprint, randomRectCellBounds, randomRectContainsCell, tileValueAt } from "../map/geometry";
import { hasSecretMarkerTile, hasSecretPathTile, isSecretWalkableTile } from "../map/secrets";
import { triggerOverlayKind } from "../map/drawMapCanvas";

export function MapKeyHud({
  setHudRef,
  style,
  anchor,
  onRequestMove,
  map,
  hover,
  triggers,
  randomLevel,
  mapRecords,
  activeTool,
  selectedTile,
  tilesetLabel
}: {
  setHudRef: (node: HTMLDivElement | null) => void;
  style: CSSProperties;
  anchor: MapHudAnchor;
  onRequestMove: () => void;
  map: MapEntity;
  hover: { x: number; y: number } | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  activeTool: EditorTool;
  selectedTile: number;
  tilesetLabel: string;
}) {
  const visibleMapRecords = mapRecords.filter((record) => mapRecordTerrainFootprint(record, map));
  const boxes = hover ? hoverBoxesAt(map, hover, triggers, randomLevel, visibleMapRecords) : [];
  const raw = hover ? tileValueAt(map, hover.x, hover.y) : null;
  const secretTags = hover && raw != null ? secretHoverTags(raw, map) : [];
  const overlayCount = triggers.length + (randomLevel?.rects.length ?? 0) + visibleMapRecords.length;
  return (
    <div
      className={`map-key-hud anchor-${anchor}`}
      ref={setHudRef}
      style={style}
      aria-live="polite"
      onMouseEnter={onRequestMove}
      onPointerEnter={onRequestMove}
    >
      <div className="map-key-title">
        {map.name} ({map.levelType} {map.index}) | {map.width} x {map.height} | {overlayCount} boxes
      </div>
      <div className="map-key-row">
        {hover ? (
          <>
            tile {hover.x},{hover.y} | raw {raw}
            {secretTags.length > 0 ? ` | ${secretTags.join(", ")}` : ""}
          </>
        ) : (
          "hover a tile for metadata"
        )}
      </div>
      {boxes.length > 0 && (
        <div className="map-key-row">
          {boxes.slice(0, 4).map((box) => (
            <div key={box}>{box}</div>
          ))}
          {boxes.length > 4 && <div>+ {boxes.length - 4} more</div>}
        </div>
      )}
      <div className="map-key-row subtle">
        {activeTool === "paint" ? `painting ${selectedTile}` : activeTool} | {tilesetLabel}
      </div>
      <div className="map-key-legend" aria-label="Map overlay legend">
        <span className="map-key-legend-group">
          <b>areas</b>
          <span><i className="map-key-swatch area random" />random</span>
          <span><i className="map-key-swatch area map" />player map</span>
        </span>
        <span className="map-key-legend-group">
          <b>APs</b>
          <span><i className="map-key-swatch ap quest" />quest</span>
          <span><i className="map-key-swatch ap encounter" />encounter</span>
          <span><i className="map-key-swatch ap battle" />battle</span>
          <span><i className="map-key-swatch ap text" />text</span>
          <span><i className="map-key-swatch ap trigger" />other</span>
        </span>
      </div>
    </div>
  );
}

function hoverBoxesAt(
  map: MapEntity,
  hover: { x: number; y: number },
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
) {
  const boxes: string[] = [];
  for (const rect of randomLevel?.rects ?? []) {
    const { left, top, right, bottom } = randomRectCellBounds(rect);
    if (randomRectContainsCell(rect, hover.x, hover.y)) {
      boxes.push(`Random encounter area R${rect.rectIndex} @ ${left},${top} - ${right},${bottom}`);
    }
  }
  for (const trigger of triggers) {
    if (trigger.coordinate?.x !== hover.x || trigger.coordinate.y !== hover.y) continue;
    const category = triggerOverlayKind(trigger);
    boxes.push(`Action Point ${trigger.recordIndex} ${category} @ ${hover.x},${hover.y}`);
  }
  for (const record of mapRecords) {
    if (!mapRecordContainsCell(record, map, hover.x, hover.y)) continue;
    const footprint = mapRecordTerrainFootprint(record, map);
    if (!footprint) continue;
    boxes.push(`${record.label} view ${footprint.left},${footprint.top} - ${footprint.right},${footprint.bottom}; anchor ${footprint.anchorX},${footprint.anchorY}`);
  }
  return boxes.sort((a, b) => {
    const aRandom = a.startsWith("Random") ? 1 : 0;
    const bRandom = b.startsWith("Random") ? 1 : 0;
    return aRandom - bRandom || a.localeCompare(b);
  });
}

function secretHoverTags(value: number, map: MapEntity) {
  const tags = [];
  if (hasSecretMarkerTile(value, map)) tags.push(map.levelType === "dungeon" ? "dungeon secret" : "secret marker");
  if (isSecretWalkableTile(value, map)) tags.push("hidden walkable tile");
  else if (hasSecretPathTile(value, map)) tags.push("encoded passability flag");
  return tags;
}
