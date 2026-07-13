import { ChangeEvent, DragEvent, memo, MouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadBrowserBundledLibraryResourceData } from "../browser/library";
import { X } from "lucide-react";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { TutorialTip } from "../components/TutorialTip";
import { itemReferenceOptions } from "../itemReferences";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../rulesCatalog";
import { spellAnimationFrameIds } from "../resourceIds";
import { findLibraryResourceAsset, isActorOrCreatureIconId } from "../resourceResolver";
import { LibraryAsset, LibraryCatalog, IconEntry, MonsterIconOverride, MonsterRecord, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../types";
import { battleReferencesByMonster, type BattleMonsterReference } from "../battleReferences";
import { encodeCicnResource, mirrorRgbaHorizontally } from "../cicnEncoder";
import { allMonsterScenarioIds, authorFacingMonsterRecordsForSet, authorFacingMonsterScenarioIds, isZeroBlankMonsterSlot } from "../monsterRecords";
import {
  IconLibraryFacingMode,
  createIconLibraryEntry,
  deleteIconLibraryEntry,
  iconLibraryAssetResourceBase64
} from "../iconLibrary";
import {
  createMonsterLibraryEntry,
  deleteMonsterLibraryEntry,
  duplicateMonsterLibraryEntry,
  isProvidenceMonsterLibraryEntry,
  monsterLibraryEntryDescription,
  monsterLibraryOrigin,
  monsterLibraryEntryTemplate,
  updateMonsterLibraryEntry
} from "../monsterLibrary";
import { ScrollArea } from "../ui";
import { selectEntityFromId } from "../utils";
import {
  MONSTER_SET_OPTIONS,
  useCombatLookups,
  type CombatLookups,
  type CombatWorkbenchTab
} from "./combat/combatLookups";
import {
  MONSTER_ICON_PAIR_OFFSET,
  MONSTER_ICON_SET_LIMIT,
  monsterIconPickerOptions,
  monsterIconSetTabCount,
  monsterIconSourcePairs,
  monsterIconSourceStatusLabel,
  monsterIconTargetPairs,
  monsterIconTargetSourceStatus,
  monsterIconTargetStatusTitle,
  nextImportedMonsterIconBaseId,
  nextScenarioMonsterIconTargetBaseId,
  normalizedMonsterIconBaseId,
  previewPathFromCicnBase64,
  resolveMonsterIconTargetPair,
  type MonsterIconPairOption,
  type MonsterIconPickerOption,
  type MonsterIconSourceStatus
} from "./combat/iconSetModel";
import { measureCombatWork, useCombatRenderTiming } from "./combat/performance";
import { BattleWorkbench } from "./combat/BattleWorkbench";
import { BattleBoard, MAX_DIVINITY_BATTLE_MONSTER_ID } from "./combat/BattleBoard";
import { FieldLabel, NumberField, TextAreaField, TextField, ToggleButton } from "./combat/CombatFields";
import {
  MonsterIcon,
  resolveMonsterIcon,
  samePreviewContextInputs,
  sameProjectIconInputs
} from "./combat/MonsterIconPreview";

export {
  monsterIconPickerOptions,
  monsterIconSetTabCount,
  monsterIconSourceStatusLabel,
  monsterIconTargetPairs,
  nextScenarioMonsterIconTargetBaseId,
  resolveMonsterIconTargetPair
} from "./combat/iconSetModel";
export type { MonsterIconPickerOption, MonsterIconSourceStatus } from "./combat/iconSetModel";
export type { CombatWorkbenchTab } from "./combat/combatLookups";
export { monsterBrushPaletteWindow } from "./combat/BattleBoard";

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

type ScenarioMonsterListEntry = {
  id: number;
  normal: MonsterRecord | null;
  monster: MonsterRecord | null;
  mega: MonsterRecord | null;
  active: MonsterRecord | null;
  fallback: MonsterRecord | null;
};

const MONSTER_ICON_CANVAS_PRESETS = [
  { key: "32x32", label: "32 x 32", width: 32, height: 32 },
  { key: "32x64", label: "32 x 64", width: 32, height: 64 },
  { key: "64x32", label: "64 x 32", width: 64, height: 32 },
  { key: "64x64", label: "64 x 64", width: 64, height: 64 }
] as const;
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

type CombatPanelProps = {
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  previewContext?: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor: (editor: string) => void;
  onOpenTool?: (tab: "assets", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
};

const TAB_LABELS: Record<CombatWorkbenchTab, string> = {
  battles: "Battles",
  monsters: "Monsters",
  iconSet: "Icon Set"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after strings, and battle macro target.",
  monsters: "Manage protected built-in templates, editable Providence library monsters, and scenario Data MD monster records.",
  iconSet: "Build scenario-local Monster Mash icon overrides without changing monster records."
};

const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const MONSTER_REQUIRED_WEAPON_HELP = "Realmz checks this monster record byte before allowing weapon hits: All is 0, Blunt only is -1, Sharp only is -2, and positive codes match the attacker's weapon number. Divinity fixture evidence shows the adjacent Req Weap value writes Data MD rel 7.";
const SCRAPBOOK_HELP = "Monster Library combines protected built-in Realmz scrapbook templates with editable Providence entries. Copy entries into Scenario Monsters before using them in runtime battles.";
const MONSTER_MONEY_REWARDS = [
  { label: "Gold", iconId: 2002 },
  { label: "Gems", iconId: 2014 },
  { label: "Jewelry", iconId: 2012 }
];
const MONSTER_MONEY_LABELS = MONSTER_MONEY_REWARDS.map((reward) => reward.label);
const MONSTER_MONEY_HELP = "Monster reward caps. Realmz rolls 0..value for gold, gems, and jewelry when a reward-eligible monster is killed.";
const MONSTER_SUMMON_ELIGIBLE_HELP = "Divinity labels this as Can Be Summoned. Realmz random-summon paths require 1, ordinary monsters are 0, and -1 is the NPC/ally marker.";
const MONSTER_SUMMON_ELIGIBLE_OPTIONS: CombatSelectOption[] = [
  { key: "summon-eligible:yes", value: 1, label: "1 = Yes", detail: "Runtime-proven: random summon selection requires cansum == 1." },
  { key: "summon-eligible:npc", value: -1, label: "-1 = Is a NPC", detail: "Runtime-proven: Realmz uses -1 for special NPC/ally handling." }
];
const MONSTER_SAVE_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Save`);
const MONSTER_IMMUNITY_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Immune`);
const MONSTER_ATTACK_FORM_OPTIONS: CombatSelectOption[] = [
  { key: "attack-form:32", value: 32, label: "Pummel" },
  { key: "attack-form:33", value: 33, label: "Claw" },
  { key: "attack-form:34", value: 34, label: "Bite" },
  { key: "attack-form:35", value: 35, label: "Not Used" },
  { key: "attack-form:36", value: 36, label: "Not Used" },
  { key: "attack-form:37", value: 37, label: "Not Used" },
  { key: "attack-form:38", value: 38, label: "Punch / Kick" },
  { key: "attack-form:39", value: 39, label: "Club" },
  { key: "attack-form:40", value: 40, label: "Slime" },
  { key: "attack-form:41", value: 41, label: "Sting" }
];
const MONSTER_ATTACK_SPECIAL_OPTIONS: CombatSelectOption[] = [
  { key: "attack-special:0", value: 0, label: "No Special Attacks" },
  { key: "attack-special:1", value: 1, label: "Cause Fear" },
  { key: "attack-special:2", value: 2, label: "Paralyze" },
  { key: "attack-special:3", value: 3, label: "Curse" },
  { key: "attack-special:4", value: 4, label: "Stupify" },
  { key: "attack-special:5", value: 5, label: "Entangle" },
  { key: "attack-special:6", value: 6, label: "Poison" },
  { key: "attack-special:7", value: 7, label: "Confuse" },
  { key: "attack-special:8", value: 8, label: "Drain Spell Points" },
  { key: "attack-special:9", value: 9, label: "Drain Experience" },
  { key: "attack-special:10", value: 10, label: "Charm" },
  { key: "attack-special:11", value: 11, label: "Fire Damage" },
  { key: "attack-special:12", value: 12, label: "Cold Damage" },
  { key: "attack-special:13", value: 13, label: "Electric Damage" },
  { key: "attack-special:14", value: 14, label: "Chemical Damage" },
  { key: "attack-special:15", value: 15, label: "Mental Damage" },
  { key: "attack-special:16", value: 16, label: "Cause Disease" },
  { key: "attack-special:17", value: 17, label: "Cause Age" },
  { key: "attack-special:18", value: 18, label: "Cause Blindness" },
  { key: "attack-special:19", value: 19, label: "Turn to Stone" }
];
const MONSTER_LIBRARY_DRAG_MIME = "application/x-realmz-monster-library-id";
const SCENARIO_MONSTER_DRAG_MIME = "application/x-realmz-scenario-monster-id";
const MONSTER_RECORD_BYTES = 210;
const RANDOM_WEAPON_OPTIONS: CombatSelectOption[] = [
  { key: "random-weapon:-1", value: -1, label: "-1 Random swords" },
  { key: "random-weapon:-2", value: -2, label: "-2 Random clubs" },
  { key: "random-weapon:-3", value: -3, label: "-3 Random clubs / spears" },
  { key: "random-weapon:-4", value: -4, label: "-4 Random axes" },
  { key: "random-weapon:-5", value: -5, label: "-5 Random small swords / small axes" },
  { key: "random-weapon:-6", value: -6, label: "-6 Random clubs / flails / spears" },
  { key: "random-weapon:-7", value: -7, label: "-7 Random spears / pole weapons" },
  { key: "random-weapon:-8", value: -8, label: "-8 Random axes / spears" },
  { key: "random-weapon:-9", value: -9, label: "-9 Random swords / dagger / cutlass / nunchucka" }
];
const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;

export function CombatPanel({
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  iconEntries,
  previewContext = {},
  onSelectEntity,
  onSelectEditor,
  onApplyCommand,
  onUpdateLibraryCatalog
}: CombatPanelProps) {
  useCombatRenderTiming("CombatPanel");
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    setTab(next);
    onSelectEditor(next);
  };
  const lookups = useCombatLookups(project, catalog);

  if (!project) {
    return (
      <section className="combat-workbench">
        <header className="combat-hero">
          <div>
            <h1>Combat</h1>
            <p>Open or create a scenario before editing battles and monsters.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="combat-workbench">
      <header className="combat-hero">
        <div>
          <h1>
            <TutorialTip
              title="Combat Workbench"
              body="Use Combat for scenario battles, scenario monsters, protected built-in Monster Scrapbook templates, and editable Providence monster-library variants."
              side="right"
            >
              <span>Combat</span>
            </TutorialTip>
          </h1>
          <p>Author battles, scenario monsters, and reusable Providence monster-library templates.</p>
        </div>
        <small>{project.scenario.name}</small>
      </header>
      <div className="combat-tabs" role="tablist" aria-label="Combat workbench sections">
        {(Object.keys(TAB_LABELS) as CombatWorkbenchTab[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            className={tab === candidate ? "active" : ""}
            onClick={() => selectTab(candidate)}
            title={TAB_HELP[candidate]}
          >
            <span>{TAB_LABELS[candidate]}</span>
            <b>{lookups.tabCounts[candidate].toLocaleString()}</b>
          </button>
        ))}
      </div>

      {tab === "battles" && (
        <BattleWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
          renderBoard={({ battle, monsterSetPreview, onMonsterSetPreviewChange, onUpdateGrid }) => (
            <BattleBoard
              project={project}
              iconEntries={iconEntries}
              lookups={lookups}
              previewContext={previewContext}
              monsterSetPreview={monsterSetPreview}
              onMonsterSetPreviewChange={onMonsterSetPreviewChange}
              battle={battle}
              canCopyMissingMonster={(monsterId) => Boolean(scrapbookEntryForMonsterId(catalog, monsterId))}
              onCopyMissingMonster={(monsterId) => {
                const entry = scrapbookEntryForMonsterId(catalog, monsterId);
                if (!entry) return;
                copyScrapbookMonsterToScenario(entry, monsterId, onApplyCommand);
                onSelectEntity(selectEntityFromId(`monster:${monsterId}`));
              }}
              onApplyCommand={onApplyCommand}
              onUpdateGrid={onUpdateGrid}
            />
          )}
        />
      )}
      {tab === "monsters" && (
        <MonsterWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onSelectIconSetTab={() => selectTab("iconSet")}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
      {tab === "iconSet" && (
        <MonsterIconSetWorkbench
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
    </section>
  );
}


function MonsterIconSetWorkbench({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onApplyCommand,
  onUpdateLibraryCatalog
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const targets = useMemo(() => monsterIconTargetPairs(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const sources = useMemo(() => monsterIconSourcePairs(catalog, lookups), [catalog, lookups]);
  const [targetQuery, setTargetQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState(() => targets[0]?.baseId ?? 0);
  const [selectedSourceKey, setSelectedSourceKey] = useState(() => sources[0]?.key ?? "");
  const [activeIconSetPane, setActiveIconSetPane] = useState<"target" | "source">("source");
  const [status, setStatus] = useState("");
  const [iconImportOpen, setIconImportOpen] = useState(false);
  const [iconImportCanvasKey, setIconImportCanvasKey] = useState<(typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]>("32x32");
  const [iconImportAdvanced, setIconImportAdvanced] = useState(false);
  const [iconImportBaseFile, setIconImportBaseFile] = useState<File | null>(null);
  const [iconImportPairedFile, setIconImportPairedFile] = useState<File | null>(null);
  const baseImportInputRef = useRef<HTMLInputElement | null>(null);
  const pairedImportInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selectedTargetId <= 0 && targets[0]) setSelectedTargetId(targets[0].baseId);
  }, [selectedTargetId, targets]);
  useEffect(() => {
    if (!sources.some((source) => source.key === selectedSourceKey)) setSelectedSourceKey(sources[0]?.key ?? "");
  }, [selectedSourceKey, sources]);
  const filteredTargets = useMemo(
    () => filterRecords(targets, targetQuery, (target) => `${target.baseId} ${target.asset?.label ?? ""} ${target.override?.sourceLabel ?? ""} ${monsterIconSourceStatusLabel(monsterIconTargetSourceStatus(target))}`),
    [targetQuery, targets]
  );
  const filteredSources = useMemo(
    () => filterRecords(sources, sourceQuery, (source) => `${source.baseId} ${source.sourceLabel ?? ""} ${source.asset?.label ?? ""}`),
    [sourceQuery, sources]
  );
  const selectedTarget = targets.find((target) => target.baseId === selectedTargetId) ?? null;
  const selectedSource = sources.find((source) => source.key === selectedSourceKey) ?? sources[0] ?? null;
  const selectedTargetBaseId = selectedTarget?.baseId ?? selectedTargetId;
  const selectedTargetOverrideSource = selectedTarget?.override
    ? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId && source.sourceKind === selectedTarget.override?.sourceKind)
      ?? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId)
      ?? null
    : null;
  const selectSourceByBaseId = (sourceBaseIconId: number) => {
    setSelectedSourceKey(sources.find((source) => source.baseId === sourceBaseIconId)?.key ?? sources[0]?.key ?? "");
    setActiveIconSetPane("source");
  };
  const selectTargetByBaseId = (targetBaseIconId: number) => {
    setSelectedTargetId(Math.max(0, Math.trunc(Math.abs(targetBaseIconId))));
    setActiveIconSetPane("target");
  };
  const applyOverride = async (targetBaseIconId = selectedTargetBaseId, sourceKey = selectedSource?.key ?? "") => {
    const source = sources.find((candidate) => candidate.key === sourceKey);
    const sourceBaseIconId = source?.baseId ?? 0;
    if (!source?.asset || !source.pairedAsset || !targetBaseIconId) {
      setStatus("Choose a target icon and a complete source icon pair before applying an override.");
      return;
    }
    try {
      const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
        loadLibraryResourceBase64(source.asset, previewContext, catalog),
        loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
      ]);
      if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) {
        setStatus(`${source.sourceLabel ?? `Source ${sourceBaseIconId}`} is missing one facing resource.`);
        return;
      }
      onApplyCommand?.({
        kind: "upsertMonsterIconOverride",
        label: `Override monster icon ${targetBaseIconId} from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}`,
        override: {
          targetBaseIconId,
          sourceBaseIconId,
          sourceKind: source.sourceKind ?? "monster-mash",
          sourceLabel: source.asset.label || source.sourceLabel,
          sourceBaseResourceBase64,
          sourcePairedResourceBase64
        }
      });
      setSelectedTargetId(targetBaseIconId);
      setSelectedSourceKey(source.key);
      setStatus(`Monster icon ${targetBaseIconId} will export from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load source icon resource data.");
    }
  };
  const deleteTargetOverride = (targetBaseIconId = selectedTargetBaseId) => {
    if (!targetBaseIconId || !selectedTarget?.override) return;
    onApplyCommand?.({ kind: "deleteMonsterIconOverride", label: `Delete monster icon override ${targetBaseIconId}`, targetBaseIconId });
    setStatus(`Deleted override for monster icon ${targetBaseIconId}; default art will be used when available.`);
  };
  const allowTargetDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("application/x-realmz-monster-icon-source")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const copyTargetToIconLibrary = async () => {
    if (!selectedTarget || !onUpdateLibraryCatalog) return;
    try {
      const [base64, pairedBase64] = selectedTarget.override
        ? [selectedTarget.override.sourceBaseResourceBase64, selectedTarget.override.sourcePairedResourceBase64]
        : selectedTarget.resourceBase64 && selectedTarget.pairedResourceBase64
          ? [selectedTarget.resourceBase64, selectedTarget.pairedResourceBase64]
        : selectedTarget.asset && selectedTarget.pairedAsset
          ? await Promise.all([
              loadLibraryResourceBase64(selectedTarget.asset, previewContext, catalog),
              loadLibraryResourceBase64(selectedTarget.pairedAsset, previewContext, catalog)
            ])
          : [null, null];
      if (!base64 || !pairedBase64) {
        setStatus(`Scenario icon ${selectedTarget.baseId} is missing one facing resource.`);
        return;
      }
      const label = selectedTarget.override
        ? `Scenario Icon ${selectedTarget.baseId} Override`
        : selectedTarget.sourceLabel || selectedTarget.asset?.label || `Scenario Icon ${selectedTarget.baseId}`;
      const baseMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.asset ?? null : selectedTarget.asset;
      const pairedMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.pairedAsset ?? null : selectedTarget.pairedAsset;
      const targetMetadata = selectedTargetOverrideSource
        ? { facingMode: selectedTargetOverrideSource.facingMode, canvas: selectedTargetOverrideSource.canvas }
        : { facingMode: "custom" as IconLibraryFacingMode, canvas: null };
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: {
          kind: "external-resource",
          sourceId: `scenario-monster-icon:${selectedTarget.baseId}`,
          sourceLabel: label
        },
        ...targetMetadata,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId,
            label: baseMetadataAsset?.label || `${label} left`,
            resourceBase64: base64,
            previewPath: previewPathFromCicnBase64(base64, baseMetadataAsset?.previewPath ?? null),
            bytes: baseMetadataAsset?.bytes,
            sha256: baseMetadataAsset?.sha256
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId + MONSTER_ICON_PAIR_OFFSET,
            label: pairedMetadataAsset?.label || `${label} right`,
            resourceBase64: pairedBase64,
            previewPath: previewPathFromCicnBase64(pairedBase64, pairedMetadataAsset?.previewPath ?? null),
            bytes: pairedMetadataAsset?.bytes,
            sha256: pairedMetadataAsset?.sha256
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Added ${entity.label} to Icon Library` : "Updated Icon Library");
      setStatus(entity ? `Added ${entity.label} to the Providence Icon Library.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to copy scenario icons into the Providence Icon Library.");
    }
  };
  const deleteSelectedIconVariant = () => {
    if (!catalog || !selectedSource || selectedSource.sourceKind !== "providence-library" || !onUpdateLibraryCatalog) return;
    const nextCatalog = deleteIconLibraryEntry(catalog, selectedSource.key);
    const nextSourceKey = sources.find((source) => source.key !== selectedSource.key)?.key ?? "";
    onUpdateLibraryCatalog(nextCatalog, `Deleted ${selectedSource.sourceLabel ?? "Icon Variant"}`);
    setSelectedSourceKey(nextSourceKey);
    setActiveIconSetPane("source");
    setStatus(`Deleted ${selectedSource.sourceLabel ?? "Icon Variant"} from the Providence Icon Library.`);
  };
  const createImportedIconSet = async () => {
    if (!onUpdateLibraryCatalog) return;
    if (!iconImportBaseFile) {
      setStatus("Choose a source image before importing a monster icon set.");
      return;
    }
    try {
      const canvas = monsterIconCanvasPreset(iconImportCanvasKey);
      const baseImage = await loadImageFileToRgba(iconImportBaseFile, canvas.width, canvas.height);
      const pairedImage = iconImportAdvanced && iconImportPairedFile
        ? await loadImageFileToRgba(iconImportPairedFile, canvas.width, canvas.height)
        : { width: canvas.width, height: canvas.height, rgba: mirrorRgbaHorizontally(baseImage) };
      const baseBytes = encodeCicnResource(baseImage);
      const pairedBytes = encodeCicnResource(pairedImage);
      const baseId = nextImportedMonsterIconBaseId(sources);
      const label = `${stripFileExtension(iconImportBaseFile.name) || "Imported Monster"} Icon Set`;
      const facingMode: IconLibraryFacingMode = iconImportAdvanced && iconImportPairedFile ? "custom" : "mirrored";
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: { kind: "external-resource", sourceLabel: iconImportBaseFile.name },
        facingMode,
        canvas,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: baseId,
            label: `${label} base`,
            resourceBase64: bytesToBase64(baseBytes),
            previewPath: rgbaToDataUrl(baseImage),
            bytes: baseBytes.length,
            width: canvas.width,
            height: canvas.height
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: baseId + MONSTER_ICON_PAIR_OFFSET,
            label: `${label} paired`,
            resourceBase64: bytesToBase64(pairedBytes),
            previewPath: rgbaToDataUrl(pairedImage),
            bytes: pairedBytes.length,
            width: canvas.width,
            height: canvas.height
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Imported ${entity.label}` : "Updated Icon Library");
      if (entity) {
        setSelectedSourceKey(entity.id);
        setActiveIconSetPane("source");
      }
      setIconImportBaseFile(null);
      setIconImportPairedFile(null);
      if (baseImportInputRef.current) baseImportInputRef.current.value = "";
      if (pairedImportInputRef.current) pairedImportInputRef.current.value = "";
      setStatus(entity ? `Imported ${entity.label} as ${facingMode === "mirrored" ? "mirrored" : "custom"} facing art.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to import monster icon set.");
    }
  };
  const hasSelectedSourcePair = Boolean(selectedSource?.asset && selectedSource.pairedAsset);
  const hasSelectedTargetPair = Boolean(
    selectedTarget?.override ||
    (selectedTarget?.resourceBase64 && selectedTarget.pairedResourceBase64) ||
    (selectedTarget?.asset && selectedTarget.pairedAsset)
  );
  const addSourceToScenarioIcons = () => {
    const targetBaseId = nextScenarioMonsterIconTargetBaseId(selectedSource?.baseId ?? 0, targets);
    setActiveIconSetPane("target");
    void applyOverride(targetBaseId, selectedSource?.key ?? "");
  };
  const replaceSelectedTargetArt = () => {
    if (!selectedTargetBaseId) return;
    setActiveIconSetPane("target");
    void applyOverride(selectedTargetBaseId, selectedSource?.key ?? "");
  };
  return (
    <article className="combat-editor icon-set-workbench">
      <header className="combat-editor-header icon-set-header">
        <div>
          <h2>Build Icon Set</h2>
          <p>Copy paired Monster Mash or Providence Icon Library cicn resources into the scenario as overrides or supplements for standard monster icon IDs.</p>
        </div>
        <span
          className={(project.monsterIconOverrides ?? []).length >= MONSTER_ICON_SET_LIMIT ? "icon-set-limit warning" : "icon-set-limit"}
          title="The Divinity manual describes Realmz as capable of holding around 127 monster icon sets per scenario. Modern Realmz source resolves cicn resources dynamically, so Providence treats this as a compatibility warning rather than a hard runtime cap."
        >
          {(project.monsterIconOverrides ?? []).length} / ~{MONSTER_ICON_SET_LIMIT} overrides
        </span>
      </header>
      <section className="icon-set-controls">
        <NumberField label="Target Icon" value={selectedTargetBaseId} onCommit={selectTargetByBaseId} />
        <NumberField label="Source Icon" value={selectedSource?.baseId ?? 0} onCommit={selectSourceByBaseId} />
        <div className="icon-set-action-group">
          <button
            type="button"
            className="btn btn-primary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair}
            onClick={addSourceToScenarioIcons}
            title="Copy the selected library/source icon pair into the next available scenario override target."
          >
            Copy To Scenario Icons
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair || !selectedTargetBaseId}
            onClick={replaceSelectedTargetArt}
            title="Replace the selected target icon art with the selected library/source icon pair."
          >
            Replace Target Art
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedTargetPair || !onUpdateLibraryCatalog}
            onClick={() => void copyTargetToIconLibrary()}
          >
            Copy To Icon Library
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!selectedTarget?.override} onClick={() => deleteTargetOverride()}>
            Delete Override
          </button>
          {selectedSource?.sourceKind === "providence-library" ? (
            <button type="button" className="btn btn-danger btn-sm" disabled={!catalog || !onUpdateLibraryCatalog} onClick={deleteSelectedIconVariant}>
              Delete Icon Variant
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm icon-set-import-toggle"
          disabled={!onUpdateLibraryCatalog}
          onClick={() => setIconImportOpen((open) => !open)}
        >
          Import Image Set
        </button>
        {status ? <small>{status}</small> : null}
      </section>
      {iconImportOpen ? (
        <section className="icon-set-import-panel">
          <header>
            <strong>Import Monster Icon Set</strong>
            <small>One image creates a mirrored pair; advanced import can supply separate facing art.</small>
          </header>
          <label>
            <span>Canvas</span>
            <select value={iconImportCanvasKey} onChange={(event) => setIconImportCanvasKey(event.currentTarget.value as (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"])}>
              {MONSTER_ICON_CANVAS_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Source Image</span>
            <span className="icon-set-file-control">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => baseImportInputRef.current?.click()}>
                Choose Image
              </button>
              <small>{iconImportBaseFile?.name ?? "No file selected."}</small>
              <input
                ref={baseImportInputRef}
                className="icon-set-file-input"
                type="file"
                accept="image/png,image/gif,image/jpeg,image/webp"
                aria-label="Source image"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportBaseFile(event.currentTarget.files?.[0] ?? null)}
              />
            </span>
          </label>
          <label className="checkbox-row">
            <span>Custom paired image</span>
            <input type="checkbox" checked={iconImportAdvanced} onChange={(event) => setIconImportAdvanced(event.currentTarget.checked)} />
          </label>
          {iconImportAdvanced ? (
            <label>
              <span>Paired Image</span>
              <span className="icon-set-file-control">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pairedImportInputRef.current?.click()}>
                  Choose Paired Image
                </button>
                <small>{iconImportPairedFile?.name ?? "No file selected."}</small>
                <input
                  ref={pairedImportInputRef}
                  className="icon-set-file-input"
                  type="file"
                  accept="image/png,image/gif,image/jpeg,image/webp"
                  aria-label="Paired image"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportPairedFile(event.currentTarget.files?.[0] ?? null)}
                />
              </span>
            </label>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" disabled={!onUpdateLibraryCatalog || !iconImportBaseFile} onClick={() => void createImportedIconSet()}>
            Create Library Icon Set
          </button>
        </section>
      ) : null}
      <div className="icon-set-layout">
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Library Monster Icon Sets</strong>
            <small>{sources.length} source pairs</small>
          </header>
          <input value={sourceQuery} onChange={(event) => setSourceQuery(event.currentTarget.value)} placeholder="Search library monster icon sets..." />
          <div className="icon-set-scroll">
            {filteredSources.map((source) => (
              <button
                key={source.key}
                type="button"
                draggable
                className={`icon-set-row${activeIconSetPane === "source" && selectedSourceKey === source.key ? " selected" : ""}`}
                onClick={() => {
                  setSelectedSourceKey(source.key);
                  setActiveIconSetPane("source");
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-realmz-monster-icon-source", source.key);
                  event.dataTransfer.setData("text/plain", source.sourceLabel ?? `Source ${source.baseId}`);
                }}
              >
                <IconPairPreview baseAsset={source.asset} pairedAsset={source.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>{source.sourceLabel ?? `Source ${source.baseId}`}</strong>
                  <small>{source.sourceKind === "providence-library" ? "Providence Icon Library" : "Monster Mash"} | pair {source.baseId + MONSTER_ICON_PAIR_OFFSET}</small>
                </span>
              </button>
            ))}
            {filteredSources.length === 0 ? <p className="empty-copy compact">No library monster icon sets match that search.</p> : null}
          </div>
        </section>
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Monster Icon Targets</strong>
            <small>{targets.length} target pairs</small>
          </header>
          <input value={targetQuery} onChange={(event) => setTargetQuery(event.currentTarget.value)} placeholder="Search monster icon targets..." />
          <div className="icon-set-scroll">
            {filteredTargets.map((target) => {
              const previewBaseAsset = target.asset;
              const previewPairedAsset = target.pairedAsset;
              const sourceStatus = monsterIconTargetSourceStatus(target);
              const statusLabel = monsterIconSourceStatusLabel(sourceStatus);
              return (
                <button
                  key={target.baseId}
                  type="button"
                  className={`icon-set-row${activeIconSetPane === "target" && selectedTargetId === target.baseId ? " selected" : ""}${target.override ? " overridden" : ""}`}
                  onClick={() => {
                    setSelectedTargetId(target.baseId);
                    setActiveIconSetPane("target");
                  }}
                  onDragOver={allowTargetDrop}
                  onDragEnter={allowTargetDrop}
                  onDrop={(event) => {
                    const sourceKey = event.dataTransfer.getData("application/x-realmz-monster-icon-source");
                    if (!sourceKey) return;
                    event.preventDefault();
                    setActiveIconSetPane("target");
                    void applyOverride(target.baseId, sourceKey);
                  }}
                >
                  <IconPairPreview baseAsset={previewBaseAsset} pairedAsset={previewPairedAsset} previewContext={previewContext} />
                  <span>
                    <strong>Icon {target.baseId}</strong>
                    <small>{target.override?.sourceLabel ?? target.sourceLabel ?? target.asset?.label ?? (target.referenced ? "Referenced scenario icon target" : "Available scenario icon target")}</small>
                    <small className={`icon-target-source-badge ${sourceStatus}`} title={monsterIconTargetStatusTitle(sourceStatus)}>
                      {statusLabel}{target.override ? `: ${target.override.sourceLabel ?? `Source ${target.override.sourceBaseIconId}`}` : ""}
                    </small>
                  </span>
                </button>
              );
            })}
            {filteredTargets.length === 0 ? <p className="empty-copy compact">No monster icon targets match that search.</p> : null}
          </div>
        </section>
      </div>
    </article>
  );
}

function MonsterWorkbench({
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
        <aside
          className={`combat-record-list scrapbook-list combined-scrapbook-list${libraryDropActive ? " drop-active" : ""}`}
          aria-label="Monster Library entries"
          onDragOver={allowLibraryDrop}
          onDragEnter={allowLibraryDrop}
          onDragLeave={leaveLibraryDrop}
          onDrop={dropMonsterToLibrary}
        >
          <header className="monster-list-header">
            <div className="monster-list-heading-row">
              <strong className="combat-pane-title">Monster Library</strong>
              <div className="monster-list-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setPopulateMenuOpen((open) => !open)}
                >
                  Populate Scenario...
                </button>
              </div>
            </div>
            {populateMenuOpen ? (
              <div className="monster-populate-menu" role="menu" aria-label="Populate scenario from monster library">
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateStockMonsters}>
                  Copy Stock Monsters
                  <small>Fill missing built-in IDs.</small>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateVisibleLibrary} disabled={filteredLibrary.length === 0}>
                  Copy Visible Library
                  <small>{filteredLibrary.length} visible entr{filteredLibrary.length === 1 ? "y" : "ies"}.</small>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateCustomLibrary} disabled={!libraryEntries.some(isProvidenceMonsterLibraryEntry)}>
                  Copy Custom Library
                  <small>Providence entries only.</small>
                </button>
              </div>
            ) : null}
          </header>
          <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.currentTarget.value)} placeholder="Search monster library..." />
          <div className="combat-record-scroll">
            {filteredLibrary.map((entry) => {
              const custom = isProvidenceMonsterLibraryEntry(entry);
              const librarySelectionActive = activePreview === "library";
              const selectedForCopy = librarySelectionActive && selectedLibraryIds.includes(entry.id);
              const selectedLibraryEntry = librarySelectionActive && entry.id === selectedLibrary?.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  draggable
                  className={`${selectedLibraryEntry ? "selected" : ""}${selectedForCopy ? " multi-selected" : ""}`}
                  aria-selected={selectedForCopy}
                  onClick={(event) => selectLibraryMonster(entry, event)}
                  onDragStart={(event) => startLibraryDrag(entry, event)}
                  onDragEnd={() => {
                    setScenarioDropActive(false);
                    setLibraryDropActive(false);
                  }}
                >
                  <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
                  <span>
                    <strong>{scrapbookName(entry)}</strong>
                    <small>{custom ? "Providence library" : "Built-in"} | {scrapbookFacts(entry)}</small>
                    {selectedForCopy && selectedLibraryIds.length > 1 ? <small className="monster-selected-badge">Selected for copy</small> : null}
                  </span>
                </button>
              );
            })}
            {filteredLibrary.length === 0 && <p className="empty-copy compact">No library monsters match that search.</p>}
          </div>
        </aside>

        <aside
          className={`combat-record-list scenario-monster-list${scenarioDropActive ? " drop-active" : ""}`}
          aria-label="Scenario monster records"
          onDragOver={allowScenarioDrop}
          onDragEnter={allowScenarioDrop}
          onDragLeave={leaveScenarioDrop}
          onDrop={dropLibraryMonsterToScenario}
        >
          <header className="monster-list-header">
            <div className="monster-list-heading-row">
              <strong className="combat-pane-title">Scenario Monsters</strong>
              <div className="monster-list-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => {
                    onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: nextMonsterId });
                    selectScenarioMonster(nextMonsterId);
                  }}
                >
                  New Monster {nextMonsterId}
                </button>
              </div>
            </div>
          </header>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scenario monsters..." />
          <div className="combat-record-scroll">
            {filtered.map((entry) => (
              <ScenarioMonsterRow
                key={entry.id}
                entry={entry}
                activeSetId={activeSetId}
                selected={activePreview === "scenario" && selectedId === entry.id}
                iconEntries={iconEntries}
                project={project}
                lookups={lookups}
                previewContext={previewContext}
                onSelect={selectScenarioMonster}
                onDragStart={startScenarioDrag}
                onDragEnd={() => setLibraryDropActive(false)}
              />
            ))}
            {filtered.length === 0 && <p className="empty-copy compact">No scenario monsters match that search.</p>}
          </div>
        </aside>
      </div>

      {activePreview === "library" && multiSelectedLibraryEntries.length > 1 ? (
        <MonsterLibraryMultiSelection
          entries={multiSelectedLibraryEntries}
          project={project}
          onCopy={() => void copyLibraryEntriesToScenario(multiSelectedLibraryEntries, `Copy ${multiSelectedLibraryEntries.length} selected library monsters to scenario`)}
          onClear={clearLibraryMultiSelection}
        />
      ) : activePreview === "library" && selectedLibrary && selectedLibraryTemplate ? (
        <MonsterEditor
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
        <MonsterEditor
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

type ScenarioMonsterRowProps = {
  entry: ScenarioMonsterListEntry;
  activeSetId: MonsterSetId;
  selected: boolean;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (id: number) => void;
  onDragStart: (monster: MonsterRecord, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
};

const ScenarioMonsterRow = memo(function ScenarioMonsterRow({
  entry,
  activeSetId,
  selected,
  iconEntries,
  project,
  lookups,
  previewContext,
  onSelect,
  onDragStart,
  onDragEnd
}: ScenarioMonsterRowProps) {
  const monster = entry.fallback;
  if (!monster) return null;
  return (
    <button
      type="button"
      draggable
      className={selected ? "selected" : ""}
      onClick={() => onSelect(entry.id)}
      onDragStart={(event) => onDragStart(monster, event)}
      onDragEnd={onDragEnd}
    >
      <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} compact />
      <span>
        <strong>{monster.displayName || `Monster ${entry.id}`}</strong>
        <small>{monsterFacts(monster)}</small>
        <MonsterSetBadges entry={entry} activeSetId={activeSetId} />
      </span>
    </button>
  );
}, areScenarioMonsterRowPropsEqual);

function areScenarioMonsterRowPropsEqual(previous: ScenarioMonsterRowProps, next: ScenarioMonsterRowProps) {
  return previous.entry === next.entry
    && previous.activeSetId === next.activeSetId
    && previous.selected === next.selected
    && previous.iconEntries === next.iconEntries
    && previous.lookups === next.lookups
    && samePreviewContextInputs(previous.previewContext, next.previewContext)
    && sameProjectIconInputs(previous.project, next.project);
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

function MonsterSetBadges({
  entry,
  activeSetId
}: {
  entry: { normal: MonsterRecord | null; monster: MonsterRecord | null; mega: MonsterRecord | null };
  activeSetId: MonsterSetId;
}) {
  return (
    <span className="monster-set-badges" aria-label="Monster set availability">
      {MONSTER_SET_OPTIONS.map((option) => {
        const available = option.id === 0 ? Boolean(entry.normal) : option.id === 1 ? Boolean(entry.monster) : Boolean(entry.mega);
        return (
          <span key={option.id} className={`${available ? "available" : "missing"}${activeSetId === option.id ? " active" : ""}`}>
            {option.label}
          </span>
        );
      })}
    </span>
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

function MonsterEditor({
  project,
  catalog,
  monster,
  iconEntries,
  lookups,
  previewContext,
  description,
  headerMeta,
  onUpdate,
  onUpdateDescription,
  onCopyToLibrary,
  onReplaceScenario,
  onOpenIconSet,
  onDuplicate,
  onClear,
  duplicateLabel = "Duplicate",
  replaceLabel = "Replace Scenario",
  clearLabel = "Clear To Defaults"
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  description: string;
  headerMeta?: ReactNode;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
  onUpdateDescription: (text: string) => void;
  onCopyToLibrary?: () => void;
  onReplaceScenario?: () => void;
  onOpenIconSet?: () => void;
  onDuplicate: () => void;
  onClear?: () => void;
  duplicateLabel?: string;
  replaceLabel?: string;
  clearLabel?: string;
}) {
  useCombatRenderTiming("MonsterEditor");
  const [detailsMonsterId, setDetailsMonsterId] = useState<number | null>(null);
  const detailsReady = detailsMonsterId === monster.id;
  useEffect(() => {
    setDetailsMonsterId(null);
    const timer = window.setTimeout(() => setDetailsMonsterId(monster.id), 450);
    return () => window.clearTimeout(timer);
  }, [monster.id]);
  return (
    <article className="combat-editor monster-editor scenario-monster-editor">
      <header className="combat-editor-header monster-editor-title-header monster-record-editor-header">
        <div className="combat-editor-actions monster-editor-record-actions">
          {onCopyToLibrary ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToLibrary}>Copy To Library</button> : null}
          {onReplaceScenario ? <button type="button" className="btn btn-danger btn-xs" title="Explicitly replace the selected Normal scenario monster slot" onClick={onReplaceScenario}>{replaceLabel}</button> : null}
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>{duplicateLabel}</button>
          {onClear ? <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>{clearLabel}</button> : null}
        </div>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
      </header>
      <div className="monster-editor-section-grid monster-editor-identity-description-grid">
        <section className="monster-section monster-identity-section">
          <MonsterIconControl
            monster={monster}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            onCommit={(iconId) => onUpdate({ iconId })}
            onOpenIconSet={onOpenIconSet}
          />
          <div className="monster-field-grid">
            <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
            <MacroReferenceField project={project} value={monster.deathMacro} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
          </div>
        </section>
        <section className="monster-section monster-description-section">
          <SectionHeader title="Monster Description" help="Data DES bestiary/scrapbook text." />
          <TextAreaField label="Description" value={description} placeholder="No monster description." onCommit={onUpdateDescription} />
        </section>
      </div>
      <div className="monster-editor-section-grid monster-editor-primary-grid">
        <MonsterNumberSection
          title="Combat Stats"
          className="monster-compact-number-section"
          monster={monster}
          fields={[
            ["Stamina Level", "hitDice"],
            ["Bonus Stamina", "staminaBonus"],
            ["Agility", "agility"],
            ["Move Max", "movementMax"],
            ["Armor Rating", "armor"],
            ["Magic Resist %", "magicResistance"],
            ["Magic + Required To Hit", "magicToHit"],
            ["Victory Points", "exp"],
            ["Spell Points", "spellPoints"],
            ["Max Spell Points", "maxSpellPoints"]
          ]}
          onUpdate={onUpdate}
        />
        <MonsterBehaviorSection
          project={project}
          catalog={catalog}
          monster={monster}
          onUpdate={onUpdate}
        />
      </div>
      {detailsReady ? (
        <>
          <div className="monster-editor-section-grid monster-editor-reference-grid">
            <div className="monster-attacks-traits-column">
              <section className="monster-section monster-attacks-section">
                <SectionHeader title="Attacks" />
                <div className="monster-attack-equipment-row">
                  <WeaponIdField project={project} catalog={catalog} value={monster.weapon} onCommit={(weapon) => onUpdate({ weapon })} />
                </div>
                <div className="monster-attacks-grid">
                  {Array.from({ length: 5 }, (_, row) => {
                    const values = monster.attacks[row] ?? [0, 0, 0, 0];
                    const updateAttackSlot = (slot: number, value: number) => {
                      const attacks = [...monster.attacks];
                      while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                      attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                      onUpdate({ attacks });
                    };
                    return (
                      <div key={row} className="monster-attack-row">
                        <strong>Attack {row + 1}</strong>
                        <NumberField label="Damage Low" value={values[0] ?? 0} onCommit={(value) => updateAttackSlot(0, value)} />
                        <NumberField label="Damage High" value={values[1] ?? 0} onCommit={(value) => updateAttackSlot(1, value)} />
                        <MonsterAttackCodePicker label="Form" value={values[2] ?? 0} options={MONSTER_ATTACK_FORM_OPTIONS} onCommit={(value) => updateAttackSlot(2, value)} />
                        <MonsterAttackCodePicker label="Special" value={values[3] ?? 0} options={MONSTER_ATTACK_SPECIAL_OPTIONS} onCommit={(value) => updateAttackSlot(3, value)} />
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="monster-section monster-traits-section">
                <SectionHeader title="Traits" />
                <div className="monster-trait-grid combat-traits">
                  {["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"].map((label, index) => (
                    <label key={label} className="combat-check-field">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(monster.typeFlags[index])}
                        onChange={(event) => onUpdate({ typeFlags: updateArraySlot(monster.typeFlags, index, event.currentTarget.checked ? 1 : 0, 8) })}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
            <section className="monster-section monster-spells-loot-section">
              <SectionHeader title="Spells / Loot" help="Spell slots, gold/gems/jewelry caps, and item drops." />
              <div className="monster-spells-loot-layout">
                <div className="monster-spells-column">
                  <SpellSlotGrid project={project} catalog={catalog} values={monster.spells} onCommit={(spells) => onUpdate({ spells })} />
                </div>
                <div className="monster-loot-column">
                  <ItemSlotGrid project={project} catalog={catalog} values={monster.items} onCommit={(items) => onUpdate({ items })} />
                  <MonsterMoneyFields
                    values={monster.money}
                    iconEntries={iconEntries}
                    catalog={catalog}
                    lookups={lookups}
                    previewContext={previewContext}
                    onCommit={(money) => onUpdate({ money })}
                  />
                </div>
              </div>
            </section>
          </div>
          <section className="monster-section monster-advanced-section">
            <SectionHeader title="Saves, Immunities, And Conditions" />
            <div className="monster-advanced-group monster-advanced-immunities">
              <CompactCheckboxFields labels={MONSTER_IMMUNITY_LABELS} values={monster.spellImmunities} onCommit={(spellImmunities) => onUpdate({ spellImmunities })} />
            </div>
            <div className="monster-advanced-group monster-advanced-saves">
              <CompactArrayFields labels={MONSTER_SAVE_LABELS} values={monster.saves} onCommit={(saves) => onUpdate({ saves })} />
            </div>
            <div className="monster-advanced-group monster-advanced-conditions">
              <CompactArrayFields labels={CONDITION_LABELS} values={monster.conditions} onCommit={(conditions) => onUpdate({ conditions })} />
            </div>
          </section>
        </>
      ) : <div className="monster-editor-details-placeholder" aria-hidden="true" />}
    </article>
  );
}


function RecordList({
  title,
  query,
  onQuery,
  count,
  total,
  newLabel,
  help,
  onNew,
  children
}: {
  title: string;
  query: string;
  onQuery: (value: string) => void;
  count: number;
  total: number;
  newLabel: string;
  help?: string;
  onNew: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="combat-record-list">
      <header>
        <div>
          {help ? (
            <TutorialTip title={title} body={help} side="right">
              <strong>{title}</strong>
            </TutorialTip>
          ) : (
            <strong>{title}</strong>
          )}
          <small>{count.toLocaleString()} shown | {total.toLocaleString()} total</small>
        </div>
        <button type="button" className="btn btn-primary btn-xs" onClick={onNew}>{newLabel}</button>
      </header>
      <input value={query} onChange={(event) => onQuery(event.currentTarget.value)} placeholder={`Search ${title.toLowerCase()}...`} />
      <div className="combat-record-scroll">{children}</div>
    </aside>
  );
}


function MonsterIconControl({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  onCommit,
  onOpenIconSet
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (iconId: number) => void;
  onOpenIconSet?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const statusLabel = monsterIconSourceStatusLabel(resolution.sourceStatus);
  const canPickTargetIcon = Boolean(onOpenIconSet);
  const iconTitle = `${canPickTargetIcon ? "Choose monster icon" : "Monster icon"} (${statusLabel}: ${resolution.label})`;
  const showSourceBadge = resolution.sourceStatus !== "default-art";
  const preview = <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />;
  return (
    <div className="monster-icon-control">
      {canPickTargetIcon ? (
        <button
          type="button"
          className="monster-icon-button"
          onClick={() => setPickerOpen(true)}
          title={iconTitle}
          aria-label="Choose monster icon"
        >
          {preview}
        </button>
      ) : <span title={iconTitle}>{preview}</span>}
      {showSourceBadge ? (
        <span className={`monster-icon-source-badge ${resolution.sourceStatus}`} title={resolution.label}>
          {statusLabel}
        </span>
      ) : null}
      {canPickTargetIcon ? (
        <MonsterIconPickerModal
          open={pickerOpen}
          currentIconId={Math.abs(monster.iconId)}
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelect={(iconId) => onCommit(iconId)}
          onOpenIconSet={onOpenIconSet}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MonsterIconPickerModal({
  open,
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  open: boolean;
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <MonsterIconPickerDialog
      currentIconId={currentIconId}
      project={project}
      iconEntries={iconEntries}
      lookups={lookups}
      previewContext={previewContext}
      query={query}
      onQuery={setQuery}
      onSelect={onSelect}
      onOpenIconSet={onOpenIconSet}
      onClose={onClose}
    />
  );
}

function MonsterIconPickerDialog({
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  query,
  onQuery,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => monsterIconPickerOptions(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [
        String(option.baseId),
        `icon ${option.baseId}`,
        option.sourceLabel,
        monsterIconSourceStatusLabel(option.sourceStatus)
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);
  return (
    <div className="monster-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="monster-icon-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-icon-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="monster-icon-picker-header">
          <div>
            <h3 id="monster-icon-picker-title">Choose Monster Icon</h3>
          </div>
          <div className="monster-icon-picker-actions">
            {onOpenIconSet ? (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  onClose();
                  onOpenIconSet();
                }}
              >
                Open Icon Set
              </button>
            ) : null}
            <button type="button" className="btn btn-icon btn-xs" aria-label="Close icon picker" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <input
          className="monster-icon-picker-search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          placeholder="Search icon ID or source..."
          autoFocus
        />
        <div className="monster-icon-picker-grid" role="listbox" aria-label="Scenario monster icon targets">
          {filteredOptions.map((option) => {
            const selected = option.baseId === currentIconId;
            return (
              <button
                key={option.key}
                type="button"
                className={`monster-icon-picker-option${selected ? " selected" : ""}`}
                aria-selected={selected}
                role="option"
                onClick={() => {
                  onSelect(option.baseId);
                  onClose();
                }}
              >
                <IconPairPreview baseAsset={option.asset} pairedAsset={option.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>Icon {option.baseId}</strong>
                  <small>{monsterIconSourceStatusLabel(option.sourceStatus)}</small>
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 ? <p className="empty-copy compact">No scenario target icons match that search.</p> : null}
        </div>
      </section>
    </div>
  );
}

function MonsterNumberSection({
  title,
  className = "",
  monster,
  fields,
  onUpdate
}: {
  title: string;
  className?: string;
  monster: MonsterRecord;
  fields: Array<[string, keyof MonsterRecord]>;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  return (
    <section className={`monster-section${className ? ` ${className}` : ""}`}>
      <SectionHeader title={title} />
      <div className="monster-field-grid">
        {fields.map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
      </div>
    </section>
  );
}

function MonsterBehaviorSection({
  project,
  catalog,
  monster,
  onUpdate
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  const fields: Array<[string, keyof MonsterRecord]> = [
    ["Side", "traitor"],
    ["Size", "size"],
    ["Attacks", "attackCount"],
    ["Magical Attacks", "magicAttackCount"],
    ["Damage Plus", "damageBonus"],
    ["Cast Spell %", "castPercent"],
    ["Run Away %", "runPercent"],
    ["Surrender %", "surrenderPercent"],
    ["Use Missile %", "missilePercent"]
  ];
  return (
    <section className="monster-section monster-compact-number-section">
      <SectionHeader title="Behavior" />
      <div className="monster-field-grid">
        <NumberField label="Side" value={Number(monster.traitor ?? 0)} onCommit={(traitor) => onUpdate({ traitor })} />
        <NumberField label="Size" value={Number(monster.size ?? 0)} onCommit={(size) => onUpdate({ size })} />
        <RequiredWeaponField project={project} catalog={catalog} value={monster.distance} onCommit={(distance) => onUpdate({ distance })} />
        {fields.slice(2).map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
        <SummonEligibleField value={monster.canSummon} onCommit={(canSummon) => onUpdate({ canSummon })} />
      </div>
    </section>
  );
}

function SectionHeader({ title, help }: { title: string; help?: string }) {
  return (
    <header>
      <strong>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : title}
      </strong>
    </header>
  );
}

type CombatSelectOption = { key: string; value: number; label: string; detail?: string };

function MacroReferenceField({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(
    () => (project.triggers ?? [])
      .filter((trigger) => trigger.source === "Data ED3")
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.filter((action) => action.rawCode !== 0).length} action step(s)`
      })),
    [project.triggers]
  );
  return <NumberSelectField label="Monster Macro" help={MONSTER_DEATH_ACTION_HELP} value={value} options={options} emptyLabel="No monster macro" onCommit={onCommit} />;
}

