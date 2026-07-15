import { useCallback, useTransition } from "react";
import { LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, SelectedEntity } from "../types";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { scriptPanelTitle } from "./scripts/scriptInventory";
import { ActionPointAuthoringPanel } from "./scripts/ActionPointAuthoringPanel";
import { ActionSettingsWorkbench } from "./scripts/ActionSettingsWorkbench";
import { StoryFlagsWorkbench } from "./scripts/StoryFlagsWorkbench";
import { WorkbenchTabs, type WorkbenchTabOption } from "../ui";


const SCRIPT_EDITOR_TABS: ReadonlyArray<WorkbenchTabOption<string>> = [
  { value: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { value: "macros", label: "Extra Action Points", title: "Extra Action Points and branch targets." },
  { value: "global-macros", label: "Global Events", title: "Scenario-wide event hooks and startup logic." },
  { value: "quests", label: "Story Flags", title: "Beta story-flag labels, decoded usage, and optional author notes." },
  { value: "settings-rows", label: "Action Settings", title: "Advanced browser for shared or imported action settings." }
];

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
      onApplyCommand={handleApplyCommand}
    />
  );
  return (
    <div className="editor-full-panel scripts-workbench">
      <ScriptEditorTabs activeEditor={effectiveEditor} onSelectEditor={handleSelectEditor} />
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
      options={SCRIPT_EDITOR_TABS}
      onChange={(editor) => onSelectEditor?.(editor)}
    />
  );
}
