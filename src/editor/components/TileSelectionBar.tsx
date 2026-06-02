import { memo, MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "../store";
import { IconEntry, LibraryAsset, MapEntity, MapPaintVariation, Project, TileAttributeFlag, TilePaletteCategory, TilesetAsset } from "../types";
import { classifyTileValue, isDivinityVisualPathTile, standardTileValues, tileAttributeGroup } from "../map/tileMetadata";
import { LANDLOOK_TILE_GROUPS, landlookGroupById, landlookGroupRangeLabel, landlookGroupTiles } from "../map/paintGroups";
import { PAINTABLE_REFERENCE_ACTOR_ICON_VALUES, PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES } from "../map/renderValues";
import { isActorOrCreatureIconId, isMapPlaceableLibraryAsset } from "../resourceResolver";
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
  project?: Project | null;
  libraryAssets?: LibraryAsset[];
  selectedTile: number;
  inspectedTile: number | null;
  setSelectedTile: (tile: number) => void;
  tileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons?: Record<number, IconEntry>;
  atlasStatus: string;
  activePaintGroupId: string;
  paintVariation: MapPaintVariation;
  onSetActivePaintGroup: (groupId: string) => void;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  variant?: "bar" | "sidebar";
};

type SpecialIconFilter = "placeable" | "actors" | "used" | "all";

export function TileSelectionBar(props: Omit<PaintPalettePanelProps, "variant">) {
  return <PaintPalettePanel {...props} variant="bar" />;
}

