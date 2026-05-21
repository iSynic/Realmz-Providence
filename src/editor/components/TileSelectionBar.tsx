import { useEffect, useRef } from "react";
import { EditorState } from "../store";
import { MapEntity, TilesetAsset } from "../types";
import { TileSprite, tileColor } from "./TileSprite";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";

const FALLBACK_TILE_CHOICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160,
  192, 224, 256, 300, 350, 400, 500, 999
];

type PaintPalettePanelProps = {
  map: MapEntity | null;
  selectedTile: number;
  inspectedTile: number | null;
  setSelectedTile: (tile: number) => void;
  tileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  atlasStatus: string;
  variant?: "bar" | "sidebar";
};

export function TileSelectionBar(props: Omit<PaintPalettePanelProps, "variant">) {
  return <PaintPalettePanel {...props} variant="bar" />;
}

export function PaintPalettePanel({
  map,
  selectedTile,
  inspectedTile,
  setSelectedTile,
  tileset,
  atlas,
  atlasStatus,
  variant = "sidebar"
}: PaintPalettePanelProps) {
  const paletteTiles = paletteForMap(map, tileset);
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusTile = inspectedTile ?? selectedTile;

  useEffect(() => {
    const button = buttonRefs.current.get(focusTile);
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: variant === "bar" ? "center" : "nearest" });
  }, [focusTile, paletteTiles.length]);

  const rootClass = variant === "bar" ? "tile-selection-bar" : "paint-palette-panel";
  const metaClass = variant === "bar" ? "tile-selection-meta" : "paint-palette-meta";
  const listClass = variant === "bar" ? "tile-strip" : "paint-palette-grid";

  return (
    <section className={rootClass}>
      <div className={metaClass}>
        <TutorialTip
          title="Paint Palette"
          body="Click a tile to choose what the Paint tool will place. Sprite thumbnails use the loaded Realmz atlas; color-only swatches are decoded fallback or special tile values."
          side={variant === "bar" ? "above" : "right"}
        >
          <strong>Paint Palette</strong>
        </TutorialTip>
        <span>{tileset ? `${tileset.name} | ${paletteTiles.length} tiles` : "No tileset"}</span>
        {inspectedTile != null && <b className="cell-tile-readout">Cell tile {inspectedTile}</b>}
        <b>Paint {selectedTile}</b>
      </div>
      <ScrollArea className={listClass} orientation={variant === "bar" ? "horizontal" : "vertical"} aria-label="Paint Palette">
        {paletteTiles.map((tile) => (
          <button
            ref={(node) => {
              if (node) buttonRefs.current.set(tile, node);
              else buttonRefs.current.delete(tile);
            }}
            key={tile}
            className={tileButtonClass(tile, selectedTile, inspectedTile)}
            style={{ background: tileColor(tile) }}
            title={`Use tile ${tile} for painting`}
            onClick={() => setSelectedTile(tile)}
          >
            {atlas && <TileSprite atlas={atlas} tile={tile} />}
            <span className="tile-label">{tile}</span>
          </button>
        ))}
      </ScrollArea>
      <small>{atlasStatus}</small>
    </section>
  );
}

export function tileButtonClass(tile: number, selectedTile: number, inspectedTile: number | null) {
  return [
    tile === selectedTile ? "selected" : "",
    inspectedTile != null && tile === inspectedTile ? "inspected" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function paletteForMap(map: MapEntity | null, tileset: TilesetAsset | null) {
  const capacity = tileset ? Math.max(0, tileset.columns * tileset.rows) : 0;
  const fullAtlas = capacity > 0 ? Array.from({ length: capacity }, (_, index) => index + 1) : [];
  const used = map ? Array.from(new Set(map.tiles)).sort((a, b) => a - b) : [];
  const merged = [...fullAtlas, ...used, ...FALLBACK_TILE_CHOICES];
  return Array.from(new Set(merged)).sort((a, b) => a - b);
}
