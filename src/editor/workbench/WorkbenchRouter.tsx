import { ReactNode, Suspense } from "react";
import { EditorState } from "../store";
import { AssetSearchHint, BenchmarkReport, ExportReport, Issue, LibraryCatalog, ManagedAssetKind, MapCoordinateTarget, MapEntity, MapRecord, MapViewFlag, ProjectCommand, RandomLevel, ScenarioTarget, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { MediaAssetImportOptions } from "../mediaAssets";
import { LibraryDraftSpec } from "../libraryDrafts";
import type { TransientUndoScope } from "../app/transientUndo";
import {
  LazyCombatPanel as CombatPanel,
  LazyExportPanel as ExportPanel,
  LazyLibraryHubPanel as LibraryHubPanel,
  LazyLinterPanel as LinterPanel,
  LazyMapsPanel as MapsPanel,
  LazyPlayerMapsPanel as PlayerMapsPanel,
  LazyRecordsPanel as RecordsPanel,
  LazyResourcesPanel as ResourcesPanel,
  LazyRulesPanel as RulesPanel,
  LazyScenarioPanel as ScenarioPanel,
  LazyScriptsPanel as ScriptsPanel,
  LazySuiteDomainPanel as SuiteDomainPanel,
  LazyTextPanel as TextPanel,
  WorkbenchChunkErrorBoundary,
  WorkbenchLoading
} from "./LazyWorkbenchPanels";

export function WorkbenchRouter(props: WorkbenchRouterProps) {
  const resetKey = `${props.state.activeWorkbench}:${props.state.activeTab}:${props.state.activeEditor}`;
  return (
    <WorkbenchChunkErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<WorkbenchLoading label="Loading editor section..." />}>
        <WorkbenchRouterContent {...props} />
      </Suspense>
    </WorkbenchChunkErrorBoundary>
  );
}

