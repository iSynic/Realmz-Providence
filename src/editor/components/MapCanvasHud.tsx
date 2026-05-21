import type { CSSProperties } from "react";
import { EditorTool, MapEntity, RandomLevel, SemanticEntity, TriggerRecord } from "../types";
import { clampCell, numberSummary, tileValueAt } from "../map/geometry";
import { hasSecretMarkerTile, hasSecretPathTile, isSecretWalkableTile } from "../map/secrets";
import { triggerOverlayKind } from "../map/drawMapCanvas";

export function MapKeyHud({
  setHudRef,
  style,
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
  map: MapEntity;
  hover: { x: number; y: number } | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  activeTool: EditorTool;
  selectedTile: number;
  tilesetLabel: string;
}) {
  const boxes = hover ? hoverBoxesAt(hover, triggers, randomLevel, mapRecords) : [];
  const raw = hover ? tileValueAt(map, hover.x, hover.y) : null;
  const secretTags = hover && raw != null ? secretHoverTags(raw, map) : [];
  const overlayCount = triggers.length + (randomLevel?.rects.length ?? 0) + mapRecords.length;
  return (
    <div className="map-key-hud" ref={setHudRef} style={style} aria-live="polite">
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
      <div className="map-key-legend">
        <span><i className="map-key-swatch random" />random</span>
        <span><i className="map-key-swatch quest" />quest</span>
        <span><i className="map-key-swatch encounter" />encounter</span>
        <span><i className="map-key-swatch battle" />battle</span>
        <span><i className="map-key-swatch entrance" />entrance</span>
        <span><i className="map-key-swatch map" />map</span>
        <span><i className="map-key-swatch text" />text</span>
        <span><i className="map-key-swatch trigger" />trigger</span>
      </div>
    </div>
  );
}

function hoverBoxesAt(
  hover: { x: number; y: number },
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
) {
  const boxes: string[] = [];
  for (const rect of randomLevel?.rects ?? []) {
    const left = clampCell(rect.left);
    const top = clampCell(rect.top);
    const right = clampCell(rect.right);
    const bottom = clampCell(rect.bottom);
    if (hover.x >= left && hover.x <= right && hover.y >= top && hover.y <= bottom) {
      boxes.push(`Random encounter area R${rect.rectIndex} @ ${left},${top} - ${right},${bottom}`);
    }
  }
  for (const trigger of triggers) {
    if (trigger.coordinate?.x !== hover.x || trigger.coordinate.y !== hover.y) continue;
    const category = triggerOverlayKind(trigger);
    boxes.push(`Action Point ${trigger.recordIndex} ${category} @ ${hover.x},${hover.y}`);
  }
  for (const record of mapRecords) {
    const x = numberSummary(record, "startX");
    const y = numberSummary(record, "startY");
    if (x === hover.x && y === hover.y) boxes.push(`${record.label} start @ ${hover.x},${hover.y}`);
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
