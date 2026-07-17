import { useEffect, useMemo, useState } from "react";
import type { MapContextFocus } from "../../components/maps/mapBrowserModel";
import type { LandLayoutCellSelection } from "../../components/maps/LandLayoutWorkbench";
import type { EditorState } from "../../store";
import { readGlobalMapStamps, writeGlobalMapStamps } from "../../map/customMapStamps";
import { DUNGEON_DEFAULT_DRAW_FLAGS } from "../../map/dungeonCellFlags";
import { buildSmartTerrainChanges, buildSmartTerrainPaintChanges, smartBrushProfileForTileset } from "../../map/smartTerrainBrush";
import { builtInStampToMapStamp, customMapStampToMapStamp, superTileStampsForMap } from "../../map/superTileStamps";
import { useSmartBrushMaskHistory } from "./useSmartBrushMaskHistory";
import type {
  CustomMapStamp,
  DungeonCellFlag,
  EditorTool,
  MapEntity,
  MapPaintMode,
  MapPaintVariation,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapRegionSelection,
  MapWorkbenchMode,
  Project,
  ProjectCommand,
  SmartBrushPreset,
  TilePaletteCategory,
  TilesetAsset
} from "../../types";

const MAP_WORKBENCH_MODE_STORAGE_KEY = "providence.mapWorkbenchMode.v1";