export function PaintPalettePanel({
  map,
  project,
  libraryAssets = [],
  selectedTile,
  inspectedTile,
  setSelectedTile,
  tileset,
  atlas,
  icons,
  atlasStatus,
  activePaintGroupId,
  paintVariation,
  onSetActivePaintGroup,
  onSetPaintVariation,
  variant = "sidebar"
}: PaintPalettePanelProps) {
  const standardTiles = useMemo(() => standardTileValues(tileset), [tileset]);
  const [mode, setMode] = useState<TilePaletteCategory>("landlook");
  const [specialFilter, setSpecialFilter] = useState<SpecialIconFilter>("all");
  const [attributeFilter, setAttributeFilter] = useState<TileAttributeFlag | "all">("all");
  const tileAttributes = project?.tileAttributes ?? [];
  const usedTiles = useMemo(() => {
    if (mode !== "used" && mode !== "attributes") return [];
    return usedTilesForMap(map);
  }, [map, mode]);
  const rawTiles = useMemo(() => (mode === "raw" ? rawTilesForMap(map, tileset) : []), [map, mode, tileset]);
  const specialTiles = useMemo(
    () => (mode === "special" ? specialTilesForPalette(project ?? null, map, libraryAssets, icons, specialFilter) : []),
    [icons, libraryAssets, map, mode, project, specialFilter]
  );
  const attributeTiles = useMemo(() => {
    if (mode !== "attributes") return [];
    const candidates = [...new Set([...standardTiles, ...usedTiles])].sort((a, b) => a - b);
    if (attributeFilter === "all") return candidates;
    return candidates.filter((tile) => tileAttributeGroup(classifyTileValue(tile, tileset, tileAttributes, icons).attributes, tile, tileset).includes(attributeFilter));
  }, [attributeFilter, icons, mode, standardTiles, tileAttributes, tileset, usedTiles]);
  const groupedStandardTiles = useMemo(() => {
    return landlookGroupTiles(tileset, activePaintGroupId);
  }, [activePaintGroupId, tileset]);
  const paletteTiles = useMemo(() => {
    if (mode === "used") return usedTiles;
    if (mode === "raw") return rawTiles;
    if (mode === "special") return specialTiles;
    if (mode === "attributes") return attributeTiles;
    return groupedStandardTiles;
  }, [attributeTiles, groupedStandardTiles, mode, rawTiles, specialTiles, usedTiles]);
  const [query, setQuery] = useState("");
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusTile = inspectedTile ?? selectedTile;
  const filteredTiles = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return paletteTiles;
    return paletteTiles.filter((tile) => String(tile).includes(normalized));
  }, [paletteTiles, query]);
  const selectedMeta = classifyTileValue(selectedTile, tileset, tileAttributes, icons);
  const activeGroup = landlookGroupById(activePaintGroupId);
  const activeGroupTiles = useMemo(() => landlookGroupTiles(tileset, activePaintGroupId), [activePaintGroupId, tileset]);
  const groupWarning = paintVariation !== "single" && activeGroupTiles.length === 0
    ? "This group has no tiles in the current landlook; painting will use the selected tile."
    : null;

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
          <strong>Palette</strong>
        </TutorialTip>
        <span>{tileset ? `${tileset.name} | ${standardTiles.length} tiles` : "No tileset"}</span>
        <b>{paintVariation === "single" ? `Paint ${selectedTile}` : paintVariationLabel(paintVariation, activeGroup.label)}</b>
      </div>
      {variant === "sidebar" && (
        <div className="paint-palette-tabs" role="tablist" aria-label="Tile palette mode">
          <button type="button" className={mode === "landlook" ? "active" : ""} onClick={() => setMode("landlook")}>Landlook</button>
          <button type="button" className={mode === "special" ? "active" : ""} onClick={() => setMode("special")}>Special / Icons</button>
          <button type="button" className={mode === "used" ? "active" : ""} onClick={() => setMode("used")}>Used</button>
          <button type="button" className={mode === "attributes" ? "active" : ""} onClick={() => setMode("attributes")}>Attributes</button>
          <button type="button" className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>Raw / Advanced</button>
        </div>
      )}
      {variant === "sidebar" && mode === "landlook" && (
        <div className="paint-tile-groups" role="toolbar" aria-label="Landlook tile groups">
          {LANDLOOK_TILE_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={activePaintGroupId === group.id ? "active" : ""}
              onClick={() => onSetActivePaintGroup(group.id)}
              title={group.hint}
            >
              {group.label}
            </button>
          ))}
        </div>
      )}
      {variant === "sidebar" && (
        <div className="paint-variation-panel" aria-label="Brush variation">
          <div className="paint-variation-header">
            <span>Variation</span>
            <b>{paintVariationLabel(paintVariation, activeGroup.label)}</b>
          </div>
          <div className="paint-variation-buttons" role="toolbar" aria-label="Brush variation mode">
            {PAINT_VARIATIONS.map((variation) => (
              <button
                key={variation.id}
                type="button"
                className={paintVariation === variation.id ? "active" : ""}
                onClick={() => onSetPaintVariation(variation.id)}
                title={variation.hint}
              >
                {variation.label}
              </button>
            ))}
          </div>
          {paintVariation !== "single" && (
            <div className="paint-group-preview">
              <small>{activeGroup.label} {landlookGroupRangeLabel(activePaintGroupId)}</small>
              <div className="paint-group-preview-strip">
                {activeGroupTiles.slice(0, 14).map((tile) => (
                  <button
                    key={tile}
                    type="button"
                    className={tile === selectedTile ? "selected" : ""}
                    style={{ background: tileColor(tile) }}
                    onClick={() => setSelectedTile(tile)}
                    title={tileTitle(tile, tileset, tileAttributes, icons)}
                  >
                    <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={tileset} />
                  </button>
                ))}
                {activeGroupTiles.length > 14 && <span>+{activeGroupTiles.length - 14}</span>}
              </div>
              {groupWarning && <small className="paint-variation-warning">{groupWarning}</small>}
            </div>
          )}
        </div>
      )}
      {variant === "sidebar" && mode === "attributes" && (
        <div className="paint-attribute-filters" role="toolbar" aria-label="Tile attribute filters">
          {ATTRIBUTE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={attributeFilter === filter.id ? "active" : ""}
              onClick={() => setAttributeFilter(filter.id)}
              title={filter.hint}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
      {variant === "sidebar" && mode === "special" && (
        <div className="paint-attribute-filters" role="toolbar" aria-label="Special icon filters">
          {SPECIAL_ICON_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={specialFilter === filter.id ? "active" : ""}
              onClick={() => setSpecialFilter(filter.id)}
              title={filter.hint}
            >
              {filter.label}
            </button>
          ))}
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
            tileAttributes={tileAttributes}
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
            tileAttributes={tileAttributes}
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

const PaletteButtons = memo(function PaletteButtons({
  atlas,
  icons,
  inspectedTile,
  selectedTile,
  setSelectedTile,
  tiles,
  tileset,
  tileAttributes,
  buttonRefs
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  icons?: Record<number, IconEntry>;
  inspectedTile: number | null;
  selectedTile: number;
  setSelectedTile: (tile: number) => void;
  tiles: number[];
  tileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
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
          className={tileButtonClassWithMetadata(tile, selectedTile, inspectedTile, tileset, tileAttributes, icons)}
          style={{ background: tileColor(tile) }}
          title={tileTitle(tile, tileset, tileAttributes, icons)}
          onClick={() => setSelectedTile(tile)}
        >
          <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={tileset} />
        </button>
      ))}
      {tiles.length === 0 && <small>No tiles match that search.</small>}
    </>
  );
});

