import { useCallback, useTransition } from "react";
import { Database } from "lucide-react";
import { LibraryCatalog, MapCoordinateTarget, MapEntity, Project, ProjectCommand, SelectedEntity } from "../types";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { scriptPanelTitle } from "./scripts/scriptInventory";
import { ActionPointAuthoringPanel } from "./scripts/ActionPointAuthoringPanel";
import { ActionSettingsWorkbench } from "./scripts/ActionSettingsWorkbench";
import { StoryFlagsWorkbench } from "./scripts/StoryFlagsWorkbench";
import { WorkbenchTabs, type WorkbenchTabOption } from "../ui";


export const PRIMARY_SCRIPT_EDITOR_TABS: ReadonlyArray<WorkbenchTabOption<string>> = [
  { value: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { value: "macros", label: "Extra Action Points", title: "Extra Action Points and branch targets." },
  { value: "global-macros", label: "Global Macros", title: "Extra Action Point scripts assigned in Scenario > Global Macros." },
  { value: "quests", label: "Story Flags", title: "Beta story-flag labels, decoded usage, and optional author notes." }
];

export function isAdvancedScriptStorageEditor(editor: string) {
  return editor === "settings-rows";
}

export function ScriptsPanel({
  project,
  catalog,
  selectedEntity,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onOpenMapCoordinate,
  selectedMap,
  onApplyCommand,
  activeEditor = "action-points"
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  selectedMap?: MapEntity | null;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const [, startScriptTransition] = useTransition();
  const { confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const effectiveEditor = activeEditor === "domain"
    ? "action-points"
    : activeEditor === "ed3-evidence"
      ? "macros"
      : activeEditor;
  const handleSelectEntity = useCallback((entity: SelectedEntity) => {
    startScriptTransition(() => onSelectEntity(entity));
  }, [onSelectEntity]);
  const handleApplyCommand = useCallback((command: ProjectCommand) => {
    startScriptTransition(() => onApplyCommand?.(command));
  }, [onApplyCommand]);
  const handleSelectEditor = useCallback((editor: string) => {
    if (editor === effectiveEditor) return;
    confirmBeforeDraftDiscard(`switch to ${scriptPanelTitle(editor)}`, () => onSelectEditor?.(editor));
  }, [confirmBeforeDraftDiscard, effectiveEditor, onSelectEditor]);
  const workbench = project && effectiveEditor === "settings-rows" ? (
    <ActionSettingsWorkbench
      project={project}
      catalog={catalog}
      selectedEntity={selectedEntity}
      onSelectEntity={handleSelectEntity}
      onSelectEditor={onSelectEditor}
      onOpenTool={onOpenTool}
      onApplyCommand={handleApplyCommand}
    />
  ) : project && effectiveEditor === "quests" ? (
    <StoryFlagsWorkbench
      project={project}
      scripts={project.triggers}
      onSelectEntity={handleSelectEntity}
      onApplyCommand={handleApplyCommand}
    />
  ) : (
    <ActionPointAuthoringPanel
      project={project}
      catalog={catalog}
      activeEditor={effectiveEditor}
      selectedEntity={selectedEntity}
      desktopRuntime={desktopRuntime}
      projectDir={projectDir}
      workspaceDir={workspaceDir}
      onSelectEntity={handleSelectEntity}
      onSelectEditor={onSelectEditor}
      onOpenTool={onOpenTool}
      onOpenMapCoordinate={onOpenMapCoordinate}
      activeMap={selectedMap}
      onApplyCommand={handleApplyCommand}
    />
  );
  return (
    <div className="editor-full-panel scripts-workbench">
      <div className="script-editor-navigation">
        <ScriptEditorTabs activeEditor={effectiveEditor} onSelectEditor={handleSelectEditor} />
        <details className="script-advanced-storage-menu" open={isAdvancedScriptStorageEditor(effectiveEditor) ? true : undefined}>
          <summary><Database size={13} /> Advanced</summary>
          <div>
            <button
              type="button"
              className={isAdvancedScriptStorageEditor(effectiveEditor) ? "active" : ""}
              onClick={() => handleSelectEditor("settings-rows")}
            >
              <strong>Data EDCD / Extra Code Storage</strong>
              <small>Technical diagnostics and deliberate raw-row repair.</small>
            </button>
          </div>
        </details>
      </div>
      {workbench}
    </div>
  );
}

function ScriptEditorTabs({
  activeEditor,
  onSelectEditor
}: {
  activeEditor: string;
  onSelectEditor?: (editor: string) => void;
}) {
  return (
    <WorkbenchTabs
      ariaLabel="Action Point Hub sections"
      className="script-editor-tabs"
      value={activeEditor}
      options={PRIMARY_SCRIPT_EDITOR_TABS}
      onChange={(editor) => onSelectEditor?.(editor)}
    />
  );
}
