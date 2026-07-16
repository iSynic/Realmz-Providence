import { DragEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, IconEntry, MonsterRecord, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../../types";
import { battleReferencesByMonster } from "../../battleReferences";
import { allMonsterScenarioIds, authorFacingMonsterRecordsForSet, authorFacingMonsterScenarioIds } from "../../monsterRecords";
import {
  createMonsterLibraryEntry,
  deleteMonsterLibraryEntry,
  duplicateMonsterLibraryEntry,
  isProvidenceMonsterLibraryEntry,
  monsterLibraryEntryDescription,
  monsterLibraryOrigin,
  monsterLibraryEntryTemplate,
  updateMonsterLibraryEntry
} from "../../monsterLibrary";
import { selectEntityFromId } from "../../utils";
import {
  MONSTER_SET_OPTIONS,
  type CombatLookups
} from "./combatLookups";
import { measureCombatWork, useCombatRenderTiming } from "./performance";
import { MAX_DIVINITY_BATTLE_MONSTER_ID } from "./battleMonsterPaletteModel";
import { BattleReferenceRepairDialog, battleReferenceReplacementCandidates, type PendingBattleReferenceRepair } from "./BattleReferenceRepairDialog";
import { MonsterLibraryList } from "./MonsterLibraryList";
import { MonsterLibraryMultiSelection } from "./MonsterLibraryMultiSelection";
import { MonsterLibraryOwnershipBadge } from "./MonsterLibraryOwnershipBadge";
import { MonsterLibraryIcon, MonsterLibraryPreview } from "./MonsterLibraryPreview";
import { useMonsterLibraryFilter } from "./monsterLibraryFilters";
import { MonsterRecordEditor } from "./MonsterRecordEditor";
import { ScenarioMonsterList, type ScenarioMonsterListEntry } from "./ScenarioMonsterList";
import { MissingMonsterSetEditor, MonsterSetToolbar } from "./MonsterSetControls";
import { isBlankMonsterSlot, monsterSetLabel } from "./monsterVariantModel";
import {
  copyMonsterLibraryEntryToScenario,
  materializeMonsterLibraryIconOverrides,
  monsterCopyTargetId,
  monsterRecordFromLibraryEntry,
  nextAvailableMonsterRecordId,
  preferredMonsterCopyId,
  scrapbookDescription,
  scrapbookFacts,
  scrapbookIndex,
  scrapbookName,
  visibleMonsterLibraryEntries,
  type MonsterLibraryCopyEntry
} from "./monsterLibraryWorkflow";

export { monsterRequiredWeaponDisplayCode, monsterRequiredWeaponStoredCode } from "./MonsterRecordEditor";
export {
  copyScrapbookMonsterToScenario,
  materializeMonsterLibraryIconOverrides,
  monsterIconOverrideForLibraryCopy,
  scrapbookEntryForMonsterId
} from "./monsterLibraryWorkflow";

const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_LIBRARY_DRAG_MIME = "application/x-realmz-monster-library-id";
const SCENARIO_MONSTER_DRAG_MIME = "application/x-realmz-scenario-monster-id";
export function MonsterWorkbench({
  project,
  catalog,
  selectedEntity,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
  onSelectIconSetTab,
  onApplyCommand,
  onUpdateLibraryCatalog
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectIconSetTab: () => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [libraryRangeAnchorId, setLibraryRangeAnchorId] = useState<string | null>(null);
  const [populateMenuOpen, setPopulateMenuOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<"scenario" | "library">("scenario");
  const [activeSetId, setActiveSetId] = useState<MonsterSetId>(0);
  const [scenarioDropActive, setScenarioDropActive] = useState(false);
  const [libraryDropActive, setLibraryDropActive] = useState(false);
  const [pendingBattleRepair, setPendingBattleRepair] = useState<PendingBattleReferenceRepair | null>(null);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const projectMonsters = project.monsters;
  const projectMonsterSets = project.monsterSets;
  const projectBattles = project.battles;
  const scenarioIds = useMemo(
    () => measureCombatWork("MonsterWorkbench scenarioIds", () => authorFacingMonsterScenarioIds(project)),
    [projectMonsters, projectMonsterSets]
  );
  const scenarioEntries = useMemo<ScenarioMonsterListEntry[]>(
    () => measureCombatWork("MonsterWorkbench scenarioEntries", () => scenarioIds.map((id) => {
      const normal = monsterForSet(lookups, 0, id);
      const monster = monsterForSet(lookups, 1, id);
      const mega = monsterForSet(lookups, -1, id);
      const active = monsterForSet(lookups, activeSetId, id);
      const fallback = active ?? normal ?? monster ?? mega;
      return { id, normal, monster, mega, active, fallback };
    })),
    [activeSetId, lookups, scenarioIds]
  );
  const displayScenarioEntries = scenarioEntries;
  const filtered = useMemo(
    () => measureCombatWork("MonsterWorkbench filteredScenarioEntries", () => filterRecords(displayScenarioEntries, query, (entry) => {
      const record = entry.fallback;
      return `${entry.id} ${record?.displayName ?? ""} icon ${record?.iconId ?? ""} hd ${record?.hitDice ?? ""} normal ${Boolean(entry.normal)} monster ${Boolean(entry.monster)} mega ${Boolean(entry.mega)}`;
    })),
    [displayScenarioEntries, query]
  );
  const libraryEntries = useMemo(() => {
    const entries = visibleMonsterLibraryEntries(catalog)
      .filter((entry) => {
        if (isProvidenceMonsterLibraryEntry(entry)) return true;
        return !(catalog?.entities ?? []).some((candidate) => {
          if (!isProvidenceMonsterLibraryEntry(candidate)) return false;
          const origin = monsterLibraryOrigin(candidate);
          return origin.kind === "built-in-override" && origin.sourceId === entry.id;
        });
      });
    return entries.sort((a, b) => {
      const aCustom = isProvidenceMonsterLibraryEntry(a);
      const bCustom = isProvidenceMonsterLibraryEntry(b);
      if (aCustom !== bCustom) return aCustom ? 1 : -1;
      return scrapbookIndex(a) - scrapbookIndex(b);
    });
  }, [catalog?.entities]);
  const { libraryScope, setLibraryScope, filteredLibrary, libraryScopeCounts } = useMonsterLibraryFilter(libraryEntries, libraryQuery);
  useEffect(() => {
    if (filteredLibrary.length === 0) {
      setSelectedLibraryId(null);
      setSelectedLibraryIds([]);
      return;
    }
    if (selectedLibraryId === null || !filteredLibrary.some((entry) => entry.id === selectedLibraryId)) {
      const nextId = filteredLibrary[0].id;
      setSelectedLibraryId(nextId);
      setSelectedLibraryIds((ids) => ids.length > 1 ? ids.filter((id) => libraryEntries.some((entry) => entry.id === id)) : [nextId]);
    }
  }, [filteredLibrary, libraryEntries, selectedLibraryId]);
  useEffect(() => {
    if (selectedLibraryIds.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedLibraryIds(selectedLibraryId ? [selectedLibraryId] : []);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLibraryId, selectedLibraryIds.length]);
  const nextMonsterId = nextAvailableMonsterRecordId(scenarioIds.map((id) => ({ id })));
  const selectedId = selectedFromEntity ?? displayScenarioEntries[0]?.id ?? null;
  const selectedEntry = selectedId !== null ? scenarioEntries.find((entry) => entry.id === selectedId) ?? null : null;
  const selected = selectedId !== null ? monsterForSet(lookups, activeSetId, selectedId) : null;
  const selectedNormal = selectedId !== null ? monsterForSet(lookups, 0, selectedId) : null;
  const selectedLibrary =
    selectedLibraryId !== null ? filteredLibrary.find((entry) => entry.id === selectedLibraryId) ?? null :
    filteredLibrary[0] ?? null;
  const selectedLibraryTemplate = selectedLibrary ? monsterLibraryEntryTemplate(selectedLibrary) : null;
  const selectedLibraryEntries = selectedLibraryIds
    .map((id) => libraryEntries.find((entry) => entry.id === id) ?? null)
    .filter((entry): entry is LibraryCatalog["entities"][number] => Boolean(entry));
  const multiSelectedLibraryEntries = selectedLibraryEntries.length > 1 ? selectedLibraryEntries : [];
  const selectedDescription = selectedId !== null ? project.monsterDescriptions.find((description) => description.id === selectedId)?.text ?? "" : "";
  const battleReferenceLookup = useMemo(
    () => measureCombatWork("MonsterWorkbench battleReferencesByMonster", () => battleReferencesByMonster(project)),
    [projectBattles]
  );
  const battleReferencesForId = (id: number) => battleReferenceLookup.get(Math.abs(id)) ?? [];
  const selectedBattleReferences = useMemo(
    () => selectedId !== null ? battleReferencesForId(selectedId) : [],
    [battleReferenceLookup, selectedId]
  );
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>, setId: MonsterSetId = activeSetId) => onApplyCommand?.({ kind: "updateMonsterRecord", label: `Update ${monsterSetLabel(setId)} monster`, id, changes, setId });
  const applyClearScenarioMonster = (monsterId: number, setId: MonsterSetId) => {
    onApplyCommand?.({
      kind: "clearMonsterRecord",
      label: `Clear ${monsterSetLabel(setId)} monster ${monsterId}`,
      id: monsterId,
      setId
    });
    setActivePreview("scenario");
    selectMonster(monsterId);
  };
  const clearScenarioMonster = (monster: MonsterRecord, setId: MonsterSetId) => {
    if (battleReferencesForId(monster.id).length > 0) {
      setPendingBattleRepair({ kind: "clear", monsterId: monster.id, setId });
      return;
    }
    applyClearScenarioMonster(monster.id, setId);
  };
  const applySwitchMonsterRecords = (fromId: number, toId: number, setId: MonsterSetId) => {
    onApplyCommand?.({ kind: "switchMonsterRecords", label: `Switch ${monsterSetLabel(setId)} monster ${fromId} with ${toId}`, setId, fromId, toId });
    selectMonster(toId);
  };
  const managedLibraryPath = catalog?.managedPath ?? "browser://workspace/library";
  const commitCatalog = (nextCatalog: LibraryCatalog, status: string) => onUpdateLibraryCatalog?.(nextCatalog, status);
  const selectScenarioMonster = (id: number) => {
    setActivePreview("scenario");
    setPopulateMenuOpen(false);
    selectMonster(id);
  };
  const selectLibraryMonster = (entry: LibraryCatalog["entities"][number], event?: MouseEvent<HTMLButtonElement>) => {
    setActivePreview("library");
    setPopulateMenuOpen(false);
    setSelectedLibraryId(entry.id);
    if (event?.shiftKey && libraryRangeAnchorId) {
      const anchorIndex = filteredLibrary.findIndex((candidate) => candidate.id === libraryRangeAnchorId);
      const targetIndex = filteredLibrary.findIndex((candidate) => candidate.id === entry.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        setSelectedLibraryIds(filteredLibrary.slice(start, end + 1).map((candidate) => candidate.id));
        return;
      }
    }
    if (event?.ctrlKey || event?.metaKey) {
      const exists = selectedLibraryIds.includes(entry.id);
      const nextIds = exists ? selectedLibraryIds.filter((id) => id !== entry.id) : [...selectedLibraryIds, entry.id];
      setSelectedLibraryIds(nextIds.length > 0 ? nextIds : [entry.id]);
      setLibraryRangeAnchorId(entry.id);
      if (exists && selectedLibraryId === entry.id && nextIds.length > 0) setSelectedLibraryId(nextIds[nextIds.length - 1]);
      return;
    }
    setSelectedLibraryIds([entry.id]);
    setLibraryRangeAnchorId(entry.id);
  };
  const clearLibraryMultiSelection = () => {
    setSelectedLibraryIds(selectedLibraryId ? [selectedLibraryId] : []);
    setLibraryRangeAnchorId(selectedLibraryId);
  };
  const applyMonsterCopyEntries = async (
    entries: MonsterLibraryCopyEntry[],
    label: string
  ) => {
    if (entries.length === 0) return;
    onApplyCommand?.({ kind: "createMonstersFromTemplates", label, entries });
    await materializeMonsterLibraryIconOverrides(entries, project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    const first = entries[0];
    setActiveSetId(first.setId ?? 0);
    setActivePreview("scenario");
    selectMonster(first.id);
  };
  const buildSequentialLibraryCopyEntries = (entries: LibraryCatalog["entities"][number][]) => {
    const used = new Set(monsterScenarioIds(project));
    const copies: MonsterLibraryCopyEntry[] = [];
    for (const entry of entries) {
      const preferred = preferredMonsterCopyId(project, entry);
      const id = preferred > 0 && !used.has(preferred)
        ? preferred
        : nextAvailableMonsterRecordId([...used].map((candidate) => ({ id: candidate })));
      if (!Number.isInteger(id) || id < 0) continue;
      used.add(id);
      copies.push({ entry, id, template: monsterRecordFromLibraryEntry(entry, id), description: scrapbookDescription(entry) });
    }
    return copies;
  };
  const buildStockLibraryCopyEntries = () => {
    const used = new Set(monsterScenarioIds(project));
    return libraryEntries
      .filter((entry) => !isProvidenceMonsterLibraryEntry(entry))
      .map((entry) => ({ entry, id: scrapbookIndex(entry) }))
      .filter(({ id }) => id > 0 && id <= MAX_DIVINITY_BATTLE_MONSTER_ID && !used.has(id))
      .map(({ entry, id }) => {
        used.add(id);
        return { entry, id, template: monsterRecordFromLibraryEntry(entry, id), description: scrapbookDescription(entry) };
      });
  };
  const copyLibraryEntriesToScenario = async (entries: LibraryCatalog["entities"][number][], label: string) => {
    await applyMonsterCopyEntries(buildSequentialLibraryCopyEntries(entries), label);
  };
  const populateStockMonsters = () => {
    setPopulateMenuOpen(false);
    void applyMonsterCopyEntries(buildStockLibraryCopyEntries(), "Copy stock monsters to scenario");
  };
  const populateVisibleLibrary = () => {
    setPopulateMenuOpen(false);
    void copyLibraryEntriesToScenario(filteredLibrary, "Copy visible library monsters to scenario");
  };
  const populateCustomLibrary = () => {
    setPopulateMenuOpen(false);
    void copyLibraryEntriesToScenario(libraryEntries.filter(isProvidenceMonsterLibraryEntry), "Copy custom library monsters to scenario");
  };
  const copyLibraryEntryToScenario = async (entry: LibraryCatalog["entities"][number], mode: "normal" | "all" | "generated" = "normal") => {
    const copyId = monsterCopyTargetId(project, entry);
    const template = monsterRecordFromLibraryEntry(entry, copyId);
    const description = scrapbookDescription(entry);
    if (mode === "all") {
      for (const option of MONSTER_SET_OPTIONS) {
        onApplyCommand?.({
          kind: "createMonsterFromTemplate",
          label: `Copy ${scrapbookName(entry)} to ${option.label} Monster ${copyId}`,
          id: copyId,
          template,
          description: option.id === 0 ? description : undefined,
          setId: option.id
        });
      }
      await materializeMonsterLibraryIconOverrides([{ entry, id: copyId, template, description, setId: 0 }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    } else {
      copyMonsterLibraryEntryToScenario(entry, copyId, onApplyCommand);
      await materializeMonsterLibraryIconOverrides([{ entry, id: copyId, template, description }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
      if (mode === "generated") {
        onApplyCommand?.({ kind: "generateMonsterVariants", label: `Generate variants for monster ${copyId}`, id: copyId });
      }
    }
    setActiveSetId(0);
    setActivePreview("scenario");
    selectMonster(copyId);
  };
  const replaceScenarioMonsterFromLibraryEntry = async (entry: LibraryCatalog["entities"][number], id: number) => {
    if (!Number.isInteger(id) || id < 0) return;
    const template = monsterRecordFromLibraryEntry(entry, id);
    const description = scrapbookDescription(entry);
    onApplyCommand?.({
      kind: "createMonsterFromTemplate",
      label: `Replace Scenario Monster ${id} from ${scrapbookName(entry)}`,
      id,
      template,
      description,
      setId: 0
    });
    await materializeMonsterLibraryIconOverrides([{ entry, id, template, description, setId: 0 }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    setActiveSetId(0);
    setActivePreview("scenario");
    selectMonster(id);
  };
  const copyLibraryEntryToLibrary = (entry: LibraryCatalog["entities"][number], variant = false) => {
    if (!onUpdateLibraryCatalog) return;
    const template = monsterRecordFromLibraryEntry(entry, preferredMonsterCopyId(project, entry));
    const label = variant ? `${scrapbookName(entry)} Variant` : scrapbookName(entry);
    const originKind = variant ? "library-variant" : isProvidenceMonsterLibraryEntry(entry) ? "library-variant" : "built-in-override";
    const { catalog: nextCatalog, entity } = createMonsterLibraryEntry(catalog, managedLibraryPath, { ...template, displayName: label }, scrapbookDescription(entry), {
      label,
      origin: {
        kind: originKind,
        sourceId: entry.id,
        sourceLabel: scrapbookName(entry)
      },
      preferredScenarioMonsterId: preferredMonsterCopyId(project, entry)
    });
    commitCatalog(nextCatalog, `Copied ${scrapbookName(entry)} to Monster Library`);
    setActivePreview("library");
    setSelectedLibraryId(entity.id);
  };
  const copyScenarioMonsterToLibrary = (monster: MonsterRecord) => {
    if (!onUpdateLibraryCatalog) return;
    const description = project.monsterDescriptions.find((candidate) => candidate.id === monster.id)?.text ?? "";
    const label = monster.displayName?.trim() || `Monster ${monster.id}`;
    const { catalog: nextCatalog, entity } = createMonsterLibraryEntry(catalog, managedLibraryPath, monster, description, {
      label,
      origin: { kind: "scenario-monster", sourceId: `monster:${monster.id}`, sourceLabel: label },
      preferredScenarioMonsterId: monster.id
    });
    commitCatalog(nextCatalog, `Copied ${label} to Monster Library`);
    setActivePreview("library");
    setSelectedLibraryId(entity.id);
  };
  const updateLibraryMonster = (entry: LibraryCatalog["entities"][number], changes: Partial<MonsterRecord>, description?: string) => {
    if (!catalog || !isProvidenceMonsterLibraryEntry(entry)) return;
    const nextCatalog = updateMonsterLibraryEntry(catalog, entry.id, changes, description);
    commitCatalog(nextCatalog, `Updated ${entry.label}`);
  };
  const duplicateLibraryMonster = (entry: LibraryCatalog["entities"][number]) => {
    if (!catalog) {
      copyLibraryEntryToLibrary(entry, true);
      return;
    }
    const result = isProvidenceMonsterLibraryEntry(entry)
      ? duplicateMonsterLibraryEntry(catalog, entry.id)
      : createMonsterLibraryEntry(catalog, managedLibraryPath, monsterRecordFromLibraryEntry(entry, preferredMonsterCopyId(project, entry)), scrapbookDescription(entry), {
        label: `${scrapbookName(entry)} Variant`,
        origin: { kind: "library-variant", sourceId: entry.id, sourceLabel: scrapbookName(entry) },
        preferredScenarioMonsterId: preferredMonsterCopyId(project, entry)
      });
    if (result.entity) {
      commitCatalog(result.catalog, `Created ${result.entity.label}`);
      setActivePreview("library");
      setSelectedLibraryId(result.entity.id);
    }
  };
  const deleteLibraryMonster = (entry: LibraryCatalog["entities"][number]) => {
    if (!catalog || !isProvidenceMonsterLibraryEntry(entry)) return;
    const nextCatalog = deleteMonsterLibraryEntry(catalog, entry.id);
    commitCatalog(nextCatalog, `Deleted ${entry.label}`);
    setSelectedLibraryId(null);
  };
  const startLibraryDrag = (entry: LibraryCatalog["entities"][number], event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(MONSTER_LIBRARY_DRAG_MIME, entry.id);
    event.dataTransfer.setData("text/plain", `${scrapbookIndex(entry)} ${scrapbookName(entry)}`);
  };
  const startScenarioDrag = (monster: MonsterRecord, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(SCENARIO_MONSTER_DRAG_MIME, String(monster.id));
    event.dataTransfer.setData("text/plain", `${monster.id} ${monster.displayName}`);
  };
  const allowScenarioDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(MONSTER_LIBRARY_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setScenarioDropActive(true);
  };
  const leaveScenarioDrop = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setScenarioDropActive(false);
  };
  const dropLibraryMonsterToScenario = (event: DragEvent<HTMLElement>) => {
    const entryId = event.dataTransfer.getData(MONSTER_LIBRARY_DRAG_MIME);
    const entry = libraryEntries.find((candidate) => candidate.id === entryId);
    setScenarioDropActive(false);
    if (!entry) return;
    event.preventDefault();
    void copyLibraryEntryToScenario(entry);
  };
  const allowLibraryDrop = (event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer.types);
    if (!types.includes(MONSTER_LIBRARY_DRAG_MIME) && !types.includes(SCENARIO_MONSTER_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setLibraryDropActive(true);
  };
  const leaveLibraryDrop = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setLibraryDropActive(false);
  };
  const dropMonsterToLibrary = (event: DragEvent<HTMLElement>) => {
    setLibraryDropActive(false);
    const scenarioId = Number(event.dataTransfer.getData(SCENARIO_MONSTER_DRAG_MIME));
    if (Number.isInteger(scenarioId)) {
      const monster =
        monsterForSet(lookups, activeSetId, scenarioId)
        ?? monsterForSet(lookups, 0, scenarioId)
        ?? monsterForSet(lookups, 1, scenarioId)
        ?? monsterForSet(lookups, -1, scenarioId);
      if (monster) {
        event.preventDefault();
        copyScenarioMonsterToLibrary(monster);
        return;
      }
    }
    const entryId = event.dataTransfer.getData(MONSTER_LIBRARY_DRAG_MIME);
    const entry = libraryEntries.find((candidate) => candidate.id === entryId);
    if (entry) {
      event.preventDefault();
      duplicateLibraryMonster(entry);
    }
  };
  const activeSetIds = useMemo(
    () => new Set(authorFacingMonsterRecordsForSet(project, activeSetId).map((monster) => monster.id)),
    [activeSetId, project.battles, project.monsters, project.monsterSets]
  );
  const authorFacingIdSet = useMemo(() => new Set(scenarioIds), [scenarioIds]);
  const normalVariantSourceIds = useMemo(
    () => (project.monsters ?? [])
      .filter((monster) => monster.id > 0 && monster.hitDice !== 255 && authorFacingIdSet.has(monster.id) && !isBlankMonsterSlot(monster))
      .map((monster) => monster.id)
      .sort((left, right) => left - right),
    [authorFacingIdSet, project.monsters]
  );
  const replaceScenarioId = selectedId !== null && scenarioEntries.some((entry) => entry.id === selectedId) ? selectedId : null;
  const selectedSetTools = selectedId !== null ? (
    <MonsterSetToolbar
      activeSetId={activeSetId}
      selectedId={selectedId}
      selectedRecord={selected}
      normalRecord={selectedNormal}
      availableIds={activeSetIds}
      battleReferenceCount={selectedBattleReferences.length}
      generateAllCount={normalVariantSourceIds.length}
      onSetIdChange={setActiveSetId}
      onToggleNotOnMenu={(notOnMenu) => {
        if (selectedId === null || !selectedNormal) return;
        update(selectedId, { notOnMenu }, 0);
      }}
      onCreateFromNormal={() => {
        if (selectedId === null || activeSetId === 0) return;
        onApplyCommand?.({ kind: "createMonsterVariantFromNormal", label: `Create ${monsterSetLabel(activeSetId)} monster ${selectedId} from Normal`, id: selectedId, setId: activeSetId });
      }}
      onCopyToAll={() => {
        if (selectedId === null || !selected) return;
        onApplyCommand?.({ kind: "copyCurrentMonsterToAllSets", label: `Copy ${monsterSetLabel(activeSetId)} monster ${selectedId} to all sets`, id: selectedId, sourceSetId: activeSetId });
      }}
      onGenerate={() => {
        if (selectedId === null || !selectedNormal) return;
        onApplyCommand?.({ kind: "generateMonsterVariants", label: `Generate monster variants for ${selectedId}`, id: selectedId });
      }}
      onGenerateAll={() => {
        if (normalVariantSourceIds.length === 0) return;
        onApplyCommand?.({ kind: "generateMonsterVariantsForAll", label: `Generate variants for ${normalVariantSourceIds.length} scenario monsters`, ids: normalVariantSourceIds });
      }}
      onSwitch={(toId) => {
        if (selectedId === null) return;
        const affected = [
          ...battleReferencesForId(selectedId),
          ...battleReferencesForId(toId)
        ];
        if (affected.length > 0) {
          setPendingBattleRepair({ kind: "switch", fromId: selectedId, toId, setId: activeSetId });
          return;
        }
        applySwitchMonsterRecords(selectedId, toId, activeSetId);
      }}
    />
  ) : null;
  const pendingRepairReferences = useMemo(() => {
    if (!pendingBattleRepair) return [];
    if (pendingBattleRepair.kind === "clear") return battleReferencesForId(pendingBattleRepair.monsterId);
    return [
      ...battleReferencesForId(pendingBattleRepair.fromId),
      ...battleReferencesForId(pendingBattleRepair.toId)
    ];
  }, [battleReferenceLookup, pendingBattleRepair]);
  const repairReplacements = useMemo(
    () => battleReferenceReplacementCandidates(scenarioEntries, pendingBattleRepair?.kind === "clear" ? pendingBattleRepair.monsterId : 0),
    [pendingBattleRepair, scenarioEntries]
  );
  const closeBattleRepair = () => setPendingBattleRepair(null);
  const applyClearRepair = (mode: "keep" | "clear" | "replace", replacementId = 0) => {
    if (!pendingBattleRepair || pendingBattleRepair.kind !== "clear") return;
    const { monsterId, setId } = pendingBattleRepair;
    if (mode === "clear") {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Clear battle placements for monster ${monsterId}`, rewrite: { mode: "clear", monsterId } });
    } else if (mode === "replace" && replacementId > 0) {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Replace battle monster ${monsterId} with ${replacementId}`, rewrite: { mode: "replace", fromId: monsterId, toId: replacementId } });
    }
    applyClearScenarioMonster(monsterId, setId);
    closeBattleRepair();
  };
  const applySwitchRepair = (swapBattleCells: boolean) => {
    if (!pendingBattleRepair || pendingBattleRepair.kind !== "switch") return;
    const { fromId, toId, setId } = pendingBattleRepair;
    applySwitchMonsterRecords(fromId, toId, setId);
    if (swapBattleCells) {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Swap battle monster IDs ${fromId} and ${toId}`, rewrite: { mode: "swap", fromId, toId } });
    }
    closeBattleRepair();
  };

  return (
    <>
    <div className="combat-record-layout monster-combined-layout">
      <div className="monster-source-lists">
        <MonsterLibraryList
          entries={filteredLibrary}
          query={libraryQuery}
          scope={libraryScope} scopeCounts={libraryScopeCounts}
          selectedId={selectedLibrary?.id ?? null}
          selectedIds={selectedLibraryIds}
          selectionActive={activePreview === "library"}
          populateMenuOpen={populateMenuOpen}
          dropActive={libraryDropActive}
          hasCustomEntries={libraryEntries.some(isProvidenceMonsterLibraryEntry)}
          onQuery={setLibraryQuery} onScopeChange={setLibraryScope}
          onTogglePopulateMenu={() => setPopulateMenuOpen((open) => !open)}
          onPopulateStock={populateStockMonsters}
          onPopulateVisible={populateVisibleLibrary}
          onPopulateCustom={populateCustomLibrary}
          onSelect={selectLibraryMonster}
          onDragStart={startLibraryDrag}
          onDragEnd={() => {
            setScenarioDropActive(false);
            setLibraryDropActive(false);
          }}
          onDragOver={allowLibraryDrop}
          onDragEnter={allowLibraryDrop}
          onDragLeave={leaveLibraryDrop}
          onDrop={dropMonsterToLibrary}
          isCustom={isProvidenceMonsterLibraryEntry}
          entryName={scrapbookName}
          entryFacts={scrapbookFacts}
          renderIcon={(entry) => (
            <MonsterLibraryIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
          )}
        />

        <ScenarioMonsterList
          entries={filtered}
          query={query}
          activeSetId={activeSetId}
          selectedId={selectedId}
          selectionActive={activePreview === "scenario"}
          nextMonsterId={nextMonsterId}
          dropActive={scenarioDropActive}
          iconEntries={iconEntries}
          project={project}
          lookups={lookups}
          previewContext={previewContext}
          onQuery={setQuery}
          onCreate={() => {
            onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: nextMonsterId });
            selectScenarioMonster(nextMonsterId);
          }}
          onSelect={selectScenarioMonster}
          onDragStart={startScenarioDrag}
          onDragEnd={() => setLibraryDropActive(false)}
          onDragOver={allowScenarioDrop}
          onDragEnter={allowScenarioDrop}
          onDragLeave={leaveScenarioDrop}
          onDrop={dropLibraryMonsterToScenario}
        />
      </div>

      {activePreview === "library" && multiSelectedLibraryEntries.length > 1 ? (
        <MonsterLibraryMultiSelection
          entries={multiSelectedLibraryEntries}
          project={project}
          onCopy={() => void copyLibraryEntriesToScenario(multiSelectedLibraryEntries, `Copy ${multiSelectedLibraryEntries.length} selected library monsters to scenario`)}
          onClear={clearLibraryMultiSelection}
        />
      ) : activePreview === "library" && selectedLibrary && selectedLibraryTemplate ? (
        <MonsterRecordEditor
          project={project}
          catalog={catalog}
          monster={selectedLibraryTemplate}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          description={monsterLibraryEntryDescription(selectedLibrary)}
          headerMeta={<MonsterLibraryOwnershipBadge custom />}
          duplicateLabel="New Variant"
          clearLabel={monsterLibraryOrigin(selectedLibrary).kind === "built-in-override" ? "Restore Scrapbook Default" : "Delete Library Entry"}
          onUpdate={(changes) => updateLibraryMonster(selectedLibrary, changes)}
          onUpdateDescription={(text) => updateLibraryMonster(selectedLibrary, {}, text)}
          onReplaceScenario={replaceScenarioId !== null ? () => void replaceScenarioMonsterFromLibraryEntry(selectedLibrary, replaceScenarioId) : undefined}
          replaceLabel={replaceScenarioId !== null ? `Replace Scenario ${replaceScenarioId}` : undefined}
          onDuplicate={() => duplicateLibraryMonster(selectedLibrary)}
          onClear={() => deleteLibraryMonster(selectedLibrary)}
        />
      ) : activePreview === "library" && selectedLibrary ? (
        <MonsterLibraryPreview
          entry={selectedLibrary}
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          copyId={monsterCopyTargetId(project, selectedLibrary)}
          onCopy={() => void copyLibraryEntryToScenario(selectedLibrary)}
          onCopyAll={() => void copyLibraryEntryToScenario(selectedLibrary, "all")}
          onCopyGenerated={() => void copyLibraryEntryToScenario(selectedLibrary, "generated")}
          onReplaceScenario={replaceScenarioId !== null ? () => void replaceScenarioMonsterFromLibraryEntry(selectedLibrary, replaceScenarioId) : undefined}
          replaceId={replaceScenarioId}
          onCustomize={() => copyLibraryEntryToLibrary(selectedLibrary)}
          onCopyVariant={() => copyLibraryEntryToLibrary(selectedLibrary, true)}
        />
      ) : selected ? (
        <MonsterRecordEditor
          project={project}
          catalog={catalog}
          monster={selected}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          description={selectedDescription}
          headerMeta={selectedSetTools}
          onUpdate={(changes) => update(selected.id, changes, activeSetId)}
          onUpdateDescription={(text) => onApplyCommand?.({ kind: "upsertMonsterDescription", label: `Update monster ${selected.id} description`, id: selected.id, text })}
          onCopyToLibrary={() => copyScenarioMonsterToLibrary(selected)}
          onOpenIconSet={onSelectIconSetTab}
          onDuplicate={() => {
            const id = nextMonsterId;
            update(id, { ...selected, id, displayName: `${selected.displayName || `Monster ${selected.id}`} Copy` }, activeSetId);
            selectMonster(id);
          }}
          clearLabel="Clear Selection"
          onClear={() => clearScenarioMonster(selected, activeSetId)}
        />
      ) : activePreview === "scenario" && selectedId !== null ? (
        <MissingMonsterSetEditor
          id={selectedId}
          setId={activeSetId}
          normalRecord={selectedNormal}
          headerMeta={selectedSetTools}
          onCreate={() => {
            if (activeSetId === 0) return;
            onApplyCommand?.({ kind: "createMonsterVariantFromNormal", label: `Create ${monsterSetLabel(activeSetId)} monster ${selectedId} from Normal`, id: selectedId, setId: activeSetId });
          }}
        />
      ) : (
        <EmptyCombatEditor title="No monster selected" body="Create a scenario monster, select a scenario monster to edit, or select a Monster Library entry to preview and copy." />
      )}
    </div>
    {pendingBattleRepair ? (
      <BattleReferenceRepairDialog
        action={pendingBattleRepair}
        references={pendingRepairReferences}
        replacements={repairReplacements}
        onCancel={closeBattleRepair}
        onClearOnly={() => applyClearRepair("keep")}
        onClearPlacements={() => applyClearRepair("clear")}
        onReplacePlacements={(replacementId) => applyClearRepair("replace", replacementId)}
        onSwitchRecordsOnly={() => applySwitchRepair(false)}
        onSwitchAndSwapCells={() => applySwitchRepair(true)}
      />
    ) : null}
    </>
  );
}

function EmptyCombatEditor({ title, body }: { title: string; body: string }) {
  return (
    <article className="combat-editor empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}


function filterRecords<T>(records: T[], query: string, text: (record: T) => string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => text(record).toLowerCase().includes(needle));
}


function idFromEntity(entityId: string, prefix: string) {
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

function monsterScenarioIds(project: Project) {
  return allMonsterScenarioIds(project);
}

function monstersForSet(lookups: CombatLookups, setId: MonsterSetId) {
  return lookups.monsterSetsById.get(setId) ?? [];
}

function monsterMapForSet(lookups: CombatLookups, setId: MonsterSetId) {
  return lookups.monsterBySetAndId.get(setId) ?? new Map<number, MonsterRecord>();
}

function monsterForSet(lookups: CombatLookups, setId: MonsterSetId, id: number) {
  return monsterMapForSet(lookups, setId).get(id) ?? null;
}
