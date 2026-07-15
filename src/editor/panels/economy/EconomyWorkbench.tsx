import { useEffect, useMemo, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { WorkbenchTabs, type WorkbenchTabOption } from "../../ui";
import { ItemCatalogWorkbench } from "./ItemCatalogWorkbench";
import { ShopWorkbench } from "./ShopWorkbench";
import { TreasureWorkbench } from "./TreasureWorkbench";

type EconomySection = "treasure" | "items" | "shops";

const ECONOMY_SECTION_HELP: Record<EconomySection, string> = {
  treasure: "Data TD reward records with victory points, money, gems, jewelry, and twenty item slots.",
  items: "Shared Realmz item families plus scenario Data NI items. Built-in items are reference/copy sources; custom scenario items live in IDs 900-999.",
  shops: "Data SD source shop records with item IDs, quantities, and inflation. Saved-game/runtime stock can mutate separately."
};

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

function EconomySectionSwitcher({
  project,
  selectedSection,
  onSelectSection
}: {
  project: Project;
  selectedSection: EconomySection;
  onSelectSection: (section: EconomySection) => void;
}) {
  const itemCount = useMemo(() => economyItemReferenceCount(project), [project]);
  const sections: Array<WorkbenchTabOption<EconomySection>> = [
    { value: "treasure", label: <TutorialTip title="Treasure" body={ECONOMY_SECTION_HELP.treasure} side="right"><span>Treasure</span></TutorialTip>, meta: (project.treasures?.length ?? 0).toLocaleString() },
    { value: "items", label: <TutorialTip title="Items" body={ECONOMY_SECTION_HELP.items} side="right"><span>Items</span></TutorialTip>, meta: itemCount.toLocaleString() },
    { value: "shops", label: <TutorialTip title="Shops" body={ECONOMY_SECTION_HELP.shops} side="right"><span>Shops</span></TutorialTip>, meta: (project.shops?.length ?? 0).toLocaleString() }
  ];
  return (
    <WorkbenchTabs
      className="economy-section-switcher"
      ariaLabel="Economy sections"
      value={selectedSection}
      options={sections}
      onChange={onSelectSection}
    />
  );
}

function economySectionFromEditor(activeEditor: string): EconomySection | null {
  if (activeEditor === "treasure") return "treasure";
  if (activeEditor === "items") return "items";
  if (activeEditor === "shops") return "shops";
  return null;
}

function readStoredEconomySection(): EconomySection {
  try {
    const value = window.localStorage.getItem("domain.economy.section");
    if (value === "treasure" || value === "items" || value === "shops") return value;
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
  return "treasure";
}

function writeStoredEconomySection(section: EconomySection) {
  try {
    window.localStorage.setItem("domain.economy.section", section);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

function economyItemReferenceCount(project: Project) {
  const ids = new Set<number>();
  for (const record of project.scenarioItems ?? []) {
    const id = record.itemId || 800 + record.id;
    if (isCatalogItemId(id)) ids.add(id);
  }
  for (let id = 900; id < 1000; id += 1) ids.add(id);
  for (const treasure of project.treasures ?? []) {
    for (const id of treasure.itemIds) if (isCatalogItemId(id)) ids.add(id);
  }
  for (const shop of project.shops ?? []) {
    for (const id of shop.itemIds) if (isCatalogItemId(id)) ids.add(id);
  }
  return ids.size;
}

function isCatalogItemId(itemId: number) {
  return Number.isInteger(itemId) && itemId > 0 && itemId < 1000;
}
