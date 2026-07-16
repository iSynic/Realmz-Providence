import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { EditorState } from "../../store";
import { IconEntry, ManagedAsset, Project, ProjectCommand, ResourceAsset, TileAttributeFlag, TilesetAsset } from "../../types";
import { LandlookTileVisualCategory, landlookVisualCategoryLabel } from "../../map/landlookTileSemantics";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "../../map/tileMetadata";
import { PopoverPanel, SearchField } from "../../ui";
import { TileSwatch } from "../TileSwatch";
import { loadImage, tileColor } from "../TileSprite";
import { MapNumberField } from "./MapFormControls";
import { normalizedCombatBuild, tileAttributeLabel } from "./mapTileUiUtils";

type LandTileFilterId = TileAttributeFlag | "all" | `visual:${LandlookTileVisualCategory}`;
type CustomAtlasImportMode = "full" | "block" | "tile";

const CUSTOM_LANDLOOKS = [
  { landlook: 6, label: "Custom 1", pictId: 306 },
  { landlook: 7, label: "Custom 2", pictId: 307 },
  { landlook: 8, label: "Custom 3", pictId: 308 }
] as const;
const LOCKED_LAND_TILES = new Set([60, 61]);

const LAND_TILE_FILTERS: Array<{ id: LandTileFilterId; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show the full current landlook atlas." },
  { id: "visual:water-shore", label: "Water / Shore", hint: "Water, coast, and shoreline art in the current atlas." },
  { id: "visual:mountain-land", label: "Mountain / Land", hint: "Mountain tiles that blend into land." },
  { id: "visual:mountain-water", label: "Mountain / Water", hint: "Mountain tiles that blend into water." },
  { id: "visual:forest", label: "Forest", hint: "Contiguous forest transition art, separate from decorative tree detail." },
  { id: "visual:tree-detail", label: "Tree Detail", hint: "Decorative tree/detail tiles such as 150-154; useful art, but not smart-forest fill." },
  { id: "visual:road", label: "Road Art", hint: "Road, bridge, and path-looking art. This is visual, not necessarily runtime path metadata." },
  { id: "visual:watercraft", label: "Boat", hint: "Boat or watercraft art, including tile 147." },
  { id: "visual:rocks", label: "Rocks", hint: "Rock, rubble, and terrain-prop tiles." },
  { id: "visual:graves", label: "Graves", hint: "Grave and graveyard tiles." },
  { id: "visual:buildings", label: "Buildings", hint: "Houses, gates, and other building art." },
  { id: "walkable", label: "Walkable", hint: "Tiles Realmz treats as ordinary foot movement." },
  { id: "solid", label: "Solid", hint: "Tiles Realmz treats as blocking, boat-only, or fly/float-gated." },
  { id: "path", label: "Runtime Path", hint: "Tiles Realmz marks with the runtime path flag." },
  { id: "visual-path", label: "Road Art", hint: "Road/path-looking art tiles. These are not runtime path tiles unless Realmz marks them that way." },
  { id: "shore", label: "Shore / Water", hint: "Tiles marked as shore or water movement surfaces." },
  { id: "boat-required", label: "Boat", hint: "Tiles that require boat-style movement." },
  { id: "fly-float-required", label: "Fly / Float", hint: "Tiles that require fly or float movement." },
  { id: "blocks-los", label: "Blocks LOS", hint: "Tiles that block line of sight." },
  { id: "forest", label: "Forest", hint: "Tiles with decoded forest behavior." },
  { id: "combat-build", label: "Combat Map", hint: "Tiles with a decoded 3x3 combat expansion." },
  { id: "unknown-metadata", label: "Unknown", hint: "Tiles with no decoded attribute data yet." }
];

function landTileFilterLabel(item: { id: LandTileFilterId; label: string }, tileset: TilesetAsset) {
  if (!item.id.startsWith("visual:")) return item.label;
  const category = item.id.slice("visual:".length) as LandlookTileVisualCategory;
  return landlookVisualCategoryLabel(category, tileset.landlook);
}