export function tileButtonClass(tile: number, selectedTile: number, inspectedTile: number | null) {
  return tileButtonClassFor(tile, selectedTile, inspectedTile, null, [], undefined);
}

function tileButtonClassWithMetadata(
  tile: number,
  selectedTile: number,
  inspectedTile: number | null,
  tileset: TilesetAsset | null,
  tileAttributes: Project["tileAttributes"],
  icons?: Record<number, IconEntry>
) {
  return tileButtonClassFor(tile, selectedTile, inspectedTile, tileset, tileAttributes, icons);
}

function tileButtonClassFor(
  tile: number,
  selectedTile: number,
  inspectedTile: number | null,
  tileset: TilesetAsset | null,
  tileAttributes: Project["tileAttributes"],
  icons?: Record<number, IconEntry>
) {
  const metadata = classifyTileValue(tile, tileset, tileAttributes, icons);
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

const ATTRIBUTE_FILTERS: Array<{ id: TileAttributeFlag | "all"; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show all tiles with known or unknown metadata." },
  { id: "walkable", label: "Walkable", hint: "Realmz landlook data says normal foot movement can enter this tile without boat or fly/float." },
  { id: "solid", label: "Solid / Blocking", hint: "Realmz landlook data marks this tile as solid, boat-only, or fly/float-gated." },
  { id: "path", label: "Runtime Path", hint: "Realmz landlook data marks this tile with the runtime path flag." },
  { id: "visual-path", label: "Road Art", hint: "Road/path-looking atlas tiles. These are visual art unless Realmz also marks them as runtime paths." },
  { id: "shore", label: "Shore / Water", hint: "Realmz shore/water tile data." },
  { id: "boat-required", label: "Boat Required", hint: "Realmz boat/water movement requirement." },
  { id: "fly-float-required", label: "Fly / Float", hint: "Realmz fly/float movement requirement." },
  { id: "blocks-los", label: "Blocks LOS", hint: "Realmz line-of-sight blocker." },
  { id: "forest", label: "Forest", hint: "Realmz forest type used for outdoor and combat behavior." },
  { id: "combat-build", label: "Combat Map", hint: "Tiles with a decoded 3x3 combat expansion grid." },
  { id: "special-icon", label: "Special / Icon", hint: "Negative values or icon-backed tiles." },
  { id: "unknown-metadata", label: "Unknown", hint: "Tiles without decoded attribute metadata." }
];

const SPECIAL_ICON_FILTERS: Array<{ id: SpecialIconFilter; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "All currently exposed special/icon paint values, including special land and actor-style cicn art." },
  { id: "actors", label: "NPCs / Creatures", hint: "Broader cicn actor, corpse, monster, and creature art exposed as negative map-field aliases for special/icon painting." },
  { id: "placeable", label: "Special Land", hint: "Project/library special land tiles and negative icon values commonly authored as map field values." },
  { id: "used", label: "Used Here", hint: "Negative icon values already used in the current map." },
];

