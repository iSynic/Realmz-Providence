import { useState } from "react";
import type { EditorState } from "../../store";
import type {
  CustomMapStamp,
  EditorTool,
  MapEntity,
  MapPaintMode,
  MapPaintVariation,
  MapRegionSelection,
  Project,
  ProjectCommand,
  SmartBrushMaskCell,
  SmartBrushPlan,
  SmartBrushPreset,
  TilePaletteCategory,
  TilesetAsset
} from "../../types";
import { regionCellCount } from "../../map/regionPaint";
import { classifyTileValue } from "../../map/tileMetadata";
import { SMART_BRUSH_PRESETS, smartBrushProfileForTileset } from "../../map/smartTerrainBrush";
import { InfoGrid } from "../InfoGrid";
import { PaintPalettePanel } from "../TileSelectionBar";
import { TileSwatch } from "../TileSwatch";
import { tileColor } from "../TileSprite";
import { TutorialTip } from "../TutorialTip";
import { PanelSection, SegmentedControl, type SegmentedControlOption } from "../../ui";
import { clearRegion, fillRegion, paintModeLabel, regionLabel } from "./mapRegionUiUtils";
import { tileAttributeLabel } from "./mapTileUiUtils";
import { PaintPaletteSurface } from "./PaintPaletteSurface";
import type { MapShapeFill, SmartBrushDrawMode } from "../../map/mapCellShapes";

