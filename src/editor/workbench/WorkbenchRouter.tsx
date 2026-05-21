import { ReactNode } from "react";
import { EditorState } from "../store";
import { BenchmarkReport, ExportReport, ManagedAssetKind, MapEntity, MapViewFlag, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { LibraryDraftSpec } from "../libraryDrafts";
import { EncountersPanel } from "../panels/EncountersPanel";
import { ExportPanel } from "../panels/ExportPanel";
import { LibraryHubPanel } from "../panels/LibraryHubPanel";
import { LinterPanel } from "../panels/LinterPanel";
import { MapsPanel } from "../panels/MapsPanel";
import { RecordsPanel } from "../panels/RecordsPanel";
import { ResourcesPanel } from "../panels/ResourcesPanel";
import { ScriptsPanel } from "../panels/ScriptsPanel";
import { SuiteDomainPanel } from "../panels/SuiteDomainPanel";
import { Issue } from "../types";

export function WorkbenchRouter({
  state,
  emptyProjectView,
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  selectedTileset,
  mapRecords,
  atlas,
  desktopRuntime,
  browserFileSystem,
  projectDir,
  workspaceDir,
  exportReport,
  benchmark,
  issues,
  onSelectMap,
  onSelectTile,
  onSelectCell,
  onSelectEntity,
  onSetTool,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag,
  onSetShowTriggers,
  onSetShowRandomRects,
  onSetShowMapRecords,
  onClearSelection,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke,
  onImportDivinity,
  onImportRealmz,
  onCreateDraft,
  onUpdateDraft,
  onImportAssets,
  onReplaceAsset,
  onUpdateAsset,
  onDeleteAsset,
  onValidate,
  onExport,
  onBenchmark
}: {
  state: EditorState;
  emptyProjectView: ReactNode;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  selectedTileset: TilesetAsset | null;
  mapRecords: SemanticEntity[];
  atlas: EditorState["atlasEntries"][string] | null;
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  projectDir: string;
  workspaceDir: string;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  issues: Issue[];
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  onSelectCell: (cell: { x: number; y: number; tile: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetTool: EditorStateSetter<"activeTool">;
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetShowTriggers: (value: boolean) => void;
  onSetShowRandomRects: (value: boolean) => void;
  onSetShowMapRecords: (value: boolean) => void;
  onClearSelection: () => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
  onImportDivinity: () => void;
  onImportRealmz: () => void;
  onCreateDraft: (spec: LibraryDraftSpec) => void;
  onUpdateDraft: (entityId: string, changes: { label?: string; notes?: string }) => void;
  onImportAssets: (files: File[], kind: ManagedAssetKind) => void;
  onReplaceAsset: (assetId: string, file: File) => void;
  onUpdateAsset: (assetId: string, changes: { label?: string; resourceId?: number }) => void;
  onDeleteAsset: (assetId: string) => void;
  onValidate: () => void;
  onExport: () => void;
  onBenchmark: () => void;
}) {
  if (!state.project && state.activeWorkbench === "project") {
    return <>{emptyProjectView}</>;
  }

  if (state.activeWorkbench === "library" && state.activeEditor === "hub") {
    return (
      <LibraryHubPanel
        workspace={state.workspace}
        catalog={state.libraryCatalog}
        desktopRuntime={desktopRuntime}
        browserFileSystem={browserFileSystem}
        onImportDivinity={onImportDivinity}
        onImportRealmz={onImportRealmz}
      />
    );
  }

  if (state.activeWorkbench === "library" && state.activeEditor !== "hub" && state.activeTab === "assets") {
    return (
      <ResourcesPanel
        project={null}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        desktopRuntime={desktopRuntime}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
      />
    );
  }

  if (state.activeWorkbench === "library" && state.activeEditor !== "hub" && state.activeTab !== "assets") {
    return (
      <SuiteDomainPanel
        tab={state.activeTab}
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        onSelectEntity={onSelectEntity}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
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
        onSetShowTriggers={onSetShowTriggers}
        onSetShowRandomRects={onSetShowRandomRects}
        onSetShowMapRecords={onSetShowMapRecords}
        onClearSelection={onClearSelection}
        onBeginPaintStroke={onBeginPaintStroke}
        onApplyCommand={onApplyCommand}
        onCommitPaintStroke={onCommitPaintStroke}
        onCancelPaintStroke={onCancelPaintStroke}
      />
    );
  }

  if (state.activeTab === "scripts") {
    return <ScriptsPanel project={state.project} activeEditor={state.activeEditor} selectedEntity={state.selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />;
  }

  if (state.activeTab === "scenario") {
    return (
      <SuiteDomainPanel
        tab="scenario"
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        onSelectEntity={onSelectEntity}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
      />
    );
  }

  if (state.activeTab === "encounters") {
    return <EncountersPanel project={state.project} selectedEntity={state.selectedEntity} onSelectEntity={onSelectEntity} activeEditor={state.activeEditor} />;
  }

  if (["combat", "economy", "rules", "text"].includes(state.activeTab)) {
    return (
      <SuiteDomainPanel
        tab={state.activeTab}
        activeEditor={state.activeEditor}
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        onSelectEntity={onSelectEntity}
        onCreateDraft={onCreateDraft}
        onUpdateDraft={onUpdateDraft}
      />
    );
  }

  if (state.activeTab === "assets") {
    return (
      <ResourcesPanel
        project={state.project}
        catalog={state.libraryCatalog}
        selectedEntity={state.selectedEntity}
        activeEditor={state.activeEditor}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
        onImportAssets={onImportAssets}
        onReplaceAsset={onReplaceAsset}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={onDeleteAsset}
        onSelectPaintTile={(tile) => {
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
        onExport={onExport}
        onBenchmark={onBenchmark}
      />
    );
  }

  return null;
}

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;
