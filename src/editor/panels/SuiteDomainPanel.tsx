import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ENTITY_TYPE_LABELS } from "../constants";
import { loadBrowserBundledLibraryAssetPreview } from "../browser/library";
import { TutorialTip } from "../components/TutorialTip";
import { playPreviewUrl, useIconPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { isDraftEntity, LibraryDraftSpec } from "../libraryDrafts";
import { EditorTab, LibraryAsset, LibraryCatalog, LibraryEntity, ManagedAssetKind, Project, ProjectCommand, RealmzTargetRecordKind, ScenarioItemRecord, SemanticEntity, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { TargetRecordEditor } from "./scripts/TargetRecordEditor";
import { directRecordsForTool, labelForSelectedId, type DirectRecordRow } from "../directRecordIndex";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceOptions, itemTextDisplay, type ItemReferenceCategory, type ItemReferenceOption, type ItemTextDisplay } from "../itemReferences";
import { ruleCasteName, ruleRaceName } from "../ruleNames";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_DESCRIPTOR_LABELS, REALMZ_CASTES, REALMZ_RACES } from "../rulesCatalog";

const DOMAIN_CONFIG: Record<EditorTab, { title: string; subtitle: string; editors: DomainEditor[] }> = {
  maps: {
    title: "Land/Dungeon Maps",
    subtitle: "Land levels, dungeon levels, layout, and special land tile workflows.",
    editors: [
      { id: "land", label: "Land Editor", entityTypes: ["map"] },
      { id: "land-layout", label: "Land Layout", entityTypes: ["land-layout"], createType: "land-layout" },
      { id: "map-editor", label: "Map Editor", entityTypes: ["map"] },
      { id: "dungeon", label: "Dungeon Editor", entityTypes: ["map"] },
      { id: "special-land", label: "Special Land Tiles", entityTypes: ["special-land-tile"], createType: "special-land-tile" }
    ]
  },
  "player-maps": {
    title: "Player Maps",
    subtitle: "Maps/Notes helper maps, names, pictures, markers, and description text.",
    editors: [
      { id: "map-records", label: "Player Maps", entityTypes: ["map record"], createType: "map record" }
    ]
  },
  scripts: {
    title: "Action Point Hub",
    subtitle: "Action Points, GOSUBs, macros, global macros, quests, and cross-links into scenario content.",
    editors: [
      { id: "action-points", label: "Action Points / GOSUBs", entityTypes: ["trigger", "action-slot"] },
      { id: "macros", label: "Macros", entityTypes: ["macro"], createType: "macro" },
      { id: "global-macros", label: "Global Events", entityTypes: ["global-macro"], createType: "global-macro" },
      { id: "quests", label: "Quests", entityTypes: ["quest flag"], createType: "quest flag" }
    ]
  },
  scenario: {
    title: "Scenario",
    subtitle: "Startup information, restrictions, contact metadata, and legacy security.",
    editors: [
      { id: "startup", label: "Scenario Startup Information", entityTypes: ["scenario-startup", "scenario", "contact-info"], createType: "scenario-startup" },
      { id: "restrictions", label: "Scenario Restrictions", entityTypes: ["scenario-restriction"], createType: "scenario-restriction" },
      { id: "global-macros", label: "Global Events", entityTypes: ["global-macro", "macro"], createType: "global-macro" },
      { id: "registration", label: "Scenario Security / Registration Codes", entityTypes: ["registration-security", "action-slot"] }
    ]
  },
  encounters: {
    title: "Encounters",
    subtitle: "Simple, complex, rogue, and timed encounter authoring.",
    editors: [
      { id: "simple", label: "Simple Encounter Editor", entityTypes: ["simple encounter"], createType: "simple encounter" },
      { id: "complex", label: "Complex Encounter Editor", entityTypes: ["complex encounter"], createType: "complex encounter" },
      { id: "rogue", label: "Rogue Encounter Editor", entityTypes: ["thief-encounter"], createType: "thief-encounter" },
      { id: "timed", label: "Time Encounter Editor", entityTypes: ["timed-encounter"], createType: "timed-encounter" }
    ]
  },
  combat: {
    title: "Combat",
    subtitle: "Battles, monsters, monster icons, and shared monster datasets.",
    editors: [
      { id: "battles", label: "Battle Editor", entityTypes: ["battle"], createType: "battle" },
      { id: "monsters", label: "Monster Editor", entityTypes: ["monster"], createType: "monster" },
      { id: "scrapbook", label: "Monster Scrapbook", entityTypes: ["monster-scrapbook-entry"], createType: "monster-scrapbook-entry" },
      { id: "mash", label: "Monster Mash", entityTypes: ["monster-mash-icon"], createType: "monster-mash-icon" }
    ]
  },
  economy: {
    title: "Economy",
    subtitle: "Treasure, items, shops, and shared icon/item libraries.",
    editors: [
      { id: "treasure", label: "Treasure Editor", entityTypes: ["treasure"], createType: "treasure" },
      { id: "items", label: "Item Editor", entityTypes: ["item", "item-reference"], createType: "item" },
      { id: "shops", label: "Shop Editor", entityTypes: ["shop"], createType: "shop" },
      { id: "bag", label: "Bag of Holding", entityTypes: ["bag-item"], createType: "bag-item" },
      { id: "vault", label: "Vault of Arcana", entityTypes: ["vault-icon"], createType: "vault-icon" }
    ]
  },
  rules: {
    title: "Rules",
    subtitle: "Custom spells, races, castes, and selectors used by scenario logic.",
    editors: [
      { id: "spells", label: "Spell Editor", entityTypes: ["spell", "spell-reference"], createType: "spell" },
      { id: "races", label: "Race Editor", entityTypes: ["race"], createType: "race" },
      { id: "castes", label: "Caste Editor", entityTypes: ["caste"], createType: "caste" }
    ]
  },
  assets: {
    title: "Assets",
    subtitle: "Pictures, sounds, resource forks, special land tiles, and render assets.",
    editors: [
      { id: "pictures", label: "Pictures", entityTypes: ["picture", "tile atlas"] },
      { id: "sounds", label: "Sounds", entityTypes: ["sound"] },
      { id: "special-land", label: "Create Special Land Tiles", entityTypes: ["special-land-tile"], createType: "special-land-tile" },
      {
        id: "resource-inventory",
        label: "Resource Fork Inventory",
        entityTypes: [
          "resource type",
          "resource",
          "picture",
          "icon-resource",
          "sound",
          "text-resource",
          "style-resource",
          "string-list-resource",
          "realmz-metadata-resource",
          "version-resource"
        ]
      }
    ]
  },
  text: {
    title: "Text",
    subtitle: "Scenario strings, external text resources, style resources, and spell-check workflows.",
    editors: [
      { id: "messages", label: "Scenario Strings", entityTypes: ["message"], createType: "message" },
      { id: "text-import", label: "Text Import / Export / Spell Checking", entityTypes: ["message", "text-resource", "string-list-resource", "style-resource"] }
    ]
  },
  records: { title: "Records", subtitle: "Decoded binary records and byte provenance.", editors: [] },
  linter: { title: "Linter", subtitle: "Compatibility diagnostics and export blockers.", editors: [] },
  export: { title: "Export", subtitle: "Realmz scenario folder export readiness.", editors: [] }
};

type DomainEditor = {
  id: string;
  label: string;
  entityTypes: string[];
  createType?: string;
};

type EconomySection = "treasure" | "items" | "shops";

const ECONOMY_HEADER_HELP = "Economy covers scenario Treasure records, scenario Shop records, item references, custom scenario items, and bundled read-only item/icon libraries.";
const ENCOUNTERS_HEADER_HELP = "Encounters covers source Data ED, Data ED2, Data TD2, and Data TD3 records: simple choices, complex branch tests, rogue/thief scenes, and timed macro triggers.";
const ECONOMY_SECTION_HELP: Record<EconomySection, string> = {
  treasure: "Data TD reward records with victory points, money, gems, jewelry, and twenty item slots.",
  items: "Shared Realmz item families plus scenario Data NI items. Built-in items are reference/copy sources; custom scenario items live in IDs 900-999.",
  shops: "Data SD source shop records with item IDs, quantities, and inflation. Saved-game/runtime stock can mutate separately."
};
const ITEM_EDITOR_HELP = "Browse item IDs by Divinity family, inspect built-in/library data, and copy built-in items into scenario custom slots when you need editable item definitions.";
const TREASURE_EDITOR_HELP = "Build source-backed Data TD treasure rewards. Fixed rewards and item slots are exported as scenario data and can be targeted from scripts and encounters.";
const TREASURE_ITEMS_HELP = "Treasure records have twenty ordered item slots. Zero means empty; use the item browser to fill the next open slot or edit a raw ID directly to preserve imported data.";
const SHOP_RECORD_HELP = "Shop records are source Data SD stock definitions. Realmz may copy them into runtime cache stock during play, so source stock and saved-game stock are separate concepts.";
const CUSTOM_ITEM_HELP = "Custom scenario items use item IDs 900-999. Built-in items stay reference-only unless copied into one of these scenario-backed slots.";
const SIMPLE_ENCOUNTER_HELP = "Simple Encounters are source Data ED records with a prompt, four choice text buffers, back-out behavior, attempt fields, and four result action rows.";
const COMPLEX_ENCOUNTER_HELP = "Complex Encounters are source Data ED2 records with spell, item, thief, typed-word, and action-picker branch tests that feed four result action rows.";
const THIEF_ENCOUNTER_HELP = "Rogue Encounters are source Data TD2 records for lock, trap, search, and thief-skill scenes. Runtime can mutate trap/action state after play begins.";
const TIMED_ENCOUNTER_HELP = "Timed Encounters are source Data TD3 records that execute a macro/door when schedule, chance, item, quest, and location gates match.";

