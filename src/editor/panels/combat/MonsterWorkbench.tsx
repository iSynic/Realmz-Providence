import { DragEvent, MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { browserReferenceIconUrl } from "../../browser/atlasPaths";
import { TutorialTip } from "../../components/TutorialTip";
import { itemReferenceOptions } from "../../itemReferences";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import { isActorOrCreatureIconId } from "../../resourceResolver";
import type { LibraryCatalog, IconEntry, MonsterIconOverride, MonsterRecord, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../../types";
import { battleReferencesByMonster, type BattleMonsterReference } from "../../battleReferences";
import { allMonsterScenarioIds, authorFacingMonsterRecordsForSet, authorFacingMonsterScenarioIds, isZeroBlankMonsterSlot } from "../../monsterRecords";
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
import { ScrollArea } from "../../ui";
import { selectEntityFromId } from "../../utils";
import {
  MONSTER_SET_OPTIONS,
  type CombatLookups
} from "./combatLookups";
import {
  monsterIconSourcePairs,
  normalizedMonsterIconBaseId,
  resolveMonsterIconTargetPair
} from "./iconSetModel";
import { measureCombatWork, useCombatRenderTiming } from "./performance";
import { MAX_DIVINITY_BATTLE_MONSTER_ID } from "./BattleBoard";
import { FieldLabel } from "./CombatFields";
import { loadLibraryResourceBase64 } from "./IconPairResources";
import { MonsterLibraryList } from "./MonsterLibraryList";
import { MONSTER_MONEY_HELP, MONSTER_MONEY_LABELS, MONSTER_MONEY_REWARDS } from "./monsterMoneyModel";
import { MonsterRecordEditor } from "./MonsterRecordEditor";
import { combatSpellOptions, spellPreviewIconIdMap } from "./monsterReferenceOptions";
import { ReferenceIconPreview } from "./ReferenceIconPreview";
import { ScenarioMonsterList, type ScenarioMonsterListEntry } from "./ScenarioMonsterList";

export { monsterRequiredWeaponDisplayCode, monsterRequiredWeaponStoredCode } from "./MonsterRecordEditor";


type MonsterLibraryCopyEntry = {
  entry: LibraryCatalog["entities"][number];
  id: number;
  template: MonsterRecord;
  description?: string;
  setId?: MonsterSetId;
};

type PendingBattleReferenceRepair =
  | { kind: "clear"; monsterId: number; setId: MonsterSetId }
  | { kind: "switch"; fromId: number; toId: number; setId: MonsterSetId };

const MONSTER_VARIANT_SCALE: Record<Exclude<MonsterSetId, 0>, {
  hitDice: number;
  staminaBonus: number;
  agility: number;
  movementMax: number;
  armor: number;
  magicResistance: number;
  damageBonus: number;
  saves: number;
  spellPointsNumerator: number;
  spellPointsDenominator: number;
  expNumerator: number;
  expDenominator: number;
}> = {
  1: { hitDice: 6, staminaBonus: 6, agility: 1, movementMax: 2, armor: 10, magicResistance: 10, damageBonus: 2, saves: 10, spellPointsNumerator: 133, spellPointsDenominator: 100, expNumerator: 5, expDenominator: 4 },
  [-1]: { hitDice: 15, staminaBonus: 15, agility: 3, movementMax: 4, armor: 30, magicResistance: 25, damageBonus: 5, saves: 25, spellPointsNumerator: 2, spellPointsDenominator: 1, expNumerator: 25, expDenominator: 16 }
};


const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const SCRAPBOOK_HELP = "Monster Library combines protected built-in Realmz scrapbook templates with editable Providence entries. Copy entries into Scenario Monsters before using them in runtime battles.";
const MONSTER_LIBRARY_DRAG_MIME = "application/x-realmz-monster-library-id";
const SCENARIO_MONSTER_DRAG_MIME = "application/x-realmz-scenario-monster-id";
const MONSTER_RECORD_BYTES = 210;
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
  const filteredLibrary = useMemo(
    () => filterRecords(libraryEntries, libraryQuery, scrapbookSearchText),
    [libraryEntries, libraryQuery]
  );
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
  const repairReplacementIds = useMemo(
    () => scenarioIds.filter((id) => id > 0 && id !== (pendingBattleRepair?.kind === "clear" ? pendingBattleRepair.monsterId : 0)),
    [pendingBattleRepair, scenarioIds]
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
          selectedId={selectedLibrary?.id ?? null}
          selectedIds={selectedLibraryIds}
          selectionActive={activePreview === "library"}
          populateMenuOpen={populateMenuOpen}
          dropActive={libraryDropActive}
          hasCustomEntries={libraryEntries.some(isProvidenceMonsterLibraryEntry)}
          onQuery={setLibraryQuery}
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
            <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
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
        <ScrapbookMonsterPreview
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
        replacementIds={repairReplacementIds}
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

function BattleReferenceRepairDialog({
  action,
  references,
  replacementIds,
  onCancel,
  onClearOnly,
  onClearPlacements,
  onReplacePlacements,
  onSwitchRecordsOnly,
  onSwitchAndSwapCells
}: {
  action: PendingBattleReferenceRepair;
  references: BattleMonsterReference[];
  replacementIds: number[];
  onCancel: () => void;
  onClearOnly: () => void;
  onClearPlacements: () => void;
  onReplacePlacements: (replacementId: number) => void;
  onSwitchRecordsOnly: () => void;
  onSwitchAndSwapCells: () => void;
}) {
  const [replacementId, setReplacementId] = useState(replacementIds[0] ?? 0);
  const battleCount = new Set(references.map((reference) => reference.battleId)).size;
  const referenceSummary = references.slice(0, 8);
  return (
    <div className="battle-reference-repair-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="battle-reference-repair-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Battle reference repair"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>Battle References</strong>
          <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label="Close battle reference repair" onClick={onCancel}>
            <X size={14} />
          </button>
        </header>
        <p>
          {references.length} placed battle cell{references.length === 1 ? "" : "s"} across {battleCount} battle{battleCount === 1 ? "" : "s"} reference {action.kind === "clear" ? `monster ${action.monsterId}` : `monster ${action.fromId} or ${action.toId}`}.
          Data BD stores raw monster IDs shared by Normal, Monster, and Mega sets.
        </p>
        <div className="battle-reference-repair-list">
          {referenceSummary.map((reference) => (
            <small key={`${reference.battleId}:${reference.slot}`}>
              Battle {reference.battleId}, cell {reference.col}, {reference.row}
              {reference.forcedFriendly ? " | Force Friends" : ""}
            </small>
          ))}
          {references.length > referenceSummary.length ? <small>+{references.length - referenceSummary.length} more placement{references.length - referenceSummary.length === 1 ? "" : "s"}</small> : null}
        </div>
        {action.kind === "clear" ? (
          <>
            <label className="combat-field battle-reference-replacement">
              <span>Replace With</span>
              <select value={String(replacementId)} onChange={(event) => setReplacementId(Number(event.currentTarget.value))}>
                {replacementIds.map((id) => (
                  <option key={id} value={id}>Monster {id}</option>
                ))}
              </select>
            </label>
            <div className="battle-reference-repair-actions">
              <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn btn-danger btn-xs" onClick={onClearPlacements}>Clear Battle Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" disabled={!replacementId} onClick={() => onReplacePlacements(replacementId)}>Replace Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={onClearOnly}>Clear Monster Only</button>
            </div>
          </>
        ) : (
          <div className="battle-reference-repair-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onSwitchRecordsOnly}>Switch Records Only</button>
            <button type="button" className="btn btn-primary btn-xs" onClick={onSwitchAndSwapCells}>Also Swap Battle Cell IDs</button>
          </div>
        )}
      </section>
    </div>
  );
}

function MonsterLibraryMultiSelection({
  entries,
  project,
  onCopy,
  onClear
}: {
  entries: LibraryCatalog["entities"][number][];
  project: Project;
  onCopy: () => void;
  onClear: () => void;
}) {
  const used = new Set(monsterScenarioIds(project));
  const plans = entries.map((entry) => {
    const preferred = preferredMonsterCopyId(project, entry);
    const occupied = preferred > 0 && used.has(preferred);
    const id = preferred > 0 && !occupied
      ? preferred
      : nextAvailableMonsterRecordId([...used].map((candidate) => ({ id: candidate })));
    used.add(id);
    return { entry, id, occupied };
  });
  return (
    <section className="combat-editor monster-multi-selection">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">Selected Monsters</span>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-primary btn-xs" onClick={onCopy}>Copy Selected To Scenario</button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClear}>Clear Selection</button>
        </div>
      </header>
      <p className="empty-copy compact">{entries.length} monster library entries selected. Copying uses preferred IDs when empty, then the next open scenario monster slot.</p>
      <div className="monster-selection-list">
        {plans.map(({ entry, id, occupied }) => (
          <div key={entry.id} className="monster-selection-row">
            <span>
              <strong>{scrapbookName(entry)}</strong>
              <small>{isProvidenceMonsterLibraryEntry(entry) ? "Providence library" : "Built-in"} | {scrapbookFacts(entry)}</small>
            </span>
            <span className={occupied ? "copy-target shifted" : "copy-target"}>
              Monster {id}
              {occupied ? <small>preferred occupied</small> : <small>preferred slot</small>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonsterSetToolbar({
  activeSetId,
  selectedId,
  selectedRecord,
  normalRecord,
  availableIds,
  battleReferenceCount,
  generateAllCount,
  onSetIdChange,
  onToggleNotOnMenu,
  onCreateFromNormal,
  onCopyToAll,
  onGenerate,
  onGenerateAll,
  onSwitch
}: {
  activeSetId: MonsterSetId;
  selectedId: number;
  selectedRecord: MonsterRecord | null;
  normalRecord: MonsterRecord | null;
  availableIds: Set<number>;
  battleReferenceCount: number;
  generateAllCount: number;
  onSetIdChange: (setId: MonsterSetId) => void;
  onToggleNotOnMenu: (notOnMenu: boolean) => void;
  onCreateFromNormal: () => void;
  onCopyToAll: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
  onSwitch: (toId: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [generatePreviewOpen, setGeneratePreviewOpen] = useState(false);
  const [generateAllPreviewOpen, setGenerateAllPreviewOpen] = useState(false);
  const targetId = Number(draft);
  const canSwitch = Number.isInteger(targetId) && targetId >= 0 && targetId !== selectedId && availableIds.has(targetId);
  const generateRows = normalRecord ? monsterGeneratePreviewRows(normalRecord) : [];
  const statusText = monsterSetToolbarStatus(activeSetId, selectedRecord);
  useEffect(() => {
    setDraft("");
    setGeneratePreviewOpen(false);
    setGenerateAllPreviewOpen(false);
  }, [activeSetId, selectedId]);
  return (
    <div className="monster-set-toolbar">
      <div className="monster-set-primary-row">
        <div
          className="monster-set-segmented"
          role="group"
          aria-label="Monster Set"
          title="Normal = Data MD, Monster = Data MD1, Mega = Data MD-1"
        >
          {MONSTER_SET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`combat-toggle${activeSetId === option.id ? " active" : ""}`}
              onClick={() => onSetIdChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="combat-check-field monster-bestiary-check">
          <FieldLabel label="Hide From Bestiary" help="Realmz rebuilds the player bestiary from Normal/Data MD only. Battles still place this scenario monster by Data BD monster ID." />
          <input
            type="checkbox"
            checked={Boolean(normalRecord?.notOnMenu)}
            disabled={!normalRecord}
            onChange={(event) => onToggleNotOnMenu(event.currentTarget.checked)}
          />
        </label>
      </div>
      {battleReferenceCount > 0 ? (
        <small className="monster-battle-reference-note">Used in {battleReferenceCount} battle placement{battleReferenceCount === 1 ? "" : "s"}</small>
      ) : null}
      {statusText ? <small className="monster-set-status">{statusText}</small> : null}
      <div className="monster-set-actions">
        {activeSetId !== 0 && !selectedRecord && normalRecord ? (
          <button type="button" className="btn btn-primary btn-xs" onClick={onCreateFromNormal}>Create From Normal</button>
        ) : null}
        {selectedRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToAll}>Copy To All Sets</button> : null}
        {normalRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => setGeneratePreviewOpen((open) => !open)}>Generate Variants</button> : null}
        <button type="button" className="btn btn-secondary btn-xs" disabled={generateAllCount === 0} onClick={() => setGenerateAllPreviewOpen((open) => !open)}>Generate Variants For All</button>
        <label className="monster-switch-with">
          <span>Switch With</span>
          <input type="number" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
          <button type="button" className="btn btn-secondary btn-xs" disabled={!canSwitch} onClick={() => canSwitch && onSwitch(targetId)}>
            Switch
          </button>
        </label>
      </div>
      {generatePreviewOpen ? (
        <div className="monster-generate-preview">
          <small>
            This replaces Monster and Mega variants for ID {selectedId}. Semantic fields stay copied from Normal; Providence scales strength fields and clamps values instead of emulating Divinity overflow.
          </small>
          <div className="monster-generate-preview-table" role="table" aria-label="Generate variant field preview">
            <div role="row" className="monster-generate-preview-row head">
              <span role="columnheader">Field</span>
              <span role="columnheader">Normal</span>
              <span role="columnheader">Monster</span>
              <span role="columnheader">Mega</span>
            </div>
            {generateRows.map((row) => (
              <div role="row" className="monster-generate-preview-row" key={row.label}>
                <span role="cell">{row.label}</span>
                <span role="cell">{row.normal}</span>
                <span role="cell" className={row.monsterChanged ? "changed" : ""}>{row.monster}</span>
                <span role="cell" className={row.megaChanged ? "changed" : ""}>{row.mega}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-xs" onClick={onGenerate}>Apply Generate Variants</button>
        </div>
      ) : null}
      {generateAllPreviewOpen ? (
        <div className="monster-generate-preview">
          <small>
            This replaces Monster and Mega variants for {generateAllCount} active Normal scenario monster{generateAllCount === 1 ? "" : "s"}. Blank Normal slots are skipped.
          </small>
          <button type="button" className="btn btn-primary btn-xs" disabled={generateAllCount === 0} onClick={onGenerateAll}>Apply Generate Variants For All</button>
        </div>
      ) : null}
    </div>
  );
}

function monsterSetToolbarStatus(setId: MonsterSetId, selectedRecord: MonsterRecord | null) {
  if (!selectedRecord) return `${monsterSetFile(setId)} missing`;
  if (isBlankMonsterSlot(selectedRecord)) return `${monsterSetFile(setId)} blank`;
  return "";
}

function isBlankMonsterSlot(record: MonsterRecord) {
  return isZeroBlankMonsterSlot(record);
}

function MissingMonsterSetEditor({
  id,
  setId,
  normalRecord,
  headerMeta,
  onCreate
}: {
  id: number;
  setId: MonsterSetId;
  normalRecord: MonsterRecord | null;
  headerMeta?: ReactNode;
  onCreate: () => void;
}) {
  return (
    <article className="combat-editor monster-editor scenario-monster-editor missing-monster-set-editor">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">{monsterSetLabel(setId)} Monster {id}</span>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
      </header>
      <section className="monster-section">
        <header><strong>Missing {monsterSetLabel(setId)} Variant</strong><small>{monsterSetFile(setId)} has no record for monster ID {id}.</small></header>
        {setId === 0 ? (
          <p className="empty-copy compact">Create or copy a Normal scenario monster before editing this runtime ID.</p>
        ) : normalRecord ? (
          <div className="empty-copy compact">
            <p>This set can be created from Normal Monster {id}. Descriptions remain shared by monster ID across all monster sets.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>Create {monsterSetLabel(setId)} From Normal</button>
          </div>
        ) : (
          <p className="empty-copy compact">Normal Monster {id} is also missing, so Providence cannot seed this variant safely.</p>
        )}
      </section>
    </article>
  );
}

function ScrapbookMonsterPreview({
  entry,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  copyId,
  onCopy,
  onCopyAll,
  onCopyGenerated,
  onReplaceScenario,
  replaceId,
  onCustomize,
  onCopyVariant
}: {
  entry: LibraryCatalog["entities"][number];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  copyId: number;
  onCopy: () => void;
  onCopyAll?: () => void;
  onCopyGenerated?: () => void;
  onReplaceScenario?: () => void;
  replaceId?: number | null;
  onCustomize?: () => void;
  onCopyVariant?: () => void;
}) {
  const description = scrapbookDescription(entry);
  return (
    <article className="combat-editor monster-editor scrapbook-monster-preview">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">{scrapbookName(entry)}</span>
        <div className="combat-editor-actions">
          {onCustomize ? (
            <button type="button" className="btn btn-secondary btn-xs" title="Create an editable override for this protected built-in template" onClick={onCustomize}>
              Customize
            </button>
          ) : null}
          {onCopyVariant ? (
            <button type="button" className="btn btn-secondary btn-xs" title="Create an editable Providence library variant" onClick={onCopyVariant}>
              Copy To Library Variant
            </button>
          ) : null}
          <button type="button" className="btn btn-primary btn-xs" title={`Copy to Scenario Monster ${copyId}`} onClick={onCopy}>
            Copy To Scenario
          </button>
          {onReplaceScenario && replaceId != null ? (
            <button type="button" className="btn btn-danger btn-xs" title={`Explicitly replace occupied Scenario Monster ${replaceId}`} onClick={onReplaceScenario}>
              Replace Scenario {replaceId}
            </button>
          ) : null}
          {onCopyAll ? <button type="button" className="btn btn-primary btn-xs" title="Copy exact records to Normal, Monster, and Mega scenario sets" onClick={onCopyAll}>Copy To All Sets</button> : null}
          {onCopyGenerated ? <button type="button" className="btn btn-primary btn-xs" title="Copy Normal, then generate Monster and Mega variants with Providence scaling" onClick={onCopyGenerated}>Copy And Generate Variants</button> : null}
        </div>
      </header>
      <section className="scrapbook-summary scrapbook-description-summary">
        <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} />
        <div className="scrapbook-description-card">
          <header><strong>Description</strong><small>Copied to Data DES when this built-in monster is copied.</small></header>
          <p className="scrapbook-description">{description || "No description."}</p>
        </div>
      </section>
      <div className="scrapbook-stat-attack-row">
        <section className="monster-section scrapbook-stat-section">
          <header><strong>Stats</strong><small>Read-only preview.</small></header>
          <div className="scrapbook-stat-grid">
            <ScrapbookFact label="Hit Dice" value={summaryNumber(entry, "hitDice")} />
            <ScrapbookFact label="Armor" value={summaryNumber(entry, "armor")} />
            <ScrapbookFact label="Agility" value={summaryNumber(entry, "agility")} />
            <ScrapbookFact label="Movement" value={summaryNumber(entry, "movementMax")} />
            <ScrapbookFact label="Attacks" value={summaryNumber(entry, "attackCount")} />
            <ScrapbookFact label="Magic Attacks" value={summaryNumber(entry, "magicAttackCount")} />
            <ScrapbookFact label="Spell Points" value={summaryNumber(entry, "spellPoints")} />
            <ScrapbookFact label="Experience" value={summaryNumber(entry, "exp")} />
          </div>
        </section>
        <section className="monster-section scrapbook-attack-section">
          <header><strong>Attacks</strong><small>Read-only Realmz monster rows.</small></header>
          <div className="scrapbook-attack-table">
            <div className="scrapbook-attack-table-head">
              <span>Attack</span>
              <span>Damage</span>
              <span>Form</span>
              <span>Special</span>
            </div>
            {summaryNumberRows(entry, "attacks").map((attack, index) => (
              <div key={index} className="scrapbook-attack-table-row">
                <strong>Attack {index + 1}</strong>
                <span>{attack[0] ?? 0}-{attack[1] ?? 0}</span>
                <span>{attack[2] ?? 0}</span>
                <span>{attack[3] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="monster-section scrapbook-loot-section">
        <header><strong>Spells And Loot</strong><small>IDs preserved from the library record.</small></header>
        <div className="scrapbook-pill-grid">
          <ScrapbookSpellList
            values={summaryNumberArray(entry, "spells")}
            project={project}
            catalog={catalog}
            iconEntries={iconEntries}
            lookups={lookups}
            previewContext={previewContext}
          />
          <ScrapbookItemList
            values={summaryNumberArray(entry, "items")}
            project={project}
            catalog={catalog}
            iconEntries={iconEntries}
            lookups={lookups}
            previewContext={previewContext}
          />
          <ScrapbookMoneyList
            values={summaryNumberArray(entry, "money")}
            iconEntries={iconEntries}
            catalog={catalog}
            lookups={lookups}
            previewContext={previewContext}
          />
        </div>
      </section>
    </article>
  );
}

function MonsterScrapbookWorkbench({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () => visibleMonsterLibraryEntries(catalog)
      .sort((a, b) => scrapbookIndex(a) - scrapbookIndex(b)),
    [catalog?.entities]
  );
  const filtered = filterRecords(entries, query, scrapbookSearchText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!filtered.some((entry) => entry.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;
  const copyId = selected ? monsterCopyTargetId(project, selected) : null;
  const copySelected = () => {
    if (!selected || copyId == null) return;
    copyScrapbookMonsterToScenario(selected, copyId, onApplyCommand);
    onSelectEntity(selectEntityFromId(`monster:${copyId}`));
  };

  return (
    <div className="combat-record-layout scrapbook-layout">
      <aside className="combat-record-list scrapbook-list" aria-label="Monster Scrapbook entries">
        <header>
          <div>
            <TutorialTip title="Monster Scrapbook" body={SCRAPBOOK_HELP} side="right">
              <strong>Monster Scrapbook</strong>
            </TutorialTip>
            <small>{filtered.length.toLocaleString()} shown | {entries.length.toLocaleString()} total</small>
          </div>
        </header>
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search built-in monsters..." />
        <ScrollArea className="combat-record-scroll">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selected?.id ? "selected" : ""}
              onClick={() => setSelectedId(entry.id)}
            >
              <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
              <span>
                <strong>{scrapbookName(entry)}</strong>
                <small>{scrapbookFacts(entry)}</small>
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="empty-copy compact">No built-in monsters match that search.</p>}
        </ScrollArea>
      </aside>
      <article className="combat-editor scrapbook-editor">
        {selected ? (
          <>
            <header className="combat-editor-header">
              <div>
                <span>{scrapbookName(selected)}</span>
                <small>{scrapbookFacts(selected)}</small>
              </div>
              <div className="combat-editor-actions">
                {copyId != null && (
                  <button className="btn btn-primary btn-sm" type="button" onClick={copySelected}>
                    Copy To Scenario Monster {copyId}
                  </button>
                )}
              </div>
            </header>
            <section className="scrapbook-summary">
              <ScrapbookMonsterIcon entry={selected} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} />
              <div className="scrapbook-stat-grid">
                <ScrapbookFact label="Hit Dice" value={summaryNumber(selected, "hitDice")} />
                <ScrapbookFact label="Armor" value={summaryNumber(selected, "armor")} />
                <ScrapbookFact label="Agility" value={summaryNumber(selected, "agility")} />
                <ScrapbookFact label="Movement" value={summaryNumber(selected, "movementMax")} />
                <ScrapbookFact label="Attacks" value={summaryNumber(selected, "attackCount")} />
                <ScrapbookFact label="Magic Attacks" value={summaryNumber(selected, "magicAttackCount")} />
                <ScrapbookFact label="Spell Points" value={summaryNumber(selected, "spellPoints")} />
                <ScrapbookFact label="Experience" value={summaryNumber(selected, "exp")} />
              </div>
            </section>
            {scrapbookDescription(selected) && (
              <section className="monster-section">
                <header><strong>Description</strong><small>Bundled Monster Scrapbook text.</small></header>
                <p className="scrapbook-description">{scrapbookDescription(selected)}</p>
              </section>
            )}
            <section className="monster-section">
              <header><strong>Attacks</strong><small>Read-only Realmz monster rows.</small></header>
              <div className="scrapbook-attack-grid">
                {summaryNumberRows(selected, "attacks").map((attack, index) => (
                  <div key={index} className="scrapbook-attack-row">
                    <strong>Attack {index + 1}</strong>
                    <span>low {attack[0] ?? 0}</span>
                    <span>high {attack[1] ?? 0}</span>
                    <span>form {attack[2] ?? 0}</span>
                    <span>special {attack[3] ?? 0}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="monster-section scrapbook-loot-section">
              <header><strong>Spells And Loot</strong><small>IDs preserved from the library record.</small></header>
              <div className="scrapbook-pill-grid">
                <ScrapbookSpellList
                  values={summaryNumberArray(selected, "spells")}
                  project={project}
                  catalog={catalog}
                  iconEntries={iconEntries}
                  lookups={lookups}
                  previewContext={previewContext}
                />
                <ScrapbookItemList
                  values={summaryNumberArray(selected, "items")}
                  project={project}
                  catalog={catalog}
                  iconEntries={iconEntries}
                  lookups={lookups}
                  previewContext={previewContext}
                />
                <ScrapbookMoneyList
                  values={summaryNumberArray(selected, "money")}
                  iconEntries={iconEntries}
                  catalog={catalog}
                  lookups={lookups}
                  previewContext={previewContext}
                />
              </div>
            </section>
          </>
        ) : (
          <EmptyCombatEditor title="No Monster Scrapbook entries" body="The bundled library catalog did not include Monster Scrapbook records." />
        )}
      </article>
    </div>
  );
}

function ScrapbookFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="scrapbook-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScrapbookSpellList({
  values,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext
}: {
  values: number[];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const options = useMemo(() => new Map(combatSpellOptions(project, catalog).map((option) => [option.value, option])), [project, catalog]);
  const iconIds = useMemo(() => spellPreviewIconIdMap(project, catalog), [project, catalog]);
  const visible = values.filter((value) => value !== 0);
  return (
    <div className="scrapbook-array scrapbook-reference-array">
      <span>Spells</span>
      <div className="scrapbook-reference-list">
        {visible.length ? visible.map((value, index) => {
          const option = options.get(value);
          return (
            <ScrapbookReferenceRow
              key={`${value}:${index}`}
              value={value}
              label={option?.label ?? `Spell ${value}`}
              detail={option?.detail || "Raw spell ID; no catalog match yet."}
              iconId={iconIds.get(value) ?? null}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
            />
          );
        }) : <ScrapbookEmptyValue label="No spells" />}
      </div>
    </div>
  );
}

function ScrapbookItemList({
  values,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext
}: {
  values: number[];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const options = useMemo(() => new Map(itemReferenceOptions(project, catalog).map((option) => [option.value, option])), [project, catalog]);
  const visible = values.filter((value) => value !== 0);
  return (
    <div className="scrapbook-array scrapbook-reference-array">
      <span>Items</span>
      <div className="scrapbook-reference-list">
        {visible.length ? visible.map((value, index) => {
          const option = options.get(value);
          return (
            <ScrapbookReferenceRow
              key={`${value}:${index}`}
              value={value}
              label={option?.label ?? `Item ${value}`}
              detail={option ? [option.summary, option.sourceState].filter(Boolean).join(" | ") : "Raw item ID; no catalog match yet."}
              iconId={option?.iconId ?? null}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
              preferLibraryIcon={Math.abs(value) < 800}
            />
          );
        }) : <ScrapbookEmptyValue label="No items" />}
      </div>
    </div>
  );
}

function ScrapbookMoneyList({
  values,
  iconEntries,
  catalog,
  lookups,
  previewContext
}: {
  values: number[];
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const slots = fixedNumberArray(values, MONSTER_MONEY_LABELS.length);
  return (
    <div className="scrapbook-array scrapbook-money-array">
      <span>Money Rewards</span>
      <div>
        {MONSTER_MONEY_REWARDS.map((reward, index) => (
          <span key={reward.label} className="scrapbook-money-row" title={MONSTER_MONEY_HELP}>
            <ReferenceIconPreview
              iconId={reward.iconId}
              fallbackValue={index + 1}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
            />
            <strong>{reward.label}</strong>
            <b className="scrapbook-money-value">{slots[index] ?? 0}</b>
          </span>
        ))}
      </div>
      <small>Realmz rolls 0..value for each reward type when this monster drops loot.</small>
    </div>
  );
}

function ScrapbookReferenceRow({
  value,
  label,
  detail,
  iconId,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  preferLibraryIcon = false
}: {
  value: number;
  label: string;
  detail: string;
  iconId: number | null;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  preferLibraryIcon?: boolean;
}) {
  return (
    <div className="scrapbook-reference-row">
      <ReferenceIconPreview
        iconId={iconId}
        fallbackValue={value}
        iconEntries={iconEntries}
        catalog={catalog}
        lookups={lookups}
        previewContext={previewContext}
        preferLibraryIcon={preferLibraryIcon}
      />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function ScrapbookEmptyValue({ label }: { label: string }) {
  return <small className="scrapbook-empty-value">{label}</small>;
}

function ScrapbookMonsterIcon({
  entry,
  iconEntries,
  lookups,
  previewContext,
  compact = false
}: {
  entry: LibraryCatalog["entities"][number];
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  compact?: boolean;
}) {
  const iconId = summaryNumber(entry, "iconId");
  const absIconId = Math.abs(iconId);
  const icon = iconEntries[iconId] ?? iconEntries[Math.abs(iconId)] ?? iconEntries[-Math.abs(iconId)];
  const realmzActorAsset = lookups.realmzActorIconAssetsByAbsId.get(absIconId) ?? null;
  const mashAsset = lookups.monsterMashAssetsByAbsId.get(absIconId) ?? null;
  const fallbackAsset = lookups.iconAssetsByAbsId.get(absIconId);
  const realmzActorUrl = useResolvedPreviewUrl(null, null, realmzActorAsset, previewContext);
  const fallbackUrl = useResolvedPreviewUrl(fallbackAsset?.previewPath ?? null, null, mashAsset, previewContext);
  const referenceUrl = isActorOrCreatureIconId(absIconId) ? browserReferenceIconUrl(absIconId) : null;
  const url = realmzActorUrl ?? referenceUrl ?? icon?.url ?? fallbackUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  const ready = !usableUrl || loadedUrl === usableUrl;
  return (
    <div
      className={compact ? "monster-icon-preview compact" : "monster-icon-preview"}
      data-combat-preview="monster-icon"
      data-combat-preview-ready={ready ? "true" : "false"}
    >
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onLoad={() => setLoadedUrl(usableUrl)} onError={() => setFailedUrl(usableUrl)} /> : <span>{iconId || "?"}</span>}
    </div>
  );
}

function scrapbookIndex(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.index === "number" ? entry.summary.index : 0;
}

function scrapbookName(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.displayName === "string" && entry.summary.displayName ? entry.summary.displayName : entry.label;
}

function scrapbookFacts(entry: LibraryCatalog["entities"][number]) {
  return `ID ${scrapbookIndex(entry)}, HD ${summaryNumber(entry, "hitDice")}, armor ${summaryNumber(entry, "armor")}, agility ${summaryNumber(entry, "agility")}, icon ${summaryNumber(entry, "iconId")}`;
}

function scrapbookSearchText(entry: LibraryCatalog["entities"][number]) {
  return `${scrapbookName(entry)} ${scrapbookFacts(entry)} ${scrapbookDescription(entry)} ${entry.source}`;
}

function scrapbookDescription(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.description === "string" ? entry.summary.description : "";
}

function visibleMonsterLibraryEntries(catalog: LibraryCatalog | null) {
  return (catalog?.entities ?? []).filter((entry) => {
    if (entry.type !== "monster-scrapbook-entry") return false;
    return isProvidenceMonsterLibraryEntry(entry) || !isBlankBuiltInScrapbookPlaceholder(entry);
  });
}

function isBlankBuiltInScrapbookPlaceholder(entry: LibraryCatalog["entities"][number]) {
  if (isProvidenceMonsterLibraryEntry(entry)) return false;
  const index = scrapbookIndex(entry);
  const name = scrapbookName(entry).trim();
  if (name !== `Monster ${index}`) return false;
  if (scrapbookDescription(entry).trim()) return false;

  const scalarKeys = [
    "hitDice",
    "staminaBonus",
    "agility",
    "movementMax",
    "armor",
    "magicResistance",
    "distance",
    "size",
    "attackCount",
    "magicAttackCount",
    "damageBonus",
    "castPercent",
    "runPercent",
    "surrenderPercent",
    "missilePercent",
    "weapon",
    "iconId",
    "spellPoints",
    "exp"
  ];
  if (scalarKeys.some((key) => summaryNumber(entry, key) !== 0)) return false;

  const arrayKeys = ["money", "spells", "items", "saves", "spellImmunities"];
  if (arrayKeys.some((key) => summaryNumberArray(entry, key).some((value) => value !== 0))) return false;
  if (summaryNumberRows(entry, "attacks").some((row) => row.some((value) => value !== 0))) return false;

  return true;
}

function monsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId > 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailableMonsterRecordId([...used].map((id) => ({ id })));
}

function battleMonsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId > 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailablePlaceableMonsterId([...used].map((id) => ({ id })));
}

function preferredMonsterCopyId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const preferred = typeof entry.summary.preferredScenarioMonsterId === "number" ? Math.trunc(entry.summary.preferredScenarioMonsterId) : scrapbookIndex(entry);
  if (preferred > 0) return preferred;
  return nextAvailableMonsterRecordId(monsterScenarioIds(project).map((id) => ({ id })));
}

function nextAvailableMonsterRecordId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.max(1, used.size + 1);
}

function nextAvailablePlaceableMonsterId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id <= MAX_DIVINITY_BATTLE_MONSTER_ID; id += 1) {
    if (!used.has(id)) return id;
  }
  return 0;
}

export function scrapbookEntryForMonsterId(catalog: LibraryCatalog | null, monsterId: number) {
  return (catalog?.entities ?? []).find((entry) => entry.type === "monster-scrapbook-entry" && scrapbookIndex(entry) === monsterId) ?? null;
}

function copyMonsterLibraryEntryToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  const template = monsterRecordFromLibraryEntry(entry, id);
  onApplyCommand?.({
    kind: "createMonsterFromTemplate",
    label: `Copy ${scrapbookName(entry)} to Monster ${id}`,
    id,
    template,
    description: scrapbookDescription(entry)
  });
}

export function copyScrapbookMonsterToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  copyMonsterLibraryEntryToScenario(entry, id, onApplyCommand);
}

export async function materializeMonsterLibraryIconOverrides(
  entries: MonsterLibraryCopyEntry[],
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext,
  onApplyCommand?: (command: ProjectCommand) => void
) {
  if (!onApplyCommand || entries.length === 0) return [] as MonsterIconOverride[];
  const overrides: MonsterIconOverride[] = [];
  const seenTargets = new Set<number>();
  for (const entry of entries) {
    const override = await monsterIconOverrideForLibraryCopy(entry.entry, entry.template, project, catalog, lookups, iconEntries, previewContext);
    if (!override) continue;
    const targetBaseIconId = normalizedMonsterIconBaseId(override.targetBaseIconId);
    if (!targetBaseIconId || seenTargets.has(targetBaseIconId)) continue;
    seenTargets.add(targetBaseIconId);
    overrides.push(override);
  }
  for (const override of overrides) {
    onApplyCommand({
      kind: "upsertMonsterIconOverride",
      label: `Materialize monster icon ${override.targetBaseIconId} from ${override.sourceLabel ?? `Source ${override.sourceBaseIconId}`}`,
      override
    });
  }
  return overrides;
}

export async function monsterIconOverrideForLibraryCopy(
  entry: LibraryCatalog["entities"][number],
  template: MonsterRecord,
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext
): Promise<MonsterIconOverride | null> {
  const targetBaseIconId = normalizedMonsterIconBaseId(template.iconId);
  if (!targetBaseIconId) return null;
  const targetPair = resolveMonsterIconTargetPair(project, lookups, iconEntries, targetBaseIconId, true);
  if (targetPair) return null;
  const source = monsterIconSourcePairs(catalog, lookups).find((candidate) => candidate.baseId === targetBaseIconId);
  if (!source?.asset || !source.pairedAsset || !source.sourceKind) return null;
  try {
    const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
      loadLibraryResourceBase64(source.asset, previewContext, catalog),
      loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
    ]);
    if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) return null;
    return {
      targetBaseIconId,
      sourceBaseIconId: source.baseId,
      sourceKind: source.sourceKind,
      sourceLabel: source.sourceLabel ?? source.asset.label ?? scrapbookName(entry),
      sourceBaseResourceBase64,
      sourcePairedResourceBase64
    };
  } catch {
    return null;
  }
}

function monsterRecordFromLibraryEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const template = monsterLibraryEntryTemplate(entry);
  if (template) {
    return {
      ...template,
      id,
      displayName: template.displayName || scrapbookName(entry),
      authored: true
    };
  }
  return monsterRecordFromScrapbookEntry(entry, id);
}

function monsterRecordFromScrapbookEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const rawSource = summaryNumberArray(entry, "rawBytes");
  const hasRaw = rawSource.length >= MONSTER_RECORD_BYTES;
  const rawBytes = fixedNumberArray(rawSource, MONSTER_RECORD_BYTES);
  const byte = (offset: number, fallbackKey?: string) => hasRaw ? rawBytes[offset] ?? 0 : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;
  const signed = (offset: number, fallbackKey?: string) => signedByte(byte(offset, fallbackKey));
  const short = (offset: number, fallbackKey?: string) => hasRaw ? i16At(rawBytes, offset) : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;

  return {
    id,
    hitDice: byte(0, "hitDice"),
    staminaBonus: byte(1, "staminaBonus"),
    agility: byte(2, "agility"),
    nameId: byte(3),
    movementMax: byte(4, "movementMax"),
    armor: signed(5, "armor"),
    magicResistance: signed(6, "magicResistance"),
    distance: signed(7, "distance"),
    traitor: signed(8),
    size: signed(9, "size"),
    typeFlags: hasRaw ? Array.from({ length: 8 }, (_, index) => signedByte(rawBytes[10 + index] ?? 0)) : new Array(8).fill(0),
    attackCount: signed(18, "attackCount"),
    magicAttackCount: signed(19, "magicAttackCount"),
    attacks: hasRaw
      ? Array.from({ length: 5 }, (_, row) => Array.from({ length: 4 }, (_, slot) => signedByte(rawBytes[20 + row * 4 + slot] ?? 0)))
      : Array.from({ length: 5 }, (_, row) => fixedNumberArray(summaryNumberRows(entry, "attacks")[row], 4)),
    damageBonus: signed(40, "damageBonus"),
    castPercent: signed(41, "castPercent"),
    runPercent: signed(42, "runPercent"),
    surrenderPercent: signed(43, "surrenderPercent"),
    missilePercent: signed(44, "missilePercent"),
    canSummon: signed(45, "canSummon"),
    saves: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[46 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "saves"), 6),
    spellImmunities: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[52 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "spellImmunities"), 6),
    money: hasRaw ? Array.from({ length: 3 }, (_, index) => i16At(rawBytes, 58 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "money"), 3),
    spells: hasRaw ? Array.from({ length: 10 }, (_, index) => i16At(rawBytes, 64 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "spells"), 10),
    items: hasRaw ? Array.from({ length: 6 }, (_, index) => i16At(rawBytes, 84 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "items"), 6),
    weapon: short(96, "weapon"),
    iconId: short(98, "iconId"),
    spellPoints: short(100, "spellPoints"),
    exp: short(102, "exp"),
    stamina: short(104, "stamina"),
    staminaMax: short(106, "staminaMax"),
    underneath: hasRaw ? Array.from({ length: 4 }, (_, index) => i16At(rawBytes, 108 + index * 2)) : new Array(4).fill(0),
    target: signed(116),
    guarding: signed(117),
    notOnMenu: hasRaw ? (rawBytes[118] ?? 0) !== 0 : false,
    beenAttacked: signed(119),
    movement: signed(120),
    magicToHit: signed(121, "magicToHit"),
    conditions: hasRaw ? Array.from({ length: 40 }, (_, index) => signedByte(rawBytes[122 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "conditions"), 40),
    lr: signed(162),
    up: signed(163),
    attackNum: signed(164),
    bonusAttack: signed(165),
    deathMacro: short(166, "deathMacro"),
    maxSpellPoints: short(168, "maxSpellPoints"),
    displayName: scrapbookName(entry),
    rawBytes,
    authored: true
  };
}

function summaryNumber(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function summaryNumberArray(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

function summaryNumberRows(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value)
    ? value.map((row) => Array.isArray(row) ? row.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [])
    : [];
}

function fixedNumberArray(values: number[] | undefined, length: number) {
  return Array.from({ length }, (_, index) => Number(values?.[index] ?? 0));
}

function signedByte(value: number) {
  const byte = value & 0xff;
  return byte > 0x7f ? byte - 0x100 : byte;
}

function i16At(bytes: number[], offset: number) {
  const high = bytes[offset] ?? 0;
  const low = bytes[offset + 1] ?? 0;
  const value = ((high & 0xff) << 8) | (low & 0xff);
  return value & 0x8000 ? value - 0x10000 : value;
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

function monsterSetLabel(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.label ?? "Normal";
}

function monsterSetFile(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.file ?? "Data MD";
}

function monsterGeneratePreviewRows(source: MonsterRecord) {
  const monster = previewGeneratedMonsterVariant(source, 1);
  const mega = previewGeneratedMonsterVariant(source, -1);
  const rows = [
    ["Hit Dice", source.hitDice, monster.hitDice, mega.hitDice],
    ["Bonus Stamina", source.staminaBonus, monster.staminaBonus, mega.staminaBonus],
    ["Armor", source.armor, monster.armor, mega.armor],
    ["Magic Resist", source.magicResistance, monster.magicResistance, mega.magicResistance],
    ["Agility", source.agility, monster.agility, mega.agility],
    ["Movement", source.movementMax, monster.movementMax, mega.movementMax],
    ["Damage Bonus", source.damageBonus, monster.damageBonus, mega.damageBonus],
    ["Spell Points", source.spellPoints, monster.spellPoints, mega.spellPoints],
    ["Max Spell Points", source.maxSpellPoints, monster.maxSpellPoints, mega.maxSpellPoints],
    ["Experience", source.exp, monster.exp, mega.exp],
    ["Saves 1-6", formatPreviewArray(source.saves), formatPreviewArray(monster.saves), formatPreviewArray(mega.saves)]
  ];
  return rows.map(([label, normal, monsterValue, megaValue]) => ({
    label: String(label),
    normal: String(normal),
    monster: String(monsterValue),
    mega: String(megaValue),
    monsterChanged: String(monsterValue) !== String(normal),
    megaChanged: String(megaValue) !== String(normal)
  }));
}

function previewGeneratedMonsterVariant(source: MonsterRecord, setId: Exclude<MonsterSetId, 0>) {
  const scale = MONSTER_VARIANT_SCALE[setId];
  const scaledSpellPoints = clampInteger(Math.floor(source.spellPoints * scale.spellPointsNumerator / scale.spellPointsDenominator), 0, 999);
  return {
    hitDice: clampInteger(source.hitDice + scale.hitDice, 0, 255),
    staminaBonus: clampInteger(source.staminaBonus + scale.staminaBonus, -128, 127),
    agility: clampInteger(source.agility + scale.agility, -128, 127),
    movementMax: clampInteger(source.movementMax + scale.movementMax, -128, 127),
    armor: clampInteger(source.armor + scale.armor, -128, 127),
    magicResistance: clampInteger(source.magicResistance + scale.magicResistance, -128, 127),
    damageBonus: clampInteger(source.damageBonus + scale.damageBonus, -128, 127),
    saves: source.saves.map((value) => clampInteger(value + scale.saves, -128, 127)),
    spellPoints: scaledSpellPoints,
    maxSpellPoints: clampInteger(Math.max(source.maxSpellPoints, scaledSpellPoints), 0, 999),
    exp: clampInteger(Math.floor(source.exp * scale.expNumerator / scale.expDenominator), 0, 32767)
  };
}

function formatPreviewArray(values: number[]) {
  return values.join(", ");
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
