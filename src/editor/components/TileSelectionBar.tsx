import { CSSProperties, DragEvent, memo, MutableRefObject, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "../store";
import { CustomMapStamp, IconEntry, LibraryAsset, MapEntity, MapPaintVariation, MapRegionSelection, Project, ProjectCommand, TileAttributeFlag, TilePaletteCategory, TilesetAsset } from "../types";
import { classifyTileValue, isDivinityVisualPathTile, standardTileValues, tileAttributeGroup } from "../map/tileMetadata";
import { LANDLOOK_TILE_GROUPS, landlookGroupById, landlookGroupRangeLabel, landlookGroupTiles } from "../map/paintGroups";
import { PAINTABLE_REFERENCE_ACTOR_ICON_VALUES, PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES, tileIconCandidates } from "../map/renderValues";
import { builtInStampToMapStamp, customMapStampToMapStamp, MapStamp, superTileStampsForMap } from "../map/superTileStamps";
import { captureMapStampFromRegion, createMapStampId, normalizeMapStamps } from "../map/customMapStamps";
import { isActorOrCreatureIconId, isMapPlaceableLibraryAsset } from "../resourceResolver";
import { tileColor } from "./TileSprite";
import { TileSwatch } from "./TileSwatch";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";

const FALLBACK_TILE_CHOICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160,
  192, 224, 256, 300, 350, 400, 500, 999
];
const TILE_DRAG_THRESHOLD = 6;

const PALETTE_MODE_HELP: Record<TilePaletteCategory, string> = {
  landlook: "Standard Realmz landlook or dungeon atlas tiles for the selected map renderer.",
  special: "Negative special land cicn tiles and icon-backed map values, including large structures and landmarks.",
  super: "Stamp Library: built-in, project, and global multi-cell brushes for structures, tree pairs, landmarks, and custom assemblies.",
  custom: "Project-saved named tile buckets. Drag tiles from any palette tab into the reveal dock to collect them.",
  used: "Every raw tile value already present on the current map, including values outside the visible atlas range.",
  attributes: "Tiles grouped by decoded behavior such as solid, walkable, shore/water, path, boat, LOS, forest, and combat evidence.",
  raw: "Advanced compatibility values and map-used raw values for auditing or expert painting."
};

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
  mode: TilePaletteCategory;
  onSetMode: (mode: TilePaletteCategory) => void;
  activePaintGroupId: string;
  paintVariation: MapPaintVariation;
  activeCustomPaletteId: string | null;
  selectedRegion?: MapRegionSelection | null;
  globalMapStamps?: CustomMapStamp[];
  selectedSuperTileStampId?: string | null;
  onSetActivePaintGroup: (groupId: string) => void;
  onSetActiveCustomPaletteId: (paletteId: string | null) => void;
  onSetGlobalMapStamps?: (stamps: CustomMapStamp[]) => void;
  onSelectSuperTileStamp?: (stampId: string) => void;
  onActivateStampTool?: () => void;
  stampOnly?: boolean;
  onSetVariationTiles: (tiles: number[] | null) => void;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  variant?: "bar" | "sidebar";
};

