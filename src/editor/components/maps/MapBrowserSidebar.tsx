import type { EditorState } from "../../store";
import type {
  EditorTool,
  MapEntity,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapWorkbenchMode,
  ProjectCommand,
  RandomLevel,
  TilesetAsset
} from "../../types";
import { ScrollArea } from "../../ui";
import { ResizablePane } from "../ResizablePane";
import { type MapContextFocus } from "./mapBrowserModel";
import type { ConnectedTileMatchMode } from "../../map/connectedMapSelection";
import { MapOutliner } from "./MapOutliner";
import { MapToolset } from "./MapToolset";

export function MapBrowserSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  workbenchMode,
  connectedSelectionMode,
  selectedRandomLevel,
  contextFocus,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetWorkbenchMode,
  onSetConnectedSelectionMode,
  onSelectMap,
  onSetTool,
  onSelectTile,
  onApplyCommand
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbenchMode: MapWorkbenchMode;
  connectedSelectionMode: ConnectedTileMatchMode;
  selectedRandomLevel: RandomLevel | null;
  contextFocus: MapContextFocus;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetConnectedSelectionMode: (mode: ConnectedTileMatchMode) => void;
  onSelectMap: (id: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  return (
    <ResizablePane
      className="editor-sidebar contextual-sidebar"
      ariaLabel="Map tools and context"
      storageKey="providence.mapLeftSidebarWidth.v4"
      defaultWidth={360}
      minWidth={320}
      maxWidth={560}
      edge="right"
    >
      <ScrollArea className="contextual-sidebar-scroll" aria-label="Map tools and browser">
        <MapOutliner
          project={state.project}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          randomLevel={selectedRandomLevel}
          contextFocus={contextFocus}
          previewMode={previewMode}
          previewFocalPoint={previewFocalPoint}
          onSelectMap={onSelectMap}
          onSetPreviewMode={onSetPreviewMode}
          onSetPreviewFocalPoint={onSetPreviewFocalPoint}
          onSetWorkbenchMode={onSetWorkbenchMode}
          onApplyCommand={onApplyCommand}
        />
        <MapToolset
          state={state}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          workbenchMode={workbenchMode}
          connectedSelectionMode={connectedSelectionMode}
          onSetWorkbenchMode={onSetWorkbenchMode}
          onSetConnectedSelectionMode={onSetConnectedSelectionMode}
          onSetTool={onSetTool}
          onSelectTile={onSelectTile}
        />
      </ScrollArea>
    </ResizablePane>
  );
}
