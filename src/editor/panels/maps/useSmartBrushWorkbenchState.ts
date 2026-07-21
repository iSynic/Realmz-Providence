import { useEffect, useMemo, useState } from "react";
import type { EditorState } from "../../store";
import { connectedSelectionSmartMaskCells } from "../../map/connectedSelectionActions";
import { growMapCells, shrinkMapCells, type MapShapeFill, type SmartBrushDrawMode } from "../../map/mapCellShapes";
import { analyzeMapPaintOperation, applyMapPaintImpactToSmartPlan } from "../../map/mapPaintSafeguards";
import { buildSmartTerrainChanges, buildSmartTerrainPaintChanges, smartBrushProfileForTileset } from "../../map/smartTerrainBrush";
import type {
  EditorTool,
  MapEntity,
  MapPaintMode,
  Project,
  ProjectCommand,
  SmartBrushPreset,
  TilesetAsset
} from "../../types";
import { useSmartBrushMaskHistory } from "./useSmartBrushMaskHistory";

export function useSmartBrushWorkbenchState({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  paintMode,
  onSetPaintMode,
  onOpenCanvasTool,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  onOpenCanvasTool: (tool: EditorTool) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [smartBrushPreset, setSmartBrushPreset] = useState<SmartBrushPreset>("mountains");
  const [smartBrushDrawMode, setSmartBrushDrawMode] = useState<SmartBrushDrawMode>("freehand");
  const [smartBrushShapeFill, setSmartBrushShapeFill] = useState<MapShapeFill>("filled");
  const [protectMapFeatures, setProtectMapFeatures] = useState(true);
  const { smartBrushMask, setSmartBrushMask, commitSmartBrushMaskStep, canUndoSmartBrushMaskStep, undoSmartBrushMaskStep, resetSmartBrushMask } = useSmartBrushMaskHistory();
  const [smartBrushDrawing, setSmartBrushDrawing] = useState(false);

  const rawSmartBrushPlan = useMemo(
    () => buildSmartTerrainChanges(selectedMap, smartBrushMask, smartBrushPreset, selectedTileset, atlas),
    [atlas, selectedMap, selectedTileset, smartBrushMask, smartBrushPreset]
  );
  const smartBrushImpact = useMemo(() => selectedMap
    ? analyzeMapPaintOperation({
        map: selectedMap,
        changes: buildSmartTerrainPaintChanges(rawSmartBrushPlan),
        triggers: project?.triggers ?? [],
        tileset: selectedTileset,
        protectFeatures: protectMapFeatures
      })
    : null,
  [project?.triggers, protectMapFeatures, rawSmartBrushPlan, selectedMap, selectedTileset]);
  const smartBrushPlan = useMemo(
    () => smartBrushImpact ? applyMapPaintImpactToSmartPlan(rawSmartBrushPlan, smartBrushImpact) : rawSmartBrushPlan,
    [rawSmartBrushPlan, smartBrushImpact]
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
    resetSmartBrushMask();
    setSmartBrushDrawing(false);
  }, [resetSmartBrushMask, selectedMap?.id]);
  useEffect(() => {
    if (paintMode !== "smart") return;
    if (!selectedMap || selectedMap.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null) {
      onSetPaintMode("brush");
      resetSmartBrushMask();
      setSmartBrushDrawing(false);
    }
  }, [onSetPaintMode, paintMode, resetSmartBrushMask, selectedMap, selectedTileset]);

  const clearSmartBrushMask = () => { resetSmartBrushMask(); setSmartBrushDrawing(false); };
  const loadSmartBrushMaskFromCells = (cells: ReadonlyArray<{ x: number; y: number }>) => {
    if (!selectedMap || selectedMap.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null) return;
    const next = connectedSelectionSmartMaskCells(selectedMap, cells);
    if (next.length === 0) return;
    commitSmartBrushMaskStep(smartBrushMask, next);
    setSmartBrushDrawing(false);
    onSetPaintMode("smart");
    onOpenCanvasTool("paint");
  };
  const reshapeSmartBrushMask = (operation: "grow" | "shrink") => {
    if (!selectedMap || smartBrushMask.length === 0) return;
    const next = operation === "grow"
      ? growMapCells(smartBrushMask, selectedMap)
      : shrinkMapCells(smartBrushMask, selectedMap);
    commitSmartBrushMaskStep(smartBrushMask, next);
    setSmartBrushDrawing(false);
  };
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
    smartBrush: {
      smartBrushPreset,
      setSmartBrushPreset,
      smartBrushDrawMode,
      setSmartBrushDrawMode,
      smartBrushShapeFill,
      setSmartBrushShapeFill,
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
      loadSmartBrushMaskFromCells,
      growSmartBrushMask: () => reshapeSmartBrushMask("grow"),
      shrinkSmartBrushMask: () => reshapeSmartBrushMask("shrink"),
      applySmartBrush
    },
    safeguards: {
      protectMapFeatures,
      setProtectMapFeatures,
      smartBrushImpact
    }
  };
}