function WorkbenchRouterContent({
  state,
  emptyProjectView,
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  selectedTileset,
  mapRecords,
  atlas,
  desktopRuntime,
  projectDir,
  workspaceDir,
  assetSearchHint,
  exportReport,
  benchmark,
  issues,
  onSelectMap,
  onSelectTile,
  onSelectCell,
  onSelectEntity,
  onSelectEditor,
  onSetTool,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag,
  onSetVisibleRandomRectIds,
  onSetVisibleMapRecordIds,
  onClearSelection,
  onOpenScripts,
  onOpenTool,
  onOpenMapCoordinate,
  onOpenPlayerMapTarget,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke,
  onSetTransientUndoScope,
  onCreateDraft,
  onUpdateDraft,
  onUpdateLibraryCatalog,
  onImportAssets,
  onReplaceAsset,
  onUpdateAsset,
  onDeleteAsset,
  onUpdateCustomAsset,
  onDeleteCustomAsset,
  onAddAssetToCustomLibrary,
  onCopyCustomAssetToScenario,
  onCopyReferenceAssetToScenario,
  onValidate,
  onExport,
  onExportProjectJson,
  onBenchmark
}: WorkbenchRouterProps) {
  if (!state.project && state.activeWorkbench === "project") {
    return <>{emptyProjectView}</>;
  }

  if (state.activeWorkbench === "library" && state.activeEditor === "hub") {
    return (
      <LibraryHubPanel
        workspace={state.workspace}
        catalog={state.libraryCatalog}
      />
    );
  }

  if (state.activeWorkbench === "library" && state.activeEditor !== "hub" && state.activeTab === "assets") {
    return (
      <ResourcesPanel
        project={null}
        catalog={state.libraryCatalog}
        customAssets={state.workspace?.customAssets ?? []}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        workspaceDir={workspaceDir}
        searchHint={assetSearchHint}
        onSelectEntity={onSelectEntity}
        onImportAssets={onImportAssets}
        onUpdateCustomAsset={onUpdateCustomAsset}
        onDeleteCustomAsset={onDeleteCustomAsset}
      />
    );
  }

  if (state.activeWorkbench === "library" && state.activeEditor !== "hub" && state.activeTab !== "assets") {
    return (
      <SuiteDomainPanel
        tab={state.activeTab}
        activeEditor={state.activeEditor}
        activeWorkbench={state.activeWorkbench}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onSelectEditor={onSelectEditor}
        onApplyCommand={onApplyCommand}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
        onUpdateLibraryCatalog={onUpdateLibraryCatalog}
      />
    );
  }

  if (!state.project || state.activeWorkbench !== "project") return null;

  if (state.activeTab === "maps") {
    return (
      <MapsPanel
        state={state}
        selectedMap={selectedMap}
        selectedRandomLevel={selectedRandomLevel}
        mapTriggers={mapTriggers}
        selectedTileset={selectedTileset}
        mapRecords={mapRecords}
        atlas={atlas}
        onSelectMap={onSelectMap}
        onSelectTile={onSelectTile}
        onSelectCell={onSelectCell}
        onSelectEntity={onSelectEntity}
        onSetTool={onSetTool}
        onSetZoom={onSetZoom}
        onSetSmoothTiles={onSetSmoothTiles}
        onSetViewFlag={onSetViewFlag}
        onSetVisibleRandomRectIds={onSetVisibleRandomRectIds}
        onSetVisibleMapRecordIds={onSetVisibleMapRecordIds}
        onClearSelection={onClearSelection}
        onOpenScripts={onOpenScripts}
        onBeginPaintStroke={onBeginPaintStroke}
        onApplyCommand={onApplyCommand}
        onCommitPaintStroke={onCommitPaintStroke}
        onCancelPaintStroke={onCancelPaintStroke}
        onSetTransientUndoScope={onSetTransientUndoScope}
      />
    );
  }

  if (state.activeTab === "player-maps") {
    return (
      <PlayerMapsPanel
        project={state.project}
        selectedEntity={state.selectedEntity}
        atlasEntries={state.atlasEntries}
        icons={state.iconEntries}
        onOpenTool={onOpenTool}
        onOpenRelatedMap={onOpenPlayerMapTarget}
        onApplyCommand={onApplyCommand}
      />
    );
  }

  if (state.activeTab === "scripts") {
    return (
      <ScriptsPanel
        project={state.project}
        catalog={state.libraryCatalog}
        activeEditor={state.activeEditor}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onSelectEditor={onSelectEditor}
        onOpenTool={onOpenTool}
        onOpenMapCoordinate={onOpenMapCoordinate}
        onApplyCommand={onApplyCommand}
        onUpdateLibraryCatalog={onUpdateLibraryCatalog}
      />
    );
  }

  if (state.activeTab === "scenario") {
    return (
      <ScenarioPanel
        project={state.project}
        onApplyCommand={onApplyCommand}
        onSelectMap={onSelectMap}
        onSelectEntity={onSelectEntity}
        onOpenTool={onOpenTool}
      />
    );
  }

  if (state.activeTab === "encounters") {
    return (
      <SuiteDomainPanel
        tab="encounters"
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onSelectEditor={onSelectEditor}
        onApplyCommand={onApplyCommand}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
        onUpdateLibraryCatalog={onUpdateLibraryCatalog}
      />
    );
  }

  if (state.activeTab === "rules") {
    return (
      <RulesPanel
        project={state.project}
        catalog={state.libraryCatalog}
        activeEditor={state.activeEditor}
        selectedEntity={state.selectedEntity}
        queueAtlasUrl={state.atlasEntries["dungeon-top-down-302"]?.url ?? null}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
      />
    );
  }

  if (state.activeTab === "text") {
    return (
      <TextPanel
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        activeEditor={state.activeEditor}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
      />
    );
  }

  if (state.activeTab === "combat") {
    return (
      <CombatPanel
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        iconEntries={state.iconEntries}
        previewContext={{ desktopRuntime, projectDir, workspaceDir }}
        onSelectEntity={onSelectEntity}
        onSelectEditor={onSelectEditor}
        onOpenTool={onOpenTool}
        onApplyCommand={onApplyCommand}
        onUpdateLibraryCatalog={onUpdateLibraryCatalog}
      />
    );
  }

  if (state.activeTab === "economy") {
    return (
      <SuiteDomainPanel
        tab={state.activeTab}
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
        onUpdateLibraryCatalog={onUpdateLibraryCatalog}
      />
    );
  }

  if (state.activeTab === "assets") {
    return (
      <ResourcesPanel
        project={state.project}
        catalog={state.libraryCatalog}
        customAssets={state.workspace?.customAssets ?? []}
        selectedEntity={state.selectedEntity}
        activeEditor={state.activeEditor}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        searchHint={assetSearchHint}
        onSelectEntity={onSelectEntity}
        onImportAssets={onImportAssets}
        onReplaceAsset={onReplaceAsset}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={onDeleteAsset}
        onUpdateCustomAsset={onUpdateCustomAsset}
        onDeleteCustomAsset={onDeleteCustomAsset}
        onAddAssetToCustomLibrary={onAddAssetToCustomLibrary}
        onCopyCustomAssetToScenario={onCopyCustomAssetToScenario}
        onCopyReferenceAssetToScenario={onCopyReferenceAssetToScenario}
        onSelectPaintTile={(tile: number) => {
          onSelectTile(tile);
          onSetTool("paint");
        }}
      />
    );
  }

  if (state.activeTab === "records") {
    return <RecordsPanel project={state.project} selectedEntity={state.selectedEntity} onSelectEntity={onSelectEntity} />;
  }

  if (state.activeTab === "linter") {
    return (
      <LinterPanel
        project={state.project}
        issues={issues}
        selectedEntity={state.selectedEntity}
        onValidate={onValidate}
        onSelectEntity={onSelectEntity}
      />
    );
  }

  if (state.activeTab === "export") {
    return (
      <ExportPanel
        project={state.project}
        exportReport={exportReport}
        benchmark={benchmark}
        desktopRuntime={desktopRuntime}
        onExport={onExport}
        onExportProjectJson={onExportProjectJson}
        onBenchmark={onBenchmark}
      />
    );
  }

  return null;
}

