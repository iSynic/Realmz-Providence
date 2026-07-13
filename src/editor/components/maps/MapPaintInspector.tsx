import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
import { clearRegion, fillRegion, paintModeLabel, regionLabel } from "./mapRegionUiUtils";
import { tileAttributeLabel } from "./mapTileUiUtils";

const PAINT_PALETTE_STORAGE_KEY = "providence.mapPaintPalette.v1";
const DEFAULT_PALETTE_STATE: PaintPaletteState = {
  mode: "docked",
  x: 720,
  y: 120,
  width: 440,
  height: 560
};

type PaintPaletteState = {
  mode: "docked" | "floating";
  x: number;
  y: number;
  width: number;
  height: number;
};

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
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
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
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
  onApplySmartBrush: () => void;
  selectedSuperTileStampId: string | null;
  onSelectSuperTileStamp: (stampId: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
}) {
  const [paletteState, setPaletteState] = useState<PaintPaletteState>(() => readPaintPaletteState());
  const [paintFillChance, setPaintFillChance] = useState(100);
  const onSetPaletteState = setPaletteState;
  const onSetPaintFillChance = setPaintFillChance;
  useEffect(() => {
    localStorage.setItem(PAINT_PALETTE_STORAGE_KEY, JSON.stringify(paletteState));
  }, [paletteState]);
  const selectedMeaning = classifyTileValue(state.selectedTile, selectedTileset, state.project?.tileAttributes ?? [], state.iconEntries);
  const docked = paletteState.mode === "docked";
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
        smartBrushMask={smartBrushMask}
        smartBrushPlan={smartBrushPlan}
        onClearSmartBrushMask={onClearSmartBrushMask}
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
      <div className={`paint-palette-shell${paletteOpen && docked ? " paint-palette-shell-docked" : ""}`}>
        <div className="paint-palette-shell-header">
          <TutorialTip
            title="Tile Palette"
            body="Dock the palette in the Paint Inspector or pop it out over the map. Custom palettes are saved with the project; drag tiles from any tab into the reveal dock to collect them."
            side="right"
          >
            <span>Tile Palette</span>
          </TutorialTip>
          <div>
            {!paletteOpen && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSetPaletteOpen(true)}>
                Open
              </button>
            )}
            {paletteOpen && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSetPaletteState({ ...paletteState, mode: docked ? "floating" : "docked" })}>
                {docked ? "Pop-Out" : "Dock"}
              </button>
            )}
            {paletteOpen && (
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => onSetPaletteOpen(false)}>
                Close
              </button>
            )}
          </div>
        </div>
        {paletteOpen && docked && <div className="paint-palette-scroll">{palette}</div>}
        {paletteOpen && !docked && <p className="empty-copy compact">Palette is floating over the map canvas.</p>}
      </div>
      {paletteOpen && !docked && (
        <FloatingPaintPalette
          paletteState={paletteState}
          onSetPaletteState={onSetPaletteState}
          onClose={() => onSetPaletteOpen(false)}
          onDock={() => onSetPaletteState({ ...paletteState, mode: "docked" })}
        >
          {palette}
        </FloatingPaintPalette>
      )}
    </section>
  );
}

const PAINT_VARIATION_OPTIONS: Array<{ id: MapPaintVariation; label: string; hint: string }> = [
  { id: "single", label: "Single Tile", hint: "Paint the selected tile." },
  { id: "cycle-group", label: "Cycle Group", hint: "Advance through the active palette group once for each newly painted cell." },
  { id: "random-group", label: "Random Group", hint: "Pick a stable pseudo-random tile from the active palette group for each newly painted cell." }
];