const PAINT_VARIATIONS: Array<{ id: MapPaintVariation; label: string; hint: string }> = [
  { id: "single", label: "Single Tile", hint: "Paint the selected tile, matching the current behavior." },
  { id: "cycle-group", label: "Cycle Group", hint: "Advance through the active tile group once for each newly painted cell." },
  { id: "random-group", label: "Random Group", hint: "Pick a stable pseudo-random tile from the active tile group for each newly painted cell." }
];

function paintVariationLabel(variation: MapPaintVariation, groupLabel: string) {
  if (variation === "cycle-group") return `Cycle: ${groupLabel}`;
  if (variation === "random-group") return `Random: ${groupLabel}`;
  return "Single Tile";
}

function specialTilesForPalette(
  project: Project | null,
  map: MapEntity | null,
  libraryAssets: LibraryAsset[],
  icons?: Record<number, IconEntry>,
  filter: SpecialIconFilter = "placeable"
) {
  const placeable = new Set<number>();
  const actors = new Set<number>();
  const used = new Set<number>();
  for (const asset of project?.assets ?? []) {
    if (asset.kind === "special-land-tile") placeable.add(asset.resourceId);
  }
  for (const asset of project?.assetCatalog.icons ?? []) {
    const value = asset.resourceId < 0 ? asset.resourceId : -asset.resourceId;
    placeable.add(value);
  }
  for (const asset of libraryAssets) {
    if (!isPaintableSpecialLandAsset(asset)) continue;
    if (asset.resourceId == null) continue;
    const value = asset.resourceId < 0 ? asset.resourceId : -asset.resourceId;
    if (isActorOrCreatureIconId(Math.abs(asset.resourceId))) actors.add(value);
    else placeable.add(value);
  }
  for (const tile of PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES) {
    placeable.add(tile);
  }
  for (const tile of PAINTABLE_REFERENCE_ACTOR_ICON_VALUES) {
    actors.add(tile);
  }
  for (const tile of map?.tiles ?? []) {
    if (tile < 0) used.add(tile);
  }
  for (const id of Object.keys(icons ?? {})) {
    const tile = Number(id);
    if (Number.isFinite(tile) && tile < 0) placeable.add(tile);
  }
  const values = new Set<number>();
  if (filter === "placeable" || filter === "all") for (const value of placeable) values.add(value);
  if (filter === "actors" || filter === "all") for (const value of actors) values.add(value);
  if (filter === "used" || filter === "all") for (const value of used) values.add(value);
  return [...values].sort((a, b) => a - b);
}

function isPaintableSpecialLandAsset(asset: LibraryAsset) {
  return isMapPlaceableLibraryAsset(asset);
}

function entitySummaryNumber(summary: Record<string, unknown> | undefined, key: string) {
  const value = summary?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function tileTitle(
  tile: number,
  tileset: TilesetAsset | null,
  tileAttributes: Project["tileAttributes"],
  icons?: Record<number, IconEntry>
) {
  const metadata = classifyTileValue(tile, tileset, tileAttributes, icons);
  const icon = metadata.iconCandidates.length > 0
    ? metadata.iconAvailable
      ? ` Icon art loaded (${metadata.iconCandidates.join(", ")}).`
      : ` Missing icon art (${metadata.iconCandidates.join(", ")}).`
    : "";
  const attributes = metadata.attributes
    ? ` Solid type ${metadata.attributes.solidType ?? "unknown"} from ${attributeTableLabel(metadata.attributes.sourceKind, metadata.attributes.source)}.`
    : " Tile attributes unknown.";
  const visualPath = isDivinityVisualPathTile(tile, tileset) && !metadata.attributes?.flags.includes("path")
    ? " Divinity shows this atlas range as road/path art; Realmz mapstats does not set its path flag."
    : "";
  return `${metadata.label}. Raw ${metadata.raw}; renders as ${metadata.renderTile}.${icon}${attributes}${visualPath} ${metadata.compatibility}`;
}

function attributeTableLabel(sourceKind: string | undefined, source: string) {
  if (sourceKind === "mapstats") return "the landlook table";
  if (sourceKind === "data-solids") return "the special tile table";
  return source || "decoded tile data";
}