export function useMapWorkbenchState({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  onSetTool,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  onSetTool: (tool: EditorTool) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextFocus, setContextFocus] = useState<MapContextFocus>("flags");
  const [workbenchMode, setWorkbenchMode] = useState<MapWorkbenchMode>(() => readStoredWorkbenchMode());
  const [paintMode, setPaintMode] = useState<MapPaintMode>("brush");
  const [paintVariation, setPaintVariation] = useState<MapPaintVariation>("single");
  const [activePaintGroupId, setActivePaintGroupId] = useState("all");
  const [paintPaletteMode, setPaintPaletteMode] = useState<TilePaletteCategory>("landlook");
  const [dungeonDrawFlags, setDungeonDrawFlags] = useState<Record<DungeonCellFlag, boolean>>(DUNGEON_DEFAULT_DRAW_FLAGS);
  const [activeCustomPaletteId, setActiveCustomPaletteId] = useState<string | null>(null);
  const [selectedSuperTileStampId, setSelectedSuperTileStampId] = useState<string | null>(null);
  const [globalMapStamps, setGlobalMapStamps] = useState<CustomMapStamp[]>(() => readGlobalMapStamps());
  const [variationTiles, setPaletteVariationTiles] = useState<number[] | null>(null);
  const [previewMode, setPreviewMode] = useState<MapPreviewMode>("off");
  const [previewFocalPoint, setPreviewFocalPoint] = useState<MapPreviewFocalPoint | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapRegionSelection | null>(null);
  const [smartBrushPreset, setSmartBrushPreset] = useState<SmartBrushPreset>("mountains");
  const { smartBrushMask, setSmartBrushMask, commitSmartBrushMaskStep, canUndoSmartBrushMaskStep, undoSmartBrushMaskStep, resetSmartBrushMask } = useSmartBrushMaskHistory();
  const [smartBrushDrawing, setSmartBrushDrawing] = useState(false);
  const [selectedLayoutCell, setSelectedLayoutCell] = useState<LandLayoutCellSelection>(null);

  useEffect(() => {
    setSelectedRegion(null);
    resetSmartBrushMask();
    setSmartBrushDrawing(false);
    setPreviewFocalPoint(null);
  }, [resetSmartBrushMask, selectedMap?.id]);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MAP_WORKBENCH_MODE_STORAGE_KEY, workbenchMode);
  }, [workbenchMode]);
  useEffect(() => {
    writeGlobalMapStamps(globalMapStamps);
  }, [globalMapStamps]);

  const customPalettes = useMemo(() => project?.editorMetadata?.tilePalettes ?? [], [project?.editorMetadata?.tilePalettes]);
  const availableSuperTileStamps = useMemo(
    () => [
      ...superTileStampsForMap(selectedMap, selectedTileset).map(builtInStampToMapStamp),
      ...(project?.editorMetadata?.mapStamps ?? []).map((stamp) => customMapStampToMapStamp(stamp, "project")),
      ...globalMapStamps.map((stamp) => customMapStampToMapStamp(stamp, "global"))
    ],
    [globalMapStamps, project?.editorMetadata?.mapStamps, selectedMap, selectedTileset]
  );
  const selectedSuperTileStamp = availableSuperTileStamps.find((stamp) => stamp.id === selectedSuperTileStampId) ?? availableSuperTileStamps[0] ?? null;
  const smartBrushPlan = useMemo(
    () => buildSmartTerrainChanges(selectedMap, smartBrushMask, smartBrushPreset, selectedTileset, atlas),
    [atlas, selectedMap, selectedTileset, smartBrushMask, smartBrushPreset]
  );
  const visibleSmartBrushPlan = smartBrushDrawing
    ? {
        cells: [],
        skipped: [],
        changedCount: 0,
        skippedCount: 0,
        profileConfidence: smartBrushPlan.profileConfidence,
        reason: smartBrushMask.length > 0 ? "Release the pointer to resolve the full smart terrain shape." : "Draw a smart terrain mask on the map."
      }
    : smartBrushPlan;

  useEffect(() => {
    if (customPalettes.length === 0) {
      if (activeCustomPaletteId !== null) setActiveCustomPaletteId(null);
      return;
    }
    if (!activeCustomPaletteId || !customPalettes.some((palette) => palette.id === activeCustomPaletteId)) {
      setActiveCustomPaletteId(customPalettes[0].id);
    }
  }, [activeCustomPaletteId, customPalettes]);
  useEffect(() => {
    if (availableSuperTileStamps.length === 0) {
      if (selectedSuperTileStampId !== null) setSelectedSuperTileStampId(null);
      return;
    }
    if (!selectedSuperTileStampId || !availableSuperTileStamps.some((stamp) => stamp.id === selectedSuperTileStampId)) {
      setSelectedSuperTileStampId(availableSuperTileStamps[0].id);
    }
  }, [availableSuperTileStamps, selectedSuperTileStampId]);
  useEffect(() => {
    if (paintMode !== "smart") return;
    if (!selectedMap || selectedMap.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null) {
      setPaintMode("brush");
      resetSmartBrushMask();
      setSmartBrushDrawing(false);
    }
  }, [paintMode, resetSmartBrushMask, selectedMap, selectedTileset]);

  const openCanvasTool = (tool: EditorTool) => {
    setWorkbenchMode("canvas");
    onSetTool(tool);
    if (tool === "paint" || tool === "stamp") setPaletteOpen(true);
  };
  const clearSmartBrushMask = () => { resetSmartBrushMask(); setSmartBrushDrawing(false); };
  const applySmartBrush = () => {
    if (!selectedMap) return;
    const cells = buildSmartTerrainPaintChanges(smartBrushPlan);
    if (cells.length === 0) return;
    onApplyCommand({
      kind: "paintTiles",
      label: `Smart ${smartBrushPreset} terrain`,
      mapId: selectedMap.id,
      cells
    });
    resetSmartBrushMask();
  };

  return {
    shell: {
      paletteOpen,
      setPaletteOpen,
      contextFocus,
      setContextFocus,
      workbenchMode,
      setWorkbenchMode,
      previewMode,
      setPreviewMode,
      previewFocalPoint,
      setPreviewFocalPoint,
      selectedLayoutCell,
      setSelectedLayoutCell
    },
    paint: {
      paintMode,
      setPaintMode,
      paintVariation,
      setPaintVariation,
      activePaintGroupId,
      setActivePaintGroupId,
      paintPaletteMode,
      setPaintPaletteMode,
      dungeonDrawFlags,
      setDungeonDrawFlags,
      activeCustomPaletteId,
      setActiveCustomPaletteId,
      variationTiles,
      setPaletteVariationTiles,
      selectedRegion,
      setSelectedRegion
    },
    stamps: {
      globalMapStamps,
      setGlobalMapStamps,
      selectedSuperTileStamp,
      setSelectedSuperTileStampId
    },
    smartBrush: {
      smartBrushPreset,
      setSmartBrushPreset,
      smartBrushMask,
      setSmartBrushMask,
      commitSmartBrushMaskStep,
      canUndoSmartBrushMaskStep,
      undoSmartBrushMaskStep,
      smartBrushDrawing,
      setSmartBrushDrawing,
      smartBrushPlan,
      visibleSmartBrushPlan,
      clearSmartBrushMask,
      applySmartBrush
    },
    openCanvasTool
  };
}

export type MapWorkbenchState = ReturnType<typeof useMapWorkbenchState>;

function readStoredWorkbenchMode(): MapWorkbenchMode {
  if (typeof localStorage === "undefined") return "canvas";
  const stored = localStorage.getItem(MAP_WORKBENCH_MODE_STORAGE_KEY);
  if (stored === "canvas" || stored === "land-layout" || stored === "land-tiles" || stored === "random-areas") return stored;
  return "canvas";
}
