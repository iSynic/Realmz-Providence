import { useEffect, useMemo, useState } from "react";
import { EditorState } from "../../store";
import { EditorTool, IconEntry, MapEntity, Project, TileAttributeFlag, TilesetAsset } from "../../types";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "../../map/tileMetadata";
import { InfoGrid } from "../InfoGrid";
import { TileSwatch } from "../TileSwatch";
import { tileColor } from "../TileSprite";
import { attributeSourceLabel, normalizedCombatBuild, tileAttributeLabel, tileAttributeRows, yesNo } from "./mapTileUiUtils";

const LAND_TILE_FILTERS: Array<{ id: TileAttributeFlag | "all"; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show the full current landlook atlas." },
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

export function LandTileAtlasEditor({
  project,
  selectedTileset,
  atlas,
  icons,
  selectedPaintTile,
  onSelectTile,
  onSetTool,
  onOpenPalette
}: {
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
  selectedPaintTile: number;
  onSelectTile: (tile: number) => void;
  onSetTool: (tool: EditorTool) => void;
  onOpenPalette: () => void;
}) {
  const [filter, setFilter] = useState<TileAttributeFlag | "all">("all");
  const [query, setQuery] = useState("");
  const [inspectedTile, setInspectedTile] = useState(selectedPaintTile);
  useEffect(() => {
    setInspectedTile(selectedPaintTile);
  }, [selectedPaintTile, selectedTileset?.id]);

  if (!selectedTileset) {
    return <p className="empty-copy compact">Select a land map to inspect its tile set.</p>;
  }

  const attributes = project?.tileAttributes ?? [];
  const tiles = standardTileValues(selectedTileset);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTiles = tiles.filter((tile) => {
    const profile = classifyTileValue(tile, selectedTileset, attributes, icons);
    if (filter !== "all" && !tileAttributeGroup(profile.attributes, tile, selectedTileset).includes(filter)) return false;
    if (!normalizedQuery) return true;
    return String(tile).includes(normalizedQuery)
      || profile.label.toLowerCase().includes(normalizedQuery)
      || profile.attributeFlags.map(tileAttributeLabel).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const meaning = classifyTileValue(inspectedTile, selectedTileset, attributes, icons);
  const attributeRows = tileAttributeRows(meaning);
  const quickFilters = meaning.attributeFlags.filter((flag) => LAND_TILE_FILTERS.some((item) => item.id === flag));

  return (
    <div className="land-tile-atlas-editor">
      <div className="land-tile-atlas-top">
        <div className="land-tile-atlas-status">
          <InfoGrid
            rows={[
              ["Tileset", selectedTileset.name],
              ["Scope", "Built into Realmz"],
              ["Editing", "Read-only"],
              ["Tile Count", tiles.length],
              ["Base Tile", selectedTileset.baseTile],
              ["Shown", visibleTiles.length]
            ]}
          />
        </div>
        <div className="land-tile-atlas-controls">
          <input
            className="map-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search tile id, label, or trait..."
          />
          <div className="land-tile-atlas-toolbar" role="toolbar" aria-label="Tile attribute filters">
            {LAND_TILE_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "active" : ""}
                onClick={() => setFilter(item.id)}
                title={item.hint}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="land-tile-atlas-main">
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
              <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={selectedTileset} />
            </button>
          ))}
          {visibleTiles.length === 0 && <span className="empty-inline">No tiles match this filter.</span>}
        </div>
        <aside className="land-tile-detail-rail">
          <div className="land-tile-detail-card">
            <div className="land-tile-detail-preview" style={{ background: tileColor(inspectedTile) }}>
              <TileSwatch atlas={atlas} icons={icons} tile={inspectedTile} tileset={selectedTileset} showBadge={false} />
            </div>
            <div className="land-tile-detail-body">
              <div className="tile-meaning-title">
                <span>{meaning.label}</span>
                <b>{attributeSourceLabel(meaning.attributes)}</b>
              </div>
              <InfoGrid rows={attributeRows} />
              {quickFilters.length > 0 && (
                <div className="land-tile-quick-filters" aria-label="Matching tile filters">
                  {quickFilters.map((flag) => (
                    <button key={flag} type="button" onClick={() => setFilter(flag)} title={`Show all ${tileAttributeLabel(flag)} tiles`}>
                      Show {tileAttributeLabel(flag)}
                    </button>
                  ))}
                </div>
              )}
              <div className="context-action-stack compact">
                <button
                  className="btn btn-primary btn-xs context-action-button"
                  type="button"
                  onClick={() => {
                    onSelectTile(inspectedTile);
                    onSetTool("paint");
                    onOpenPalette();
                  }}
                >
                  Paint With This Tile
                </button>
              </div>
            </div>
          </div>
          <CombatBuildPreview
            atlas={atlas}
            icons={icons}
            profile={meaning.attributes}
            sourceTile={inspectedTile}
            tileset={selectedTileset}
          />
          <p className="context-capacity-note">
            Built-in Realmz landlooks are read-only. Scenario custom landlook editing is hidden until custom tile-map writing is proven.
          </p>
        </aside>
      </div>
    </div>
  );
}

function CombatBuildPreview({
  profile,
  sourceTile,
  tileset,
  atlas,
  icons
}: {
  profile: ReturnType<typeof classifyTileValue>["attributes"];
  sourceTile?: number;
  tileset: TilesetAsset;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
}) {
  const rows = normalizedCombatBuild(profile);
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
              </div>
            )))}
          </div>
        </div>
      </div>
      <p>Realmz expands this land tile into these combat-map cells when outdoor combat starts.</p>
    </div>
  );
}

