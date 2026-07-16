import { useMemo } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { LibraryCatalog, Project } from "../../types";
import { WorkbenchTabs, type WorkbenchTabOption } from "../../ui";

export type EconomySection = "treasure" | "items" | "shops" | "bag" | "vault";

const ECONOMY_SECTION_HELP: Record<EconomySection, string> = {
  treasure: "Data TD reward records with victory points, money, gems, jewelry, and twenty item slots.",
  items: "Shared Realmz item families plus scenario Data NI items. Built-in items are reference/copy sources; custom scenario items live in IDs 900-999.",
  shops: "Data SD source shop records with item IDs, quantities, and inflation. Saved-game/runtime stock can mutate separately.",
  bag: "Protected Bag of Holding reference material used by Providence item pickers and previews.",
  vault: "Protected Vault of Arcana icon material used by Providence item pickers and previews."
};

export function EconomySectionSwitcher({
  project,
  catalog,
  selectedSection,
  onSelectSection
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSection: EconomySection;
  onSelectSection: (section: EconomySection) => void;
}) {
  const itemCount = useMemo(() => economyItemReferenceCount(project), [project]);
  const libraryCounts = useMemo(() => {
    const counts = { bag: 0, vault: 0 };
    for (const entity of catalog?.entities ?? []) {
      if (entity.type === "bag-item") counts.bag += 1;
      if (entity.type === "vault-icon") counts.vault += 1;
    }
    return counts;
  }, [catalog?.entities]);
  const sections: Array<WorkbenchTabOption<EconomySection>> = [
    { value: "treasure", label: <TutorialTip title="Treasure" body={ECONOMY_SECTION_HELP.treasure} side="right"><span>Treasure</span></TutorialTip>, meta: (project.treasures?.length ?? 0).toLocaleString() },
    { value: "items", label: <TutorialTip title="Items" body={ECONOMY_SECTION_HELP.items} side="right"><span>Items</span></TutorialTip>, meta: itemCount.toLocaleString() },
    { value: "shops", label: <TutorialTip title="Shops" body={ECONOMY_SECTION_HELP.shops} side="right"><span>Shops</span></TutorialTip>, meta: (project.shops?.length ?? 0).toLocaleString() },
    { value: "bag", label: <TutorialTip title="Bag of Holding" body={ECONOMY_SECTION_HELP.bag} side="right"><span>Bag of Holding</span></TutorialTip>, meta: libraryCounts.bag.toLocaleString() },
    { value: "vault", label: <TutorialTip title="Vault of Arcana" body={ECONOMY_SECTION_HELP.vault} side="right"><span>Vault of Arcana</span></TutorialTip>, meta: libraryCounts.vault.toLocaleString() }
  ];
  return <WorkbenchTabs className="economy-section-switcher" ariaLabel="Economy sections" value={selectedSection} options={sections} onChange={onSelectSection} />;
}

export function economySectionFromEditor(activeEditor: string): EconomySection | null {
  if (activeEditor === "treasure" || activeEditor === "items" || activeEditor === "shops" || activeEditor === "bag" || activeEditor === "vault") {
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
