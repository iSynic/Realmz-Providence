import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "../store";
import { IconEntry, MapEntity, TilesetAsset } from "../types";
import { classifyTileValue, standardTileValues } from "../map/tileMetadata";
import { tileColor } from "./TileSprite";
import { TileSwatch } from "./TileSwatch";
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
  icons?: Record<number, IconEntry>;
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
  icons,
  atlasStatus,
  variant = "sidebar"
}: PaintPalettePanelProps) {
  const standardTiles = standardTileValues(tileset);
  const usedTiles = usedTilesForMap(map);
  const rawTiles = rawTilesForMap(map, tileset);
  const [mode, setMode] = useState<"landlook" | "used" | "raw">("landlook");
  const paletteTiles = mode === "used" ? usedTiles : mode === "raw" ? rawTiles : standardTiles;
  const [query, setQuery] = useState("");
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusTile = inspectedTile ?? selectedTile;
  const filteredTiles = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return paletteTiles;
    return paletteTiles.filter((tile) => String(tile).includes(normalized));
  }, [paletteTiles, query]);
  const selectedMeta = classifyTileValue(selectedTile, tileset);

  useEffect(() => {
    const button = buttonRefs.current.get(focusTile);
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: variant === "bar" ? "center" : "nearest" });
  }, [focusTile, filteredTiles.length, paletteTiles.length]);

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
        <span>{tileset ? `${tileset.name} | ${standardTiles.length} art tiles` : "No tileset"}</span>
        {inspectedTile != null && <b className="cell-tile-readout">Cell tile {inspectedTile}</b>}
        <b>Paint {selectedTile}</b>
      </div>
      {variant === "sidebar" && (
        <div className="paint-palette-tabs" role="tablist" aria-label="Tile palette mode">
          <button type="button" className={mode === "landlook" ? "active" : ""} onClick={() => setMode("landlook")}>Landlook</button>
          <button type="button" className={mode === "used" ? "active" : ""} onClick={() => setMode("used")}>Used</button>
          <button type="button" className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>Special / Raw</button>
        </div>
      )}
      {variant === "sidebar" && (
        <input
          className="paint-palette-search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search tile id..."
          aria-label="Search tile id"
        />
      )}
      {variant === "bar" ? (
        <ScrollArea className={listClass} orientation="horizontal" aria-label="Paint Palette">
          <PaletteButtons
            atlas={atlas}
            icons={icons}
            inspectedTile={inspectedTile}
            selectedTile={selectedTile}
            setSelectedTile={setSelectedTile}
            tiles={filteredTiles}
            tileset={tileset}
            buttonRefs={buttonRefs}
          />
        </ScrollArea>
      ) : (
        <div className={listClass} aria-label="Paint Palette">
          <PaletteButtons
            atlas={atlas}
            icons={icons}
            inspectedTile={inspectedTile}
            selectedTile={selectedTile}
            setSelectedTile={setSelectedTile}
            tiles={filteredTiles}
            tileset={tileset}
            buttonRefs={buttonRefs}
          />
        </div>
      )}
      <small className="paint-palette-detail">
        <b>{selectedMeta.label}</b> | raw {selectedMeta.raw} | render {selectedMeta.renderTile} | {selectedMeta.compatibility}
      </small>
      <small>{atlasStatus}</small>
    </section>
  );
}

function PaletteButtons({
  atlas,
  icons,
  inspectedTile,
  selectedTile,
  setSelectedTile,
  tiles,
  tileset,
  buttonRefs
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  icons?: Record<number, IconEntry>;
  inspectedTile: number | null;
  selectedTile: number;
  setSelectedTile: (tile: number) => void;
  tiles: number[];
  tileset: TilesetAsset | null;
  buttonRefs: MutableRefObject<Map<number, HTMLButtonElement>>;
}) {
  return (
    <>
      {tiles.map((tile) => (
        <button
          ref={(node) => {
            if (node) buttonRefs.current.set(tile, node);
            else buttonRefs.current.delete(tile);
          }}
          key={tile}
          className={tileButtonClassWithMetadata(tile, selectedTile, inspectedTile, tileset)}
          style={{ background: tileColor(tile) }}
          title={tileTitle(tile, tileset)}
          onClick={() => setSelectedTile(tile)}
        >
          <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={tileset} />
        </button>
      ))}
      {tiles.length === 0 && <small>No tiles match that search.</small>}
    </>
  );
}

export function tileButtonClass(tile: number, selectedTile: number, inspectedTile: number | null) {
  return tileButtonClassFor(tile, selectedTile, inspectedTile, null);
}

function tileButtonClassWithMetadata(tile: number, selectedTile: number, inspectedTile: number | null, tileset: TilesetAsset | null) {
  return tileButtonClassFor(tile, selectedTile, inspectedTile, tileset);
}

function tileButtonClassFor(tile: number, selectedTile: number, inspectedTile: number | null, tileset: TilesetAsset | null) {
  const metadata = classifyTileValue(tile, tileset);
  return [
    `tile-kind-${metadata.kind}`,
    tile === selectedTile ? "selected" : "",
    inspectedTile != null && tile === inspectedTile ? "inspected" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function paletteForMap(map: MapEntity | null, tileset: TilesetAsset | null) {
  const merged = [...standardTileValues(tileset), ...usedTilesForMap(map), ...FALLBACK_TILE_CHOICES];
  return Array.from(new Set(merged)).sort((a, b) => tileSort(a, b, tileset));
}

function usedTilesForMap(map: MapEntity | null) {
  return map ? Array.from(new Set(map.tiles)).sort((a, b) => a - b) : [];
}

function rawTilesForMap(map: MapEntity | null, tileset: TilesetAsset | null) {
  const standard = new Set(standardTileValues(tileset));
  const used = usedTilesForMap(map).filter((tile) => !standard.has(tile));
  const rawFallback = FALLBACK_TILE_CHOICES.filter((tile) => !standard.has(tile));
  return Array.from(new Set([...used, ...rawFallback])).sort((a, b) => a - b);
}

function tileSort(a: number, b: number, tileset: TilesetAsset | null) {
  const rank = (tile: number) => {
    const meta = classifyTileValue(tile, tileset);
    if (meta.kind === "standard-atlas" || meta.kind === "dungeon-bitfield") return 0;
    if (meta.kind === "marker-bit" || meta.kind === "path-bit") return 1;
    if (meta.kind === "special-negative") return 2;
    return 3;
  };
  return rank(a) - rank(b) || a - b;
}

function tileTitle(tile: number, tileset: TilesetAsset | null) {
  const metadata = classifyTileValue(tile, tileset);
  return `${metadata.label}. Raw ${metadata.raw}; renders as ${metadata.renderTile}. ${metadata.compatibility}`;
}