export function SuiteDomainPanel({
  tab,
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onSelectEditor,
  onApplyCommand,
  onCreateDraft,
  onUpdateDraft,
  onUpdateLibraryCatalog,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = ""
}: {
  tab: EditorTab;
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onCreateDraft?: (spec: LibraryDraftSpec) => void;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
}) {
  void onUpdateLibraryCatalog;
  const config = DOMAIN_CONFIG[tab];
  const economyActive = tab === "economy";
  const [economySection, setEconomySection] = useState<EconomySection>(() =>
    economySectionFromEditor(activeEditor) ?? readStoredEconomySection()
  );
  useEffect(() => {
    if (!economyActive) return;
    const next = economySectionFromEditor(activeEditor);
    if (next) setEconomySection(next);
  }, [activeEditor, economyActive]);
  useEffect(() => {
    if (economyActive) writeStoredEconomySection(economySection);
  }, [economyActive, economySection]);
  const focusedEditor = config.editors.find((editor) => editor.id === activeEditor) ?? null;
  const headerEditor = tab === "encounters" || economyActive ? null : focusedEditor;
  const visibleEditors = focusedEditor ? [focusedEditor] : config.editors;
  const libraryEntities = catalog?.entities ?? [];
  const suppressDetailPanel = tab === "encounters" || economyActive;
  const selectedDetail = suppressDetailPanel ? null :
    directDetailForSelection(project, selectedEntity?.id ?? null) ??
    libraryEntities.find((entity) => entity.id === selectedEntity?.id) ??
    (tab === "records" ? [
      ...(project?.semanticSchema?.records ?? []),
      ...(catalog?.records ?? [])
    ].find((record) => record.id === selectedEntity?.id) : null) ??
    null;
  const records = tab === "records" ? [
    ...(project?.semanticSchema?.records?.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? []),
    ...(catalog?.records.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? [])
  ] : [];
  const economyTargetRecordTypes = economyActive ? economyTargetRecordTypesForSection(economySection) : null;
  const targetRecordTypes = project ? economyTargetRecordTypes ?? targetRecordTypesForEditor(tab, activeEditor) : [];
  const focusedTargetEditor = targetRecordTypes.length > 0 && activeEditor !== "domain" && tab !== "encounters" && !economyActive;
  const selectedTargetRecordType = selectedTargetRecordTypeFromEntity(selectedEntity?.id ?? "", targetRecordTypes);
  const [overviewTargetRecordType, setOverviewTargetRecordType] = useState<RealmzTargetRecordKind | null>(() => readStoredOverviewTargetRecordType(tab));
  useEffect(() => {
    if (targetRecordTypes.length === 0) return;
    setOverviewTargetRecordType((current) => {
      const stored = readStoredOverviewTargetRecordType(tab);
      const next =
        selectedTargetRecordType ??
        targetRecordTypeFromEditor(tab, activeEditor) ??
        (current && targetRecordTypes.includes(current) ? current : null) ??
        (stored && targetRecordTypes.includes(stored) ? stored : null) ??
        targetRecordTypes[0];
      return current === next ? current : next;
    });
  }, [activeEditor, selectedTargetRecordType, tab, targetRecordTypes.join("|")]);
  useEffect(() => {
    if (!overviewTargetRecordType || !targetRecordTypes.includes(overviewTargetRecordType)) return;
    writeStoredOverviewTargetRecordType(tab, overviewTargetRecordType);
  }, [overviewTargetRecordType, tab, targetRecordTypes]);
  const visibleTargetRecordTypes =
    focusedTargetEditor ? targetRecordTypes :
    overviewTargetRecordType && targetRecordTypes.includes(overviewTargetRecordType) ? [overviewTargetRecordType] :
    targetRecordTypes.slice(0, 1);
  const itemWorkbenchActive = economyActive && economySection === "items";
  const headerHelp = domainHeaderHelp(tab);
  const headerTitle = headerEditor ? headerEditor.label : config.title;
  const showTargetSwitcher = targetRecordTypes.length > 1 && (tab === "encounters" || (!economyActive && !focusedTargetEditor));
  const showOverviewCards = tab !== "records" && tab !== "linter" && !focusedTargetEditor && !itemWorkbenchActive && targetRecordTypes.length === 0;
  return (
    <section className={`domain-workbench${suppressDetailPanel ? " domain-workbench-no-detail" : ""}`}>
      <header className="domain-header">
        <div>
          <h1>
            {headerHelp ? (
              <TutorialTip title={headerTitle} body={headerHelp} side="right">
                <span>{headerTitle}</span>
              </TutorialTip>
            ) : (
              headerTitle
            )}
          </h1>
          <p>{headerEditor ? editorSubtitle(headerEditor) : config.subtitle}</p>
        </div>
        <small>{project ? project.scenario.name : "Library workbench"}</small>
      </header>
      <div className={`domain-main-layout${suppressDetailPanel ? " no-detail" : ""}`}>
        <div className="domain-main-column">
      {economyActive && project && (
        <EconomySectionSwitcher project={project} selectedSection={economySection} onSelectSection={setEconomySection} />
      )}
      {itemWorkbenchActive && project && (
        <ItemCatalogWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {project && targetRecordTypes.length > 0 && (
        <div className="domain-target-stack">
          {showTargetSwitcher && (
            <DomainTargetSwitcher
              project={project}
              recordTypes={targetRecordTypes}
              selectedRecordType={visibleTargetRecordTypes[0] ?? targetRecordTypes[0]}
              onSelectRecordType={setOverviewTargetRecordType}
            />
          )}
          {visibleTargetRecordTypes.map((recordType) => (
            economyActive && recordType === "treasure" ? (
              <TreasureWorkbench
                key={recordType}
                project={project}
                catalog={catalog}
                selectedEntity={selectedEntity}
                previewContext={{ desktopRuntime, projectDir, workspaceDir }}
                onSelectEntity={onSelectEntity}
                onApplyCommand={onApplyCommand}
              />
            ) : economyActive && recordType === "shop" ? (
              <ShopWorkbench
                key={recordType}
                project={project}
                catalog={catalog}
                selectedEntity={selectedEntity}
                previewContext={{ desktopRuntime, projectDir, workspaceDir }}
                onSelectEntity={onSelectEntity}
                onApplyCommand={onApplyCommand}
              />
            ) : (
              <TargetRecordWorkbench
                key={recordType}
                project={project}
                catalog={catalog}
                recordType={recordType}
                selectedEntity={selectedEntity}
                previewContext={{ desktopRuntime, projectDir, workspaceDir }}
                onSelectEntity={onSelectEntity}
                onSelectEditor={onSelectEditor}
                onSelectRecordType={setOverviewTargetRecordType}
                onApplyCommand={onApplyCommand}
              />
            )
          ))}
        </div>
      )}
      {tab === "records" && (
        <div className="domain-editor-grid">
          <article className="domain-editor-card">
            <header>
              <span>Decoded Records</span>
              <b>{records.length.toLocaleString()}</b>
            </header>
            <ScrollArea className="domain-entity-list" aria-label="Decoded records">
              {includeSelectedEntry(records, selectedEntity?.id ?? null, 240).map((record, index) => (
                <button key={renderListKey("domain-record", record, index)} type="button" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
                  <strong>{record.label}</strong>
                  <small>{record.type} | {record.editState}</small>
                </button>
              ))}
            </ScrollArea>
          </article>
        </div>
      )}
      {tab === "linter" && (
        <div className="domain-editor-grid">
          <article className="domain-editor-card">
            <header>
              <span>Library Diagnostics</span>
              <b>{catalog?.diagnostics.length ?? 0}</b>
            </header>
            <ScrollArea className="domain-entity-list" aria-label="Library diagnostics">
              {catalog?.diagnostics.slice(0, 240).map((diagnostic, index) => (
                <button key={renderListKey("domain-diagnostic", diagnostic, index)} type="button">
                  <strong>{diagnostic.message}</strong>
                  <small>{diagnostic.severity} | {diagnostic.type}</small>
                </button>
              ))}
            </ScrollArea>
            {!catalog?.diagnostics.length && <p>No library diagnostics.</p>}
          </article>
        </div>
      )}
      <div className="domain-editor-grid">
        {showOverviewCards && visibleEditors.map((editor) => {
          const matches = matchingEntries(editor, project, libraryEntities);
          return (
            <article key={editor.id} className="domain-editor-card">
              <header>
                <span>{editor.label}</span>
                <div className="domain-card-actions">
                  <b>{matches.length.toLocaleString()}</b>
                  {editor.createType && onCreateDraft && (
                    <button
                      type="button"
                      onClick={() => onCreateDraft({ editorId: editor.id, editorLabel: editor.label, entityType: editor.createType ?? editor.entityTypes[0] })}
                    >
                      New
                    </button>
                  )}
                </div>
              </header>
              <EntityRows entities={matches} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} />
              {matches.length === 0 && <p>No entries yet. Use New to create a Providence draft where available, or import/open source data.</p>}
            </article>
          );
        })}
      </div>
        </div>
        {!suppressDetailPanel && <DomainDetailPanel detail={selectedDetail} catalog={catalog} onUpdateDraft={onUpdateDraft} />}
      </div>
    </section>
  );
}

function editorSubtitle(editor: DomainEditor) {
  if (editor.createType) return `Create, inspect, and validate ${editor.label.toLowerCase()} entries. Export is available when that record family is supported.`;
  return `Inspect ${editor.label.toLowerCase()} records, resources, links, and diagnostics.`;
}

function domainHeaderHelp(tab: EditorTab) {
  if (tab === "economy") return ECONOMY_HEADER_HELP;
  if (tab === "encounters") return ENCOUNTERS_HEADER_HELP;
  return null;
}

type DomainListEntry = DirectRecordRow | LibraryEntity;

function matchingEntries(editor: DomainEditor, project: Project | null, libraryEntities: LibraryEntity[]) {
  const wanted = new Set(editor.entityTypes);
  const projectMatches = project ? directRowsForEditor(project, editor) : [];
  const libraryMatches = libraryEntities.filter((entity) => wanted.has(entity.type));
  return [...projectMatches, ...libraryMatches];
}

function directRowsForEditor(project: Project, editor: DomainEditor): DirectRecordRow[] {
  const direct = directRecordsForTool(project, editor.id);
  if (direct.length) return direct;
  if (editor.id === "land" || editor.id === "map-editor" || editor.id === "dungeon") {
    return project.maps
      .filter((map) => editor.id === "dungeon" ? map.levelType === "dungeon" : editor.id === "land" ? map.levelType === "land" : true)
      .map((map) => ({ id: `map:${map.levelType}:${map.index}`, label: map.name, type: "map", summary: `${map.width} x ${map.height} ${map.levelType}` }));
  }
  if (editor.id === "land-layout") {
    return project.landLayout ? [{ id: "land-layout:0", label: "Land Layout", type: "land-layout", summary: `${project.landLayout.rows} x ${project.landLayout.cols}` }] : [];
  }
  if (editor.id === "special-land") {
    return [
      ...project.assets
        .filter((asset) => asset.kind === "special-land-tile")
        .map((asset) => ({ id: asset.id, label: asset.label, type: "special-land-tile", summary: `cicn ${asset.resourceId}` })),
      ...(project.assetCatalog?.icons ?? [])
        .filter((asset) => asset.resourceId < 0)
        .map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "special-land-tile", summary: asset.source }))
    ];
  }
  if (editor.id === "global-macros") {
    return project.scenario.globalMacroHooks ? [{ id: "scenario:global-macros", label: "Global Events", type: "global-macro", summary: "Scenario global hooks" }] : [];
  }
  if (editor.id === "quests") {
    return (project.questLabels ?? []).map((record) => ({ id: `quest-flag:${record.id}`, label: record.label || `Quest ${record.id}`, type: "quest flag", summary: record.note ?? "" }));
  }
  if (editor.id === "startup") {
    const rows: DirectRecordRow[] = [];
    if (project.scenario.shell) rows.push({ id: "scenario:startup", label: "Startup Info", type: "scenario-startup", summary: `land ${project.scenario.shell.landLevel}` });
    if (project.scenario.contactInfo) rows.push({ id: "contact:info", label: "Contact Info", type: "contact-info", summary: project.scenario.contactInfo.scenarioName || project.scenario.name });
    return rows;
  }
  if (editor.id === "restrictions") {
    return project.scenario.restrictions ? [{ id: "scenario:restrictions", label: "Restrictions", type: "scenario-restriction", summary: "Scenario restrictions" }] : [];
  }
  if (editor.id === "registration") {
    return project.scenario.securityBackup ? [{ id: "scenario:security", label: "Security / Registration", type: "registration-security", summary: "Divinity code segments" }] : [];
  }
  if (editor.id === "spells") return project.spellOverrides.map((record) => ({ id: `spell:${record.id}`, label: record.displayName || `Spell ${record.id}`, type: "spell-reference", summary: `sound ${record.sound1}/${record.sound2}` }));
  if (editor.id === "races") return project.raceOverrides.map((record) => ({ id: `race:${record.id}`, label: ruleRaceName(project, record.id, record.displayName), type: "race", summary: `default icons ${record.defaultIconSet}` }));
  if (editor.id === "castes") return project.casteOverrides.map((record) => ({ id: `caste:${record.id}`, label: ruleCasteName(project, record.id, record.displayName), type: "caste", summary: `default icon ${record.defaultIcon}` }));
  if (editor.id === "pictures") {
    return [
      ...(project.assetCatalog?.pictures ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "picture", summary: asset.source })),
      ...(project.assetCatalog?.tilesets ?? []).filter((asset) => asset.pictId != null).map((asset) => ({ id: `resource:PICT:${asset.pictId}`, label: asset.name, type: "tile atlas", summary: asset.source }))
    ];
  }
  if (editor.id === "sounds") {
    return [
      ...project.assets.filter((asset) => asset.resourceType.trim() === "snd").map((asset) => ({ id: asset.id, label: asset.label, type: "sound", summary: `snd ${asset.resourceId}` })),
      ...(project.assetCatalog?.sounds ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "sound", summary: asset.source }))
    ];
  }
  if (editor.id === "resource-inventory") {
    return [
      ...project.assets.map((asset) => ({ id: asset.id, label: asset.label, type: asset.kind, summary: `${asset.resourceType} ${asset.resourceId}` })),
      ...(project.assetCatalog?.icons ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "icon-resource", summary: asset.source })),
      ...(project.assetCatalog?.pictures ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "picture", summary: asset.source })),
      ...(project.assetCatalog?.sounds ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "sound", summary: asset.source }))
    ];
  }
  if (editor.id === "text-import") {
    return [
      ...(project.messages ?? []).map((record) => ({ id: `message:${record.id}`, label: `Message ${record.id}`, type: "message", summary: record.text.slice(0, 80) })),
      ...(project.optionLabels ?? []).map((record) => ({ id: `option-label:${record.id}`, label: `Option Label ${record.id}`, type: "option-label", summary: record.text.slice(0, 80) }))
    ];
  }
  return [];
}

function directDetailForSelection(project: Project | null, entityId: string | null): DirectRecordRow | null {
  if (!project || !entityId) return null;
  const rows = [
    ...DOMAIN_CONFIG.maps.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.scripts.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.scenario.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.text.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.combat.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.economy.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.rules.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.assets.editors.flatMap((editor) => directRowsForEditor(project, editor))
  ];
  const direct = rows.find((row) => row.id === entityId);
  if (direct) return direct;
  const label = labelForSelectedId(project, null, entityId);
  return label && label !== entityId ? { id: entityId, label, type: "record", summary: "Direct project record" } : null;
}

function DomainTargetSwitcher({
  project,
  recordTypes,
  selectedRecordType,
  onSelectRecordType
}: {
  project: Project;
  recordTypes: RealmzTargetRecordKind[];
  selectedRecordType: RealmzTargetRecordKind;
  onSelectRecordType: (recordType: RealmzTargetRecordKind) => void;
}) {
  return (
    <div className="domain-target-switcher" role="tablist" aria-label="Writable Realmz record family">
      {recordTypes.map((recordType) => {
        const selected = selectedRecordType === recordType;
        const count = targetRecords(project, recordType).length;
        const help = targetRecordHelp(recordType);
        return (
          <button
            key={recordType}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "active" : ""}
            onClick={() => onSelectRecordType(recordType)}
          >
            {help ? (
              <TutorialTip title={targetRecordLabel(recordType)} body={help} side="right">
                <span>{targetRecordLabel(recordType)}</span>
              </TutorialTip>
            ) : (
              <span>{targetRecordLabel(recordType)}</span>
            )}
            <b>{count.toLocaleString()}</b>
          </button>
        );
      })}
    </div>
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
  const sections: Array<{ id: EconomySection; label: string; count: number; help: string }> = [
    { id: "treasure", label: "Treasure", count: project.treasures?.length ?? 0, help: ECONOMY_SECTION_HELP.treasure },
    { id: "items", label: "Items", count: itemCount, help: ECONOMY_SECTION_HELP.items },
    { id: "shops", label: "Shops", count: project.shops?.length ?? 0, help: ECONOMY_SECTION_HELP.shops }
  ];
  return (
    <div className="domain-target-switcher economy-section-switcher" role="tablist" aria-label="Economy sections">
      {sections.map((section) => {
        const selected = section.id === selectedSection;
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "active" : ""}
            onClick={() => onSelectSection(section.id)}
          >
            <TutorialTip title={section.label} body={section.help} side="right">
              <span>{section.label}</span>
            </TutorialTip>
            <b>{section.count.toLocaleString()}</b>
          </button>
        );
      })}
    </div>
  );
}

function ItemCatalogWorkbench({
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(240);
  const selectedFromEntity = itemIdFromEntityId(selectedEntity?.id ?? "");
  const filteredOptions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return options.filter((option) => {
      if (category !== "all" && option.category !== category) return false;
      if (!text) return true;
      return [option.label, option.detail, option.summary, String(option.value)].some((part) => part.toLowerCase().includes(text));
    });
  }, [category, options, query]);
  useEffect(() => {
    setVisibleLimit(240);
  }, [category, query]);
  const visibleOptions = useMemo(() => filteredOptions.slice(0, visibleLimit), [filteredOptions, visibleLimit]);
  const hiddenOptionCount = Math.max(0, filteredOptions.length - visibleOptions.length);
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null);
  const selectedId =
    selectedFromEntity ??
    (localSelectedId != null && options.some((option) => option.value === localSelectedId) ? localSelectedId : null) ??
    filteredOptions[0]?.value ??
    options[0]?.value ??
    0;
  const selectedOption = options.find((option) => option.value === selectedId) ?? filteredOptions[0] ?? options[0] ?? null;
  const selectedEntityDetail = selectedOption ? findItemCatalogEntity(project, catalog, selectedOption.value) : null;

  const selectItem = (option: ItemReferenceOption) => {
    setLocalSelectedId(option.value);
    onSelectEntity(selectEntityFromId(`item:${option.value}`));
  };

  return (
    <article className="item-workbench">
      <header className="item-workbench-header">
        <div>
          <h2>
            <TutorialTip title="Item Editor" body={ITEM_EDITOR_HELP} side="right">
              <span>Item Editor</span>
            </TutorialTip>
          </h2>
          <p>Browse Realmz items by Divinity category, including scenario special items loaded from this scenario's item table.</p>
        </div>
            <strong>{deferredOptions ? `${options.length.toLocaleString()} item reference${options.length === 1 ? "" : "s"}` : "Loading item references"}</strong>
      </header>
      <div className="item-workbench-layout">
        <aside className="item-browser-panel">
          <div className="item-category-tabs" role="tablist" aria-label="Item categories">
            {ITEM_REFERENCE_CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={category === entry.id ? "active" : ""}
                onClick={() => setCategory(entry.id)}
                title={entry.range ? `${entry.label}: ${entry.range}` : entry.label}
              >
                <span>{entry.label}</span>
                {entry.range && <small>{entry.range}</small>}
              </button>
            ))}
          </div>
          <input
            className="item-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search item ID, name, category, or use..."
            aria-label="Search items"
          />
          <ScrollArea className="item-browser-list" aria-label="Item catalog">
            {visibleOptions.map((option) => (
              <button
                key={`${option.value}:${option.key}`}
                type="button"
                className={option.value === selectedOption?.value ? "selected" : ""}
                onClick={() => selectItem(option)}
              >
                <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
                <span>
                  <strong>{option.label.replace(/\s+\(-?\d+\)$/, "")}</strong>
                  <small>{option.detail}</small>
                </span>
                <b>{option.value}</b>
              </button>
            ))}
            {hiddenOptionCount > 0 && (
              <div className="item-browser-load-more">
                <small>
                  {hiddenOptionCount} more item reference{hiddenOptionCount === 1 ? "" : "s"}.
                </small>
                <button type="button" onClick={() => setVisibleLimit((limit) => limit + 240)}>
                  Load {Math.min(240, hiddenOptionCount)} More
                </button>
              </div>
            )}
            {filteredOptions.length === 0 && <p>No items match this category/search.</p>}
          </ScrollArea>
        </aside>
        <ItemDetailPanel
          option={selectedOption}
          entity={selectedEntityDetail}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      </div>
    </article>
  );
}

function ItemOptionIcon({
  option,
  project,
  catalog,
  previewContext
}: {
  option: ItemReferenceOption;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
}) {
  const iconUrl = useIconPreviewUrl(option.iconId, project, catalog, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [iconUrl]);
  const usableUrl = iconUrl && iconUrl !== failedUrl ? iconUrl : null;
  return (
    <span className="item-option-icon" title={option.iconId ? `cicn ${option.iconId}` : `${itemCategoryBadge(option.category)} item`}>
      {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{itemCategoryBadge(option.category)}</i>}
    </span>
  );
}

function useDeferredItemReferenceOptions(project: Project, catalog?: LibraryCatalog | null) {
  const [options, setOptions] = useState<ItemReferenceOption[] | null>(null);
  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      const next = itemReferenceOptions(project, catalog);
      if (!disposed) setOptions(next);
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [catalog, project]);
  return options;
}

function itemCategoryBadge(category: ItemReferenceCategory) {
  if (category === "weapon") return "W";
  if (category === "armor") return "AR";
  if (category === "accessory") return "AC";
  if (category === "magic") return "M";
  if (category === "supply") return "SP";
  return "IT";
}