type SpecialIconFilter = "structures" | "placeable" | "actors" | "used" | "all";

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
  mode,
  onSetMode,
  activePaintGroupId,
  activeCustomPaletteId,
  selectedRegion,
  globalMapStamps = [],
  selectedSuperTileStampId,
  onSetActiveCustomPaletteId,
  onSetGlobalMapStamps,
  onSelectSuperTileStamp,
  onActivateStampTool,
  stampOnly = false,
  onSetVariationTiles,
  paintVariation,
  onSetActivePaintGroup,
  onSetPaintVariation,
  onApplyCommand,
  variant = "sidebar"
}: PaintPalettePanelProps) {
  const standardTiles = useMemo(() => standardTileValues(tileset), [tileset]);
  const [specialFilter, setSpecialFilter] = useState<SpecialIconFilter>("all");
  const [attributeFilter, setAttributeFilter] = useState<TileAttributeFlag | "all">("all");
  const [tileDrag, setTileDrag] = useState<TileDragState | null>(null);
  const tileDragRef = useRef<TileDragState | null>(null);
  const tileAttributes = project?.tileAttributes ?? [];
  const customPalettes = project?.editorMetadata?.tilePalettes ?? [];
  const activeCustomPalette = customPalettes.find((palette) => palette.id === activeCustomPaletteId) ?? customPalettes[0] ?? null;
  const projectMapStamps = project?.editorMetadata?.mapStamps ?? [];
  const superTileStamps = useMemo(
    () => (mode === "super"
      ? [
          ...superTileStampsForMap(map, tileset).map(builtInStampToMapStamp),
          ...projectMapStamps.map((stamp) => customMapStampToMapStamp(stamp, "project")),
          ...globalMapStamps.map((stamp) => customMapStampToMapStamp(stamp, "global"))
        ]
      : []),
    [globalMapStamps, map, mode, projectMapStamps, tileset]
  );
  const dragDockVisible = Boolean(tileDrag?.active);
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
    const tiles = landlookGroupTiles(tileset, activePaintGroupId);
    if (activePaintGroupId !== "structures") return tiles;
    return [...new Set([...tiles, ...specialStructureTilesForPalette(project ?? null, libraryAssets, icons)])].sort((a, b) => a - b);
  }, [activePaintGroupId, icons, libraryAssets, project, tileset]);
  const paletteTiles = useMemo(() => {
    if (mode === "used") return usedTiles;
    if (mode === "raw") return rawTiles;
    if (mode === "special") return specialTiles;
    if (mode === "attributes") return attributeTiles;
    if (mode === "custom") return activeCustomPalette?.tiles ?? [];
    if (mode === "super") return [];
    return groupedStandardTiles;
  }, [activeCustomPalette, attributeTiles, groupedStandardTiles, mode, rawTiles, specialTiles, usedTiles]);
  const [query, setQuery] = useState("");
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusTile = inspectedTile ?? selectedTile;
  const filteredTiles = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return paletteTiles;
    return paletteTiles.filter((tile) => String(tile).includes(normalized));
  }, [paletteTiles, query]);
  const filteredSuperTileStamps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return superTileStamps;
    return superTileStamps.filter((stamp) =>
      stamp.label.toLowerCase().includes(normalized) ||
      stamp.id.toLowerCase().includes(normalized) ||
      stamp.cells.some((cell) => String(cell.tile).includes(normalized))
    );
  }, [query, superTileStamps]);
  const selectedMeta = classifyTileValue(selectedTile, tileset, tileAttributes, icons);
  const activeGroup = landlookGroupById(activePaintGroupId);
  const activeVariationLabel = mode === "custom" ? activeCustomPalette?.name ?? "Custom Palette" : activeGroup.label;
  const activeVariationTiles = useMemo(
    () => {
      if (mode === "custom") return activeCustomPalette?.tiles ?? [];
      if (mode === "special") return specialTiles;
      if (mode === "used") return usedTiles;
      if (mode === "attributes") return attributeTiles;
      if (mode === "raw") return rawTiles;
      return landlookGroupTiles(tileset, activePaintGroupId);
    },
    [activeCustomPalette, activePaintGroupId, attributeTiles, mode, rawTiles, specialTiles, tileset, usedTiles]
  );
  const groupWarning = paintVariation !== "single" && activeVariationTiles.length === 0
    ? "This group has no tiles in the current landlook; painting will use the selected tile."
    : null;

  useEffect(() => {
    const button = buttonRefs.current.get(focusTile);
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: variant === "bar" ? "center" : "nearest" });
  }, [focusTile, filteredTiles.length, paletteTiles.length]);

  useEffect(() => {
    onSetVariationTiles(activeVariationTiles);
  }, [activeVariationTiles, onSetVariationTiles]);

  useEffect(() => {
    if (!tileDrag) return;
    const handleMove = (event: PointerEvent) => {
      setTileDrag((current) => {
        if (!current) return null;
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        const next = {
          ...current,
          x: event.clientX,
          y: event.clientY,
          active: current.active || distance >= TILE_DRAG_THRESHOLD
        };
        tileDragRef.current = next;
        return next;
      });
    };
    const handleUp = (event: PointerEvent) => {
      const current = tileDragRef.current;
      tileDragRef.current = null;
      setTileDrag(null);
      if (current?.active) finishTileDrag(current.tile, event.clientX, event.clientY);
    };
    const handleCancel = () => {
      tileDragRef.current = null;
      setTileDrag(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [tileDrag]);

  const beginTileDrag = (tile: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const next = {
      tile,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false
    };
    tileDragRef.current = next;
    setTileDrag(next);
  };
  const finishTileDrag = (tile: number, clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-palette-drop-target]");
    const targetId = target?.dataset.paletteDropTarget ?? "";
    if (!targetId) return;
    if (targetId === "new") {
      createPaletteWithTile(tile);
      return;
    }
    const palette = customPalettes.find((candidate) => candidate.id === targetId);
    if (!palette) return;
    onApplyCommand({ kind: "addTileToPalette", label: `Add tile ${tile} to ${palette.name}`, paletteId: palette.id, tile });
  };
  const createPaletteWithTile = (tile: number) => {
    const fallbackName = `Palette ${customPalettes.length + 1}`;
    const name = window.prompt("Name this tile palette", fallbackName)?.trim();
    if (!name) return;
    const id = `tile-palette:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    onApplyCommand({ kind: "createTilePalette", label: `Create tile palette ${name}`, id, name, tiles: [tile] });
    onSetActiveCustomPaletteId(id);
  };

  const rootClass = variant === "bar" ? "tile-selection-bar" : "paint-palette-panel";
  const metaClass = variant === "bar" ? "tile-selection-meta" : "paint-palette-meta";
  const listClass = variant === "bar" ? "tile-strip" : "paint-palette-grid";
  const dropDockStyle = dragDockVisible && tileDrag ? paletteDropDockStyle(tileDrag) : undefined;

  return (
    <section className={`${rootClass}${dragDockVisible ? " dragging-tile" : ""}`}>
      <div className={metaClass}>
        <TutorialTip
          title="Paint Palette"
          body="Click a tile to choose the raw Realmz map-field value Paint will place. Landlook tiles use the active atlas; Special / Icons includes negative cicn structures and landmarks; Custom palettes collect single tiles. In Stamp mode, this area becomes the Stamp Library for multi-cell brushes."
          side={variant === "bar" ? "above" : "right"}
        >
          <strong>Palette</strong>
        </TutorialTip>
        <span>{tileset ? `${tileset.name} | ${standardTiles.length} tiles` : "No tileset"}</span>
        <b>{paintVariation === "single" ? `Paint ${selectedTile}` : paintVariationLabel(paintVariation, activeVariationLabel)}</b>
      </div>
      {variant === "sidebar" && !stampOnly && (
        <div className="paint-palette-tabs" role="tablist" aria-label="Tile palette mode">
          <button type="button" className={mode === "landlook" ? "active" : ""} onClick={() => onSetMode("landlook")} title={PALETTE_MODE_HELP.landlook}>Landlook</button>
          <button type="button" className={mode === "special" ? "active" : ""} onClick={() => onSetMode("special")} title={PALETTE_MODE_HELP.special}>Special / Icons</button>
          <button type="button" className={mode === "super" ? "active" : ""} onClick={() => onSetMode("super")} title={PALETTE_MODE_HELP.super}>Super Tiles</button>
          <button type="button" className={mode === "custom" ? "active" : ""} onClick={() => onSetMode("custom")} title={PALETTE_MODE_HELP.custom}>Custom</button>
          <button type="button" className={mode === "used" ? "active" : ""} onClick={() => onSetMode("used")} title={PALETTE_MODE_HELP.used}>Used</button>
          <button type="button" className={mode === "attributes" ? "active" : ""} onClick={() => onSetMode("attributes")} title={PALETTE_MODE_HELP.attributes}>Attributes</button>
          <button type="button" className={mode === "raw" ? "active" : ""} onClick={() => onSetMode("raw")} title={PALETTE_MODE_HELP.raw}>Raw / Advanced</button>
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
      {variant === "sidebar" && mode === "custom" && (
        <CustomPaletteControls
          palettes={customPalettes}
          activePaletteId={activeCustomPalette?.id ?? null}
          selectedTile={selectedTile}
          onSetActivePaletteId={onSetActiveCustomPaletteId}
          onApplyCommand={onApplyCommand}
        />
      )}
      {variant === "sidebar" && mode !== "super" && (
        <div className="paint-variation-panel" aria-label="Brush variation">
          <div className="paint-variation-header">
            <span>Variation</span>
            <b>{paintVariationLabel(paintVariation, activeVariationLabel)}</b>
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
              <small>{mode === "custom" ? `${activeVariationLabel} (${activeVariationTiles.length} tiles)` : `${activeGroup.label} ${landlookGroupRangeLabel(activePaintGroupId)}`}</small>
              <div className="paint-group-preview-strip">
                {activeVariationTiles.slice(0, 14).map((tile) => (
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
                {activeVariationTiles.length > 14 && <span>+{activeVariationTiles.length - 14}</span>}
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
      {variant === "sidebar" && mode === "super" ? (
        <StampLibrary
          atlas={atlas}
          icons={icons}
          map={map}
          project={project ?? null}
          selectedRegion={selectedRegion ?? null}
          selectedTile={selectedTile}
          selectedStampId={selectedSuperTileStampId ?? null}
          stamps={filteredSuperTileStamps}
          tileset={tileset}
          globalMapStamps={globalMapStamps}
          onSelectStamp={(stamp) => {
            onSelectSuperTileStamp?.(stamp.id);
            onActivateStampTool?.();
          }}
          onApplyCommand={onApplyCommand}
          onSetGlobalMapStamps={onSetGlobalMapStamps}
        />
      ) : variant === "bar" ? (
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
            emptyMessage="No tiles match that search."
            onBeginTileDrag={beginTileDrag}
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
            emptyMessage={mode === "custom" ? "This custom palette is empty. Drag tiles here from another palette tab, or use Add Selected." : "No tiles match that search."}
            onBeginTileDrag={beginTileDrag}
            onRemoveTile={mode === "custom" && activeCustomPalette ? (tile) => onApplyCommand({ kind: "removeTileFromPalette", label: `Remove tile ${tile} from ${activeCustomPalette.name}`, paletteId: activeCustomPalette.id, tile }) : undefined}
          />
        </div>
      )}
      {dragDockVisible && (
        <>
          <PaletteDropDock palettes={customPalettes} style={dropDockStyle} />
          <div className="palette-drag-ghost" style={{ left: tileDrag!.x, top: tileDrag!.y }}>
            <TileSwatch atlas={atlas} icons={icons} tile={tileDrag!.tile} tileset={tileset} />
            <span>{tileDrag!.tile}</span>
          </div>
        </>
      )}
      {mode !== "super" && (
        <small className="paint-palette-detail">
          <b>{selectedMeta.label}</b> | raw {selectedMeta.raw} | render {selectedMeta.renderTile} | {selectedMeta.compatibility}
        </small>
      )}
      <small>{atlasStatus}</small>
    </section>
  );
}

type StampLibraryScope = "all" | "built-in" | "project" | "global";

function StampLibrary({
  atlas,
  icons,
  map,
  project,
  selectedRegion,
  selectedTile,
  selectedStampId,
  stamps,
  tileset,
  globalMapStamps,
  onSelectStamp,
  onApplyCommand,
  onSetGlobalMapStamps
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  icons?: Record<number, IconEntry>;
  map: MapEntity | null;
  project: Project | null;
  selectedRegion: MapRegionSelection | null;
  selectedTile: number;
  selectedStampId: string | null;
  stamps: MapStamp[];
  tileset: TilesetAsset | null;
  globalMapStamps: CustomMapStamp[];
  onSelectStamp: (stamp: MapStamp) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onSetGlobalMapStamps?: (stamps: CustomMapStamp[]) => void;
}) {
  const [scope, setScope] = useState<StampLibraryScope>("all");
  const [editing, setEditing] = useState<{ source: "project" | "global"; id: string; draft: CustomMapStamp } | null>(null);
  const [editTool, setEditTool] = useState<"paint" | "erase">("paint");
  const visibleStamps = scope === "all" ? stamps : stamps.filter((stamp) => stamp.source === scope);
  const selectedStamp = stamps.find((stamp) => stamp.id === selectedStampId) ?? null;
  const customSelected = selectedStamp?.source === "project" || selectedStamp?.source === "global" ? selectedStamp : null;
  const captureDisabled = !project || !map || !selectedRegion;
  const createFromSelection = () => {
    if (!project || !map || !selectedRegion) return;
    const fallbackName = `Stamp ${(project.editorMetadata?.mapStamps?.length ?? 0) + 1}`;
    const name = window.prompt("Name this map stamp", fallbackName)?.trim();
    if (!name) return;
    const id = createMapStampId(name);
    const stamp = captureMapStampFromRegion(map, selectedRegion, tileset, name, id);
    if (!stamp) {
      window.alert("The selected region only contains clear/base tiles, so no stamp was created.");
      return;
    }
    onApplyCommand({ kind: "createMapStamp", label: `Create stamp ${stamp.name}`, id: stamp.id, name: stamp.name, width: stamp.width, height: stamp.height, cells: stamp.cells });
    onSelectStamp(customMapStampToMapStamp(stamp, "project"));
  };
  const copySelectedToGlobal = () => {
    if (!customSelected || !onSetGlobalMapStamps) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source) return;
    const copy = stampCopy(source, `${source.name} Global`);
    onSetGlobalMapStamps([...globalMapStamps, copy]);
    onSelectStamp(customMapStampToMapStamp(copy, "global"));
  };
  const copySelectedToProject = () => {
    if (!customSelected || !project) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source) return;
    const copy = stampCopy(source, `${source.name} Project`);
    onApplyCommand({ kind: "createMapStamp", label: `Copy stamp ${source.name} to project`, id: copy.id, name: copy.name, width: copy.width, height: copy.height, cells: copy.cells });
    onSelectStamp(customMapStampToMapStamp(copy, "project"));
  };
  const renameSelected = () => {
    if (!customSelected) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source) return;
    const name = window.prompt("Rename stamp", source.name)?.trim();
    if (!name) return;
    if (customSelected.source === "project") onApplyCommand({ kind: "renameMapStamp", label: `Rename stamp ${source.name}`, stampId: source.id, name });
    else onSetGlobalMapStamps?.(globalMapStamps.map((stamp) => stamp.id === source.id ? { ...stamp, name, updatedAt: new Date().toISOString() } : stamp));
  };
  const duplicateSelected = () => {
    if (!customSelected) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source) return;
    if (customSelected.source === "project") {
      onApplyCommand({ kind: "duplicateMapStamp", label: `Duplicate stamp ${source.name}`, stampId: source.id, name: `Copy of ${source.name}` });
    } else {
      const copy = stampCopy(source, `Copy of ${source.name}`);
      onSetGlobalMapStamps?.([...globalMapStamps, copy]);
      onSelectStamp(customMapStampToMapStamp(copy, "global"));
    }
  };
  const deleteSelected = () => {
    if (!customSelected) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source || !window.confirm(`Delete stamp "${source.name}"?`)) return;
    if (customSelected.source === "project") onApplyCommand({ kind: "deleteMapStamp", label: `Delete stamp ${source.name}`, stampId: source.id });
    else onSetGlobalMapStamps?.(globalMapStamps.filter((stamp) => stamp.id !== source.id));
  };
  const beginEdit = () => {
    if (!customSelected) return;
    const source = customStampFromMapStamp(customSelected, project, globalMapStamps);
    if (!source) return;
    const editSource = customSelected.source === "project" ? "project" : "global";
    setEditing({ source: editSource, id: source.id, draft: cloneStamp(source) });
  };
  const saveEdit = () => {
    if (!editing) return;
    const draft = normalizeMapStamps([editing.draft])[0];
    if (editing.source === "project") {
      onApplyCommand({ kind: "updateMapStamp", label: `Update stamp ${draft.name}`, stampId: editing.id, changes: { name: draft.name, width: draft.width, height: draft.height, cells: draft.cells } });
      onSelectStamp(customMapStampToMapStamp(draft, "project"));
    } else {
      onSetGlobalMapStamps?.(globalMapStamps.map((stamp) => stamp.id === editing.id ? { ...draft, id: editing.id, updatedAt: new Date().toISOString() } : stamp));
      onSelectStamp(customMapStampToMapStamp({ ...draft, id: editing.id }, "global"));
    }
    setEditing(null);
  };
  return (
    <div className="stamp-palette-section">
      <div className="stamp-library-toolbar">
        <div className="stamp-scope-tabs" role="toolbar" aria-label="Stamp library filter">
          {STAMP_SCOPES.map((item) => (
            <button key={item.id} type="button" className={scope === item.id ? "active" : ""} onClick={() => setScope(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-xs" type="button" disabled={captureDisabled} onClick={createFromSelection} title={captureDisabled ? "Select a map region first." : "Create a project stamp from the selected map region."}>
          New From Selection
        </button>
      </div>
      {selectedStamp && (
        <div className="stamp-library-actions">
          <span>{selectedStamp.label} <small>{stampSourceLabel(selectedStamp.source)}</small></span>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!customSelected} onClick={beginEdit}>Edit</button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!customSelected} onClick={renameSelected}>Rename</button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!customSelected} onClick={duplicateSelected}>Duplicate</button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!customSelected || selectedStamp.source === "global"} onClick={copySelectedToGlobal}>Copy To Global</button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!customSelected || selectedStamp.source === "project" || !project} onClick={copySelectedToProject}>Copy To Project</button>
          <button className="btn btn-ghost btn-xs" type="button" disabled={!customSelected} onClick={deleteSelected}>Delete</button>
        </div>
      )}
      {editing && (
        <StampEditor
          atlas={atlas}
          icons={icons}
          draft={editing.draft}
          editTool={editTool}
          selectedTile={selectedTile}
          tileset={tileset}
          onSetDraft={(draft) => setEditing({ ...editing, draft })}
          onSetEditTool={setEditTool}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
      <div className="stamp-palette-grid" aria-label="Map stamp brushes">
        {visibleStamps.map((stamp) => {
          const bounds = stampBounds(stamp);
          return (
            <button
              key={stamp.id}
              type="button"
              className={`stamp-palette-card${stamp.id === selectedStampId ? " selected" : ""}`}
              onClick={() => onSelectStamp(stamp)}
              title={`${stamp.description} Places ${stamp.cells.length} tiles.`}
            >
              <span
                className="stamp-palette-preview"
                style={{
                  gridTemplateColumns: `repeat(${bounds.width}, 24px)`,
                  gridTemplateRows: `repeat(${bounds.height}, 24px)`,
                  width: `${bounds.width * 24 + 2}px`,
                  height: `${bounds.height * 24 + 2}px`
                }}
              >
                {stamp.cells.map((cell) => (
                  <span
                    key={`${cell.dx}:${cell.dy}:${cell.tile}`}
                    style={{ gridColumn: cell.dx - bounds.left + 1, gridRow: cell.dy - bounds.top + 1, background: tileColor(cell.tile) }}
                  >
                    <TileSwatch atlas={atlas} icons={icons} tile={cell.tile} tileset={tileset} showBadge={false} />
                  </span>
                ))}
              </span>
              <span className="stamp-palette-label">{stamp.label}</span>
              <small>{stampSourceLabel(stamp.source)} | {stamp.cells.length} tiles</small>
            </button>
          );
        })}
        {visibleStamps.length === 0 && <small className="paint-palette-empty">No stamps are available in this library.</small>}
      </div>
    </div>
  );
}

function StampEditor({
  atlas,
  icons,
  draft,
  editTool,
  selectedTile,
  tileset,
  onSetDraft,
  onSetEditTool,
  onCancel,
  onSave
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  icons?: Record<number, IconEntry>;
  draft: CustomMapStamp;
  editTool: "paint" | "erase";
  selectedTile: number;
  tileset: TilesetAsset | null;
  onSetDraft: (draft: CustomMapStamp) => void;
  onSetEditTool: (tool: "paint" | "erase") => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [dragCell, setDragCell] = useState<{ x: number; y: number } | null>(null);
  const cellAt = (x: number, y: number) => draft.cells.find((cell) => cell.x === x && cell.y === y) ?? null;
  const setCell = (x: number, y: number, tile: number | null) => {
    const cells = draft.cells.filter((cell) => cell.x !== x || cell.y !== y);
    if (tile != null) cells.push({ x, y, tile });
    onSetDraft({ ...draft, cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) });
  };
  const resize = (field: "width" | "height", value: number) => {
    const next = Math.max(1, Math.min(32, Math.trunc(value || 1)));
    const width = field === "width" ? next : draft.width;
    const height = field === "height" ? next : draft.height;
    const trimmed = draft.cells.some((cell) => cell.x >= width || cell.y >= height);
    if (trimmed && !window.confirm("Shrinking this stamp will remove cells outside the new bounds. Continue?")) return;
    onSetDraft({ ...draft, width, height, cells: draft.cells.filter((cell) => cell.x < width && cell.y < height) });
  };
  const dropCell = (event: DragEvent<HTMLButtonElement>, x: number, y: number) => {
    event.preventDefault();
    if (!dragCell) return;
    const source = cellAt(dragCell.x, dragCell.y);
    if (!source) return;
    const target = cellAt(x, y);
    const cells = draft.cells.filter((cell) => !(cell.x === dragCell.x && cell.y === dragCell.y) && !(cell.x === x && cell.y === y));
    cells.push({ x, y, tile: source.tile });
    if (target) cells.push({ x: dragCell.x, y: dragCell.y, tile: target.tile });
    onSetDraft({ ...draft, cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) });
    setDragCell(null);
  };
  return (
    <div className="stamp-editor">
      <div className="stamp-editor-fields">
        <label>
          <span>Name</span>
          <input value={draft.name} onChange={(event) => onSetDraft({ ...draft, name: event.currentTarget.value })} />
        </label>
        <label>
          <span>Width</span>
          <input type="number" min={1} max={32} value={draft.width} onChange={(event) => resize("width", Number(event.currentTarget.value))} />
        </label>
        <label>
          <span>Height</span>
          <input type="number" min={1} max={32} value={draft.height} onChange={(event) => resize("height", Number(event.currentTarget.value))} />
        </label>
      </div>
      <div className="stamp-editor-tools" role="toolbar" aria-label="Stamp edit tool">
        <button type="button" className={editTool === "paint" ? "active" : ""} onClick={() => onSetEditTool("paint")}>Place {selectedTile}</button>
        <button type="button" className={editTool === "erase" ? "active" : ""} onClick={() => onSetEditTool("erase")}>Transparent</button>
      </div>
      <div
        className="stamp-editor-grid"
        style={{ gridTemplateColumns: `repeat(${draft.width}, 32px)`, gridTemplateRows: `repeat(${draft.height}, 32px)` }}
      >
        {Array.from({ length: draft.width * draft.height }, (_, index) => {
          const x = index % draft.width;
          const y = Math.floor(index / draft.width);
          const cell = cellAt(x, y);
          return (
            <button
              key={`${x}:${y}`}
              type="button"
              className={cell ? "filled" : ""}
              draggable={Boolean(cell)}
              onDragStart={() => setDragCell({ x, y })}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropCell(event, x, y)}
              onClick={() => setCell(x, y, editTool === "paint" ? selectedTile : null)}
              title={cell ? `Tile ${cell.tile}` : "Transparent cell"}
            >
              {cell && <TileSwatch atlas={atlas} icons={icons} tile={cell.tile} tileset={tileset} showBadge={false} />}
            </button>
          );
        })}
      </div>
      <div className="stamp-editor-actions">
        <button className="btn btn-primary btn-xs" type="button" onClick={onSave}>Save Stamp</button>
        <button className="btn btn-ghost btn-xs" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const STAMP_SCOPES: Array<{ id: StampLibraryScope; label: string }> = [
  { id: "all", label: "All" },
  { id: "built-in", label: "Built In" },
  { id: "project", label: "Project" },
  { id: "global", label: "Global" }
];

function stampBounds(stamp: MapStamp) {
  if (stamp.width && stamp.height) return { left: 0, top: 0, width: stamp.width, height: stamp.height };
  if (stamp.cells.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  const left = Math.min(...stamp.cells.map((cell) => cell.dx));
  const right = Math.max(...stamp.cells.map((cell) => cell.dx));
  const top = Math.min(...stamp.cells.map((cell) => cell.dy));
  const bottom = Math.max(...stamp.cells.map((cell) => cell.dy));
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function customStampFromMapStamp(stamp: MapStamp, project: Project | null, globalMapStamps: CustomMapStamp[]) {
  const rawId = stamp.id.replace(/^(project|global):/, "");
  if (stamp.source === "project") return project?.editorMetadata?.mapStamps?.find((candidate) => candidate.id === rawId) ?? null;
  if (stamp.source === "global") return globalMapStamps.find((candidate) => candidate.id === rawId) ?? null;
  return null;
}

function stampCopy(stamp: CustomMapStamp, name: string): CustomMapStamp {
  const now = new Date().toISOString();
  return { ...cloneStamp(stamp), id: createMapStampId(name), name, createdAt: now, updatedAt: now };
}

function cloneStamp(stamp: CustomMapStamp): CustomMapStamp {
  return { ...stamp, cells: stamp.cells.map((cell) => ({ ...cell })) };
}

function stampSourceLabel(source: MapStamp["source"]) {
  if (source === "built-in") return "Built-in";
  if (source === "project") return "Project";
  return "Global";
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
  buttonRefs,
  emptyMessage,
  onBeginTileDrag,
  onRemoveTile
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
  emptyMessage: string;
  onBeginTileDrag?: (tile: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRemoveTile?: (tile: number) => void;
}) {
  return (
    <>
      {tiles.map((tile) => (
        <span className="palette-tile-wrap" key={tile}>
          <button
            ref={(node) => {
              if (node) buttonRefs.current.set(tile, node);
              else buttonRefs.current.delete(tile);
            }}
            className={tileButtonClassWithMetadata(tile, selectedTile, inspectedTile, tileset, tileAttributes, icons)}
            style={{ background: tileColor(tile) }}
            title={tileTitle(tile, tileset, tileAttributes, icons)}
            onClick={() => setSelectedTile(tile)}
            onPointerDown={(event) => onBeginTileDrag?.(tile, event)}
          >
            <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={tileset} />
          </button>
          {onRemoveTile && (
            <button className="palette-tile-action remove" type="button" title={`Remove tile ${tile} from custom palette`} onClick={() => onRemoveTile(tile)}>
              -
            </button>
          )}
        </span>
      ))}
      {tiles.length === 0 && <small className="paint-palette-empty">{emptyMessage}</small>}
    </>
  );
});

type TileDragState = {
  tile: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
};

function paletteDropDockStyle(tileDrag: TileDragState): CSSProperties {
  const width = 190;
  const maxHeight = 280;
  const offset = 18;
  const margin = 12;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  let left = tileDrag.startX + offset;
  if (left + width + margin > viewportWidth) left = Math.max(margin, tileDrag.startX - width - offset);
  let top = tileDrag.startY + offset;
  if (top + maxHeight + margin > viewportHeight) top = Math.max(margin, viewportHeight - maxHeight - margin);
  return { left, top, width, maxHeight };
}

function PaletteDropDock({ palettes, style }: { palettes: Project["editorMetadata"]["tilePalettes"]; style?: CSSProperties }) {
  return (
    <div className="palette-drop-dock" style={style} aria-label="Custom palette drop targets">
      <strong>Drop to palette</strong>
      {palettes.map((palette) => (
        <button key={palette.id} type="button" data-palette-drop-target={palette.id}>
          <span>{palette.name}</span>
          <b>{palette.tiles.length}</b>
        </button>
      ))}
      <button type="button" data-palette-drop-target="new">
        <span>New Palette</span>
        <b>+</b>
      </button>
    </div>
  );
}

function CustomPaletteControls({
  palettes,
  activePaletteId,
  selectedTile,
  onSetActivePaletteId,
  onApplyCommand
}: {
  palettes: Project["editorMetadata"]["tilePalettes"];
  activePaletteId: string | null;
  selectedTile: number;
  onSetActivePaletteId: (paletteId: string | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const activePalette = palettes.find((palette) => palette.id === activePaletteId) ?? palettes[0] ?? null;
  const createPalette = (initialTile?: number) => {
    const fallbackName = `Palette ${palettes.length + 1}`;
    const name = window.prompt("Name this tile palette", fallbackName)?.trim();
    if (!name) return;
    const id = `tile-palette:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    onApplyCommand({ kind: "createTilePalette", label: `Create tile palette ${name}`, id, name, tiles: initialTile == null ? [] : [initialTile] });
    onSetActivePaletteId(id);
  };
  const renamePalette = () => {
    if (!activePalette) return;
    const name = window.prompt("Rename tile palette", activePalette.name)?.trim();
    if (!name || name === activePalette.name) return;
    onApplyCommand({ kind: "renameTilePalette", label: `Rename tile palette ${activePalette.name}`, paletteId: activePalette.id, name });
  };
  const deletePalette = () => {
    if (!activePalette) return;
    if (!window.confirm(`Delete tile palette "${activePalette.name}"?`)) return;
    const next = palettes.find((palette) => palette.id !== activePalette.id) ?? null;
    onSetActivePaletteId(next?.id ?? null);
    onApplyCommand({ kind: "deleteTilePalette", label: `Delete tile palette ${activePalette.name}`, paletteId: activePalette.id });
  };
  const addSelected = () => {
    if (!activePalette) {
      createPalette(selectedTile);
      return;
    }
    onApplyCommand({ kind: "addTileToPalette", label: `Add tile ${selectedTile} to ${activePalette.name}`, paletteId: activePalette.id, tile: selectedTile });
  };
  return (
    <div className="custom-palette-controls">
      <div className="custom-palette-row">
        <select
          value={activePalette?.id ?? ""}
          onChange={(event) => onSetActivePaletteId(event.currentTarget.value || null)}
          aria-label="Custom tile palette"
        >
          {palettes.length === 0 && <option value="">No custom palettes</option>}
          {palettes.map((palette) => (
            <option key={palette.id} value={palette.id}>
              {palette.name} ({palette.tiles.length})
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => createPalette()}>
          New
        </button>
        <button type="button" className="btn btn-secondary btn-xs" disabled={!activePalette} onClick={renamePalette}>
          Rename
        </button>
        <button type="button" className="btn btn-ghost btn-xs" disabled={!activePalette} onClick={deletePalette}>
          Delete
        </button>
      </div>
      <div className="custom-palette-row">
        <button type="button" className="btn btn-primary btn-xs" onClick={addSelected}>
          Add Selected {selectedTile}
        </button>
        <span>{activePalette ? `${activePalette.tiles.length} tile${activePalette.tiles.length === 1 ? "" : "s"}` : "Create a palette to collect reusable map tiles."}</span>
      </div>
    </div>
  );
}

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
  { id: "structures", label: "Structures", hint: "Large Realmz building, landmark, and town-piece special land icons." },
  { id: "actors", label: "NPCs / Creatures", hint: "Broader cicn actor, corpse, monster, and creature art exposed as negative map-field aliases for special/icon painting." },
  { id: "placeable", label: "Special Land", hint: "Project/library special land tiles and negative icon values commonly authored as map field values." },
  { id: "used", label: "Used Here", hint: "Special/icon-backed values already used in the current map." },
];

const PAINT_VARIATIONS: Array<{ id: MapPaintVariation; label: string; hint: string }> = [
  { id: "single", label: "Single Tile", hint: "Paint the selected tile, matching the current behavior." },
  { id: "cycle-group", label: "Cycle Group", hint: "Advance through the active tile group once for each newly painted cell." },
  { id: "random-group", label: "Random Group", hint: "Pick a stable pseudo-random tile from the active tile group for each newly painted cell." }
];

const SPECIAL_STRUCTURE_TILE_VALUES = [
  ...tileValueRange(-99, -90),
  -83,
  ...tileValueRange(-79, -50),
  ...tileValueRange(-47, -25)
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
  const structures = new Set<number>(specialStructureTilesForPalette(project, libraryAssets, icons));
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
    if (tile < 0 || tileIconCandidates(tile).length > 0) used.add(tile);
  }
  for (const id of Object.keys(icons ?? {})) {
    const tile = Number(id);
    if (Number.isFinite(tile) && tile < 0) placeable.add(tile);
  }
  const values = new Set<number>();
  if (filter === "structures" || filter === "all") for (const value of structures) values.add(value);
  if (filter === "placeable" || filter === "all") for (const value of placeable) values.add(value);
  if (filter === "actors" || filter === "all") for (const value of actors) values.add(value);
  if (filter === "used" || filter === "all") for (const value of used) values.add(value);
  return [...values].sort((a, b) => a - b);
}

function specialStructureTilesForPalette(
  project: Project | null,
  libraryAssets: LibraryAsset[],
  icons?: Record<number, IconEntry>
) {
  const values = new Set<number>(SPECIAL_STRUCTURE_TILE_VALUES);
  for (const asset of project?.assets ?? []) {
    if (asset.kind !== "special-land-tile" || asset.resourceType !== "cicn") continue;
    if (isSpecialStructureTileValue(asset.resourceId)) values.add(asset.resourceId);
  }
  for (const asset of project?.assetCatalog.icons ?? []) {
    if (asset.resourceType !== "cicn") continue;
    const value = asset.resourceId < 0 ? asset.resourceId : -asset.resourceId;
    if (isSpecialStructureTileValue(value)) values.add(value);
  }
  for (const asset of libraryAssets) {
    if (!isPaintableSpecialLandAsset(asset) || asset.resourceId == null) continue;
    const value = asset.resourceId < 0 ? asset.resourceId : -asset.resourceId;
    if (isSpecialStructureTileValue(value)) values.add(value);
  }
  for (const id of Object.keys(icons ?? {})) {
    const value = Number(id);
    if (Number.isFinite(value) && isSpecialStructureTileValue(value)) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function isSpecialStructureTileValue(value: number) {
  return SPECIAL_STRUCTURE_TILE_VALUES.includes(value);
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

function tileValueRange(start: number, end: number) {
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) values.push(value);
  return values;
}