function WeaponIdField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(() => [
    ...RANDOM_WEAPON_OPTIONS,
    ...itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: item.detail
    }))
  ], [catalog, project]);
  return <NumberSelectField label="Weapon Used" value={value} options={options} emptyLabel="No weapon" onCommit={onCommit} />;
}

function RequiredWeaponField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(() => monsterRequiredWeaponOptions(project, catalog), [catalog, project]);
  return (
    <NumberSelectField
      label="Required Weapon"
      value={monsterRequiredWeaponDisplayCode(value)}
      options={options}
      emptyLabel="All weapons"
      help={MONSTER_REQUIRED_WEAPON_HELP}
      onCommit={(displayCode) => onCommit(monsterRequiredWeaponStoredCode(displayCode))}
    />
  );
}

function SummonEligibleField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <NumberSelectField
      label="Summon Eligible"
      value={Math.trunc(Number.isFinite(value) ? value : 0)}
      options={MONSTER_SUMMON_ELIGIBLE_OPTIONS}
      emptyLabel="0 = No"
      help={MONSTER_SUMMON_ELIGIBLE_HELP}
      onCommit={onCommit}
    />
  );
}

function monsterRequiredWeaponOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const weaponOptions = new Map(
    itemReferenceOptions(project, catalog)
      .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
      .map((item) => [item.value, item])
  );
  return [
    { key: "required-weapon:blunt", value: -1, label: "Blunt only", detail: "Stored as -1." },
    { key: "required-weapon:sharp", value: -2, label: "Sharp only", detail: "Stored as -2." },
    ...Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = weaponOptions.get(code);
      return {
        key: `required-weapon:${code}`,
        value: code,
        label: item?.label ?? `Weapon ${code}`,
        detail: item ? [item.detail, item.sourceState].filter(Boolean).join(" | ") : `Specific weapon code ${code}.`
      };
    })
  ];
}