function FloatingPaintPalette({
  paletteState,
  onSetPaletteState,
  onClose,
  onDock,
  children
}: {
  paletteState: PaintPaletteState;
  onSetPaletteState: (state: PaintPaletteState) => void;
  onClose: () => void;
  onDock: () => void;
  children: ReactNode;
}) {
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);
  const stateRef = useRef(paletteState);
  useEffect(() => {
    stateRef.current = paletteState;
  }, [paletteState]);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    const start = { x: event.clientX, y: event.clientY, left: paletteState.x, top: paletteState.y };
    const move = (moveEvent: PointerEvent) => {
      const next = clampPaletteRect({
        ...stateRef.current,
        x: start.left + moveEvent.clientX - start.x,
        y: start.top + moveEvent.clientY - start.y
      });
      onSetPaletteState(next);
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizingRef.current = true;
    const start = { x: event.clientX, y: event.clientY, width: paletteState.width, height: paletteState.height };
    const move = (moveEvent: PointerEvent) => {
      const next = clampPaletteRect({
        ...stateRef.current,
        width: Math.max(320, start.width + moveEvent.clientX - start.x),
        height: Math.max(360, start.height + moveEvent.clientY - start.y)
      });
      onSetPaletteState(next);
    };
    const up = () => {
      resizingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const clamped = clampPaletteRect(paletteState);
  return (
    <div
      className="floating-paint-palette"
      style={{ left: `${clamped.x}px`, top: `${clamped.y}px`, width: `${clamped.width}px`, height: `${clamped.height}px` }}
    >
      <div className="floating-paint-palette-header" onPointerDown={startDrag}>
        <span>Paint Palette</span>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onDock}>Dock</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>Close</button>
      </div>
      <div className="floating-paint-palette-body">{children}</div>
      <button className="floating-paint-palette-resize" type="button" aria-label="Resize paint palette" onPointerDown={startResize} />
    </div>
  );
}

function readPaintPaletteState(): PaintPaletteState {
  if (typeof localStorage === "undefined") return DEFAULT_PALETTE_STATE;
  try {
    const parsed = JSON.parse(localStorage.getItem(PAINT_PALETTE_STORAGE_KEY) ?? "");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PALETTE_STATE;
    return clampPaletteRect({
      mode: parsed.mode === "floating" ? "floating" : "docked",
      x: numberOrDefault(parsed.x, DEFAULT_PALETTE_STATE.x),
      y: numberOrDefault(parsed.y, DEFAULT_PALETTE_STATE.y),
      width: numberOrDefault(parsed.width, DEFAULT_PALETTE_STATE.width),
      height: numberOrDefault(parsed.height, DEFAULT_PALETTE_STATE.height)
    });
  } catch {
    return DEFAULT_PALETTE_STATE;
  }
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampPaletteRect(state: PaintPaletteState): PaintPaletteState {
  if (typeof window === "undefined") return state;
  const margin = 12;
  const width = Math.min(Math.max(320, state.width), Math.max(320, window.innerWidth - margin * 2));
  const height = Math.min(Math.max(360, state.height), Math.max(360, window.innerHeight - margin * 2));
  return {
    ...state,
    width,
    height,
    x: Math.max(margin, Math.min(state.x, window.innerWidth - width - margin)),
    y: Math.max(margin, Math.min(state.y, window.innerHeight - height - margin))
  };
}

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
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
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
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
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
  return (
    <div className="paint-mode-panel">
      <div className="paint-mode-header">
        <TutorialTip
          title="Paint Subtools"
          body="Brush paints the selected value, Eraser writes the map's clear tile, and Smart is a beta terrain-mask resolver for mountains, water, and forest."
          side="right"
        >
          <span>Paint Subtool</span>
        </TutorialTip>
        <b>{paintModeLabel(paintMode)}</b>
      </div>
      <div className="paint-mode-grid">
        {PAINT_MODES.map((mode) => (
          <button
            key={mode.id}
            className={paintMode === mode.id ? "active" : ""}
            type="button"
            disabled={mode.id === "smart" && smartDisabled}
            onClick={() => setMode(mode.id)}
            title={mode.id === "smart" && smartDisabled ? "Smart terrain is available for supported land maps." : mode.body}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {showVariation && (
        <>
          <div className="paint-mode-divider" />
          <div className="paint-mode-variation" aria-label="Brush variation">
            <div className="paint-variation-header">
              <span>Variation</span>
              <b>{activeVariation.label}</b>
            </div>
            <div className="paint-variation-buttons" role="toolbar" aria-label="Brush variation mode">
              {PAINT_VARIATION_OPTIONS.map((variation) => (
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
          </div>
        </>
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
            <button className="btn btn-secondary btn-xs context-action-button" type="button" disabled={smartBrushMask.length === 0} onClick={onClearSmartBrushMask}>
              Clear Smart Mask
            </button>
            <button className="btn btn-ghost btn-xs context-action-button" type="button" disabled={smartBrushMask.length === 0} onClick={onClearSmartBrushMask}>
              Cancel Preview
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
    </div>
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