export function LandTileAtlasEditor({
  project,
  selectedMapId,
  selectedTileset,
  atlas,
  atlasEntries,
  icons,
  selectedPaintTile,
  onSelectTile,
  onApplyCommand
}: {
  project: Project | null;
  selectedMapId?: string | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  atlasEntries?: EditorState["atlasEntries"];
  icons: Record<number, IconEntry>;
  selectedPaintTile: number;
  onSelectTile: (tile: number) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [filter, setFilter] = useState<LandTileFilterId>("all");
  const [query, setQuery] = useState("");
  const [inspectedTile, setInspectedTile] = useState(selectedPaintTile);
  const [sourceLandlook, setSourceLandlook] = useState(selectedTileset?.landlook ?? 0);
  const [targetLandlook, setTargetLandlook] = useState<number>(6);
  const [importMode, setImportMode] = useState<CustomAtlasImportMode>("tile");
  const [importTargetTile, setImportTargetTile] = useState(selectedPaintTile);
  const [importSourceId, setImportSourceId] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  useEffect(() => {
    setInspectedTile(selectedPaintTile);
    setImportTargetTile(selectedPaintTile);
  }, [selectedPaintTile, selectedTileset?.id]);
  useEffect(() => {
    if (selectedTileset) setSourceLandlook(selectedTileset.landlook);
  }, [selectedTileset?.landlook]);
  const sourceTilesets = useMemo(() => landlookSourceTilesets(project), [project]);
  const imageSources = useMemo(() => customAtlasImageSources(project), [project]);

  if (!selectedTileset) {
    return <p className="empty-copy compact">Select a land map to inspect its tile set.</p>;
  }

  const attributes = project?.tileAttributes ?? [];
  const tiles = standardTileValues(selectedTileset);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTiles = tiles.filter((tile) => {
    const profile = classifyTileValue(tile, selectedTileset, attributes, icons);
    if (filter !== "all") {
      if (filter.startsWith("visual:")) {
        if (profile.visual?.category !== filter.slice("visual:".length)) return false;
      } else if (!tileAttributeGroup(profile.attributes, tile, selectedTileset).includes(filter as TileAttributeFlag)) {
        return false;
      }
    }
    if (!normalizedQuery) return true;
    return String(tile).includes(normalizedQuery)
      || profile.label.toLowerCase().includes(normalizedQuery)
      || (profile.visual ? landlookVisualCategoryLabel(profile.visual.category, selectedTileset.landlook).toLowerCase().includes(normalizedQuery) : false)
      || profile.attributeFlags.map(tileAttributeLabel).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const meaning = classifyTileValue(inspectedTile, selectedTileset, attributes, icons);
  const selectedCustom = CUSTOM_LANDLOOKS.some((entry) => entry.landlook === selectedTileset.landlook);
  const selectedCustomLabel = CUSTOM_LANDLOOKS.find((entry) => entry.landlook === selectedTileset.landlook)?.label;
  const activeFilter = LAND_TILE_FILTERS.find((item) => item.id === filter) ?? LAND_TILE_FILTERS[0];
  const activeFilterLabel = landTileFilterLabel(activeFilter, selectedTileset);

  const createCustomLandlook = async () => {
    if (!project) return;
    const target = CUSTOM_LANDLOOKS.find((entry) => entry.landlook === targetLandlook);
    if (!target) return;
    const hasExisting = (project.customLandlooks ?? []).some((landlook) => landlook.landlook === target.landlook)
      || (project.assets ?? []).some((asset) => asset.linkedEntity === `landlook:${target.landlook}`);
    if (hasExisting && !window.confirm(`${target.label} already has authored data. Replace it?`)) return;
    setImportStatus("");
    onApplyCommand({
      kind: "createCustomLandlookFromSource",
      label: `Create ${target.label} landlook`,
      sourceLandlook,
      targetLandlook: target.landlook,
      assignMapId: selectedMapId ?? null
    });
    const sourceTileset = sourceTilesets.find((tileset) => tileset.landlook === sourceLandlook);
    const sourceAtlas = sourceTileset ? atlasEntries?.[sourceTileset.id] : null;
    const sourceImage = sourceAtlas?.image ?? (atlas && selectedTileset.landlook === sourceLandlook ? atlas.image : null);
    if (sourceImage) {
      const dataUrl = atlasImageToDataUrl(sourceImage);
      onApplyCommand({
        kind: "replaceCustomLandlookAtlas",
        label: `Copy atlas to ${target.label}`,
        landlook: target.landlook,
        asset: customLandlookAtlasAsset(target.landlook, dataUrl, `Copied from ${sourceTileset?.name ?? selectedTileset.name}`, sourceImage.width, sourceImage.height)
      });
      setImportStatus(`${target.label} created and ${sourceTileset?.name ?? "source"} atlas copied.`);
    } else {
      setImportStatus(`${target.label} metadata created. Switch to a loaded source atlas or import art to generate PICT ${target.pictId}.`);
    }
  };

  const importAtlasSource = async (sourceUrl: string, sourceLabel: string) => {
    if (!selectedCustom) {
      setImportStatus("Create or switch to Custom 1, Custom 2, or Custom 3 before importing art.");
      return;
    }
    if (!atlas) {
      setImportStatus("Current custom atlas is not loaded yet.");
      return;
    }
    try {
      const dataUrl = await composeCustomLandlookAtlas({
        mode: importMode,
        atlasImage: atlas.image,
        sourceUrl,
        targetTile: importTargetTile
      });
      const target = CUSTOM_LANDLOOKS.find((entry) => entry.landlook === selectedTileset.landlook);
      onApplyCommand({
        kind: "replaceCustomLandlookAtlas",
        label: `Import ${importMode === "full" ? "tile set" : importMode === "block" ? "picture block" : "tile"} into ${target?.label ?? selectedTileset.name}`,
        landlook: selectedTileset.landlook,
        asset: customLandlookAtlasAsset(selectedTileset.landlook, dataUrl, sourceLabel, 640, 320)
      });
      setImportStatus(`Imported ${sourceLabel} into ${target?.label ?? selectedTileset.name}.`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Image import failed.");
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      await importAtlasSource(url, file.name);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const importSelectedImageSource = async () => {
    const source = imageSources.find((candidate) => candidate.id === importSourceId);
    if (!source) {
      setImportStatus("Choose a project or reference image source first.");
      return;
    }
    await importAtlasSource(source.url, source.label);
  };

  return (
    <div className="land-tile-atlas-editor">
      <div className="custom-landlook-tools">
        <section className="custom-landlook-card">
          <div className="tile-meaning-title">
            <span>Create Custom From Existing</span>
            <b>Custom 1-3 only</b>
          </div>
          <p className="custom-landlook-primary-copy">Load any built-in or custom landlook as a template, then save the editable copy to Custom 1, 2, or 3.</p>
          <div className="custom-landlook-form">
            <label>
              Source
              <select value={sourceLandlook} onChange={(event) => setSourceLandlook(Number(event.currentTarget.value))}>
                {sourceTilesets.map((tileset) => (
                  <option key={tileset.landlook} value={tileset.landlook}>
                    {tileset.name} ({tileset.landlook})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Save As
              <select value={targetLandlook} onChange={(event) => setTargetLandlook(Number(event.currentTarget.value))}>
                {CUSTOM_LANDLOOKS.map((entry) => (
                  <option key={entry.landlook} value={entry.landlook}>
                    {entry.label} - PICT {entry.pictId}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary btn-xs" type="button" onClick={() => void createCustomLandlook()} disabled={!project}>
              Create Custom
            </button>
          </div>
        </section>
        <section className="custom-landlook-card">
          <div className="tile-meaning-title">
            <span>Import Atlas Art</span>
            <b>{selectedCustom ? selectedCustomLabel ?? selectedTileset.name : "choose custom"}</b>
          </div>
          <p className="custom-landlook-primary-copy">{selectedCustom ? "Import art into the selected custom landlook atlas." : "Switch this map to Custom 1, 2, or 3 before importing atlas art."}</p>
          <div className="custom-landlook-form import">
            <label>
              Mode
              <select value={importMode} onChange={(event) => setImportMode(event.currentTarget.value as CustomAtlasImportMode)} disabled={!selectedCustom}>
                <option value="full">Full 640 x 320 Atlas</option>
                <option value="block">32px-Aligned Block</option>
                <option value="tile">Single 32 x 32 Tile</option>
              </select>
            </label>
            {importMode !== "full" && (
              <MapNumberField
                label="Target Tile"
                value={importTargetTile}
                onCommit={setImportTargetTile}
                min={1}
                max={200}
                compact
                plain
              />
            )}
            <label>
              Existing Image
              <select value={importSourceId} onChange={(event) => setImportSourceId(event.currentTarget.value)} disabled={!selectedCustom}>
                <option value="">Upload file or choose...</option>
                {imageSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.label}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary btn-xs" type="button" onClick={() => void importSelectedImageSource()} disabled={!importSourceId || !selectedCustom}>
              Import Selected
            </button>
            <label className="custom-landlook-file-button">
              Import File
              <input type="file" accept="image/*" onChange={(event) => void importFile(event)} disabled={!selectedCustom} />
            </label>
          </div>
          {importStatus && <p className={importStatus.toLowerCase().includes("failed") || importStatus.toLowerCase().includes("choose") ? "warning" : ""}>{importStatus}</p>}
        </section>
      </div>
      <div className="land-tile-atlas-main">
        <div className="land-tile-atlas-browser">
          <div className="land-tile-filter-bar">
            <SearchField
              className="land-tile-search-field"
              inputClassName="land-tile-search-input"
              value={query}
              onChange={setQuery}
              placeholder="Search tile id, label, or trait..."
              ariaLabel="Search land tiles"
            />
            <PopoverPanel
              className="land-tile-filter-menu"
              triggerClassName="land-tile-filter-button"
              panelClassName="land-tile-filter-popover"
              bodyClassName="land-tile-filter-list"
              bodyRole="listbox"
              bodyAriaLabel="Tile attribute filters"
              align="end"
              open={filterMenuOpen}
              onOpenChange={setFilterMenuOpen}
              ariaLabel="Tile filters"
              title="Tile Filters"
              meta={activeFilterLabel}
              trigger={(
                <>
                <span>Tile Filters</span>
                <b>{visibleTiles.length}/{tiles.length}</b>
                <em>{activeFilterLabel}</em>
                </>
              )}
              actions={(
                <>
                    <button type="button" onClick={() => { setFilter("all"); setFilterMenuOpen(false); }}>Show All</button>
                    <button type="button" onClick={() => setFilterMenuOpen(false)}>Close</button>
                </>
              )}
            >
              {LAND_TILE_FILTERS.map((item) => {
                const label = landTileFilterLabel(item, selectedTileset);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={filter === item.id}
                    className={filter === item.id ? "active" : ""}
                    onClick={() => {
                      setFilter(item.id);
                      setFilterMenuOpen(false);
                    }}
                    title={item.hint}
                  >
                    <strong>{label}</strong>
                    <small>{item.hint}</small>
                  </button>
                );
              })}
            </PopoverPanel>
          </div>
          <div className="land-tile-atlas-grid">
            {visibleTiles.map((tile) => (
              <button
                key={tile}
                type="button"
                className={[
                  tile === selectedPaintTile ? "selected" : "",
                  tile === inspectedTile ? "inspected" : ""
                ].filter(Boolean).join(" ")}
                style={{ background: tileColor(tile) }}
                onClick={() => {
                  setInspectedTile(tile);
                  onSelectTile(tile);
                }}
                title={`Tile ${tile}`}
              >
                <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={selectedTileset} showBadge={false} />
              </button>
            ))}
            {visibleTiles.length === 0 && <span className="empty-inline">No tiles match this filter.</span>}
          </div>
        </div>
        <aside className="land-tile-detail-rail">
          <CombatBuildPreview
            atlas={atlas}
            icons={icons}
            profile={meaning.attributes}
            sourceTile={inspectedTile}
            tileset={selectedTileset}
            onApplyCommand={onApplyCommand}
          />
          <TileAttributeEditor
            meaning={meaning}
            tileset={selectedTileset}
            onApplyCommand={onApplyCommand}
          />
        </aside>
      </div>
    </div>
  );
}

function landlookSourceTilesets(project: Project | null) {
  const seen = new Set<number>();
  return [...(project?.assetCatalog?.tilesets ?? [])]
    .filter((tileset) => {
      if (tileset.tileWidth !== 32 || tileset.tileHeight !== 32 || tileset.columns !== 20 || tileset.rows !== 10) return false;
      if (seen.has(tileset.landlook)) return false;
      seen.add(tileset.landlook);
      return true;
    })
    .sort((left, right) => left.landlook - right.landlook);
}

function customAtlasImageSources(project: Project | null) {
  if (!project) return [];
  const out: Array<{ id: string; label: string; url: string }> = [];
  for (const asset of project.assets ?? []) {
    if (!["picture", "icon", "special-land-tile"].includes(asset.kind)) continue;
    const url = asset.previewPath || asset.resourcePath || asset.originalPath;
    if (!url) continue;
    out.push({
      id: `asset:${asset.id}`,
      label: `${asset.label} (${asset.resourceType} ${asset.resourceId})`,
      url
    });
  }
  for (const asset of [...(project.assetCatalog?.pictures ?? []), ...(project.assetCatalog?.icons ?? [])]) {
    const url = asset.previewPath;
    if (!url) continue;
    out.push({
      id: `resource:${asset.source}:${asset.resourceType}:${asset.resourceId}`,
      label: resourceImageSourceLabel(asset),
      url
    });
  }
  return out;
}

function resourceImageSourceLabel(asset: ResourceAsset) {
  return `${asset.name || asset.resourceType} ${asset.resourceId}`;
}

function atlasImageToDataUrl(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  const ctx = required2dContext(canvas);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 640, 320);
  return canvas.toDataURL("image/png");
}

async function composeCustomLandlookAtlas({
  mode,
  atlasImage,
  sourceUrl,
  targetTile
}: {
  mode: CustomAtlasImportMode;
  atlasImage: HTMLImageElement;
  sourceUrl: string;
  targetTile: number;
}) {
  const sourceImage = await loadImage(sourceUrl);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  const ctx = required2dContext(canvas);
  ctx.imageSmoothingEnabled = false;
  if (mode === "full") {
    if (sourceWidth !== 640 || sourceHeight !== 320) {
      throw new Error("Full tile set import requires a 640 x 320 image.");
    }
    ctx.drawImage(sourceImage, 0, 0, 640, 320);
    copyLockedAtlasTile(atlasImage, ctx, 60);
    copyLockedAtlasTile(atlasImage, ctx, 61);
    return canvas.toDataURL("image/png");
  }
  ctx.drawImage(atlasImage, 0, 0, 640, 320);
  const tile = Math.trunc(targetTile);
  if (tile < 1 || tile > 200) throw new Error("Target tile must be between 1 and 200.");
  if (LOCKED_LAND_TILES.has(tile)) throw new Error("Tiles 60 and 61 are locked by Realmz and cannot be imported directly.");
  const rect = atlasTileRect(tile);
  if (mode === "tile") {
    if (sourceWidth !== 32 || sourceHeight !== 32) throw new Error("Single tile import requires a 32 x 32 image.");
    ctx.drawImage(sourceImage, rect.x, rect.y, 32, 32);
    return canvas.toDataURL("image/png");
  }
  if (sourceWidth % 32 !== 0 || sourceHeight % 32 !== 0) {
    throw new Error("Picture block import dimensions must be multiples of 32 pixels.");
  }
  const widthTiles = sourceWidth / 32;
  const heightTiles = sourceHeight / 32;
  const startCol = rect.x / 32;
  const startRow = rect.y / 32;
  if (startCol + widthTiles > 20 || startRow + heightTiles > 10) {
    throw new Error("Picture block import would exceed the 20 x 10 atlas bounds.");
  }
  for (let row = 0; row < heightTiles; row += 1) {
    for (let col = 0; col < widthTiles; col += 1) {
      const target = (startRow + row) * 20 + startCol + col + 1;
      if (LOCKED_LAND_TILES.has(target)) throw new Error("Picture block import overlaps locked tiles 60 or 61.");
    }
  }
  ctx.drawImage(sourceImage, rect.x, rect.y);
  return canvas.toDataURL("image/png");
}

function copyLockedAtlasTile(source: HTMLImageElement, ctx: CanvasRenderingContext2D, tile: number) {
  const rect = atlasTileRect(tile);
  ctx.drawImage(source, rect.x, rect.y, 32, 32, rect.x, rect.y, 32, 32);
}

function atlasTileRect(tile: number) {
  const index = tile - 1;
  return {
    x: (index % 20) * 32,
    y: Math.floor(index / 20) * 32
  };
}

function required2dContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  return ctx;
}

function customLandlookAtlasAsset(landlook: number, dataUrl: string, sourceLabel: string, sourceWidth: number, sourceHeight: number): ManagedAsset {
  const target = CUSTOM_LANDLOOKS.find((entry) => entry.landlook === landlook);
  const label = `${target?.label ?? `Custom ${landlook}`} Landlook Atlas`;
  return {
    id: `asset:custom-landlook-atlas:${landlook}:${Date.now()}`,
    label,
    kind: "picture",
    resourceType: "PICT",
    resourceId: 300 + landlook,
    fileName: `${label}.png`,
    originalPath: dataUrl,
    previewPath: dataUrl,
    resourcePath: dataUrl,
    mimeType: "image/png",
    bytes: Math.round(dataUrl.length * 0.75),
    sha256: `browser-generated-${landlook}-${Date.now()}`,
    width: 640,
    height: 320,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: `Browser generated from ${sourceLabel}`,
    linkedEntity: `landlook:${landlook}`,
    conversion: {
      target: "custom-landlook-atlas",
      fitMode: "stretch",
      scaleMode: "crisp",
      matte: "transparent",
      paletteMode: "adaptive-256",
      ditherMode: "none",
      sourceWidth,
      sourceHeight,
      finalWidth: 640,
      finalHeight: 320,
      warnings: []
    }
  };
}

function CombatBuildPreview({
  profile,
  sourceTile,
  tileset,
  atlas,
  icons,
  onApplyCommand
}: {
  profile: ReturnType<typeof classifyTileValue>["attributes"];
  sourceTile?: number;
  tileset: TilesetAsset;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const editable = profile?.editableScope === "scenario-custom" && profile.landlook != null && onApplyCommand;
  const rows = normalizedCombatBuild(profile) ?? (editable ? [0, 1, 2].map(() => [0, 0, 0]) : null);
  if (!rows) {
    return (
      <div className="combat-build-preview compact">
        <div className="tile-meaning-title">
          <span>Combat Map Expansion</span>
          <b>none</b>
        </div>
        <p>This land tile does not expose a decoded 3x3 combat expansion in the current table.</p>
      </div>
    );
  }
  return (
    <div className="combat-build-preview">
      <div className="tile-meaning-title">
        <span>Combat Map Expansion</span>
        <b>3 x 3</b>
      </div>
      <div className="combat-build-visuals">
        {sourceTile != null && (
          <div className="combat-build-source">
            <span>Land Tile</span>
            <div className="combat-build-source-tile" style={{ background: tileColor(sourceTile) }}>
              <TileSwatch atlas={atlas} icons={icons} tile={sourceTile} tileset={tileset} />
              <b>{sourceTile}</b>
            </div>
          </div>
        )}
        <div className="combat-build-expanded">
          <span>Combat Map</span>
          <div className="combat-build-grid">
            {rows.flatMap((row, rowIndex) => row.map((tile, columnIndex) => (
              <div className="combat-build-cell" key={`${rowIndex}-${columnIndex}`} title={`Combat tile ${tile}`}>
                <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={tileset} />
                <span>{tile}</span>
                {editable && (
                  <input
                    type="number"
                    aria-label={`Combat tile row ${rowIndex + 1} column ${columnIndex + 1}`}
                    value={tile}
                    onChange={(event) => {
                      onApplyCommand({
                        kind: "updateCustomLandTileCombatBuild",
                        label: "Update combat tile expansion",
                        landlook: profile.landlook ?? tileset.landlook,
                        tile: profile.tile,
                        row: rowIndex,
                        col: columnIndex,
                        value: Number(event.currentTarget.value)
                      });
                    }}
                  />
                )}
              </div>
            )))}
          </div>
        </div>
      </div>
      <p>{editable ? "Edit the 3 x 3 combat-map cells Realmz uses when outdoor combat starts." : "Realmz expands this land tile into these combat-map cells when outdoor combat starts."}</p>
    </div>
  );
}

function TileAttributeEditor({
  meaning,
  tileset,
  onApplyCommand
}: {
  meaning: ReturnType<typeof classifyTileValue>;
  tileset: TilesetAsset;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const attributes = meaning.attributes;
  if (!attributes) {
    return (
      <div className="tile-attribute-editor compact">
        <div className="tile-meaning-title">
          <span>Tile Behavior</span>
          <b>unknown</b>
        </div>
        <p>No source-backed mapstats or Data Solids row is available for this tile.</p>
      </div>
    );
  }
  if (attributes.editableScope !== "scenario-custom") {
    return (
      <div className="tile-attribute-editor compact">
        <div className="tile-meaning-title">
          <span>Tile Behavior</span>
          <b>{attributes.editableScope === "special-tile" ? "edit from selected special tile" : "copy to custom"}</b>
        </div>
        <p>{attributes.editableScope === "special-tile" ? "Select a special tile on the map canvas to edit its Data Solids passability." : "Built-in landlooks are templates. Create Custom 1, 2, or 3 from this landlook before editing tile behavior."}</p>
      </div>
    );
  }
  if (attributes.landlook == null) {
    return null;
  }
  const update = (changes: Extract<ProjectCommand, { kind: "updateCustomLandTileAttributes" }>["changes"]) => {
    onApplyCommand({
      kind: "updateCustomLandTileAttributes",
      label: "Update land tile behavior",
      landlook: attributes.landlook ?? tileset.landlook,
      tile: attributes.tile,
      changes
    });
  };
  return (
    <div className="tile-attribute-editor">
      <div className="tile-meaning-title">
        <span>Tile Behavior</span>
        <b>scenario custom</b>
      </div>
      <div className="tile-toggle-grid">
        <ToggleButton label="Solid" active={Boolean(attributes.solidType)} onToggle={(value) => update({ solid: value ? 1 : 0 })} />
        <ToggleButton label="Runtime Path" active={Boolean(attributes.pathFlag)} onToggle={(value) => update({ isPath: value ? 1 : 0 })} />
        <ToggleButton label="Shore / Water" active={Boolean(attributes.shore)} onToggle={(value) => update({ shore: value ? 1 : 0 })} />
        <ToggleButton label="Boat Required" active={Boolean(attributes.boatRequirement)} onToggle={(value) => update({ needBoat: value ? 1 : 0 })} />
        <ToggleButton label="Fly / Float" active={Boolean(attributes.flyFloatRequired)} onToggle={(value) => update({ flyFloat: value ? 1 : 0 })} />
        <ToggleButton label="Blocks LOS" active={Boolean(attributes.blocksLos)} onToggle={(value) => update({ los: value ? 1 : 0 })} />
      </div>
      <div className="map-authoring-form">
        <MapNumberField label="Movement Sound" value={attributes.movementSoundId ?? 0} onCommit={(sound) => update({ sound })} />
        <MapNumberField label="Time / Move" value={attributes.movementCost ?? 0} onCommit={(time) => update({ time })} />
        <MapNumberField label="Forest Type" value={attributes.forestType ?? 0} onCommit={(forest) => update({ forest })} min={0} max={32767} />
        <MapNumberField label="Clear Tile" value={attributes.clearLandId ?? 0} onCommit={(clearLandId) => update({ clearLandId })} />
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onToggle
}: {
  label: string;
  active: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={() => onToggle(!active)}>
      {label}
      <b>{active ? "yes" : "no"}</b>
    </button>
  );
}