export function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

export function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
}

function SpellSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(() => combatSpellOptions(project, catalog), [catalog, project]);
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 10 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Spell ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No spell"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 10))}
        />
      ))}
    </div>
  );
}

function ItemSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => itemReferenceOptions(project, catalog).map((item) => ({ key: item.key, value: item.value, label: item.label, detail: item.detail })),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 6 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Item ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No item"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 6))}
        />
      ))}
    </div>
  );
}

function NumberSelectField({
  label,
  value,
  options,
  emptyLabel,
  help,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  emptyLabel: string;
  help?: string;
  onCommit: (value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedOption = value !== 0 ? options.find((option) => option.value === value) ?? null : null;
  const hasCurrentValue = value !== 0 && !selectedOption;
  const renderedOptions = expanded ? options : selectedOption ? [selectedOption] : [];
  return (
    <label className="combat-field combat-select-field">
      <FieldLabel label={label} help={help} />
      <select
        value={String(value)}
        onFocus={() => setExpanded(true)}
        onMouseDown={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          onCommit(Number(event.currentTarget.value));
          setExpanded(false);
        }}
      >
        <option value="0">{emptyLabel}</option>
        {hasCurrentValue && <option value={String(value)}>Current value {value}</option>}
        {renderedOptions.map((option, index) => (
          <option key={`${option.key}:${option.value}:${index}`} value={String(option.value)} title={option.detail}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MonsterAttackCodePicker({
  label,
  value,
  options,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  onCommit: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const menuOptions = selected ? options : [{ key: `${label}:current:${value}`, value, label: `Current value ${value}` }, ...options];
  const title = selected ? `${selected.value} ${selected.label}` : `Current value ${value}`;
  return (
    <div
      className="combat-field monster-attack-code-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <FieldLabel label={label} />
      <button
        type="button"
        className="monster-attack-code-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {value}
      </button>
      {open ? (
        <div className="monster-attack-code-menu" role="listbox" aria-label={label}>
          {menuOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCommit(option.value);
                setOpen(false);
              }}
            >
              <span>{option.value}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactArrayFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array">
      {labels.map((label, index) => (
        <NumberField
          key={`${label}:${index}`}
          label={label}
          value={values[index] ?? 0}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, labels.length))}
        />
      ))}
    </div>
  );
}

function CompactCheckboxFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array monster-compact-checkbox-grid">
      {labels.map((label, index) => (
        <label key={`${label}:${index}`} className="combat-check-field monster-compact-check-field">
          <span title={label}>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(values[index])}
            onChange={(event) => onCommit(updateArraySlot(values, index, event.currentTarget.checked ? 1 : 0, labels.length))}
          />
        </label>
      ))}
    </div>
  );
}

function MonsterMoneyFields({
  values,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  values: number[];
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (values: number[]) => void;
}) {
  return (
    <div className="combat-compact-array monster-money-fields">
      <strong className="monster-money-title">Treasure</strong>
      {MONSTER_MONEY_REWARDS.map((reward, index) => (
        <MonsterMoneyField
          key={reward.label}
          reward={reward}
          value={values[index] ?? 0}
          iconEntries={iconEntries}
          catalog={catalog}
          lookups={lookups}
          previewContext={previewContext}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, MONSTER_MONEY_LABELS.length))}
        />
      ))}
    </div>
  );
}

