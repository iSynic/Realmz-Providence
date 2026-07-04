import { ReactNode } from "react";
import { EditorState } from "../store";
import { EditorTab } from "../types";
import { DomainRail } from "./DomainRail";
import { StatusBar } from "./StatusBar";
import { ToolSidebar } from "./ToolSidebar";
import { WorkbenchTopbar } from "./WorkbenchTopbar";

export function ProvidenceEditorShell({
  state,
  children,
  runtimeLabel,
  runtimeLive,
  canUseFiles,
  browserPreviewStatus,
  importAllowed,
  railIssueCount,
  activeStatus,
  undoLabel,
  redoLabel,
  canSave,
  canExport,
  tutorialEnabled,
  canNavigateBack,
  canNavigateForward,
  onLibrary,
  onProject,
  onDocuments,
  onDivinityManual,
  onGlobalSearch,
  onNavigateBack,
  onNavigateForward,
  onToggleTutorial,
  onNewProject,
  onOpenProject,
  onImportScenario,
  onUndo,
  onRedo,
  onSave,
  onExport,
  onSelectDomain,
  onSelectEditor
}: {
  state: EditorState;
  children: ReactNode;
  runtimeLabel: string;
  runtimeLive: boolean;
  canUseFiles: boolean;
  browserPreviewStatus: string;
  importAllowed: boolean;
  railIssueCount: number;
  activeStatus: string;
  undoLabel: string | null;
  redoLabel: string | null;
  canSave: boolean;
  canExport: boolean;
  tutorialEnabled: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onLibrary: () => void;
  onProject: () => void;
  onDocuments: () => void;
  onDivinityManual: () => void;
  onGlobalSearch: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onToggleTutorial: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportScenario: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
  onSelectDomain: (domain: EditorTab) => void;
  onSelectEditor: (editor: string) => void;
}) {
  const hasWorkbench = Boolean(state.project || state.activeWorkbench === "library");
  const subtitle = state.activeWorkbench === "library" ? "Library Workbench" : state.project?.scenario.name ?? "No project loaded";
  return (
    <div className="editor-layout providence-shell">
      <WorkbenchTopbar
        activeWorkbench={state.activeWorkbench}
        title="Realmz Providence"
        subtitle={subtitle}
        runtimeLabel={runtimeLabel}
        runtimeLive={runtimeLive}
        dirty={state.dirty}
        editing={Boolean(state.groupLabel)}
        importAllowed={importAllowed}
        canUseFiles={canUseFiles}
        browserPreviewStatus={browserPreviewStatus}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canSave={canSave}
        canExport={canExport}
        tutorialEnabled={tutorialEnabled}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        onLibrary={onLibrary}
        onProject={onProject}
        onDocuments={onDocuments}
        onDivinityManual={onDivinityManual}
        onGlobalSearch={onGlobalSearch}
        onNavigateBack={onNavigateBack}
        onNavigateForward={onNavigateForward}
        onToggleTutorial={onToggleTutorial}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        onImportScenario={onImportScenario}
        onUndo={onUndo}
        onRedo={onRedo}
        onSave={onSave}
        onExport={onExport}
      />

      <main className="editor-body workbench-body">
        {hasWorkbench && (
          <DomainRail
            activeDomain={state.activeDomain}
            project={state.project}
            catalog={state.libraryCatalog}
            activeWorkbench={state.activeWorkbench}
            issueCount={railIssueCount}
            onSelectDomain={onSelectDomain}
          />
        )}
        {hasWorkbench && state.activeDomain !== "maps" && (
          <ToolSidebar
            activeDomain={state.activeDomain}
            activeEditor={state.activeEditor}
            activeWorkbench={state.activeWorkbench}
            project={state.project}
            catalog={state.libraryCatalog}
            onSelectEditor={onSelectEditor}
          />
        )}
        <div className="editor-panel-host">{children}</div>
      </main>

      <StatusBar
        status={activeStatus}
        activeWorkbench={state.activeWorkbench}
        project={state.project}
        catalog={state.libraryCatalog}
        semanticMapping={state.semanticMapping}
      />
    </div>
  );
}
