import type { EditorTool, LevelType, MapWorkbenchMode } from "../../types";

export type MapSidebarInspector = "setup" | "paint" | "dungeon-draw" | "selection" | "land-layout" | "land-tiles" | "random-areas";

export interface MapInspectorRoute {
  choice: MapSidebarInspector;
  showPaint: boolean;
  showDungeonDraw: boolean;
  showSelection: boolean;
}

export interface MapInspectorTransition {
  workbenchMode: MapWorkbenchMode;
  tool?: EditorTool;
  clearRegion: boolean;
  clearSelection: boolean;
}

export function compatibleMapTool(levelType: LevelType | null, activeTool: EditorTool) {
  if (levelType === "dungeon" && (activeTool === "paint" || activeTool === "bucket" || activeTool === "stamp")) return "select";
  if (levelType !== "dungeon" && activeTool === "dungeon-draw") return "select";
  return activeTool;
}

export function resolveMapInspectorRoute({
  workbenchMode,
  activeTool,
  levelType,
  hasSelection,
  hasSelectedRegion
}: {
  workbenchMode: MapWorkbenchMode;
  activeTool: EditorTool;
  levelType: LevelType | null;
  hasSelection: boolean;
  hasSelectedRegion: boolean;
}): MapInspectorRoute {
  const showPaint = workbenchMode === "canvas" && levelType !== "dungeon" && (activeTool === "paint" || activeTool === "bucket" || activeTool === "stamp" || hasSelectedRegion);
  const showDungeonDraw = workbenchMode === "canvas" && levelType === "dungeon" && activeTool === "dungeon-draw";
  const showSelection = workbenchMode === "canvas" && !showPaint && !showDungeonDraw && hasSelection;
  const choice = showPaint
    ? "paint"
    : showDungeonDraw
      ? "dungeon-draw"
      : showSelection
        ? "selection"
        : workbenchMode === "canvas"
          ? "setup"
          : workbenchMode;
  return { choice, showPaint, showDungeonDraw, showSelection };
}

export function transitionToMapInspector(
  choice: MapSidebarInspector,
  { isDungeon, hasSelection }: { isDungeon: boolean; hasSelection: boolean }
): MapInspectorTransition | null {
  switch (choice) {
    case "paint":
      return { workbenchMode: "canvas", tool: "paint", clearRegion: false, clearSelection: false };
    case "dungeon-draw":
      return isDungeon
        ? { workbenchMode: "canvas", tool: "dungeon-draw", clearRegion: false, clearSelection: false }
        : null;
    case "selection":
      return hasSelection
        ? { workbenchMode: "canvas", tool: "select", clearRegion: false, clearSelection: false }
        : null;
    case "setup":
      return { workbenchMode: "canvas", tool: "select", clearRegion: true, clearSelection: true };
    case "land-layout":
    case "land-tiles":
    case "random-areas":
      return { workbenchMode: choice, clearRegion: true, clearSelection: false };
  }
}