function MonsterMoneyField({
  reward,
  value,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  reward: (typeof MONSTER_MONEY_REWARDS)[number];
  value: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="monster-money-row" title={`${reward.label}: ${MONSTER_MONEY_HELP}`}>
      <ReferenceIconPreview
        iconId={reward.iconId}
        fallbackValue={reward.iconId}
        iconEntries={iconEntries}
        catalog={catalog}
        lookups={lookups}
        previewContext={previewContext}
        preferLibraryIcon
      />
      <input
        type="number"
        aria-label={reward.label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(Number.isFinite(Number(draft)) ? Number(draft) : value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
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

function ReferenceIconPreview({
  iconId,
  fallbackValue,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  preferLibraryIcon = false
}: {
  iconId: number | null;
  fallbackValue: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  preferLibraryIcon?: boolean;
}) {
  const normalizedIconId = iconId ? Math.abs(iconId) : 0;
  const decoded = iconId ? iconEntries[iconId] ?? iconEntries[normalizedIconId] ?? iconEntries[-normalizedIconId] : null;
  const lookupAsset = normalizedIconId ? lookups.iconAssetsByAbsId.get(normalizedIconId) ?? null : null;
  const libraryAsset = iconId
    ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", iconId, "icon")
      ?? (normalizedIconId !== iconId ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", normalizedIconId, "icon") : null)
    : null;
  const directPath = preferLibraryIcon && libraryAsset ? null : decoded?.url ?? lookupAsset?.previewPath ?? null;
  const url = useResolvedPreviewUrl(directPath, null, libraryAsset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="scrapbook-reference-icon" title={iconId ? `cicn ${iconId}` : `Raw ID ${fallbackValue}`}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{fallbackValue}</b>}
    </span>
  );
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

function scrapbookEntryForMonsterId(catalog: LibraryCatalog | null, monsterId: number) {
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

function copyScrapbookMonsterToScenario(
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

function combatSpellOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const options = new Map<number, CombatSelectOption>();
  const add = (option: CombatSelectOption) => {
    if (!option.value || options.has(option.value)) return;
    options.set(option.value, option);
  };
  for (const spell of project.spellOverrides ?? []) {
    const name = spell.displayName?.trim() || `Custom Spell ${spell.id}`;
    add({ key: `project-spell:${spell.id}`, value: spell.id, label: `${name} (${spell.id})`, detail: "Scenario custom spell override" });
  }
  for (const entry of catalog?.records ?? []) {
    if (entry.type !== "spell") continue;
    const id = recordSummaryNumber(entry, "packedSpellId");
    if (id == null) continue;
    const displayName = recordSummaryString(entry, "displayName");
    const level = recordSummaryNumber(entry, "spellLevel");
    const spellClass = recordSummaryNumber(entry, "spellcasterClass");
    add({
      key: entry.id,
      value: id,
      label: `${displayName || entry.label || "Spell"} (${id})`,
      detail: [
        level != null ? `level ${level}` : "",
        spellClass != null ? `class ${spellClass + 1}` : "",
        entry.source
      ].filter(Boolean).join(" | ")
    });
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

function spellPreviewIconIdMap(project: Project, catalog: LibraryCatalog | null) {
  const icons = new Map<number, number>();
  const add = (id: number | null, summary: Record<string, unknown>) => {
    if (!id || icons.has(id)) return;
    const iconId = spellPreviewIconId(summary);
    if (iconId) icons.set(id, iconId);
  };
  for (const spell of project.spellOverrides ?? []) {
    add(spell.id, { spellLook1: spell.spellLook1, spellLook2: spell.spellLook2 });
  }
  for (const record of catalog?.records ?? []) {
    if (record.type !== "spell") continue;
    add(recordSummaryNumber(record, "packedSpellId"), record.summary);
  }
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "spell") continue;
    add(summaryFieldNumber(entity.summary, "packedSpellId"), entity.summary);
  }
  return icons;
}

function spellPreviewIconId(summary: Record<string, unknown>) {
  const castLook = summaryFieldNumber(summary, "spellLook1");
  if (castLook != null) {
    const frame = spellAnimationFrameIds(castLook, "blank-cast")[0];
    if (frame) return frame;
  }
  const resolutionLook = summaryFieldNumber(summary, "spellLook2");
  if (resolutionLook != null) {
    return spellAnimationFrameIds(resolutionLook, "default-resolution")[0] ?? null;
  }
  return null;
}

function summaryFieldNumber(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryNumber(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryString(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "string" ? value.trim() : "";
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

function IconPairPreview({
  baseAsset,
  pairedAsset,
  previewContext
}: {
  baseAsset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  return (
    <span className="icon-pair-preview" aria-hidden="true">
      <LibraryIconSwatch asset={baseAsset} previewContext={previewContext} />
      <LibraryIconSwatch asset={pairedAsset} previewContext={previewContext} />
    </span>
  );
}

function LibraryIconSwatch({
  asset,
  previewContext
}: {
  asset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  const resourceId = asset?.resourceId ?? 0;
  const url = useResolvedPreviewUrl(asset?.previewPath ?? null, null, asset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="icon-pair-swatch" title={asset?.label ?? (resourceId ? `cicn ${resourceId}` : "Missing paired icon")}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{resourceId || "?"}</b>}
    </span>
  );
}

async function loadLibraryResourceBase64(asset: LibraryAsset, previewContext: PreviewRuntimeContext, catalog?: LibraryCatalog | null) {
  const providenceBase64 = iconLibraryAssetResourceBase64(catalog, asset);
  if (providenceBase64) return providenceBase64;
  if (previewContext.desktopRuntime) {
    if (!previewContext.workspaceDir) throw new Error("Workspace directory is required to load Monster Mash resource data.");
    return invoke<string>("load_library_resource_data", {
      workspaceDir: previewContext.workspaceDir,
      source: asset.source,
      relativePath: asset.relativePath
    });
  }
  const data = await loadBrowserBundledLibraryResourceData(asset);
  return data ? bytesToBase64(data) : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function monsterIconCanvasPreset(key: (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]) {
  return MONSTER_ICON_CANVAS_PRESETS.find((preset) => preset.key === key) ?? MONSTER_ICON_CANVAS_PRESETS[0];
}

function stripFileExtension(name: string) {
  return name.replace(/\.[^.]+$/, "").trim();
}

async function loadImageFileToRgba(file: File, width: number, height: number) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Unable to load ${file.name}.`));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const left = Math.floor((width - drawWidth) / 2);
    const top = Math.floor((height - drawHeight) / 2);
    context.drawImage(image, left, top, drawWidth, drawHeight);
    return { width, height, rgba: context.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbaToDataUrl(image: { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
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

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
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

function tabFromEditor(editor: string): CombatWorkbenchTab {
  if (editor === "monsters") return "monsters";
  if (editor === "scrapbook") return "monsters";
  if (editor === "iconSet" || editor === "icon-set") return "iconSet";
  return "battles";
}

function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}