function ItemDetailPanel({
  option,
  entity,
  project,
  catalog,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  option: ItemReferenceOption | null;
  entity: SemanticEntity | LibraryEntity | null;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  if (!option) {
    return (
      <section className="item-detail-panel">
        <p>No item records are available. Import or refresh the Realmz library data to populate the catalog.</p>
      </section>
    );
  }
  const scenarioItem = scenarioItemRecordFor(project, option.value);
  const customRecordId = customItemRecordId(option.value);
  const summary = scenarioItem ? scenarioItemSummary(scenarioItem) : entity?.summary ?? {};
  const usages = itemUsageLinks(project, option.value);
  const unique = numberField(summary, "cost") != null && numberField(summary, "cost")! < 0;
  const customEditable = customRecordId != null;
  const customSlotOccupied = Boolean(scenarioItem && scenarioItemSlotInUse(scenarioItem));
  const nextCustomId = nextCustomItemId(project);
  const itemText = itemTextDisplay(project, option.value, catalog);
  const editableItemText = {
    ...itemText,
    unidentifiedName: itemText.unidentifiedName || itemText.identifiedName || `Item ${option.value}`,
    identifiedName: itemText.identifiedName || itemText.unidentifiedName || `Custom Item ${option.value}`,
    description: itemText.description
  };
  return (
    <section className="item-detail-panel">
      <header>
        <div className="item-detail-title">
          <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
          <div>
            <span>{option.value}</span>
            <h3>{option.label.replace(/\s+\(-?\d+\)$/, "")}</h3>
            <p>{itemFamilyLabel(option.value)}{unique ? " | unique item cost" : ""}</p>
          </div>
        </div>
        <b>{itemEditRangeLabel(option.value)}</b>
      </header>
      <div className="item-action-strip">
        {customEditable ? (
          <>
            <span>{customSlotOccupied ? "Custom items are stored in this scenario and exported with it." : "This custom item slot is empty and available for a scenario-specific item."}</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
            onClick={() => onApplyCommand?.({ kind: "updateScenarioItemRecord", label: `Edit custom item ${option.value}`, id: customRecordId, changes: { itemId: option.value } })}
            >
              Create Custom Item
            </button>
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => onApplyCommand?.({ kind: "clearScenarioItemRecord", label: `Clear custom item ${option.value}`, id: customRecordId })}
            >
              Clear Custom Item
            </button>
          </>
        ) : nextCustomId != null ? (
          <>
            <span>Built-in Realmz item. Copy it into a custom slot to edit a scenario-specific version.</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => {
                const id = nextCustomId - 800;
                const copiedText = itemTextDisplay(project, option.value, catalog);
                onApplyCommand?.({
                  kind: "updateScenarioItemRecord",
                  label: `Copy item ${option.value} to custom item ${nextCustomId}`,
                  id,
                  changes: { ...scenarioItemChangesFromSummary(summary), itemId: nextCustomId }
                });
                onApplyCommand?.({
                  kind: "updateItemTextRecord",
                  label: `Copy item ${option.value} names to custom item ${nextCustomId}`,
                  itemId: nextCustomId,
                  changes: {
                    unidentifiedName: copiedText.unidentifiedName || copiedText.identifiedName || `Item ${nextCustomId}`,
                    identifiedName: copiedText.identifiedName || copiedText.unidentifiedName || `Custom Item ${nextCustomId}`,
                    description: copiedText.description
                  }
                });
                onSelectEntity(selectEntityFromId(`item:${nextCustomId}`));
              }}
            >
              Copy To Custom Item {nextCustomId}
            </button>
          </>
        ) : (
          <span>All custom item slots are currently in use.</span>
        )}
      </div>
      {!customEditable && (
        <>
          <ItemTextSummary itemText={editableItemText} />
          <div className="item-detail-grid">
            <ItemFact label="Icon" value={numberText(summary, "iconId")} />
            <ItemFact label="Type" value={itemTypeText(numberField(summary, "type"))} />
            <ItemFact label="Cost" value={costText(numberField(summary, "cost"))} />
            <ItemFact label="Charges" value={numberText(summary, "charge")} />
            <ItemFact label="Sound" value={numberText(summary, "sound")} />
            <ItemFact label="Cursed As" value={numberText(summary, "cursedItemId")} />
          </div>
          <div className="item-detail-columns">
            <ItemFieldGroup title="Equipping" help="Stats and equipment-facing fields used by Realmz item wear/use behavior. Built-in values are reference data unless this is a custom scenario item.">
              <ItemFact label="Strength" value={numberText(summary, "st")} />
              <ItemFact label="Luck" value={numberText(summary, "lu")} />
              <ItemFact label="Movement" value={numberText(summary, "movement")} />
              <ItemFact label="Armor Rating" value={numberText(summary, "ac")} />
              <ItemFact label="Magic Resist" value={numberText(summary, "magicResistance")} />
              <ItemFact label="Spell Points" value={numberText(summary, "spellPoints")} />
              <ItemFact label="Hands" value={numberText(summary, "hands")} />
              <ItemFact label="Weight" value={numberText(summary, "weight")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Damage" help="Damage and resistance modifiers used by weapon and item behavior. Values come from shared Data ID or scenario Data NI depending on the item family.">
              <ItemFact label="Base Damage" value={numberText(summary, "damage")} />
              <ItemFact label="Heat" value={numberText(summary, "heat")} />
              <ItemFact label="Cold" value={numberText(summary, "cold")} />
              <ItemFact label="Electric" value={numberText(summary, "electric")} />
              <ItemFact label="Vs. Small" value={numberText(summary, "vSmall")} />
              <ItemFact label="Vs. Large" value={numberText(summary, "vLarge")} />
              <ItemFact label="Vs. Undead" value={numberText(summary, "vsUndead")} />
              <ItemFact label="Vs. Evil" value={numberText(summary, "vsEvil")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Special Behavior" help="Special item fields drive unusual runtime behavior. Door-like items can call Extra Action Points, so changes here can affect Scripts.">
              <ItemFact label="Special 1" value={numberText(summary, "special1")} />
              <ItemFact label="Special 2" value={numberText(summary, "special2")} />
              <ItemFact label="Special 3" value={numberText(summary, "special3")} />
              <ItemFact label="Special 4" value={numberText(summary, "special4")} />
              <ItemFact label="Special 5" value={numberText(summary, "special5")} />
              <ItemFact label="Weight / Charge" value={numberText(summary, "weightPerCharge")} />
              <ItemFact label="Drop On Empty" value={numberText(summary, "dropOnEmpty")} />
              <ItemFact label="Magical" value={numberText(summary, "magical")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Use Restrictions" help="Race, caste, category, and class-gating values used to decide who can use this item.">
              <ItemRestrictionSummary
                itemCat0={numberField(summary, "itemCat0") ?? 0}
                itemCat1={numberField(summary, "itemCat1") ?? 0}
                raceRestrictions={numberField(summary, "raceRestrictions") ?? 0}
                casteRestrictions={numberField(summary, "casteRestrictions") ?? 0}
                specificRace={numberField(summary, "specificRace") ?? 0}
                specificCaste={numberField(summary, "specificCaste") ?? 0}
                raceClassOnly={numberField(summary, "raceClassOnly") ?? 0}
                casteClassOnly={numberField(summary, "casteClassOnly") ?? 0}
              />
            </ItemFieldGroup>
          </div>
        </>
      )}
      {customEditable && (
        <ScenarioItemEditor
          record={scenarioItem ?? emptyScenarioItemForUi(customRecordId)}
          itemId={option.value}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          itemText={editableItemText}
          onChange={(field, value) => {
            onApplyCommand?.({
              kind: "updateScenarioItemRecord",
              label: `Update custom item ${option.value}`,
              id: customRecordId,
              changes: { itemId: option.value, [field]: value } as Partial<ScenarioItemRecord>
            });
          }}
          onTextChange={(changes) => onApplyCommand?.({
            kind: "updateItemTextRecord",
            label: `Update custom item ${option.value} text`,
            itemId: option.value,
            changes: {
              unidentifiedName: editableItemText.unidentifiedName,
              identifiedName: editableItemText.identifiedName,
              description: editableItemText.description,
              ...changes
            }
          })}
        />
      )}
      <section className="item-used-by">
        <header>Used By</header>
        {usages.length ? usages.map((usage) => (
          <button key={`${usage.target}:${usage.label}`} type="button" onClick={() => onSelectEntity(selectEntityFromId(usage.target))}>
            <strong>{usage.label}</strong>
            <small>{usage.detail}</small>
          </button>
        )) : <p>No project treasure, shop, or script references currently use this item.</p>}
      </section>
    </section>
  );
}

function ItemTextSummary({ itemText }: { itemText: ItemTextDisplay }) {
  return (
    <ItemFieldGroup title="Names And Description" className="item-field-group-full item-text-summary">
      <ItemFact label="Unidentified Name" value={itemText.unidentifiedName || "None"} />
      <ItemFact label="Identified Name" value={itemText.identifiedName || "None"} />
      <div className="item-fact item-fact-description">
        <span>Description</span>
        <code>{itemText.description || "None"}</code>
      </div>
    </ItemFieldGroup>
  );
}

function ItemFieldGroup({ title, help, className = "", children }: { title: string; help?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`item-field-group ${className}`.trim()}>
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : (
          title
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function ItemFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="item-fact">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

type ScenarioItemNumberKey =
  | "iconId"
  | "type"
  | "st"
  | "blunt"
  | "hands"
  | "lu"
  | "movement"
  | "ac"
  | "magicResistance"
  | "damage"
  | "spellPoints"
  | "sound"
  | "weight"
  | "cost"
  | "charge"
  | "cursedItemId"
  | "magical"
  | "itemCat0"
  | "itemCat1"
  | "vSmall"
  | "vLarge"
  | "heat"
  | "cold"
  | "electric"
  | "vsUndead"
  | "vsDemonDevil"
  | "vsEvil"
  | "special1"
  | "special2"
  | "special3"
  | "special4"
  | "special5"
  | "weightPerCharge"
  | "dropOnEmpty";

const SCENARIO_ITEM_EDIT_GROUPS: Array<{
  title: string;
  fields: Array<{ key: ScenarioItemNumberKey; label: string; help?: string }>;
}> = [
  {
    title: "Identity And Use",
    fields: [
      { key: "iconId", label: "Icon", help: "Icon drawn for this item in Realmz lists and menus." },
      { key: "type", label: "Type", help: "Realmz item type/category field." },
      { key: "cost", label: "Cost", help: "Negative cost marks a unique item in Realmz." },
      { key: "charge", label: "Charges", help: "Number of uses or charges, when the item supports them." },
      { key: "sound", label: "Sound", help: "Sound played by item effects, when used." }
    ]
  },
  {
    title: "Equipping",
    fields: [
      { key: "st", label: "Strength" },
      { key: "hands", label: "Hands" },
      { key: "lu", label: "Luck" },
      { key: "movement", label: "Move" },
      { key: "ac", label: "Armor" },
      { key: "magicResistance", label: "Magic Res." },
      { key: "spellPoints", label: "S.P." },
      { key: "weight", label: "Weight" }
    ]
  },
  {
    title: "Damage And Resistances",
    fields: [
      { key: "damage", label: "Damage" },
      { key: "blunt", label: "Blunt" },
      { key: "vSmall", label: "Vs. Small" },
      { key: "vLarge", label: "Vs. Large" },
      { key: "heat", label: "Heat" },
      { key: "cold", label: "Cold" },
      { key: "electric", label: "Electric" },
      { key: "vsUndead", label: "Vs. Undead" },
      { key: "vsDemonDevil", label: "Vs. Demon/Devil" },
      { key: "vsEvil", label: "Vs. Evil" }
    ]
  },
];

const SCENARIO_ITEM_SPECIAL_FIELDS: Array<{ key: ScenarioItemNumberKey; label: string; help?: string }> = [
  { key: "special5", label: "Bonus / Amount", help: "Amount used by ability, monster-type, and party-condition effects." },
  { key: "weightPerCharge", label: "Weight / Charge", help: "Weight used per charge for charge-like items." },
  { key: "dropOnEmpty", label: "Drop On Empty", help: "Whether Realmz drops this item when its charges are depleted." }
];

function ScenarioItemEditor({
  record,
  itemId,
  project,
  catalog,
  previewContext,
  itemText,
  onChange,
  onTextChange
}: {
  record: ScenarioItemRecord;
  itemId: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemText: ItemTextDisplay;
  onChange: (field: ScenarioItemNumberKey | ItemRestrictionKey, value: number) => void;
  onTextChange: (changes: Partial<Pick<ItemTextDisplay, "unidentifiedName" | "identifiedName" | "description">>) => void;
}) {
  const magicalRawValue = Number(record.magical ?? 0);
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [catalog, project]);
  return (
    <section className="scenario-item-editor" aria-label={`Custom item ${itemId} editor`}>
      <header>
        <div>
          <span>Custom Item {itemId}</span>
          <h4>
            <TutorialTip title="Scenario Item Fields" body={CUSTOM_ITEM_HELP} side="right">
              <span>Scenario Item Fields</span>
            </TutorialTip>
          </h4>
        </div>
        <small>Scenario items</small>
      </header>
      <div className="scenario-item-editor-grid">
        <ItemFieldGroup title="Names And Description" className="item-field-group-full item-name-editor">
          <ItemTextInput
            label="Unidentified Name"
            value={itemText.unidentifiedName || itemText.identifiedName || `Item ${itemId}`}
            onCommit={(value) => onTextChange({ unidentifiedName: value })}
          />
          <ItemTextInput
            label="Identified Name"
            value={itemText.identifiedName || itemText.unidentifiedName || `Custom Item ${itemId}`}
            onCommit={(value) => onTextChange({ identifiedName: value })}
          />
          <ItemTextInput
            label="Description"
            value={itemText.description}
            multiline
            onCommit={(value) => onTextChange({ description: value })}
          />
        </ItemFieldGroup>
        {SCENARIO_ITEM_EDIT_GROUPS.map((group) => (
          <ItemFieldGroup
            key={group.title}
            title={group.title}
            className={group.title === "Identity And Use" ? "item-field-group-compact" : undefined}
          >
            {group.fields.map((field) => field.key === "iconId" ? (
              <ItemIconField
                key={field.key}
                value={Number(record.iconId ?? 0)}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                itemOptions={itemOptions}
                onChange={(value) => onChange("iconId", value)}
              />
            ) : field.key === "type" ? (
              <ItemTypeSelectField
                key={field.key}
                value={Number(record.type ?? 0)}
                onChange={(value) => onChange("type", value)}
              />
            ) : field.key === "sound" ? (
              <ItemSoundField
                key={field.key}
                value={Number(record.sound ?? 0)}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onChange={(value) => onChange("sound", value)}
              />
            ) : (
              <ItemNumberInput
                key={field.key}
                label={field.label}
                value={Number(record[field.key] ?? 0)}
                title={field.help}
                onCommit={(value) => onChange(field.key, value)}
              />
            ))}
          </ItemFieldGroup>
        ))}
        <ItemFieldGroup title="Identification And Curse">
          <ItemMagicField
            value={magicalRawValue}
            onChange={(value) => onChange("magical", value)}
          />
          <CursedFormItemField
            value={Number(record.cursedItemId ?? 0)}
            options={itemOptions}
            onChange={(value) => onChange("cursedItemId", value)}
          />
          <ItemCategorySelectEditor
            itemCat0={record.itemCat0}
            itemCat1={record.itemCat1}
            onChange={(itemCat0, itemCat1) => {
              if (itemCat0 !== record.itemCat0) onChange("itemCat0", itemCat0);
              if (itemCat1 !== record.itemCat1) onChange("itemCat1", itemCat1);
            }}
          />
          {magicalRawValue !== 0 && magicalRawValue !== 1 && (
            <ItemFieldNote>
              Magic raw value {magicalRawValue}; Realmz treats any nonzero value as magical. Toggling normalizes it to 1 or 0.
            </ItemFieldNote>
          )}
        </ItemFieldGroup>
        <ItemFieldGroup title="Race And Caste Restrictions" className="item-field-group-full">
          <ItemUseRestrictionEditor
            record={record}
            onChange={(field, value) => onChange(field, value)}
          />
        </ItemFieldGroup>
        <ItemFieldGroup title="Special Behavior" className="item-field-group-full">
          <ItemSpecialBehaviorSummary record={record} />
          <div className="item-special-field-grid">
            <ItemSpecialEffectCodeField
              value={Number(record.special1 ?? 0)}
              onChange={(value) => onChange("special1", value)}
            />
            <ItemNumberInput
              label="Spell / Amount"
              value={Number(record.special2 ?? 0)}
              title="Spell number for spell-storing items, or amount used by condition and attack effects."
              onCommit={(value) => onChange("special2", value)}
            />
            <ItemSpecialAttributeField
              label="Special 3"
              value={Number(record.special3 ?? 0)}
              onChange={(value) => onChange("special3", value)}
            />
            <ItemSpecialAttributeField
              label="Special 4"
              value={Number(record.special4 ?? 0)}
              onChange={(value) => onChange("special4", value)}
            />
            {SCENARIO_ITEM_SPECIAL_FIELDS.map((field) => (
              <ItemNumberInput
                key={field.key}
                label={field.label}
                value={Number(record[field.key] ?? 0)}
                title={field.help}
                onCommit={(value) => onChange(field.key, value)}
              />
            ))}
          </div>
        </ItemFieldGroup>
      </div>
    </section>
  );
}

type ItemRestrictionKey =
  | "raceRestrictions"
  | "casteRestrictions"
  | "specificRace"
  | "specificCaste"
  | "raceClassOnly"
  | "casteClassOnly";

const CASTE_CLASS_LABELS = [
  "Warrior Castes",
  "Thief Castes",
  "Archer Castes",
  "Sorcerer Castes",
  "Priest Castes",
  "Enchanter Castes",
  "Warrior Wizard Castes"
];

function ItemRestrictionSummary({
  itemCat0,
  itemCat1,
  raceRestrictions,
  casteRestrictions,
  specificRace,
  specificCaste,
  raceClassOnly,
  casteClassOnly
}: {
  itemCat0: number;
  itemCat1: number;
  raceRestrictions: number;
  casteRestrictions: number;
  specificRace: number;
  specificCaste: number;
  raceClassOnly: number;
  casteClassOnly: number;
}) {
  return (
    <div className="item-restriction-summary">
      <ItemFact label="Item Categories" value={summarizeItemCategoryLabels(itemCat0, itemCat1, 5)} />
      <ItemFact label="Cannot Use - Race Types" value={summarizeMaskLabels(raceRestrictions, RACE_DESCRIPTOR_LABELS)} />
      <ItemFact label="Can Use Only - Race Types" value={summarizeMaskLabels(raceClassOnly, RACE_DESCRIPTOR_LABELS)} />
      <ItemFact label="Cannot Use - Caste Types" value={summarizeMaskLabels(casteRestrictions, CASTE_CLASS_LABELS)} />
      <ItemFact label="Can Use Only - Caste Types" value={summarizeMaskLabels(casteClassOnly, CASTE_CLASS_LABELS)} />
      <ItemFact label="Specific Race" value={specificRace ? `${specificRace}: ${REALMZ_RACES[specificRace - 1] ?? "Unknown race"}` : "Any"} />
      <ItemFact label="Specific Caste" value={specificCaste ? `${specificCaste}: ${REALMZ_CASTES[specificCaste - 1] ?? "Unknown caste"}` : "Any"} />
    </div>
  );
}

function ItemCategorySelectEditor({
  itemCat0,
  itemCat1,
  onChange
}: {
  itemCat0: number;
  itemCat1: number;
  onChange: (itemCat0: number, itemCat1: number) => void;
}) {
  const selectedIndex = selectedItemCategoryIndex(itemCat0, itemCat1);
  return (
    <label className="item-category-select-editor">
      <span>Category</span>
      <select
        value={selectedIndex == null ? "" : String(selectedIndex)}
        onChange={(event) => {
          const nextIndex = event.currentTarget.value === "" ? null : Number(event.currentTarget.value);
          onChange(...itemCategoryPairForSingleSelection(nextIndex));
        }}
      >
        <option value="">No category</option>
        {ITEM_CATEGORY_LABELS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ItemMagicField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const magical = value !== 0;
  return (
    <label className="item-check-field" title="Realmz checks this as a nonzero magical-item marker.">
      <input
        type="checkbox"
        checked={magical}
        onChange={(event) => onChange(event.currentTarget.checked ? 1 : 0)}
      />
      <span>Detectable As Magical</span>
    </label>
  );
}

function CursedFormItemField({
  value,
  options,
  onChange
}: {
  value: number;
  options: ItemReferenceOption[];
  onChange: (value: number) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  return (
    <label className="item-number-input item-field-wide" title="If nonzero, Realmz secretly loads this item as the cursed form while keeping the original item identity hidden until revealed.">
      <span>Cursed Form Item</span>
      <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        <option value="0">No cursed form</option>
        {value !== 0 && !selectedOption && <option value={String(value)}>Current item {value}</option>}
        {options.map((option) => (
          <option key={option.key} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ItemFieldNote({ children }: { children: ReactNode }) {
  return <p className="item-field-note">{children}</p>;
}

function ItemSpecialBehaviorSummary({ record }: { record: ScenarioItemRecord }) {
  const descriptions = describeItemSpecialBehavior(record);
  return (
    <div className="item-special-summary">
      <strong>Known Behavior</strong>
      {descriptions.length ? (
        <ul>
          {descriptions.map((description) => <li key={description}>{description}</li>)}
        </ul>
      ) : (
        <p>No known special behavior fields are set.</p>
      )}
    </div>
  );
}

function ItemSpecialEffectCodeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const group = specialEffectGroupForValue(value);
  const groupOptions = specialEffectOptionsForGroup(group);
  const hasKnownValue = groupOptions.some((option) => option.value === value);
  return (
    <div className="item-cascade-field item-special-effect-field" title="Primary Realmz special behavior code. Unknown raw values are preserved until changed.">
      <label>
        <span>Special 1</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialEffectGroup;
            onChange(defaultSpecialEffectValue(nextGroup, value));
          }}
        >
          <option value="none">No special effect</option>
          <option value="power">Power level</option>
          <option value="addCondition">Add condition</option>
          <option value="removeCondition">Remove condition</option>
          <option value="hitBonus">Hit bonus</option>
          <option value="raw">Raw code</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Code" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <label>
          <span>{specialEffectDetailLabel(group)}</span>
          <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
            {!hasKnownValue && <option value={value}>Current code {value}</option>}
            {groupOptions.map((option) => (
              <option key={`${option.value}:${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

type ItemSpecialEffectGroup = "none" | "power" | "addCondition" | "removeCondition" | "hitBonus" | "raw";

function specialEffectGroupForValue(value: number): ItemSpecialEffectGroup {
  if (value === 0) return "none";
  if ((value >= -7 && value <= -1) || value === 8) return "power";
  if (value >= 20 && value <= 59) return "addCondition";
  if (value >= 60 && value <= 99) return "removeCondition";
  if (value >= 120 && value <= 122) return "hitBonus";
  return "raw";
}

function defaultSpecialEffectValue(group: ItemSpecialEffectGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "power") return currentValue >= -7 && currentValue <= -1 ? currentValue : -1;
  if (group === "addCondition") return currentValue >= 20 && currentValue <= 59 ? currentValue : 20;
  if (group === "removeCondition") return currentValue >= 60 && currentValue <= 99 ? currentValue : 60;
  if (group === "hitBonus") return currentValue >= 120 && currentValue <= 122 ? currentValue : 120;
  return currentValue;
}

function specialEffectOptionsForGroup(group: ItemSpecialEffectGroup) {
  if (group === "power") {
    return [
      ...Array.from({ length: 7 }, (_, index) => ({ value: -(index + 1), label: `Power level ${index + 1}` })),
      { value: 8, label: "Random power level" }
    ];
  }
  if (group === "addCondition") {
    return CONDITION_LABELS.slice(0, 40).map((label, index) => ({ value: index + 20, label }));
  }
  if (group === "removeCondition") {
    return CONDITION_LABELS.slice(0, 40).map((label, index) => ({ value: index + 60, label }));
  }
  if (group === "hitBonus") {
    return [
      { value: 120, label: "Auto hit" },
      { value: 121, label: "Penetration bonus" },
      { value: 122, label: "Double to-hit bonus" }
    ];
  }
  return [];
}

function specialEffectDetailLabel(group: ItemSpecialEffectGroup) {
  if (group === "power") return "Power";
  if (group === "addCondition") return "Condition";
  if (group === "removeCondition") return "Condition";
  if (group === "hitBonus") return "Bonus";
  return "Value";
}

type ItemSpecialAttributeGroup = "none" | "ability" | "monsterType" | "partyCondition" | "raw";

function ItemSpecialAttributeField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const group = specialAttributeGroupForValue(value);
  const options = specialAttributeOptionsForGroup(group);
  const hasKnownValue = options.some((option) => option.value === value);
  return (
    <div className="item-cascade-field" title={`${label} companion field for ability, monster-type, and party-condition behavior.`}>
      <label>
        <span>{label}</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialAttributeGroup;
            onChange(defaultSpecialAttributeValue(nextGroup, value));
          }}
        >
          <option value="none">No behavior</option>
          <option value="ability">Special ability</option>
          <option value="monsterType">Monster-type bonus</option>
          <option value="partyCondition">Party condition</option>
          <option value="raw">Raw value</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Value" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <label>
          <span>{specialAttributeDetailLabel(group)}</span>
          <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
            {!hasKnownValue && <option value={value}>Current value {value}</option>}
            {options.map((option) => (
              <option key={`${option.value}:${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function specialAttributeGroupForValue(value: number): ItemSpecialAttributeGroup {
  if (value === 0) return "none";
  if (value > 0 && value < 16) return "ability";
  if (value < 0) return "monsterType";
  if (value >= 30 && value <= 40) return "partyCondition";
  return "raw";
}

function defaultSpecialAttributeValue(group: ItemSpecialAttributeGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "ability") return currentValue > 0 && currentValue < 16 ? currentValue : 1;
  if (group === "monsterType") return currentValue < 0 ? currentValue : -1;
  if (group === "partyCondition") return currentValue >= 30 && currentValue <= 40 ? currentValue : 30;
  return currentValue;
}

function specialAttributeOptionsForGroup(group: ItemSpecialAttributeGroup) {
  if (group === "ability") {
    return Array.from({ length: 15 }, (_, index) => ({ value: index + 1, label: `Ability ${index + 1}` }));
  }
  if (group === "monsterType") {
    return Array.from({ length: 20 }, (_, index) => ({ value: -(index + 1), label: `Monster type ${index + 1}` }));
  }
  if (group === "partyCondition") {
    return Array.from({ length: 11 }, (_, index) => ({ value: index + 30, label: `Party condition ${index + 30}` }));
  }
  return [];
}

function specialAttributeDetailLabel(group: ItemSpecialAttributeGroup) {
  if (group === "ability") return "Ability";
  if (group === "monsterType") return "Monster Type";
  if (group === "partyCondition") return "Condition";
  return "Value";
}

function describeItemSpecialBehavior(record: ScenarioItemRecord) {
  const sp1 = Number(record.special1 ?? 0);
  const sp2 = Number(record.special2 ?? 0);
  const sp3 = Number(record.special3 ?? 0);
  const sp4 = Number(record.special4 ?? 0);
  const sp5 = Number(record.special5 ?? 0);
  const descriptions: string[] = [];
  if (sp1 === -10) {
    descriptions.push(`Inflicts condition ${conditionNameFromOneBasedCode(sp3 - 19)}.`);
  } else if (sp1 >= -7 && sp1 <= -1) {
    descriptions.push(`Power level ${Math.abs(sp1)}.`);
  } else if (sp1 === 8) {
    descriptions.push("Random power level.");
  } else if (sp1 > 19 && sp1 < 60) {
    descriptions.push(`Adds condition ${conditionNameFromZeroBasedCode(sp1 - 20)} by ${sp2}.`);
  } else if (sp1 > 59 && sp1 < 100) {
    descriptions.push(`Removes condition ${conditionNameFromZeroBasedCode(sp1 - 60)} by ${sp2}.`);
  } else if (sp1 === 120) {
    descriptions.push("Always hits in combat.");
  } else if (sp1 === 121) {
    descriptions.push("Penetration weapon; Realmz treats magical plus as doubled for to-hit display.");
  } else if (sp1 === 122) {
    descriptions.push(`Adds attack rounds (${attackBonusText(sp2)}).`);
  } else if (sp1 > 0) {
    descriptions.push(`Unclassified special effect code ${sp1}; raw tuple is preserved.`);
  }
  if (sp2 > 1100) descriptions.push(`Stores spell ${sp2}.`);
  if (sp3 < 0) {
    descriptions.push(`Monster-type hit bonus ${sp5} against type ${Math.abs(sp3)}.`);
  } else if (sp3 > 0 && sp3 < 16) {
    descriptions.push(`Adds character special ability ${sp3} by ${sp5}.`);
  } else if (sp3 >= 30) {
    descriptions.push(`Applies party condition code ${sp3} by ${sp5}.`);
  }
  if (sp4 < 0) {
    descriptions.push(`Secondary monster-type hit bonus ${sp5} against type ${Math.abs(sp4)}.`);
  } else if (sp4 > 0 && sp4 < 16) {
    descriptions.push(`Adds secondary character special ability ${sp4} by ${sp5}.`);
  } else if (sp4 >= 30) {
    descriptions.push(`Applies secondary party condition code ${sp4} by ${sp5}.`);
  }
  if (!descriptions.length && [sp1, sp2, sp3, sp4, sp5].some((value) => value !== 0)) {
    descriptions.push(`Raw special tuple preserved: ${sp1}, ${sp2}, ${sp3}, ${sp4}, ${sp5}.`);
  }
  return descriptions;
}

function conditionNameFromOneBasedCode(code: number) {
  if (code <= 0) return `code ${code}`;
  return `${code}: ${CONDITION_LABELS[code - 1] ?? "Unknown condition"}`;
}

function conditionNameFromZeroBasedCode(code: number) {
  return `${code}: ${CONDITION_LABELS[code] ?? "Unknown condition"}`;
}

function attackBonusText(value: number) {
  if (value === 1) return "+1/2";
  if (value === 2) return "+1";
  if (value === 3) return "+1 1/2";
  if (value === 4) return "+2";
  return `raw value ${value}`;
}

function ItemUseRestrictionEditor({
  record,
  onChange
}: {
  record: ScenarioItemRecord;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <div className="item-use-restriction-editor">
      <div className="item-specific-restrictions">
        <label>
          <span>Specific Race</span>
          <select value={record.specificRace} onChange={(event) => onChange("specificRace", Number(event.currentTarget.value))}>
            <option value={0}>Any race</option>
            {REALMZ_RACES.map((label, index) => (
              <option key={label} value={index + 1}>{index + 1}: {label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Specific Caste</span>
          <select value={record.specificCaste} onChange={(event) => onChange("specificCaste", Number(event.currentTarget.value))}>
            <option value={0}>Any caste</option>
            {REALMZ_CASTES.map((label, index) => (
              <option key={label} value={index + 1}>{index + 1}: {label}</option>
            ))}
          </select>
        </label>
      </div>
      <ItemMaskEditor
        title="Those That Can't Use It"
        groups={[
          { title: "Race Restrictions", field: "raceRestrictions", labels: RACE_DESCRIPTOR_LABELS, value: record.raceRestrictions },
          { title: "Caste Restrictions", field: "casteRestrictions", labels: CASTE_CLASS_LABELS, value: record.casteRestrictions }
        ]}
        onChange={onChange}
      />
      <ItemMaskEditor
        title="Those That Can Use It"
        groups={[
          { title: "Race Restrictions", field: "raceClassOnly", labels: RACE_DESCRIPTOR_LABELS, value: record.raceClassOnly },
          { title: "Caste Restrictions", field: "casteClassOnly", labels: CASTE_CLASS_LABELS, value: record.casteClassOnly }
        ]}
        onChange={onChange}
      />
    </div>
  );
}

function ItemMaskEditor({
  title,
  groups,
  onChange
}: {
  title: string;
  groups: Array<{ title: string; field: ItemRestrictionKey; labels: string[]; value: number }>;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <section className="item-mask-editor">
      <header>{title}</header>
      {groups.map((group) => (
        <div key={group.field}>
          <h5>{group.title}</h5>
          <div className="item-bit-editor">
            {group.labels.map((label, index) => {
              const checked = bitFromMask(group.value, index);
              return (
                <label key={label} className={checked ? "checked" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(group.field, setBitInMask(group.value, index, event.currentTarget.checked))}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function bitFromMask(value: number, bit: number) {
  return Boolean((value >>> 0) & (1 << bit));
}

function setBitInMask(value: number, bit: number, checked: boolean) {
  const next = checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
  return toSigned16(next);
}

function bitFromPair(itemCat0: number, itemCat1: number, bit: number) {
  const source = bit < 32 ? itemCat0 : itemCat1;
  return Boolean((source >>> 0) & (1 << (bit % 32)));
}

function setBitInPair(itemCat0: number, itemCat1: number, bit: number, checked: boolean): [number, number] {
  if (bit < 32) return [toSigned32(setUnsignedBit(itemCat0, bit, checked)), itemCat1];
  return [itemCat0, toSigned32(setUnsignedBit(itemCat1, bit - 32, checked))];
}

function itemCategoryStorageBit(index: number) {
  return 31 - (index % 32);
}

function itemCategoryBitFromPair(itemCat0: number, itemCat1: number, index: number) {
  const source = index < 32 ? itemCat0 : itemCat1;
  return Boolean((source >>> 0) & (1 << itemCategoryStorageBit(index)));
}

function setItemCategoryBitInPair(itemCat0: number, itemCat1: number, index: number, checked: boolean): [number, number] {
  const bit = itemCategoryStorageBit(index);
  if (index < 32) return [toSigned32(setUnsignedBit(itemCat0, bit, checked)), itemCat1];
  return [itemCat0, toSigned32(setUnsignedBit(itemCat1, bit, checked))];
}

function selectedItemCategoryIndex(itemCat0: number, itemCat1: number) {
  const selected = ITEM_CATEGORY_LABELS.findIndex((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index));
  return selected >= 0 ? selected : null;
}

function itemCategoryPairForSingleSelection(index: number | null): [number, number] {
  if (index == null || !Number.isFinite(index)) return [0, 0];
  return setItemCategoryBitInPair(0, 0, Math.trunc(index), true);
}

function setUnsignedBit(value: number, bit: number, checked: boolean) {
  return checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
}

function toSigned16(value: number) {
  const unsigned = value & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function toSigned32(value: number) {
  return value | 0;
}

function summarizeMaskLabels(mask: number, labels: string[]) {
  return summarizeBitLabels([mask], labels, 4);
}

function summarizeBitLabels(values: number[], labels: string[], limit: number) {
  const selected = labels.filter((_, index) => bitFromPair(values[0] ?? 0, values[1] ?? 0, index));
  if (!selected.length) return "None";
  if (selected.length <= limit) return selected.join(", ");
  return `${selected.slice(0, limit).join(", ")} +${selected.length - limit} more`;
}

function summarizeItemCategoryLabels(itemCat0: number, itemCat1: number, limit: number) {
  const selected = ITEM_CATEGORY_LABELS.filter((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index));
  if (!selected.length) return "None";
  if (selected.length <= limit) return selected.join(", ");
  return `${selected.slice(0, limit).join(", ")} +${selected.length - limit} more`;
}

const ITEM_TYPE_LABELS: Record<number, string> = {
  0: "Ring",
  1: "Do not use",
  2: "Melee Weapon",
  3: "Shield",
  4: "Armor and Robe",
  5: "Gauntlet and Gloves",
  6: "Cloak and Cape",
  7: "Helmet and Cap",
  8: "Ion Stone",
  9: "Boots",
  10: "Quiver",
  11: "Waist and Belt",
  12: "Neck",
  13: "Scroll Case",
  14: "Misc Item",
  15: "Missile Weapon",
  16: "Broach",
  17: "Face and Mask",
  18: "Scabbard",
  19: "Belt Loop",
  20: "Scroll",
  21: "Magic Item",
  22: "Supply Item",
  23: "Action Point Item (SP5 = AP ID)",
  24: "Identified Item",
  25: "Scenario Item"
};

function itemTypeLabel(value: number) {
  const abs = Math.abs(value);
  if (ITEM_TYPE_LABELS[abs]) return ITEM_TYPE_LABELS[abs];
  return `Raw type ${value}`;
}

function itemTypeText(value: number | null | undefined) {
  if (value == null) return "unknown";
  return `${value}: ${itemTypeLabel(value)}`;
}

const ITEM_TYPE_OPTIONS = Array.from({ length: 26 }, (_, value) => ({ value, label: itemTypeLabel(value) }));

const SHOP_ITEM_CATEGORY_OPTIONS: Array<{ id: ItemReferenceCategory | "all"; label: string; range?: string }> = [
  { id: "all", label: "All Items" },
  ...ITEM_REFERENCE_CATEGORIES
];

function ItemIconField({
  value,
  project,
  catalog,
  previewContext,
  itemOptions,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemOptions: ItemReferenceOption[];
  onChange: (value: number) => void;
}) {
  const previewUrl = useIconPreviewUrl(value, project, catalog, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => setFailedUrl(null), [previewUrl]);
  const usableUrl = previewUrl && previewUrl !== failedUrl ? previewUrl : null;
  return (
    <div className="item-icon-field">
      <label className="item-number-input" title="CICN resource ID drawn for this item in Realmz lists and menus.">
        <span>Icon</span>
        <span className="item-icon-field-control">
          <button
            type="button"
            className="item-icon-preview item-icon-preview-button"
            title={value ? `Choose cicn icon; current ${value}` : "Choose cicn icon"}
            onClick={() => setPickerOpen(true)}
          >
            {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{value || "-"}</i>}
          </button>
          <input
            type="number"
            value={value}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) onChange(Math.trunc(next));
            }}
          />
        </span>
      </label>
      {pickerOpen && (
        <ItemIconPickerModal
          value={value}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          itemOptions={itemOptions}
          onChoose={(nextValue) => {
            onChange(nextValue);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

type ItemIconPickerChoice = {
  id: number;
  label: string;
  detail: string;
};

function ItemIconPickerModal({
  value,
  project,
  catalog,
  previewContext,
  itemOptions,
  onChoose,
  onClose
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemOptions: ItemReferenceOption[];
  onChoose: (value: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(() => itemIconPickerChoices(project, catalog, itemOptions), [catalog, itemOptions, project]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleChoices = choices
    .filter((choice) => !normalizedQuery || String(choice.id).includes(normalizedQuery) || choice.label.toLowerCase().includes(normalizedQuery) || choice.detail.toLowerCase().includes(normalizedQuery))
    .slice(0, 160);
  return (
    <div className="item-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="item-icon-picker-modal" role="dialog" aria-modal="true" aria-label="Choose item icon" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Choose Icon</strong>
            <small>{choices.length} cicn option(s)</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>Close</button>
        </header>
        <input
          type="search"
          value={query}
          placeholder="Search cicn id, item, or source..."
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <div className="item-icon-picker-grid">
          {visibleChoices.map((choice) => (
            <ItemIconPickerButton
              key={`${choice.id}:${choice.label}`}
              choice={choice}
              selected={choice.id === value}
              project={project}
              catalog={catalog}
              previewContext={previewContext}
              onChoose={onChoose}
            />
          ))}
        </div>
        {choices.length > visibleChoices.length && <small>{choices.length - visibleChoices.length} more icon(s); search to narrow.</small>}
      </section>
    </div>
  );
}

function ItemIconPickerButton({
  choice,
  selected,
  project,
  catalog,
  previewContext,
  onChoose
}: {
  choice: ItemIconPickerChoice;
  selected: boolean;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChoose: (value: number) => void;
}) {
  const previewUrl = useIconPreviewUrl(choice.id, project, catalog, previewContext);
  return (
    <button
      type="button"
      className={`item-icon-picker-option${selected ? " selected" : ""}`}
      onClick={() => onChoose(choice.id)}
    >
      <span className="item-icon-preview">
        {previewUrl ? <img src={previewUrl} alt="" /> : <i>{choice.id}</i>}
      </span>
      <strong>{choice.id}</strong>
      <small>{choice.label}</small>
    </button>
  );
}

function itemIconPickerChoices(project: Project, catalog: LibraryCatalog | null | undefined, itemOptions: ItemReferenceOption[]) {
  const choices = new Map<number, ItemIconPickerChoice>();
  const addChoice = (id: number | null | undefined, label: string, detail: string) => {
    if (id == null || id === 0 || !Number.isFinite(id)) return;
    const normalizedId = Math.trunc(id);
    const existing = choices.get(normalizedId);
    if (existing) {
      if (!existing.label.includes(label)) existing.detail = [existing.detail, detail].filter(Boolean).join(" | ");
      return;
    }
    choices.set(normalizedId, { id: normalizedId, label, detail });
  };
  for (const option of itemOptions) addChoice(option.iconId, option.label.replace(/\s+\(-?\d+\)$/, ""), `item ${option.value}`);
  for (const asset of project.assets ?? []) {
    if (asset.kind === "icon" || asset.resourceType.trim() === "cicn") addChoice(asset.resourceId, asset.label, "project icon");
  }
  for (const asset of project.assetCatalog.icons ?? []) {
    addChoice(asset.resourceId, asset.name || `cicn ${asset.resourceId}`, asset.source || "project catalog");
  }
  for (const asset of catalog?.assets ?? []) {
    const resourceType = (asset.resourceType ?? "").trim();
    if (asset.resourceId != null && (asset.type === "icon" || asset.type.includes("icon") || resourceType === "cicn")) {
      addChoice(asset.resourceId, asset.label, asset.source || "library icon");
    }
  }
  return [...choices.values()].sort((a, b) => Math.abs(a.id) - Math.abs(b.id) || a.id - b.id);
}

function ItemTypeSelectField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const hasOption = ITEM_TYPE_OPTIONS.some((option) => option.value === value);
  return (
    <label className="item-number-input item-type-select" title="Realmz equipment/use type. This is separate from the item category restriction list.">
      <span>Type</span>
      <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {!hasOption && <option value={String(value)}>{itemTypeText(value)}</option>}
        {ITEM_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={String(option.value)}>{option.value}: {option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ItemSoundField({
  value,
  project,
  catalog,
  previewContext,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChange: (value: number) => void;
}) {
  const previewUrl = useItemSoundPreviewUrl(value, project, catalog, previewContext);
  return (
    <div className="item-sound-field">
      <ItemNumberInput label="Sound" value={value} onCommit={onChange} />
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        disabled={!previewUrl}
        title={previewUrl ? `Play snd ${Math.abs(value)}` : "No playable sound preview is available."}
        onClick={() => previewUrl && playPreviewUrl(previewUrl)}
      >
        Play
      </button>
    </div>
  );
}

function useItemSoundPreviewUrl(
  soundId: number,
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
) {
  const resourceId = soundId ? Math.abs(soundId) : null;
  const managedAsset = resourceId == null ? null : (project.assets ?? []).find((asset) =>
    asset.kind === "sound" &&
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const projectAsset = resourceId == null ? null : (project.assetCatalog.sounds ?? []).find((asset) =>
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const libraryAsset = resourceId == null ? null : catalog?.assets.find((asset) =>
    (asset.type === "sound" || (asset.resourceType ?? "").trim() === "snd") &&
    asset.resourceId != null &&
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  return useResolvedPreviewUrl(
    managedAsset?.previewPath ?? projectAsset?.previewPath ?? libraryAsset?.previewPath ?? null,
    managedAsset,
    libraryAsset,
    { ...previewContext, project, resourceType: "snd ", resourceId }
  );
}

function ItemNumberInput({
  label,
  value,
  title,
  onCommit
}: {
  label: string;
  value: number;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.trunc(next);
    setDraft(String(normalized));
    if (normalized !== value) onCommit(normalized);
  };
  return (
    <label className="item-number-input" title={title}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

function ItemTextInput({
  label,
  value,
  multiline = false,
  onCommit
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const commonProps = {
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.currentTarget.value),
    onBlur: commit,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") setDraft(value);
      if (!multiline && event.key === "Enter") event.currentTarget.blur();
    }
  };
  return (
    <label className={`item-text-input${multiline ? " item-text-input-multiline" : ""}`}>
      <span>{label}</span>
      {multiline ? <textarea {...commonProps} /> : <input type="text" {...commonProps} />}
    </label>
  );
}

function scenarioItemRecordFor(project: Project, itemId: number) {
  return (project.scenarioItems ?? []).find((record) => scenarioItemId(record) === itemId) ?? null;
}

function scenarioItemId(record: ScenarioItemRecord) {
  return record.itemId || 800 + record.id;
}

function customItemRecordId(itemId: number) {
  return itemId >= 900 && itemId < 1000 ? itemId - 800 : null;
}

function nextCustomItemId(project: Project) {
  const used = new Set(
    (project.scenarioItems ?? [])
      .filter((record) => customItemRecordId(scenarioItemId(record)) !== null && scenarioItemSlotInUse(record))
      .map((record) => scenarioItemId(record))
  );
  for (let itemId = 900; itemId < 1000; itemId += 1) {
    if (!used.has(itemId)) return itemId;
  }
  return null;
}

function scenarioItemSlotInUse(record: ScenarioItemRecord) {
  const canonicalItemId = 800 + record.id;
  const numericFields: Array<keyof ScenarioItemRecord> = [
    "iconId",
    "type",
    "st",
    "blunt",
    "hands",
    "lu",
    "movement",
    "ac",
    "magicResistance",
    "damage",
    "spellPoints",
    "sound",
    "weight",
    "cost",
    "charge",
    "cursedItemId",
    "magical",
    "itemCat0",
    "itemCat1",
    "raceRestrictions",
    "casteRestrictions",
    "specificRace",
    "specificCaste",
    "raceClassOnly",
    "casteClassOnly",
    "vSmall",
    "vLarge",
    "heat",
    "cold",
    "electric",
    "vsUndead",
    "vsDemonDevil",
    "vsEvil",
    "special1",
    "special2",
    "special3",
    "special4",
    "special5",
    "weightPerCharge",
    "dropOnEmpty"
  ];
  const hasItemFields = numericFields.some((field) => Number(record[field] ?? 0) !== 0);
  return record.itemId !== canonicalItemId || hasItemFields;
}

function scenarioItemSummary(record: ScenarioItemRecord): Record<string, unknown> {
  return {
    itemId: scenarioItemId(record),
    iconId: record.iconId,
    type: record.type,
    st: record.st,
    blunt: record.blunt,
    hands: record.hands,
    lu: record.lu,
    movement: record.movement,
    ac: record.ac,
    magicResistance: record.magicResistance,
    damage: record.damage,
    spellPoints: record.spellPoints,
    sound: record.sound,
    weight: record.weight,
    cost: record.cost,
    charge: record.charge,
    cursedItemId: record.cursedItemId,
    magical: record.magical,
    itemCat0: record.itemCat0,
    itemCat1: record.itemCat1,
    raceRestrictions: record.raceRestrictions,
    casteRestrictions: record.casteRestrictions,
    specificRace: record.specificRace,
    specificCaste: record.specificCaste,
    raceClassOnly: record.raceClassOnly,
    casteClassOnly: record.casteClassOnly,
    vSmall: record.vSmall,
    vLarge: record.vLarge,
    heat: record.heat,
    cold: record.cold,
    electric: record.electric,
    vsUndead: record.vsUndead,
    vsDemonDevil: record.vsDemonDevil,
    vsEvil: record.vsEvil,
    special1: record.special1,
    special2: record.special2,
    special3: record.special3,
    special4: record.special4,
    special5: record.special5,
    weightPerCharge: record.weightPerCharge,
    dropOnEmpty: record.dropOnEmpty
  };
}

function scenarioItemChangesFromSummary(summary: Record<string, unknown>): Partial<ScenarioItemRecord> {
  const changes: Partial<ScenarioItemRecord> = {};
  for (const group of SCENARIO_ITEM_EDIT_GROUPS) {
    for (const field of group.fields) {
      const value = numberField(summary, field.key);
      if (value != null) changes[field.key] = value as never;
    }
  }
  const restrictionKeys: ItemRestrictionKey[] = [
    "raceRestrictions",
    "casteRestrictions",
    "specificRace",
    "specificCaste",
    "raceClassOnly",
    "casteClassOnly"
  ];
  for (const key of restrictionKeys) {
    const value = numberField(summary, key);
    if (value != null) changes[key] = value as never;
  }
  for (const key of ["itemCat0", "itemCat1"] as const) {
    const value = numberField(summary, key);
    if (value != null) changes[key] = value;
  }
  return changes;
}

function emptyScenarioItemForUi(id: number): ScenarioItemRecord {
  return {
    id,
    itemId: 800 + id,
    iconId: 0,
    type: 0,
    st: 0,
    blunt: 0,
    hands: 0,
    lu: 0,
    movement: 0,
    ac: 0,
    magicResistance: 0,
    damage: 0,
    spellPoints: 0,
    sound: 0,
    weight: 0,
    cost: 0,
    charge: 0,
    cursedItemId: 0,
    magical: 0,
    itemCat0: 0,
    itemCat1: 0,
    raceRestrictions: 0,
    casteRestrictions: 0,
    specificRace: 0,
    specificCaste: 0,
    raceClassOnly: 0,
    casteClassOnly: 0,
    spare2: new Array(7).fill(0),
    vSmall: 0,
    vLarge: 0,
    heat: 0,
    cold: 0,
    electric: 0,
    vsUndead: 0,
    vsDemonDevil: 0,
    vsEvil: 0,
    special1: 0,
    special2: 0,
    special3: 0,
    special4: 0,
    special5: 0,
    weightPerCharge: 0,
    dropOnEmpty: 0,
    rawBytes: new Array(100).fill(0),
    authored: true
  };
}

function itemIdFromEntityId(entityId: string) {
  const match = entityId.match(/^item:(-?\d+)$/);
  return match ? Number(match[1]) : null;
}

function findItemCatalogEntity(project: Project, catalog: LibraryCatalog | null | undefined, itemId: number) {
  const entities = [
    ...(catalog?.entities ?? [])
  ];
  return entities.find((entity) => {
    if (entity.type !== "item" && entity.type !== "item-reference") return false;
    const summaryId = numberField(entity.summary, "itemId") ?? numberField(entity.summary, "id") ?? trailingNumber(entity.id);
    return summaryId === itemId;
  }) ?? null;
}

function itemUsageLinks(project: Project, itemId: number) {
  const links: Array<{ target: string; label: string; detail: string }> = [];
  for (const treasure of project.treasures ?? []) {
    const slots = treasure.itemIds.map((id, slot) => id === itemId ? slot : -1).filter((slot) => slot >= 0);
    if (slots.length) links.push({ target: `treasure:${treasure.id}`, label: `Treasure ${treasure.id}`, detail: `slot${slots.length === 1 ? "" : "s"} ${slots.join(", ")}` });
  }
  for (const shop of project.shops ?? []) {
    const quantity = shop.itemIds.reduce((total, id, slot) => id === itemId ? total + Math.max(0, shop.quantities[slot] ?? 0) : total, 0);
    if (quantity) links.push({ target: `shop:${shop.id}`, label: `Shop ${shop.id}`, detail: `${quantity} in stock` });
  }
  return links.slice(0, 18);
}

function TreasureWorkbench({
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = targetRecords(project, "treasure");
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", "treasure") ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedRecord(records, selectedId, 140), [records, selectedId]);
  const record = (project.treasures ?? []).find((candidate) => candidate.id === selectedId) ?? null;
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const nextId = nextTargetRecordId(project, "treasure");
  const rewards = record ? treasureRewardTotal(record) : 0;
  return (
    <article className="treasure-workbench">
      <header className="treasure-workbench-header">
        <div>
          <span>Treasure Records</span>
          <h2>
            <TutorialTip title="Treasure Editor" body={TREASURE_EDITOR_HELP} side="right">
              <span>Treasure Editor</span>
            </TutorialTip>
          </h2>
          <p>Build Realmz reward records from money, victory points, and up to 20 item slots.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => {
            onApplyCommand?.({ kind: "createTargetRecord", label: "Create Treasure", recordType: "treasure", id: nextId });
            onSelectEntity(selectEntityFromId(`treasure:${nextId}`));
          }}
        >
          New Treasure {nextId}
        </button>
      </header>
      <div className="treasure-workbench-layout">
        <aside className="treasure-record-browser">
          <header>
            <TutorialTip title="Treasure Records" body={TREASURE_EDITOR_HELP} side="right">
              <strong>{records.length.toLocaleString()} records</strong>
            </TutorialTip>
            <small>{records.reduce((total, entry) => total + treasureFilledItems(project, entry.id), 0).toLocaleString()} item slots filled</small>
          </header>
          <ScrollArea className="treasure-record-list" aria-label="Treasure records">
            {visibleRecords.map((entry) => {
              const candidate = (project.treasures ?? []).find((treasure) => treasure.id === entry.id) ?? null;
              const itemIds = candidate?.itemIds.filter(Boolean).slice(0, 5) ?? [];
              return (
                <button
                  key={`treasure:${entry.id}`}
                  type="button"
                  className={entry.id === selectedId ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`treasure:${entry.id}`))}
                >
                  <span>
                    <strong>Treasure {entry.id}</strong>
                    <small>{targetRecordSummary(project, "treasure", entry.id)}</small>
                  </span>
                  <TreasureMiniIcons itemIds={itemIds} optionsByValue={optionsByValue} />
                </button>
              );
            })}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more treasure records; use search to jump to a specific ID.</p>
            )}
            {records.length === 0 && <p>No treasure records yet.</p>}
          </ScrollArea>
        </aside>
        <section className="treasure-detail-panel">
          {record ? (
            <>
              <header>
                <div>
                  <span>Treasure {record.id}</span>
                  <h3>{record.itemIds.filter(Boolean).length} item{record.itemIds.filter(Boolean).length === 1 ? "" : "s"} plus rewards</h3>
                  <p>{rewards > 0 ? `${rewards.toLocaleString()} combined reward value before item loot` : "No fixed reward values yet"}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear treasure", recordType: "treasure", id: record.id })}
                >
                  Clear To Defaults
                </button>
              </header>
              <TreasureRewardEditor project={project} catalog={catalog} previewContext={previewContext} record={record} onApplyCommand={onApplyCommand} />
              <TreasureLootEditor
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                recordId={record.id}
                itemIds={record.itemIds}
                options={options}
                optionsLoading={!deferredOptions}
                optionsByValue={optionsByValue}
                onApplyCommand={onApplyCommand}
              />
            </>
          ) : (
            <div className="treasure-empty-detail">
              <strong>Treasure {selectedId} does not exist yet.</strong>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: selectedId })}
              >
                Create Treasure {selectedId}
              </button>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function TreasureMiniIcons({
  itemIds,
  optionsByValue
}: {
  itemIds: number[];
  optionsByValue: Map<number, ItemReferenceOption>;
}) {
  return (
    <span className="treasure-mini-icons" aria-hidden="true">
      {itemIds.length ? itemIds.map((itemId, index) => {
        const option = optionsByValue.get(itemId);
        return <TreasureMiniItemBadge key={`${itemId}:${index}`} itemId={itemId} option={option} />;
      }) : <em>empty</em>}
    </span>
  );
}

function TreasureMiniItemBadge({ itemId, option }: { itemId: number; option?: ItemReferenceOption }) {
  return (
    <i title={option ? `${itemOptionName(option)} (${itemId})` : `Item ${itemId}`}>
      {option ? itemCategoryBadge(option.category) : itemId}
    </i>
  );
}

const TREASURE_REWARD_ICONS = {
  exp: { label: "Victory points", src: "/economy/victory-points.png" },
  gold: { label: "Gold", iconId: 2002 },
  gems: { label: "Gems", iconId: 2014 },
  jewelry: { label: "Jewelry", iconId: 2012 }
} satisfies Record<string, TreasureRewardIconDescriptor>;

type TreasureRewardIconDescriptor = {
  label: string;
  src?: string;
  iconId?: number;
};

function TreasureRewardEditor({
  project,
  catalog,
  previewContext,
  record,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  record: Project["treasures"][number];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Partial<Pick<Project["treasures"][number], "exp" | "gold" | "gems" | "jewelry">>) => {
    onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure rewards", id: record.id, changes });
  };
  return (
    <section className="treasure-reward-panel" aria-label="Treasure rewards">
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.exp} project={project} catalog={catalog} previewContext={previewContext} label="Victory Points" value={record.exp} hint="Character advancement reward" onCommit={(exp) => update({ exp })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.gold} project={project} catalog={catalog} previewContext={previewContext} label="Gold" value={record.gold} hint="Coins awarded to the party" onCommit={(gold) => update({ gold })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.gems} project={project} catalog={catalog} previewContext={previewContext} label="Gems" value={record.gems} hint="Gem reward count" onCommit={(gems) => update({ gems })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.jewelry} project={project} catalog={catalog} previewContext={previewContext} label="Jewelry" value={record.jewelry} hint="Jewelry reward count" onCommit={(jewelry) => update({ jewelry })} />
    </section>
  );
}

function TreasureRewardInput({
  icon,
  project,
  catalog,
  previewContext,
  label,
  value,
  hint,
  onCommit
}: {
  icon: TreasureRewardIconDescriptor;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  label: string;
  value: number;
  hint: string;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="treasure-reward-input">
      <TreasureRewardIcon icon={icon} project={project} catalog={catalog} previewContext={previewContext} />
      <div className="treasure-reward-field">
        <ItemNumberInput label={label} value={value} title={hint} onCommit={onCommit} />
      </div>
      <small>{hint}</small>
    </div>
  );
}

function TreasureRewardIcon({
  icon,
  project,
  catalog,
  previewContext
}: {
  icon: TreasureRewardIconDescriptor;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
}) {
  const iconUrl = useIconPreviewUrl(icon.iconId ?? null, project, catalog, previewContext);
  const src = icon.src ?? iconUrl;
  return (
    <span className={icon.src ? "treasure-reward-icon vp" : "treasure-reward-icon"} title={icon.iconId ? `${icon.label} (cicn ${icon.iconId})` : icon.label}>
      {src ? <img src={src} alt="" draggable={false} /> : <i>{icon.label.slice(0, 2).toUpperCase()}</i>}
    </span>
  );
}

function TreasureLootEditor({
  project,
  catalog,
  previewContext,
  recordId,
  itemIds,
  options,
  optionsLoading,
  optionsByValue,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  recordId: number;
  itemIds: number[];
  options: ItemReferenceOption[];
  optionsLoading: boolean;
  optionsByValue: Map<number, ItemReferenceOption>;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const openSlot = firstOpenTreasureSlotForUi(itemIds);
  const filteredOptions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return options.filter((option) => {
      if (category !== "all" && option.category !== category) return false;
      if (!text) return true;
      return [option.label, option.detail, option.summary, String(option.value)].some((part) => part.toLowerCase().includes(text));
    }).slice(0, 42);
  }, [category, options, query]);
  const commitSlot = (slot: number, itemId: number) => {
    onApplyCommand?.({
      kind: "updateTreasureRecord",
      label: "Update treasure item",
      id: recordId,
      changes: { itemIds: updateTreasureSlot(itemIds, slot, itemId) }
    });
  };
  const addItem = (itemId: number) => {
    if (openSlot < 0) return;
    commitSlot(openSlot, itemId);
  };
  return (
    <section className="treasure-loot-panel">
      <div className="treasure-catalog-panel">
        <header>
          <div>
            <TutorialTip title="Add Treasure Item" body="Choose from the same Divinity item families used by the Item Editor. Clicking an item fills the next open treasure slot." side="right">
              <strong>Add Item</strong>
            </TutorialTip>
            <small>{openSlot >= 0 ? `Next open slot ${openSlot}` : "All 20 slots are filled"}</small>
          </div>
        </header>
        <div className="item-category-tabs" role="tablist" aria-label="Treasure item categories">
          {ITEM_REFERENCE_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={category === entry.id ? "active" : ""}
              onClick={() => setCategory(entry.id)}
              title={entry.range ? `${entry.label}: ${entry.range}` : entry.label}
            >
              <span>{entry.label}</span>
              {entry.range && <small>{entry.range}</small>}
            </button>
          ))}
        </div>
        <input
          className="item-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search items to add..."
          aria-label="Search treasure items"
        />
        <ScrollArea className="treasure-catalog-list" aria-label="Items available for treasure">
          {filteredOptions.map((option) => (
            <button key={option.key} type="button" disabled={openSlot < 0} onClick={() => addItem(option.value)}>
              <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
              <span>
                <strong>{itemOptionName(option)}</strong>
                <small>{option.detail}</small>
              </span>
              <b>{option.value}</b>
            </button>
          ))}
          {optionsLoading && <p>Loading item references...</p>}
          {filteredOptions.length === 0 && <p>No items match this category/search.</p>}
        </ScrollArea>
      </div>
      <div className="treasure-slot-panel">
        <header>
          <div>
            <TutorialTip title="Treasure Items" body={TREASURE_ITEMS_HELP} side="right">
              <strong>Treasure Items</strong>
            </TutorialTip>
            <small>{itemIds.filter(Boolean).length} of 20 slots filled</small>
          </div>
        </header>
        <div className="treasure-slot-grid">
          {Array.from({ length: 20 }, (_, slot) => {
            const value = itemIds[slot] ?? 0;
            const option = optionsByValue.get(value);
            return (
              <TreasureSlotEditor
                key={slot}
                slot={slot}
                value={value}
                option={option}
                options={options}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onCommit={(itemId) => commitSlot(slot, itemId)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TreasureSlotEditor({
  slot,
  value,
  option,
  options,
  project,
  catalog,
  previewContext,
  onCommit
}: {
  slot: number;
  value: number;
  option?: ItemReferenceOption;
  options: ItemReferenceOption[];
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onCommit: (value: number) => void;
}) {
  return (
    <label className={value ? "treasure-slot-card filled" : "treasure-slot-card"}>
      <span className="treasure-slot-index">Slot {slot}</span>
      {option ? <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} /> : <span className="item-option-icon"><i>IT</i></span>}
      <select value={String(value)} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value="0">Empty / none</option>
        {value !== 0 && !option && <option value={String(value)}>Current item {value}</option>}
        {options.map((entry) => (
          <option key={entry.key} value={entry.value}>{entry.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`Treasure slot ${slot} raw item ID`} />
      <small>{option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : value ? "Raw item ID" : "Open slot"}</small>
    </label>
  );
}

function itemOptionName(option: ItemReferenceOption) {
  return option.label.replace(/\s+\(-?\d+\)$/, "");
}

function firstOpenTreasureSlotForUi(itemIds: number[]) {
  for (let index = 0; index < 20; index += 1) {
    if ((itemIds[index] ?? 0) === 0) return index;
  }
  return -1;
}

function updateTreasureSlot(itemIds: number[], slot: number, value: number) {
  const next = itemIds.slice(0, 20);
  while (next.length < 20) next.push(0);
  next[slot] = Number.isFinite(value) ? Math.trunc(value) : 0;
  return next;
}

function treasureFilledItems(project: Project, id: number) {
  return (project.treasures ?? []).find((record) => record.id === id)?.itemIds.filter(Boolean).length ?? 0;
}

function treasureRewardTotal(record: Project["treasures"][number]) {
  return Math.max(0, record.exp) + Math.max(0, record.gold) + Math.max(0, record.gems) + Math.max(0, record.jewelry);
}

function ShopWorkbench({
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = targetRecords(project, "shop");
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", "shop") ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedRecord(records, selectedId, 140), [records, selectedId]);
  const record = (project.shops ?? []).find((candidate) => candidate.id === selectedId) ?? null;
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const nextId = nextTargetRecordId(project, "shop");
  return (
    <article className="shop-workbench">
      <header className="shop-workbench-header">
        <div>
          <span>Shop Records</span>
          <h2>
            <TutorialTip title="Shop Editor" body={SHOP_RECORD_HELP} side="right">
              <span>Shop Editor</span>
            </TutorialTip>
          </h2>
          <p>Build source shop stock from item IDs, quantities, and inflation.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => {
            onApplyCommand?.({ kind: "createTargetRecord", label: "Create Shop", recordType: "shop", id: nextId });
            onSelectEntity(selectEntityFromId(`shop:${nextId}`));
          }}
        >
          New Shop {nextId}
        </button>
      </header>
      <div className="shop-workbench-layout">
        <aside className="shop-record-browser">
          <header>
            <TutorialTip title="Shop Records" body={SHOP_RECORD_HELP} side="right">
              <strong>{records.length.toLocaleString()} records</strong>
            </TutorialTip>
            <small>{records.reduce((total, entry) => total + shopFilledSlots(project, entry.id), 0).toLocaleString()} stocked slots</small>
          </header>
          <ScrollArea className="shop-record-list" aria-label="Shop records">
            {visibleRecords.map((entry) => {
              const candidate = (project.shops ?? []).find((shop) => shop.id === entry.id) ?? null;
              const itemIds = shopFilledSlotIndexes(candidate).slice(0, 5).map((slot) => candidate?.itemIds[slot] ?? 0);
              return (
                <button
                  key={`shop:${entry.id}`}
                  type="button"
                  className={entry.id === selectedId ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`shop:${entry.id}`))}
                >
                  <span>
                    <strong>Shop {entry.id}</strong>
                    <small>{targetRecordSummary(project, "shop", entry.id)}</small>
                  </span>
                  <TreasureMiniIcons itemIds={itemIds} optionsByValue={optionsByValue} />
                </button>
              );
            })}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more shop records; use search to jump to a specific ID.</p>
            )}
            {records.length === 0 && <p>No shop records yet.</p>}
          </ScrollArea>
        </aside>
        <section className="shop-detail-panel">
          {record ? (
            <>
              <header>
                <div>
                  <span>Shop {record.id}</span>
                  <h3>{shopFilledSlotIndexes(record).length} stocked slot{shopFilledSlotIndexes(record).length === 1 ? "" : "s"}</h3>
                  <p>{shopStockQuantityTotal(record).toLocaleString()} total stocked item{shopStockQuantityTotal(record) === 1 ? "" : "s"} before runtime shop changes</p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear shop", recordType: "shop", id: record.id })}
                >
                  Clear To Defaults
                </button>
              </header>
              <ShopSettingsEditor record={record} onApplyCommand={onApplyCommand} />
              <ShopStockEditor
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                record={record}
                options={options}
                optionsLoading={!deferredOptions}
                onApplyCommand={onApplyCommand}
              />
            </>
          ) : (
            <div className="shop-empty-detail">
              <strong>Shop {selectedId} does not exist yet.</strong>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: selectedId })}
              >
                Create Shop {selectedId}
              </button>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function ShopSettingsEditor({ record, onApplyCommand }: { record: Project["shops"][number]; onApplyCommand?: (command: ProjectCommand) => void }) {
  return (
    <section className="shop-settings-panel" aria-label="Shop settings">
      <div className="shop-setting-card">
        <ItemNumberInput
          label="Inflation"
          value={record.inflation}
          title="Price adjustment applied by this shop source record."
          onCommit={(inflation) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop inflation", id: record.id, changes: { inflation } })}
        />
        <small>Price adjustment applied by this shop source record.</small>
      </div>
    </section>
  );
}

function ShopStockEditor({
  project,
  catalog,
  previewContext,
  record,
  options,
  optionsLoading,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  record: Project["shops"][number];
  options: ItemReferenceOption[];
  optionsLoading: boolean;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const openSlot = firstOpenShopSlot(record);
  const filledSlots = shopFilledSlotIndexes(record);
  const visibleSlots = filledSlots.length ? filledSlots.slice(0, 120) : openSlot >= 0 ? [openSlot] : [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const filteredOptions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return options.filter((option) => {
      if (category !== "all" && option.category !== category) return false;
      if (!text) return true;
      return [option.label, option.detail, option.summary, String(option.value)].some((part) => part.toLowerCase().includes(text));
    }).slice(0, 42);
  }, [category, options, query]);
  const updateStock = (itemIds: number[], quantities: number[]) => {
    onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop stock", id: record.id, changes: { itemIds, quantities } });
  };
  const addItem = (itemId: number) => {
    if (openSlot < 0) return;
    updateStock(updateShopArraySlot(record.itemIds, openSlot, itemId), updateShopArraySlot(record.quantities, openSlot, 1));
  };
  const clearAll = () => {
    updateStock(new Array(1000).fill(0), new Array(1000).fill(0));
  };
  return (
    <section className="shop-stock-panel">
      <div className="shop-catalog-panel">
        <header>
          <div>
            <TutorialTip title="Item Pool" body="Choose from the same item families used by Treasure and Items. Clicking an item fills the next open shop slot with quantity 1." side="right">
              <strong>Item Pool</strong>
            </TutorialTip>
            <small>{openSlot >= 0 ? `Next open slot ${openSlot}` : "All shop slots are filled"}</small>
          </div>
        </header>
        <div className="shop-pool-controls">
          <label>
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.currentTarget.value as ItemReferenceCategory | "all")}
              aria-label="Shop item category"
            >
              {SHOP_ITEM_CATEGORY_OPTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.range ? `${entry.label} (${entry.range})` : entry.label}
                </option>
              ))}
            </select>
          </label>
          <input
            className="item-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search item pool..."
            aria-label="Search shop items"
          />
        </div>
        <ScrollArea className="shop-catalog-list" aria-label="Items available for shop stock">
          {filteredOptions.map((option) => (
            <button key={option.key} type="button" disabled={openSlot < 0} onClick={() => addItem(option.value)}>
              <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
              <span>
                <strong>{itemOptionName(option)}</strong>
                <small>{option.detail}</small>
              </span>
              <b>{option.value}</b>
            </button>
          ))}
          {optionsLoading && <p>Loading item references...</p>}
          {filteredOptions.length === 0 && <p>No items match this category/search.</p>}
        </ScrollArea>
      </div>
      <div className="shop-inventory-panel">
        <header>
          <div>
            <TutorialTip title="Shop Stock" body="Realmz copies this source stock into the runtime shop inventory when a new game starts. Saved games can diverge after play begins." side="right">
              <strong>Shop Stock</strong>
            </TutorialTip>
            <small>{filledSlots.length} of 1000 slots filled</small>
          </div>
          <button type="button" className="btn btn-danger btn-xs" disabled={filledSlots.length === 0} onClick={clearAll}>
            Clear Stock
          </button>
        </header>
        <ScrollArea className="shop-inventory-list" aria-label="Shop stocked items">
          {visibleSlots.map((slot) => {
            const itemId = record.itemIds[slot] ?? 0;
            const quantity = record.quantities[slot] ?? 0;
            const option = optionsByValue.get(itemId);
            return (
              <ShopStockSlotEditor
                key={slot}
                slot={slot}
                itemId={itemId}
                quantity={quantity}
                option={option}
                options={options}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onCommitItem={(value) => updateStock(updateShopArraySlot(record.itemIds, slot, value), record.quantities)}
                onCommitQuantity={(value) => updateStock(record.itemIds, updateShopArraySlot(record.quantities, slot, clampByte(value)))}
                onClear={() => updateStock(updateShopArraySlot(record.itemIds, slot, 0), updateShopArraySlot(record.quantities, slot, 0))}
              />
            );
          })}
          {filledSlots.length > visibleSlots.length && <p className="domain-list-limit">{filledSlots.length - visibleSlots.length} more stocked slots not shown.</p>}
          {visibleSlots.length === 0 && <p>No stock slots available.</p>}
        </ScrollArea>
      </div>
    </section>
  );
}

function ShopStockSlotEditor({
  slot,
  itemId,
  quantity,
  option,
  options,
  project,
  catalog,
  previewContext,
  onCommitItem,
  onCommitQuantity,
  onClear
}: {
  slot: number;
  itemId: number;
  quantity: number;
  option?: ItemReferenceOption;
  options: ItemReferenceOption[];
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onCommitItem: (value: number) => void;
  onCommitQuantity: (value: number) => void;
  onClear: () => void;
}) {
  return (
    <div className={itemId || quantity ? "shop-stock-card filled" : "shop-stock-card"}>
      <span className="shop-stock-index">Slot {slot}</span>
      {option ? <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} /> : <span className="item-option-icon"><i>IT</i></span>}
      <label>
        <span>Item</span>
        <select value={String(itemId)} onChange={(event) => onCommitItem(Number(event.currentTarget.value))}>
          <option value="0">Empty / none</option>
          {itemId !== 0 && !option && <option value={String(itemId)}>Current item {itemId}</option>}
          {options.map((entry) => (
            <option key={entry.key} value={entry.value}>{entry.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Qty</span>
        <input type="number" min={0} max={255} value={quantity} onChange={(event) => onCommitQuantity(Number(event.currentTarget.value))} />
      </label>
      <button type="button" className="btn btn-secondary btn-xs" disabled={!itemId && !quantity} onClick={onClear}>
        Clear
      </button>
      <small>{option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : itemId ? "Raw item ID" : "Open stock slot"}</small>
    </div>
  );
}

function shopFilledSlotIndexes(record: Project["shops"][number] | null | undefined) {
  if (!record) return [];
  const count = Math.max(record.itemIds.length, record.quantities.length);
  const indexes: number[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    if ((record.itemIds[slot] ?? 0) !== 0 || (record.quantities[slot] ?? 0) !== 0) indexes.push(slot);
  }
  return indexes;
}

function firstOpenShopSlot(record: Project["shops"][number]) {
  for (let slot = 0; slot < 1000; slot += 1) {
    if ((record.itemIds[slot] ?? 0) === 0 && (record.quantities[slot] ?? 0) === 0) return slot;
  }
  return -1;
}

function updateShopArraySlot(values: number[], slot: number, value: number) {
  const next = values.slice(0, 1000);
  while (next.length < 1000) next.push(0);
  next[slot] = Number.isFinite(value) ? Math.trunc(value) : 0;
  return next;
}

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function shopFilledSlots(project: Project, id: number) {
  return shopFilledSlotIndexes((project.shops ?? []).find((record) => record.id === id)).length;
}

function shopStockQuantityTotal(record: Project["shops"][number]) {
  return record.quantities.reduce((total, quantity, slot) => (record.itemIds[slot] ?? 0) ? total + Math.max(0, quantity) : total, 0);
}

function numberField(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

function numberText(summary: Record<string, unknown>, key: string) {
  const value = numberField(summary, key);
  return value == null ? "none" : String(value);
}

function formatPair(first: unknown, second: unknown) {
  const a = typeof first === "number" ? first : first == null ? 0 : String(first);
  const b = typeof second === "number" ? second : second == null ? 0 : String(second);
  return `${a}, ${b}`;
}

function costText(cost: number | null) {
  if (cost == null) return "none";
  if (cost < 0) return `${Math.abs(cost)} gp, unique`;
  return `${cost} gp`;
}

function itemFamilyLabel(itemId: number) {
  const abs = Math.abs(itemId);
  if (abs > 0 && abs < 200) return "Weapons";
  if (abs >= 200 && abs < 400) return "Armor";
  if (abs >= 400 && abs < 600) return "Accessories";
  if (abs >= 600 && abs < 800) return "Magic";
  if (abs >= 800 && abs < 1000) return "Supplies / Special";
  return "Unknown item family";
}

function itemEditRangeLabel(itemId: number) {
  const abs = Math.abs(itemId);
  if (abs >= 900 && abs < 1000) return "Custom item range";
  if (abs >= 800 && abs < 900) return "Supply item";
  return "Built-in item";
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function TargetRecordWorkbench({
  project,
  catalog,
  recordType,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onSelectEditor,
  onSelectRecordType,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordType: RealmzTargetRecordKind;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectRecordType?: (recordType: RealmzTargetRecordKind) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = targetRecords(project, recordType);
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", recordType) ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedRecord(records, selectedId, 80), [records, selectedId]);
  const opcode = opcodeForTargetRecord(recordType);
  const nextId = nextTargetRecordId(project, recordType);
  const recordHelp = targetRecordHelp(recordType);
  const encounterRecords = isEncounterRecordType(recordType);
  const [recordsCollapsedByType, setRecordsCollapsedByType] = useState<Record<string, boolean>>({});
  const recordsCollapsed = encounterRecords ? recordsCollapsedByType[recordType] ?? true : false;
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    setEditorReady(false);
    const handle = window.setTimeout(() => setEditorReady(true), 120);
    return () => window.clearTimeout(handle);
  }, [recordType, selectedId]);
  return (
    <article className="domain-target-workbench">
      <header>
        <div>
          {recordHelp ? (
            <TutorialTip title={`${targetRecordLabel(recordType)} Records`} body={recordHelp} side="right">
              <span>{targetRecordLabel(recordType)} Records</span>
            </TutorialTip>
          ) : (
            <span>{targetRecordLabel(recordType)} Records</span>
          )}
          <small>{records.length.toLocaleString()} editable Realmz fixed-record entr{records.length === 1 ? "y" : "ies"}</small>
        </div>
        <div className="domain-target-header-actions">
          {encounterRecords && (
            <button
              type="button"
              className="btn btn-secondary btn-xs domain-record-list-toggle"
              title={recordsCollapsed ? "Show encounter records list" : "Hide encounter records list"}
              aria-pressed={recordsCollapsed}
              onClick={() => setRecordsCollapsedByType((current) => ({ ...current, [recordType]: !(current[recordType] ?? true) }))}
            >
              {recordsCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
              {recordsCollapsed ? "Show Records" : "Hide Records"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${targetRecordLabel(recordType)}`, recordType, id: nextId });
              onSelectEntity(selectEntityFromId(targetEntityId(recordType, nextId)));
            }}
          >
            New {targetRecordLabel(recordType)} {nextId}
          </button>
        </div>
      </header>
      <div className={`domain-target-layout${encounterRecords ? " encounter-target-layout" : ""}${recordsCollapsed ? " domain-target-records-collapsed" : ""}`}>
        {!recordsCollapsed && (
          <ScrollArea className="domain-target-list" aria-label={`${targetRecordLabel(recordType)} records`}>
            {visibleRecords.map((record) => (
              <button
                key={`${recordType}:${record.id}`}
                type="button"
                className={record.id === selectedId ? "selected" : ""}
                onClick={() => onSelectEntity(selectEntityFromId(targetEntityId(recordType, record.id)))}
              >
                <strong>{targetRecordLabel(recordType)} {record.id}</strong>
                <small>{targetRecordSummary(project, recordType, record.id)}</small>
              </button>
            ))}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more {targetRecordLabel(recordType).toLowerCase()} record(s); use the focused editor or search to narrow.</p>
            )}
            {records.length === 0 && <p>No {targetRecordLabel(recordType).toLowerCase()} records yet.</p>}
          </ScrollArea>
        )}
        <div className="domain-target-editor">
          {editorReady ? (
            <TargetRecordEditor
              project={project}
              catalog={catalog}
              opcode={opcode}
              targetId={selectedId}
              recordType={recordType}
              presentation="workbench"
              desktopRuntime={previewContext.desktopRuntime}
              projectDir={previewContext.projectDir}
              workspaceDir={previewContext.workspaceDir}
              onSelectEntity={onSelectEntity}
              onSelectEditor={onSelectEditor}
              onSelectEncounterRecordType={onSelectRecordType}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="domain-target-editor-placeholder">Loading selected {targetRecordLabel(recordType).toLowerCase()}...</div>
          )}
        </div>
      </div>
    </article>
  );
}

function targetRecordTypesForEditor(tab: EditorTab, activeEditor: string): RealmzTargetRecordKind[] {
  if (tab === "text" && (activeEditor === "domain" || activeEditor === "messages")) return ["message"];
  if (tab === "combat" && activeEditor === "domain") return ["battle", "monster"];
  if (tab === "combat" && activeEditor === "battles") return ["battle"];
  if (tab === "combat" && activeEditor === "monsters") return ["monster"];
  if (tab === "economy" && activeEditor === "domain") return ["treasure", "shop"];
  if (tab === "economy" && activeEditor === "treasure") return ["treasure"];
  if (tab === "economy" && activeEditor === "shops") return ["shop"];
  if (tab === "encounters") return ["simpleEncounter", "complexEncounter", "thiefEncounter", "timedEncounter"];
  return [];
}

function economySectionFromEditor(activeEditor: string): EconomySection | null {
  if (activeEditor === "treasure") return "treasure";
  if (activeEditor === "items") return "items";
  if (activeEditor === "shops") return "shops";
  return null;
}

function economyTargetRecordTypesForSection(section: EconomySection): RealmzTargetRecordKind[] {
  if (section === "treasure") return ["treasure"];
  if (section === "shops") return ["shop"];
  return [];
}

function targetRecordTypeFromEditor(tab: EditorTab, activeEditor: string): RealmzTargetRecordKind | null {
  if (tab !== "encounters") return null;
  if (activeEditor === "simple") return "simpleEncounter";
  if (activeEditor === "complex") return "complexEncounter";
  if (activeEditor === "rogue") return "thiefEncounter";
  if (activeEditor === "timed") return "timedEncounter";
  return null;
}

function targetRecords(project: Project, recordType: RealmzTargetRecordKind): Array<{ id: number }> {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

function isEncounterRecordType(recordType: RealmzTargetRecordKind) {
  return recordType === "simpleEncounter" || recordType === "complexEncounter" || recordType === "thiefEncounter" || recordType === "timedEncounter";
}

function includeSelectedRecord<T extends { id: number }>(records: T[], selectedId: number, limit: number) {
  const visible = records.slice(0, limit);
  if (visible.some((record) => record.id === selectedId)) return visible;
  const selected = records.find((record) => record.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}

function targetIdFromSelection(entityId: string, recordType: RealmzTargetRecordKind) {
  const prefix = targetEntityPrefix(recordType);
  if (recordType === "timedEncounter") {
    const semanticMatch = entityId.match(/^time:(-?\d+)$/);
    if (semanticMatch) return Number(semanticMatch[1]);
  }
  if (recordType === "thiefEncounter") {
    const semanticMatch = entityId.match(/^thief:(-?\d+)$/);
    if (semanticMatch) return Number(semanticMatch[1]);
  }
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

function selectedTargetRecordTypeFromEntity(entityId: string, recordTypes: RealmzTargetRecordKind[]) {
  return recordTypes.find((recordType) => targetIdFromSelection(entityId, recordType) !== null) ?? null;
}

function targetEntityId(recordType: RealmzTargetRecordKind, id: number) {
  return `${targetEntityPrefix(recordType)}${id}`;
}

function targetEntityPrefix(recordType: RealmzTargetRecordKind) {
  if (recordType === "simpleEncounter") return "encounter:simple:";
  if (recordType === "complexEncounter") return "encounter:complex:";
  if (recordType === "thiefEncounter") return "thief:";
  if (recordType === "timedEncounter") return "time:";
  if (recordType === "questLabel") return "quest:";
  return `${recordType}:`;
}

function opcodeForTargetRecord(recordType: RealmzTargetRecordKind) {
  if (recordType === "message") return 1;
  if (recordType === "battle") return 2;
  if (recordType === "monster") return 127;
  if (recordType === "treasure") return 10;
  if (recordType === "shop") return 6;
  if (recordType === "simpleEncounter") return 4;
  if (recordType === "complexEncounter") return 5;
  if (recordType === "thiefEncounter") return 5;
  if (recordType === "timedEncounter") return 54;
  return 47;
}

function targetRecordLabel(recordType: RealmzTargetRecordKind) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "Message",
    battle: "Battle",
    monster: "Monster",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
    thiefEncounter: "Rogue Encounter",
    timedEncounter: "Time Encounter",
    questLabel: "Quest Label"
  };
  return labels[recordType];
}

function targetRecordHelp(recordType: RealmzTargetRecordKind) {
  if (recordType === "shop") return SHOP_RECORD_HELP;
  if (recordType === "treasure") return TREASURE_EDITOR_HELP;
  if (recordType === "simpleEncounter") return SIMPLE_ENCOUNTER_HELP;
  if (recordType === "complexEncounter") return COMPLEX_ENCOUNTER_HELP;
  if (recordType === "thiefEncounter") return THIEF_ENCOUNTER_HELP;
  if (recordType === "timedEncounter") return TIMED_ENCOUNTER_HELP;
  return null;
}

function nextTargetRecordId(project: Project, recordType: RealmzTargetRecordKind) {
  const used = new Set(targetRecords(project, recordType).map((record) => record.id));
  const firstId = isEncounterRecordType(recordType) ? 0 : 1;
  for (let id = firstId; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + firstId;
}

function targetRecordSummary(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  if (recordType === "message") return (project.messages ?? []).find((record) => record.id === id)?.text.slice(0, 80) || "empty message";
  if (recordType === "battle") {
    const record = (project.battles ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.grid.filter(Boolean).length} monster slot(s), messages ${record.messageBefore}/${record.messageAfter}` : "missing battle";
  }
  if (recordType === "monster") {
    const record = (project.monsters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.displayName || `Monster ${id}`}, HD ${record.hitDice}, icon ${record.iconId}` : "missing monster";
  }
  if (recordType === "treasure") {
    const record = (project.treasures ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold, ${record.exp} exp` : "missing treasure";
  }
  if (recordType === "shop") {
    const record = (project.shops ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation` : "missing shop";
  }
  if (recordType === "simpleEncounter") {
    const record = (project.simpleEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing simple encounter";
  }
  if (recordType === "complexEncounter") {
    const record = (project.complexEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing complex encounter";
  }
  if (recordType === "thiefEncounter") {
    const record = (project.thiefEncounters ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.typeFlags.filter(Boolean).length} enabled action(s), trap ${record.lowDamage}-${record.highDamage}, spell ${record.spell}` : "missing rogue encounter";
  }
  if (recordType === "timedEncounter") {
    const record = (project.timedEncounters ?? []).find((candidate) => candidate.id === id);
    if (!record) return "missing time encounter";
    const location =
      record.locationKind === "land" ? "land" :
      record.locationKind === "dungeon" ? "dungeon" :
      "anywhere";
    return `day ${record.day}, every ${record.increment}, ${record.percent}% chance, ${location}`;
  }
  return "metadata";
}

function readStoredOverviewTargetRecordType(tab: EditorTab) {
  try {
    const value = window.localStorage.getItem(`domain.${tab}.targetRecordType`) as RealmzTargetRecordKind | null;
    return value;
  } catch {
    return null;
  }
}

function writeStoredOverviewTargetRecordType(tab: EditorTab, recordType: RealmzTargetRecordKind) {
  try {
    window.localStorage.setItem(`domain.${tab}.targetRecordType`, recordType);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
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

function numericSummaryValue(summary: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  }
  return null;
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

function DomainDetailPanel({
  detail,
  catalog,
  onUpdateDraft
}: {
  detail: SemanticEntity | LibraryEntity | DirectRecordRow | { id: string; label: string; type: string; editState: string; confidence: string; summary: Record<string, unknown>; source?: string; recordRef?: string | null; byteRange?: unknown } | null;
  catalog: LibraryCatalog | null;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
}) {
  const asset = useMemo(() => findLibraryAssetForDetail(detail, catalog), [catalog, detail]);
  const preview = useLibraryAssetPreview(asset);
  if (!detail) {
    return (
      <aside className="domain-detail-panel">
        <header>
          <span>Selection</span>
        </header>
        <ScrollArea className="domain-detail-scroll" aria-label="Selection detail">
          <p>Select an entry or create a new draft to inspect its content, decoded fields, and export state.</p>
        </ScrollArea>
      </aside>
    );
  }
  const source = "source" in detail ? detail.source : null;
  const recordRef = "recordRef" in detail ? detail.recordRef : null;
  const summary = typeof detail.summary === "object" ? detail.summary ?? {} : { summary: detail.summary };
  const canEditDraft = isDraftEntity(detail.id) && onUpdateDraft;
  const sourceLabel = source ? catalog?.sources.find((candidate) => candidate.id === source)?.relativePath ?? source : "none";
  const contentFacts = getContentFacts(detail);
  return (
    <aside className="domain-detail-panel">
      <header>
        <span>{ENTITY_TYPE_LABELS[detail.type] ?? detail.type}</span>
        <b>{"editState" in detail ? detail.editState : "direct"}</b>
      </header>
      <ScrollArea className="domain-detail-scroll" aria-label="Domain detail">
        {canEditDraft ? (
          <label className="domain-field">
            <span>Name</span>
            <input
              defaultValue={detail.label}
              onBlur={(event) => {
                const label = event.currentTarget.value.trim();
                if (label && label !== detail.label) onUpdateDraft(detail.id, { label });
              }}
            />
          </label>
        ) : (
          <h2>{detail.label}</h2>
        )}
        <p className="domain-detail-subtitle">{entitySubtitle(detail)}</p>
        {asset && <DomainAssetPreview asset={asset} preview={preview} />}
        <section className="domain-summary">
          <header>Content</header>
          {contentFacts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <code>{fact.value}</code>
            </div>
          ))}
        </section>
        {canEditDraft && (
          <label className="domain-field">
            <span>Notes</span>
            <textarea
              defaultValue={String(summary.notes ?? "")}
              onBlur={(event) => {
                const notes = event.currentTarget.value;
                if (notes !== String(summary.notes ?? "")) onUpdateDraft(detail.id, { notes });
              }}
            />
          </label>
        )}
        <section className="domain-summary">
          <header>Decoded Fields</header>
          {Object.entries(summary).length ? (
            Object.entries(summary).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <code>{formatSummaryValue(value)}</code>
              </div>
            ))
          ) : (
            <p>No decoded fields yet.</p>
          )}
        </section>
        <section className="domain-summary domain-technical-summary">
          <header>Technical</header>
          <div>
            <span>ID</span>
            <code>{detail.id}</code>
          </div>
          <div>
            <span>Source</span>
            <code>{sourceLabel}</code>
          </div>
          <div>
            <span>Record</span>
            <code>{recordRef ?? "none"}</code>
          </div>
          <div>
            <span>Status</span>
            <code>{userFacingConfidence("confidence" in detail ? detail.confidence : "source-backed")}</code>
          </div>
        </section>
      </ScrollArea>
    </aside>
  );
}

function DomainAssetPreview({ asset, preview }: { asset: LibraryAsset; preview: string | null }) {
  const kind = assetKind(asset.type);
  return (
    <section className="domain-asset-preview">
      {preview && kind === "sound" ? (
        <audio src={preview} controls preload="metadata" />
      ) : preview && kind !== "sound" ? (
        <img src={preview} alt={asset.label} />
      ) : (
        <div className="domain-preview-empty">Preview unavailable for this resource variant.</div>
      )}
      <div>
        <strong>{asset.label}</strong>
        <small>{asset.resourceType ?? asset.type} {asset.resourceId ?? ""} | {formatBytes(asset.bytes)}</small>
      </div>
    </section>
  );
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}

function useLibraryAssetPreview(asset: LibraryAsset | null) {
  const [preview, setPreview] = useState<string | null>(asset?.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!asset) {
      setPreview(null);
      return;
    }
    setPreview(asset.previewPath ?? null);
    loadBrowserBundledLibraryAssetPreview(asset)
      .then((url) => {
        if (!disposed) setPreview(url);
      })
      .catch(() => {
        if (!disposed) setPreview(asset.previewPath ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [asset]);
  return preview;
}

function findLibraryAssetForDetail(detail: { id: string; label?: string; type: string; summary: Record<string, unknown> | string; source?: string } | null, catalog: LibraryCatalog | null) {
  if (!detail || !catalog) return null;
  const summary = typeof detail.summary === "object" ? detail.summary : {};
  const resourceType = typeof summary.type === "string" ? summary.type : null;
  const resourceId = typeof summary.resourceId === "number" ? summary.resourceId : null;
  if (resourceType && resourceId !== null) {
    return catalog.assets.find((asset) =>
      asset.resourceType === resourceType &&
      asset.resourceId === resourceId &&
      (!detail.source || asset.source === detail.source)
    ) ?? null;
  }
  return catalog.assets.find((asset) => asset.id === detail.id || (detail.label != null && asset.label === detail.label)) ?? null;
}

function assetKind(type: string): ManagedAssetKind {
  if (type === "sound") return "sound";
  if (type === "icon" || type.includes("icon")) return "icon";
  if (type === "picture") return "picture";
  if (type === "text") return "text";
  return "other";
}

function formatSummaryValue(value: unknown) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function EntityRows({
  entities,
  selectedEntity,
  onSelectEntity
}: {
  entities: DomainListEntry[];
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const visible = includeSelectedEntry(entities, selectedEntity?.id ?? null, 80);
  return (
    <ScrollArea className="domain-entity-list" aria-label="Domain entities">
      {visible.map((entity, index) => {
        const selected = selectedEntity?.id === entity.id;
        return (
          <button
            key={`domain-entity:${entity.id}:${index}`}
            className={selected ? "selected" : ""}
            type="button"
            onClick={() => onSelectEntity(selectEntityFromId(entity.id))}
          >
            <strong>{entity.label}</strong>
            <small>{entitySubtitle(entity)}</small>
          </button>
        );
      })}
      {entities.length > visible.length && (
        <p className="domain-list-limit">{entities.length - visible.length} more entr{entities.length - visible.length === 1 ? "y" : "ies"}; open the focused editor or search to narrow.</p>
      )}
    </ScrollArea>
  );
}

function includeSelectedEntry<T extends { id: string }>(entries: T[], selectedId: string | null, limit: number) {
  const visible = entries.slice(0, limit);
  if (!selectedId || visible.some((entry) => entry.id === selectedId)) return visible;
  const selected = entries.find((entry) => entry.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}

function entitySubtitle(entity: SemanticEntity | LibraryEntity | DomainListEntry | { type: string; editState?: string; summary: Record<string, unknown> | string }) {
  const summary = typeof entity.summary === "object" ? entity.summary ?? {} : { textPreview: entity.summary };
  const editState = "editState" in entity ? entity.editState : "direct";
  if (summary.draft) return `draft | ${editState}`;
  if (summary.resourceId !== undefined) {
    const resource = `${String(summary.type ?? "resource").trim()} ${summary.resourceId}`;
    const size = summary.bytes !== undefined ? ` | ${formatBytes(Number(summary.bytes))}` : "";
    const family = summary.family ? ` | ${summary.family}` : "";
    return `${resource}${size}${family}`;
  }
  if (summary.count !== undefined && summary.totalBytes !== undefined) {
    return `${Number(summary.count).toLocaleString()} entries | ${formatBytes(Number(summary.totalBytes))}`;
  }
  if (summary.index !== undefined) {
    const bytes = summary.recordBytes !== undefined ? ` | ${formatBytes(Number(summary.recordBytes))}` : "";
    return `entry ${summary.index}${bytes} | ${editState}`;
  }
  if (summary.family) return `${summary.family} | ${editState}`;
  if (summary.textPreview) return `${summary.textPreview} | ${editState}`;
  return `${ENTITY_TYPE_LABELS[entity.type] ?? entity.type} | ${editState}`;
}

function getContentFacts(detail: { type: string; editState?: string; summary: Record<string, unknown> | string }) {
  const summary = typeof detail.summary === "object" ? detail.summary ?? {} : { textPreview: detail.summary };
  const facts: Array<{ label: string; value: string }> = [
    { label: "Kind", value: ENTITY_TYPE_LABELS[detail.type] ?? detail.type },
    { label: "State", value: detail.editState ?? "direct" }
  ];
  if (summary.resourceId !== undefined) facts.push({ label: "Resource", value: `${String(summary.type ?? "resource").trim()} ${summary.resourceId}` });
  if (summary.index !== undefined) facts.push({ label: "Entry", value: String(summary.index) });
  if (summary.family) facts.push({ label: "Family", value: String(summary.family) });
  if (summary.bytes !== undefined) facts.push({ label: "Size", value: formatBytes(Number(summary.bytes)) });
  if (summary.recordBytes !== undefined) facts.push({ label: "Record Size", value: formatBytes(Number(summary.recordBytes)) });
  if (summary.stringCount !== undefined) facts.push({ label: "Strings", value: String(summary.stringCount) });
  if (summary.iconBytes !== undefined) facts.push({ label: "Icon Bytes", value: formatBytes(Number(summary.iconBytes)) });
  if (summary.frame) facts.push({ label: "Frame", value: formatSummaryValue(summary.frame) });
  if (summary.exportState) facts.push({ label: "Export", value: String(summary.exportState) });
  if (summary.textPreview) facts.push({ label: "Preview", value: String(summary.textPreview) });
  return facts;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  if (value < 1024) return `${value.toLocaleString()} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