export function MapPaintInspector({
  state,
  map,
  selectedTileset,
  atlas,
  paintMode,
  onSetPaintMode,
  paintVariation,
  onSetPaintVariation,
  activePaintGroupId,
  onSetActivePaintGroup,
  paintPaletteMode,
  onSetPaintPaletteMode,
  activeCustomPaletteId,
  onSetActiveCustomPaletteId,
  variationTiles,
  onSetPaletteVariationTiles,
  selectedRegion,
  onSetSelectedRegion,
  globalMapStamps,
  onSetGlobalMapStamps,
  smartBrushPreset,
  onSetSmartBrushPreset,
  smartBrushDrawMode,
  onSetSmartBrushDrawMode,
  smartBrushShapeFill,
  onSetSmartBrushShapeFill,
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
  onGrowSmartBrushMask,
  onShrinkSmartBrushMask,
  onApplySmartBrush,
  selectedSuperTileStampId,
  onSelectSuperTileStamp,
  onSetTool,
  onSelectTile,
  onApplyCommand,
  paletteOpen,
  onSetPaletteOpen,
}: {
  state: EditorState;
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  paintVariation: MapPaintVariation;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  activePaintGroupId: string;
  onSetActivePaintGroup: (groupId: string) => void;
  paintPaletteMode: TilePaletteCategory;
  onSetPaintPaletteMode: (mode: TilePaletteCategory) => void;
  activeCustomPaletteId: string | null;
  onSetActiveCustomPaletteId: (paletteId: string | null) => void;
  variationTiles: number[] | null;
  onSetPaletteVariationTiles: (tiles: number[] | null) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  globalMapStamps: CustomMapStamp[];
  onSetGlobalMapStamps: (stamps: CustomMapStamp[]) => void;
  smartBrushPreset: SmartBrushPreset;
  onSetSmartBrushPreset: (preset: SmartBrushPreset) => void;
  smartBrushDrawMode: SmartBrushDrawMode;
  onSetSmartBrushDrawMode: (mode: SmartBrushDrawMode) => void;
  smartBrushShapeFill: MapShapeFill;
  onSetSmartBrushShapeFill: (fill: MapShapeFill) => void;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
  onGrowSmartBrushMask: () => void;
  onShrinkSmartBrushMask: () => void;
  onApplySmartBrush: () => void;
  selectedSuperTileStampId: string | null;
  onSelectSuperTileStamp: (stampId: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
}) {
  const [paintFillChance, setPaintFillChance] = useState(100);
  const onSetPaintFillChance = setPaintFillChance;
  const selectedMeaning = classifyTileValue(state.selectedTile, selectedTileset, state.project?.tileAttributes ?? [], state.iconEntries);
  const palette = (
    <PaintPalettePanel
      map={map}
      project={state.project}
      libraryAssets={state.libraryCatalog?.assets ?? []}
      selectedTile={state.selectedTile}
      inspectedTile={state.selectedCell?.tile ?? null}
      setSelectedTile={onSelectTile}
      tileset={selectedTileset}
      atlas={atlas}
      icons={state.iconEntries}
      atlasStatus={state.atlasStatus}
      mode={state.activeTool === "stamp" ? "super" : paintPaletteMode}
      onSetMode={state.activeTool === "stamp" ? () => undefined : onSetPaintPaletteMode}
      activePaintGroupId={activePaintGroupId}
      onSetActivePaintGroup={onSetActivePaintGroup}
      activeCustomPaletteId={activeCustomPaletteId}
      onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
      selectedRegion={selectedRegion}
      globalMapStamps={globalMapStamps}
      onSetGlobalMapStamps={onSetGlobalMapStamps}
      onSetVariationTiles={onSetPaletteVariationTiles}
      paintVariation={paintVariation}
      onApplyCommand={onApplyCommand}
      selectedSuperTileStampId={selectedSuperTileStampId}
      onSelectSuperTileStamp={onSelectSuperTileStamp}
      onActivateStampTool={() => onSetTool("stamp")}
      stampOnly={state.activeTool === "stamp"}
      variant="sidebar"
    />
  );
  return (
    <section className="context-panel paint-inspector-panel">
      <div className="paint-inspector-hero">
        <div className="paint-inspector-preview" style={{ background: tileColor(state.selectedTile) }}>
          <TileSwatch atlas={atlas} icons={state.iconEntries} tile={state.selectedTile} tileset={selectedTileset} />
        </div>
        <div>
          <TutorialTip
            title="Selected Paint Tile"
            body="This is the raw Realmz map-field value the Paint tool will place. It may be a standard landlook tile, dungeon tile, negative special land icon, icon-backed value, or raw used value."
            side="right"
          >
            <span>Selected Paint Tile</span>
          </TutorialTip>
          <strong>{state.selectedTile}</strong>
          <small>{selectedMeaning.label}</small>
        </div>
      </div>
      <PaintModePanel
        map={map}
        selectedTileset={selectedTileset}
        selectedTile={state.selectedTile}
        paintVariation={paintVariation}
        activePaintGroupId={activePaintGroupId}
        variationTiles={variationTiles}
        paintFillChance={paintFillChance}
        onSetPaintFillChance={onSetPaintFillChance}
        paintMode={paintMode}
        onSetPaintMode={onSetPaintMode}
        selectedRegion={selectedRegion}
        smartBrushPreset={smartBrushPreset}
        onSetSmartBrushPreset={onSetSmartBrushPreset}
        smartBrushDrawMode={smartBrushDrawMode}
        onSetSmartBrushDrawMode={onSetSmartBrushDrawMode}
        smartBrushShapeFill={smartBrushShapeFill}
        onSetSmartBrushShapeFill={onSetSmartBrushShapeFill}
        smartBrushMask={smartBrushMask}
        smartBrushPlan={smartBrushPlan}
        onClearSmartBrushMask={onClearSmartBrushMask}
        onGrowSmartBrushMask={onGrowSmartBrushMask}
        onShrinkSmartBrushMask={onShrinkSmartBrushMask}
        onApplySmartBrush={onApplySmartBrush}
        onApplyCommand={onApplyCommand}
        showVariation={state.activeTool !== "stamp"}
        onSetPaintVariation={onSetPaintVariation}
        onActivatePaintTool={() => {
          if (state.activeTool !== "paint") onSetTool("paint");
        }}
      />
      {selectedRegion && paintMode !== "smart" && (
        <RegionSelectionDetails
          map={map}
          region={selectedRegion}
          selectedTileset={selectedTileset}
          tileAttributes={state.project?.tileAttributes ?? []}
          icons={state.iconEntries}
          selectedPaintTile={state.selectedTile}
        />
      )}
      <PaintPaletteSurface open={paletteOpen} onSetOpen={onSetPaletteOpen}>
        {palette}
      </PaintPaletteSurface>
    </section>
  );
}

const PAINT_VARIATION_OPTIONS: Array<{ id: MapPaintVariation; label: string; hint: string }> = [
  { id: "single", label: "Single Tile", hint: "Paint the selected tile." },
  { id: "cycle-group", label: "Cycle Group", hint: "Advance through the active palette group once for each newly painted cell." },
  { id: "random-group", label: "Random Group", hint: "Pick a stable pseudo-random tile from the active palette group for each newly painted cell." }
];

export function PaintTileSummary({
  selectedTile,
  inspectedTile,
  atlas,
  selectedTileset,
  tileAttributes,
  icons,
  onSelectTile
}: {
  selectedTile: number;
  inspectedTile: number | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  onSelectTile: (tile: number) => void;
}) {
  const paintMeaning = classifyTileValue(selectedTile, selectedTileset, tileAttributes, icons);
  const inspectedMeaning = inspectedTile != null && inspectedTile !== selectedTile
    ? classifyTileValue(inspectedTile, selectedTileset, tileAttributes, icons)
    : null;
  return (
    <div className="paint-tile-card">
      <div className="paint-tile-summary">
        <button
          type="button"
          className="paint-tile-preview"
          style={{ background: tileColor(selectedTile) }}
          onClick={() => onSelectTile(selectedTile)}
          title={`Selected paint tile ${selectedTile}`}
        >
          <TileSwatch atlas={atlas} icons={icons} tile={selectedTile} tileset={selectedTileset} />
        </button>
        <div>
          <strong>{paintMeaning.label}</strong>
          <small>{selectedTileset?.name ?? "No tileset loaded"}</small>
          {inspectedTile != null && <small>Selected cell tile {inspectedTile}</small>}
        </div>
      </div>
      <CompactTileReadout label="Paint" meaning={paintMeaning} />
      {inspectedMeaning && <CompactTileReadout label="Cell" meaning={inspectedMeaning} />}
    </div>
  );
}

function CompactTileReadout({
  label,
  meaning
}: {
  label: string;
  meaning: ReturnType<typeof classifyTileValue>;
}) {
  const traits = compactTileTraits(meaning);
  return (
    <div className="compact-tile-readout">
      <span>{label}</span>
      <b>{meaning.raw}</b>
      <small>{traits}</small>
    </div>
  );
}

function compactTileTraits(meaning: ReturnType<typeof classifyTileValue>) {
  const traits: string[] = meaning.attributeFlags
    .filter((flag) => flag !== "unknown-metadata")
    .slice(0, 3)
    .map(tileAttributeLabel);
  if (meaning.attributes?.movementSoundId != null) traits.push(`snd ${meaning.attributes.movementSoundId}`);
  if (meaning.attributes?.movementCost != null) traits.push(`move ${meaning.attributes.movementCost}`);
  return traits.length ? traits.join(" | ") : meaning.kind.replace(/-/g, " ");
}

const PAINT_MODES: Array<{ id: MapPaintMode; label: string; body: string }> = [
  { id: "brush", label: "Brush", body: "Paint cells by dragging." },
  { id: "clear", label: "Eraser", body: "Restore cells to the current map's clear tile." },
  { id: "smart", label: "Smart", body: "Beta: draw a terrain mask and resolve mountain, water, or forest edges automatically." }
];
const SMART_BRUSH_DRAW_OPTIONS: ReadonlyArray<SegmentedControlOption<SmartBrushDrawMode>> = [
  { value: "freehand", label: "Freehand" },
  { value: "line", label: "Line" },
  { value: "rectangle", label: "Rect" },
  { value: "ellipse", label: "Ellipse" }
];
const SMART_BRUSH_FILL_OPTIONS: ReadonlyArray<SegmentedControlOption<MapShapeFill>> = [
  { value: "outline", label: "Outline" },
  { value: "filled", label: "Filled" }
];

function PaintModePanel({
  map,
  selectedTileset,
  selectedTile,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  paintFillChance,
  onSetPaintFillChance,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  smartBrushPreset,
  onSetSmartBrushPreset,
  smartBrushDrawMode,
  onSetSmartBrushDrawMode,
  smartBrushShapeFill,
  onSetSmartBrushShapeFill,
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
  onGrowSmartBrushMask,
  onShrinkSmartBrushMask,
  onApplySmartBrush,
  onApplyCommand,
  showVariation,
  onSetPaintVariation,
  onActivatePaintTool
}: {
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  selectedTile: number;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  variationTiles: number[] | null | undefined;
  paintFillChance: number;
  onSetPaintFillChance: (chance: number) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  smartBrushPreset: SmartBrushPreset;
  onSetSmartBrushPreset: (preset: SmartBrushPreset) => void;
  smartBrushDrawMode: SmartBrushDrawMode;
  onSetSmartBrushDrawMode: (mode: SmartBrushDrawMode) => void;
  smartBrushShapeFill: MapShapeFill;
  onSetSmartBrushShapeFill: (fill: MapShapeFill) => void;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
  onGrowSmartBrushMask: () => void;
  onShrinkSmartBrushMask: () => void;
  onApplySmartBrush: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
  showVariation: boolean;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  onActivatePaintTool: () => void;
}) {
  const smartUnavailable = paintMode === "smart" && smartBrushPlan.reason != null && smartBrushMask.length === 0;
  const smartDisabled = !map || map.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null;
  const activeVariation = PAINT_VARIATION_OPTIONS.find((variation) => variation.id === paintVariation) ?? PAINT_VARIATION_OPTIONS[0];
  const setMode = (mode: MapPaintMode) => {
    onSetPaintMode(mode);
    onActivatePaintTool();
  };
  const paintModeOptions: ReadonlyArray<SegmentedControlOption<MapPaintMode>> = PAINT_MODES.map((mode) => ({
    value: mode.id,
    label: mode.label,
    disabled: mode.id === "smart" && smartDisabled,
    title: mode.id === "smart" && smartDisabled ? "Smart terrain is available for supported land maps." : mode.body
  }));
  const variationOptions: ReadonlyArray<SegmentedControlOption<MapPaintVariation>> = PAINT_VARIATION_OPTIONS.map((variation) => ({
    value: variation.id,
    label: variation.label,
    title: variation.hint
  }));
  return (
    <PanelSection
      title="Paint Controls"
      eyebrow="paint subtool"
      count={paintModeLabel(paintMode)}
      density="compact"
      className="paint-mode-panel"
    >
      <TutorialTip
        title="Paint Subtools"
        body="Brush paints the selected value, Eraser writes the map's clear tile, and Smart is a beta terrain-mask resolver for mountains, water, and forest."
        side="right"
      >
        <span className="paint-control-label">Mode</span>
      </TutorialTip>
      <SegmentedControl
        ariaLabel="Paint subtool"
        value={paintMode}
        options={paintModeOptions}
        onChange={setMode}
        className="paint-mode-control"
      />
      {showVariation && (
        <div className="paint-mode-variation" aria-label="Brush variation">
          <div className="paint-variation-header">
            <span>Variation</span>
            <b>{activeVariation.label}</b>
          </div>
          <SegmentedControl
            ariaLabel="Brush variation mode"
            value={paintVariation}
            options={variationOptions}
            onChange={onSetPaintVariation}
            className="paint-variation-control"
          />
        </div>
      )}
      {paintMode === "smart" && (
        <div className="smart-brush-panel">
          <label className="map-number-field">
            <TutorialTip
              title="Terrain Preset"
              body="Beta smart terrain currently supports curated standard landlook profiles for mountains, water, and forest. Draw the full intended shape, inspect the preview, then apply and touch up as needed."
              side="right"
            >
              <span>Terrain Preset</span>
            </TutorialTip>
            <small className="context-capacity-note">Beta implementation; review preview before applying.</small>
            <select value={smartBrushPreset} onChange={(event) => onSetSmartBrushPreset(event.currentTarget.value as SmartBrushPreset)}>
              {SMART_BRUSH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <div className="smart-brush-shape-controls">
            <span className="paint-control-label">Mask Shape</span>
            <SegmentedControl
              ariaLabel="Smart Mask shape"
              value={smartBrushDrawMode}
              options={SMART_BRUSH_DRAW_OPTIONS}
              onChange={onSetSmartBrushDrawMode}
              className="smart-brush-shape-control"
            />
            {(smartBrushDrawMode === "rectangle" || smartBrushDrawMode === "ellipse") && (
              <SegmentedControl
                ariaLabel="Smart Mask shape fill"
                value={smartBrushShapeFill}
                options={SMART_BRUSH_FILL_OPTIONS}
                onChange={onSetSmartBrushShapeFill}
                className="shape-fill-control"
              />
            )}
          </div>
          <InfoGrid
            rows={[
              ["Mask Cells", smartBrushMask.length],
              ["Will Change", smartBrushPlan.changedCount],
              ["Preserved", smartBrushPlan.skippedCount],
              ["Profile", smartBrushPlan.profileConfidence === "reviewed-rules" ? "reviewed rules" : smartBrushPlan.profileConfidence === "corpus-ranked" ? "corpus ranked" : smartBrushPlan.profileConfidence === "pixel-ranked" ? "pixel ranked" : smartBrushPlan.profileConfidence === "curated-fallback" ? "curated fallback" : "unsupported"],
              ["Landlook", selectedTileset?.landlook ?? "none"]
            ]}
          />
          {smartBrushPlan.reason && <p className={`context-capacity-note${smartUnavailable ? " blocked" : ""}`}>{smartBrushPlan.reason}</p>}
          {!smartBrushPlan.reason && (
            <p className="empty-copy compact">
              Preview preserves roads, buildings, icon-backed tiles, and unrelated terrain. Yellow outlined cells are preserved.
            </p>
          )}
          {smartBrushPlan.cells.length > 0 && (
            <details className="context-debug-details">
              <summary>Smart Debug</summary>
              <div className="context-chip-row">
                {smartBrushPlan.cells.slice(0, 6).map((cell) => (
                  <span key={`${cell.x}:${cell.y}`} className="context-chip">
                    {cell.x},{cell.y} m{cell.neighborMask ?? "-"} {cell.from}{"->"}{cell.to} {cell.source ?? "fallback"}{cell.samples != null ? ` ${cell.samples}` : ""}{cell.score != null ? ` ${cell.score.toFixed(2)}` : ""}
                  </span>
                ))}
              </div>
            </details>
          )}
          <div className="context-action-stack">
            <button className="btn btn-primary btn-xs context-action-button" type="button" disabled={smartBrushPlan.changedCount === 0} onClick={onApplySmartBrush}>
              Apply Smart Terrain ({smartBrushPlan.changedCount})
            </button>
            <div className="smart-mask-shape-actions">
              <button className="btn btn-secondary btn-xs" type="button" disabled={smartBrushMask.length === 0} onClick={onGrowSmartBrushMask}>
                Grow Mask
              </button>
              <button className="btn btn-secondary btn-xs" type="button" disabled={smartBrushMask.length === 0} onClick={onShrinkSmartBrushMask}>
                Shrink Mask
              </button>
            </div>
            <button className="btn btn-secondary btn-xs context-action-button" type="button" disabled={smartBrushMask.length === 0} onClick={onClearSmartBrushMask}>
              Clear Smart Mask
            </button>
          </div>
        </div>
      )}
      {selectedRegion && paintMode !== "smart" && (
        <div className="paint-region-quick-actions">
          <span>{regionLabel(selectedRegion)} | {regionCellCount(selectedRegion).toLocaleString()} cells</span>
          <label className="paint-fill-chance">
            <TutorialTip
              title="Chance To Fill"
              body="Use less than 100% to scatter the selected tile, random group, cycle group, or custom palette across a region. This is useful for flavor tiles such as rocks, trees, graves, and ruins."
              side="right"
            >
              <span>Chance To Fill</span>
            </TutorialTip>
            <b>{paintFillChance}%</b>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={paintFillChance}
              onChange={(event) => onSetPaintFillChance(Number(event.currentTarget.value))}
            />
            <small>{paintFillChance === 100 ? "Fill every eligible cell." : `Scatter paint across about ${paintFillChance}% of the selected region.`}</small>
          </label>
          <button type="button" onClick={() => fillRegion(map, selectedRegion, selectedTile, selectedTileset, paintVariation, activePaintGroupId, variationTiles, paintFillChance, onApplyCommand)}>Fill</button>
          <button type="button" onClick={() => clearRegion(map, selectedRegion, selectedTileset, onApplyCommand)}>Clear</button>
        </div>
      )}
    </PanelSection>
  );
}

function RegionSelectionDetails({
  map,
  region,
  selectedTileset,
  tileAttributes,
  icons,
  selectedPaintTile
}: {
  map: MapEntity | null;
  region: MapRegionSelection;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  selectedPaintTile: number;
}) {
  if (!map) return <p className="empty-copy compact">Select a map region to edit tiles.</p>;
  const selectedMeaning = classifyTileValue(selectedPaintTile, selectedTileset, tileAttributes, icons);
  return (
    <div className="region-selection-details">
      <div className="tile-meaning-inspector compact">
        <div className="tile-meaning-title">
          <span>Selected Paint Tile</span>
          <b>{selectedMeaning.kind.replace(/-/g, " ")}</b>
        </div>
        <p>{selectedMeaning.compatibility}</p>
      </div>
    </div>
  );
}
