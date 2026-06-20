import { useEffect, useMemo, useState } from "react";
import { EditorState } from "../../store";
import { EditorTool, IconEntry, Project, ProjectCommand, TileAttributeFlag, TilesetAsset } from "../../types";
import { LandlookTileVisualCategory, landlookVisualCategoryLabel } from "../../map/landlookTileSemantics";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "../../map/tileMetadata";
import { InfoGrid } from "../InfoGrid";
import { TileSwatch } from "../TileSwatch";
import { tileColor } from "../TileSprite";
import { MapNumberField } from "./MapFormControls";
import { attributeSourceLabel, normalizedCombatBuild, tileAttributeLabel, tileAttributeRows } from "./mapTileUiUtils";

type LandTileFilterId = TileAttributeFlag | "all" | `visual:${LandlookTileVisualCategory}`;

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
  selectedTileset,
  atlas,
  icons,
  selectedPaintTile,
  onSelectTile,
  onSetTool,
  onOpenPalette,
  onApplyCommand
}: {
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
  selectedPaintTile: number;
  onSelectTile: (tile: number) => void;
  onSetTool: (tool: EditorTool) => void;
  onOpenPalette: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [filter, setFilter] = useState<LandTileFilterId>("all");
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
  const attributeRows = tileAttributeRows(meaning);
  const quickFilters = meaning.attributeFlags.filter((flag) => LAND_TILE_FILTERS.some((item) => item.id === flag));
  const visualFilter = meaning.visual ? `visual:${meaning.visual.category}` as LandTileFilterId : null;
  const editingScope = meaning.attributes?.editableScope === "scenario-custom" ? "Scenario custom" : "Read-only";

  return (
    <div className="land-tile-atlas-editor">
      <div className="land-tile-atlas-top">
        <div className="land-tile-atlas-status">
          <InfoGrid
            rows={[
              ["Tileset", selectedTileset.name],
              ["Scope", selectedTileset.custom ? "Scenario custom" : "Built into Realmz"],
              ["Editing", editingScope],
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
                {landTileFilterLabel(item, selectedTileset)}
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
              {(visualFilter || quickFilters.length > 0) && (
                <div className="land-tile-quick-filters" aria-label="Matching tile filters">
                  {visualFilter && (
                    <button type="button" onClick={() => setFilter(visualFilter)} title={`Show all ${landlookVisualCategoryLabel(meaning.visual!.category, selectedTileset.landlook)} tiles`}>
                      Show {landlookVisualCategoryLabel(meaning.visual!.category, selectedTileset.landlook)}
                    </button>
                  )}
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
            onApplyCommand={onApplyCommand}
          />
          <TileAttributeEditor
            meaning={meaning}
            tileset={selectedTileset}
            onApplyCommand={onApplyCommand}
          />
          <p className="context-capacity-note">
            Built-in Realmz landlooks are read-only. Scenario custom landlooks and Data Solids special tiles are the current safe authoring surface.
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
          <b>{attributes.editableScope === "special-tile" ? "edit from selected special tile" : "read-only"}</b>
        </div>
        <p>{attributes.editableScope === "special-tile" ? "Select a special tile on the map canvas to edit its Data Solids passability." : "Standard Realmz landlook behavior is shown for reference and is not edited in this pass."}</p>
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
