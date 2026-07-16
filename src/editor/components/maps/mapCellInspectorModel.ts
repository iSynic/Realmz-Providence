import { actionPointMarkerState, landCellSecretState } from "../../map/actionPointMarkers";
import { hasSecretMarkerTile, isSecretWalkableTile } from "../../map/secrets";
import { classifyTileValue, tileAttributeGroup } from "../../map/tileMetadata";
import type { MapEntity, TilesetAsset } from "../../types";
import { randomRectDiagnostics } from "./RandomEncountersWorkbench";
import type { MapSelection } from "./mapSelectionModel";

type CellSelection = Extract<MapSelection, { kind: "cell" }>;
type TileMeaning = ReturnType<typeof classifyTileValue>;

export function mapCellSummaryRows(
  selection: CellSelection,
  meaning: TileMeaning | null,
  selectedTileset: TilesetAsset | null
): [string, string | number][] {
  return [
    ["Cell", `${selection.cell.x}, ${selection.cell.y}`],
    ["Raw Tile", selection.cell.tile],
    ["Render Tile", meaning?.renderTile ?? "unknown"],
    [
      "Tile Group",
      meaning
        ? tileAttributeGroup(meaning.attributes ?? null, selection.cell.tile, selectedTileset).join(", ") || "uncategorized"
        : "unknown"
    ],
    ["Special/Icon", meaning?.iconId ?? "none"],
    ["Action Points", selection.triggers.length],
    ["Random Rects", selection.rects.length],
    ["Player Maps", selection.records.length]
  ];
}

export function mapCellDiagnostics(
  selection: CellSelection,
  map: MapEntity | null,
  meaning: TileMeaning | null
) {
  const diagnostics: string[] = [];
  if (map) diagnostics.push(...actionPointAndRectangleDiagnostics(selection, map));
  diagnostics.push(...tileDiagnostics(selection, map, meaning));
  return diagnostics;
}

function actionPointAndRectangleDiagnostics(selection: CellSelection, map: MapEntity) {
  const diagnostics: string[] = [];
  const markerState = actionPointMarkerState(selection.cell.tile, map.levelType);
  const tileLooksLikeActionMarker = markerState !== "none";
  if (selection.triggers.length > 0 && !tileLooksLikeActionMarker) {
    diagnostics.push("Action Point exists here, but the tile does not look like an AP marker.");
  }
  const orphanedActionMarker = map.levelType === "land" ? markerState === "normal" : tileLooksLikeActionMarker;
  if (orphanedActionMarker && selection.triggers.length === 0) {
    diagnostics.push("Tile looks like an AP marker, but no Action Point record resolves to this cell.");
  }
  for (const rect of selection.rects) {
    diagnostics.push(...randomRectDiagnostics(rect).map((message) => `Random Rectangle ${rect.rectIndex}: ${message}`));
  }
  if (selection.rects.length > 1) {
    const priority = [...selection.rects].sort((a, b) => b.rectIndex - a.rectIndex)[0];
    diagnostics.push(`Multiple Random Rectangles overlap this cell; Realmz checks higher record indexes first, so rectangle ${priority.rectIndex} has priority here.`);
  }
  return diagnostics;
}

function tileDiagnostics(selection: CellSelection, map: MapEntity | null, meaning: TileMeaning | null) {
  const diagnostics: string[] = [];
  if (!meaning) return diagnostics;
  const attributes = meaning.attributes;
  if (meaning.attributeFlags.includes("visual-path") && !attributes?.pathFlag) {
    diagnostics.push("Tile is Divinity road/path art, but Realmz mapstats does not mark it as a runtime path.");
  }
  if (meaning.raw < 0 && attributes?.sourceKind !== "data-solids") {
    diagnostics.push("Special negative tile has no decoded Data Solids row; passability remains unknown.");
  }
  if (meaning.attributeFlags.includes("unknown-metadata")) {
    diagnostics.push("Tile behavior is unknown because no mapstats or Data Solids metadata matched this value.");
  }
  if (map) {
    const hasLandSecretState = map.levelType === "land" && landCellSecretState(selection.cell.tile) !== "normal";
    if ((hasLandSecretState || hasSecretMarkerTile(selection.cell.tile, map)) && attributes?.flags.includes("solid")) {
      diagnostics.push("Secret marker appears on a tile marked solid; verify that Realmz can actually enter this cell.");
    }
    if (isSecretWalkableTile(selection.cell.tile, map) && (attributes?.boatRequirement || attributes?.flyFloatRequired)) {
      diagnostics.push("Secret/passable marker is on a tile with boat or fly/float movement requirements.");
    }
  }
  return diagnostics;
}
