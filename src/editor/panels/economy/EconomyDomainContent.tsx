import type { PreviewRuntimeContext } from "../../previewUrls";
import type { ActiveWorkbench, EditorTab, LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { EconomyReferenceLibrary, type EconomyReferenceLibraryKind } from "./EconomyReferenceLibrary";
import { EconomyWorkbench } from "./EconomyWorkbench";

export type EconomyDomainMode = "project" | EconomyReferenceLibraryKind | null;

export function EconomyDomainContent({
  mode,
  activeEditor,
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  mode: EconomyDomainMode;
  activeEditor: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  if (mode === "project") {
    if (!project) return null;
    return (
      <EconomyWorkbench
        activeEditor={activeEditor}
        project={project}
        catalog={catalog}
        selectedEntity={selectedEntity}
        previewContext={previewContext}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
      />
    );
  }
  if (mode === "bag" || mode === "vault") {
    return (
      <EconomyReferenceLibrary
        key={mode}
        kind={mode}
        catalog={catalog}
        selectedEntity={selectedEntity}
        onSelectEntity={onSelectEntity}
      />
    );
  }
  return null;
}

export function economyDomainMode(
  activeWorkbench: ActiveWorkbench,
  tab: EditorTab,
  activeEditor: string
): EconomyDomainMode {
  if (tab !== "economy") return null;
  if (activeWorkbench === "project") return "project";
  if (activeEditor === "bag" || activeEditor === "vault") return activeEditor;
  return null;
}
