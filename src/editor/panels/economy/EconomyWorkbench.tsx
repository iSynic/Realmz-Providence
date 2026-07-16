import { useEffect, useState } from "react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import {
  EconomySectionSwitcher,
  economySectionFromEditor,
  readStoredEconomySection,
  type EconomySection,
  writeStoredEconomySection
} from "./EconomySectionSwitcher";
import { ItemCatalogWorkbench } from "./ItemCatalogWorkbench";
import { ShopWorkbench } from "./ShopWorkbench";
import { TreasureWorkbench } from "./TreasureWorkbench";

export function EconomyWorkbench({
  activeEditor,
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  activeEditor: string;
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [section, setSection] = useState<EconomySection>(() =>
    economySectionFromEditor(activeEditor) ?? readStoredEconomySection()
  );
  useEffect(() => {
    const next = economySectionFromEditor(activeEditor);
    if (next) setSection(next);
  }, [activeEditor]);
  useEffect(() => {
    writeStoredEconomySection(section);
  }, [section]);

  const commonProps = {
    project,
    catalog,
    selectedEntity,
    previewContext,
    onSelectEntity,
    onApplyCommand
  };

  return (
    <>
      <EconomySectionSwitcher project={project} selectedSection={section} onSelectSection={setSection} />
      {section === "items" ? (
        <ItemCatalogWorkbench {...commonProps} />
      ) : section === "shops" ? (
        <ShopWorkbench {...commonProps} />
      ) : (
        <TreasureWorkbench {...commonProps} />
      )}
    </>
  );
}
