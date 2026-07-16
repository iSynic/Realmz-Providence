import { useMemo } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { Project } from "../../types";
import { WorkbenchTabs, type WorkbenchTabOption } from "../../ui";

export type EconomySection = "treasure" | "items" | "shops";

const ECONOMY_SECTION_HELP: Record<EconomySection, string> = {
  treasure: "Data TD reward records with victory points, money, gems, jewelry, and twenty item slots.",
  items: "Shared Realmz item families plus scenario Data NI items. Built-in items are reference/copy sources; custom scenario items live in IDs 900-999.",
  shops: "Data SD source shop records with item IDs, quantities, and inflation. Saved-game/runtime stock can mutate separately."
};

export function EconomySectionSwitcher({
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
  return <WorkbenchTabs className="economy-section-switcher" ariaLabel="Economy sections" value={selectedSection} options={sections} onChange={onSelectSection} />;
}

export function economySectionFromEditor(activeEditor: string): EconomySection | null {
  if (activeEditor === "treasure" || activeEditor === "items" || activeEditor === "shops") {
    return activeEditor;
  }
  return null;
}

export function readStoredEconomySection(): EconomySection {
  try {
    const value = window.localStorage.getItem("domain.economy.section");
    return economySectionFromEditor(value ?? "") ?? "treasure";
  } catch {
    return "treasure";
  }
}

export function writeStoredEconomySection(section: EconomySection) {
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