type WorkbenchRouterProps = {
  state: EditorState;
  emptyProjectView: ReactNode;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  selectedTileset: TilesetAsset | null;
  mapRecords: SemanticEntity[];
  atlas: EditorState["atlasEntries"][string] | null;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  assetSearchHint: AssetSearchHint | null;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  issues: Issue[];
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor: (editor: string) => void;
  onSetTool: EditorStateSetter<"activeTool">;
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetVisibleRandomRectIds: (ids: string[]) => void;
  onSetVisibleMapRecordIds: (ids: number[]) => void;
  onClearSelection: () => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onOpenTool: (tab: "assets" | "rules" | "scripts" | "text", editor: string) => void;
  onOpenMapCoordinate: (target: MapCoordinateTarget) => void;
  onOpenPlayerMapTarget: (record: MapRecord) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
  onSetTransientUndoScope: (scope: TransientUndoScope | null) => void;
  onCreateDraft: (spec: LibraryDraftSpec) => void;
  onUpdateDraft: (entityId: string, changes: { label?: string; notes?: string }) => void;
  onUpdateLibraryCatalog: (catalog: LibraryCatalog, status: string) => void;
  onImportAssets: (files: File[], kind: ManagedAssetKind, options?: MediaAssetImportOptions) => void;
  onReplaceAsset: (assetId: string, file: File) => void;
  onUpdateAsset: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset: (assetId: string) => void;
  onUpdateCustomAsset: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteCustomAsset: (assetId: string) => void;
  onAddAssetToCustomLibrary: (assetId: string) => void;
  onCopyCustomAssetToScenario: (assetId: string) => void;
  onCopyReferenceAssetToScenario: (assetId: string) => void;
  onValidate: () => void;
  onExport: (target?: ScenarioTarget) => void;
  onExportProjectJson: () => void;
  onBenchmark: () => void;
};

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;
