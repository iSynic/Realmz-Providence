import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapPreviewFocalPoint,
  ProjectCommand,
  RandomLevel,
  TilesetAsset
} from "../../types";
import { ScrollArea } from "../../ui";
import { ResizablePane } from "../ResizablePane";
import { MapOutliner } from "./MapOutliner";
import { MapToolset } from "./MapToolset";
import type { MapWorkbenchState } from "../../panels/maps/useMapWorkbenchState";

export function MapBrowserSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  selectedRandomLevel,
  previewFocalPoint,
  workbench,
  onSelectMap,
  onSelectTile,
  onApplyCommand
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedRandomLevel: RandomLevel | null;
  previewFocalPoint: MapPreviewFocalPoint;
  workbench: MapWorkbenchState;
  onSelectMap: (id: string) => void;
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
          contextFocus={workbench.shell.contextFocus}
          previewMode={workbench.shell.previewMode}
          previewFocalPoint={previewFocalPoint}
          onSelectMap={onSelectMap}
          onSetPreviewMode={workbench.shell.setPreviewMode}
          onSetPreviewFocalPoint={workbench.shell.setPreviewFocalPoint}
          onSetWorkbenchMode={workbench.shell.setWorkbenchMode}
          onApplyCommand={onApplyCommand}
        />
        <MapToolset
          state={state}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          workbenchMode={workbench.shell.workbenchMode}
          connectedSelectionMode={workbench.selection.connectedSelectionMode}
          selectionDrawMode={workbench.selection.selectionDrawMode}
          selectionShapeFill={workbench.selection.selectionShapeFill}
          onSetWorkbenchMode={workbench.shell.setWorkbenchMode}
          onSetConnectedSelectionMode={workbench.selection.setConnectedSelectionMode}
          onSetSelectionDrawMode={workbench.selection.setSelectionDrawMode}
          onSetSelectionShapeFill={workbench.selection.setSelectionShapeFill}
          onSetTool={workbench.openCanvasTool}
          onSelectTile={onSelectTile}
        />
      </ScrollArea>
    </ResizablePane>
  );
}
