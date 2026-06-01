import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ENTITY_TYPE_LABELS } from "../constants";
import { loadBrowserBundledLibraryAssetPreview } from "../browser/library";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { isDraftEntity, LibraryDraftSpec } from "../libraryDrafts";
import { EditorTab, LibraryAsset, LibraryCatalog, LibraryEntity, ManagedAssetKind, Project, ProjectCommand, RealmzTargetRecordKind, ScenarioItemRecord, SemanticEntity, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { TargetRecordEditor } from "./ScriptsPanel";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceOptions, type ItemReferenceCategory, type ItemReferenceOption } from "../itemReferences";

const DOMAIN_CONFIG: Record<EditorTab, { title: string; subtitle: string; editors: DomainEditor[] }> = {
  maps: {
    title: "Maps",
    subtitle: "Land, layout, dungeon, map notes, and special land tile workflows.",
    editors: [
      { id: "land", label: "Land Editor", entityTypes: ["map"] },
      { id: "land-layout", label: "Land Layout", entityTypes: ["land-layout"], createType: "land-layout" },
      { id: "map-editor", label: "Map Editor", entityTypes: ["map"] },
      { id: "dungeon", label: "Dungeon Editor", entityTypes: ["map"] },
      { id: "special-land", label: "Special Land Tiles", entityTypes: ["special-land-tile"], createType: "special-land-tile" }
    ]
  },
  scripts: {
    title: "Action Point Hub",
    subtitle: "Action Points, GOSUBs, macros, global macros, quests, and cross-links into scenario content.",
    editors: [
      { id: "action-points", label: "Action Points / GOSUBs", entityTypes: ["trigger", "action-slot"] },
      { id: "macros", label: "Macros", entityTypes: ["macro"], createType: "macro" },
      { id: "ed3-evidence", label: "Imported Extra Actions", entityTypes: ["ed3-action-record"] },
      { id: "global-macros", label: "Global Macros", entityTypes: ["global-macro"], createType: "global-macro" },
      { id: "quests", label: "Quests", entityTypes: ["quest flag"], createType: "quest flag" }
    ]
  },
  scenario: {
    title: "Scenario",
    subtitle: "Startup information, restrictions, contact metadata, and legacy security.",
    editors: [
      { id: "startup", label: "Scenario Startup Information", entityTypes: ["scenario-startup", "scenario", "contact-info"], createType: "scenario-startup" },
      { id: "restrictions", label: "Scenario Restrictions", entityTypes: ["scenario-restriction"], createType: "scenario-restriction" },
      { id: "global-macros", label: "Global Macros", entityTypes: ["global-macro", "macro"], createType: "global-macro" },
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

export function SuiteDomainPanel({
  tab,
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onApplyCommand,
  onCreateDraft,
  onUpdateDraft
}: {
  tab: EditorTab;
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onCreateDraft?: (spec: LibraryDraftSpec) => void;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
}) {
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
  const projectEntities = project?.semanticSchema.entities ?? [];
  const libraryEntities = catalog?.entities ?? [];
  const selectedDetail =
    projectEntities.find((entity) => entity.id === selectedEntity?.id) ??
    libraryEntities.find((entity) => entity.id === selectedEntity?.id) ??
    (tab === "records" ? [
      ...(project?.semanticSchema.records ?? []),
      ...(catalog?.records ?? [])
    ].find((record) => record.id === selectedEntity?.id) : null) ??
    null;
  const records = tab === "records" ? [
    ...(project?.semanticSchema.records.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? []),
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
  const suppressDetailPanel = tab === "encounters" || economyActive;
  const showTargetSwitcher = targetRecordTypes.length > 1 && (tab === "encounters" || (!economyActive && !focusedTargetEditor));
  const showOverviewCards = tab !== "records" && tab !== "linter" && !focusedTargetEditor && !itemWorkbenchActive && targetRecordTypes.length === 0;
  return (
    <section className={`domain-workbench${suppressDetailPanel ? " domain-workbench-no-detail" : ""}`}>
      <header className="domain-header">
        <div>
          <h1>{headerEditor ? headerEditor.label : config.title}</h1>
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
            <TargetRecordWorkbench
              key={recordType}
              project={project}
              catalog={catalog}
              recordType={recordType}
              selectedEntity={selectedEntity}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
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
              {records.slice(0, 240).map((record, index) => (
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
          const matches = matchingEntities(editor, projectEntities, libraryEntities);
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

function matchingEntities(editor: DomainEditor, projectEntities: SemanticEntity[], libraryEntities: LibraryEntity[]) {
  const wanted = new Set(editor.entityTypes);
  const projectMatches = projectEntities.filter((entity) => wanted.has(entity.type));
  const libraryMatches = libraryEntities.filter((entity) => wanted.has(entity.type));
  return [...projectMatches, ...libraryMatches];
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
        return (
          <button
            key={recordType}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "active" : ""}
            onClick={() => onSelectRecordType(recordType)}
          >
            <span>{targetRecordLabel(recordType)}</span>
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
  const sections: Array<{ id: EconomySection; label: string; count: number }> = [
    { id: "treasure", label: "Treasure", count: project.treasures.length },
    { id: "items", label: "Items", count: itemCount },
    { id: "shops", label: "Shops", count: project.shops.length }
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
            <span>{section.label}</span>
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const selectedFromEntity = itemIdFromEntityId(selectedEntity?.id ?? "");
  const filteredOptions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return options.filter((option) => {
      if (category !== "all" && option.category !== category) return false;
      if (!text) return true;
      return [option.label, option.detail, option.summary, String(option.value)].some((part) => part.toLowerCase().includes(text));
    });
  }, [category, options, query]);
  const visibleOptions = useMemo(() => filteredOptions.slice(0, 240), [filteredOptions]);
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
          <h2>Item Editor</h2>
          <p>Browse Realmz items by Divinity category, including scenario special items loaded from this scenario's item table.</p>
        </div>
        <strong>{options.length.toLocaleString()} item reference{options.length === 1 ? "" : "s"}</strong>
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
                <ItemOptionIcon option={option} project={project} catalog={catalog} />
                <span>
                  <strong>{option.label.replace(/\s+\(-?\d+\)$/, "")}</strong>
                  <small>{option.detail}</small>
                </span>
                <b>{option.value}</b>
              </button>
            ))}
            {filteredOptions.length > visibleOptions.length && (
              <p className="domain-list-limit">
                {filteredOptions.length - visibleOptions.length} more item reference{filteredOptions.length - visibleOptions.length === 1 ? "" : "s"}; search or choose a narrower category.
              </p>
            )}
            {filteredOptions.length === 0 && <p>No items match this category/search.</p>}
          </ScrollArea>
        </aside>
        <ItemDetailPanel
          option={selectedOption}
          entity={selectedEntityDetail}
          project={project}
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
  catalog
}: {
  option: ItemReferenceOption;
  project: Project;
  catalog?: LibraryCatalog | null;
}) {
  const iconUrl = itemOptionIconUrl(option.iconId, project, catalog);
  return (
    <span className="item-option-icon" title={option.iconId ? `cicn ${option.iconId}` : `${itemCategoryBadge(option.category)} item`}>
      {iconUrl ? <img src={iconUrl} alt="" /> : <i>{itemCategoryBadge(option.category)}</i>}
    </span>
  );
}

function itemOptionIconUrl(iconId: number | null, project: Project, catalog?: LibraryCatalog | null) {
  if (!iconId) return null;
  const absId = Math.abs(iconId);
  const projectAsset = project.assetCatalog.icons?.find((asset) => Math.abs(asset.resourceId) === absId && asset.previewPath);
  if (projectAsset?.previewPath) return projectAsset.previewPath;
  const libraryAsset = catalog?.assets.find((asset) =>
    (asset.type === "icon" || asset.type.includes("icon") || asset.resourceType === "cicn") &&
    asset.resourceId != null &&
    Math.abs(asset.resourceId) === absId &&
    asset.previewPath
  );
  if (libraryAsset?.previewPath) return libraryAsset.previewPath;
  return browserReferenceIconUrl(absId);
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
  onSelectEntity,
  onApplyCommand
}: {
  option: ItemReferenceOption | null;
  entity: SemanticEntity | LibraryEntity | null;
  project: Project;
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
  return (
    <section className="item-detail-panel">
      <header>
        <div>
          <span>{option.value}</span>
          <h3>{option.label.replace(/\s+\(-?\d+\)$/, "")}</h3>
          <p>{itemFamilyLabel(option.value)}{unique ? " | unique item cost" : ""}</p>
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
                onApplyCommand?.({
                  kind: "updateScenarioItemRecord",
                  label: `Copy item ${option.value} to custom item ${nextCustomId}`,
                  id,
                  changes: { ...scenarioItemChangesFromSummary(summary), itemId: nextCustomId }
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
      <div className="item-detail-grid">
        <ItemFact label="Icon" value={numberText(summary, "iconId")} />
        <ItemFact label="Type" value={numberText(summary, "type")} />
        <ItemFact label="Cost" value={costText(numberField(summary, "cost"))} />
        <ItemFact label="Charges" value={numberText(summary, "charge")} />
        <ItemFact label="Sound" value={numberText(summary, "sound")} />
        <ItemFact label="Cursed As" value={numberText(summary, "cursedItemId")} />
      </div>
      <div className="item-detail-columns">
        <ItemFieldGroup title="Equipping">
          <ItemFact label="Strength" value={numberText(summary, "st")} />
          <ItemFact label="Luck" value={numberText(summary, "lu")} />
          <ItemFact label="Movement" value={numberText(summary, "movement")} />
          <ItemFact label="Armor Rating" value={numberText(summary, "ac")} />
          <ItemFact label="Magic Resist" value={numberText(summary, "magicResistance")} />
          <ItemFact label="Spell Points" value={numberText(summary, "spellPoints")} />
          <ItemFact label="Hands" value={numberText(summary, "hands")} />
          <ItemFact label="Weight" value={numberText(summary, "weight")} />
        </ItemFieldGroup>
        <ItemFieldGroup title="Damage">
          <ItemFact label="Base Damage" value={numberText(summary, "damage")} />
          <ItemFact label="Heat" value={numberText(summary, "heat")} />
          <ItemFact label="Cold" value={numberText(summary, "cold")} />
          <ItemFact label="Electric" value={numberText(summary, "electric")} />
          <ItemFact label="Vs. Small" value={numberText(summary, "vSmall")} />
          <ItemFact label="Vs. Large" value={numberText(summary, "vLarge")} />
          <ItemFact label="Vs. Undead" value={numberText(summary, "vsUndead")} />
          <ItemFact label="Vs. Evil" value={numberText(summary, "vsEvil")} />
        </ItemFieldGroup>
        <ItemFieldGroup title="Special Behavior">
          <ItemFact label="Special 1" value={numberText(summary, "special1")} />
          <ItemFact label="Special 2" value={numberText(summary, "special2")} />
          <ItemFact label="Special 3" value={numberText(summary, "special3")} />
          <ItemFact label="Special 4" value={numberText(summary, "special4")} />
          <ItemFact label="Special 5" value={numberText(summary, "special5")} />
          <ItemFact label="Weight / Charge" value={numberText(summary, "weightPerCharge")} />
          <ItemFact label="Drop On Empty" value={numberText(summary, "dropOnEmpty")} />
          <ItemFact label="Magic Flag" value={numberText(summary, "magical")} />
        </ItemFieldGroup>
        <ItemFieldGroup title="Use Restrictions">
          <ItemFact label="Item Category Bits" value={formatPair(summary.itemCat0, summary.itemCat1)} />
          <ItemFact label="Race Restrictions" value={numberText(summary, "raceRestrictions")} />
          <ItemFact label="Caste Restrictions" value={numberText(summary, "casteRestrictions")} />
          <ItemFact label="Specific Race" value={numberText(summary, "specificRace")} />
          <ItemFact label="Specific Caste" value={numberText(summary, "specificCaste")} />
          <ItemFact label="Race Class Only" value={numberText(summary, "raceClassOnly")} />
          <ItemFact label="Caste Class Only" value={numberText(summary, "casteClassOnly")} />
        </ItemFieldGroup>
      </div>
      {customEditable && (
        <ScenarioItemEditor
          record={scenarioItem ?? emptyScenarioItemForUi(customRecordId)}
          itemId={option.value}
          onChange={(field, value) => {
            onApplyCommand?.({
              kind: "updateScenarioItemRecord",
              label: `Update custom item ${option.value}`,
              id: customRecordId,
              changes: { itemId: option.value, [field]: value } as Partial<ScenarioItemRecord>
            });
          }}
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

function ItemFieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="item-field-group">
      <header>{title}</header>
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
  | "raceRestrictions"
  | "casteRestrictions"
  | "specificRace"
  | "specificCaste"
  | "raceClassOnly"
  | "casteClassOnly"
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
      { key: "sound", label: "Sound", help: "Sound played by item effects, when used." },
      { key: "cursedItemId", label: "Cursed As", help: "Item ID used after curse transformation." },
      { key: "magical", label: "Magic Flag", help: "Realmz magical-item marker." }
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
  {
    title: "Restrictions And Special Fields",
    fields: [
      { key: "itemCat0", label: "Category Bits A" },
      { key: "itemCat1", label: "Category Bits B" },
      { key: "raceRestrictions", label: "Race Restrict." },
      { key: "casteRestrictions", label: "Caste Restrict." },
      { key: "specificRace", label: "Specific Race" },
      { key: "specificCaste", label: "Specific Caste" },
      { key: "raceClassOnly", label: "Race Only" },
      { key: "casteClassOnly", label: "Caste Only" },
      { key: "special1", label: "Special 1" },
      { key: "special2", label: "Special 2" },
      { key: "special3", label: "Special 3" },
      { key: "special4", label: "Special 4" },
      { key: "special5", label: "Special 5" },
      { key: "weightPerCharge", label: "Weight/Charge" },
      { key: "dropOnEmpty", label: "Drop Empty" }
    ]
  }
];

function ScenarioItemEditor({
  record,
  itemId,
  onChange
}: {
  record: ScenarioItemRecord;
  itemId: number;
  onChange: (field: ScenarioItemNumberKey, value: number) => void;
}) {
  return (
    <section className="scenario-item-editor" aria-label={`Custom item ${itemId} editor`}>
      <header>
        <div>
          <span>Custom Item {itemId}</span>
          <h4>Scenario Item Fields</h4>
        </div>
        <small>Data NI</small>
      </header>
      <div className="scenario-item-editor-grid">
        {SCENARIO_ITEM_EDIT_GROUPS.map((group) => (
          <ItemFieldGroup key={group.title} title={group.title}>
            {group.fields.map((field) => (
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
      </div>
    </section>
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
    ...(project.semanticSchema.entities ?? []),
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
  for (const link of project.semanticSchema.links ?? []) {
    if (link.to !== `item:${itemId}`) continue;
    if (links.some((usage) => usage.target === link.from)) continue;
    links.push({ target: link.from, label: semanticLinkLabel(project, link.from), detail: link.kind.replace(/_/g, " ") });
  }
  return links.slice(0, 18);
}

function semanticLinkLabel(project: Project, entityId: string) {
  const entity = project.semanticSchema.entities.find((candidate) => candidate.id === entityId);
  return entity?.label ?? entityId;
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordType: RealmzTargetRecordKind;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = targetRecords(project, recordType);
  const visibleRecords = records.slice(0, 80);
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", recordType) ?? records[0]?.id ?? 1;
  const opcode = opcodeForTargetRecord(recordType);
  const nextId = nextTargetRecordId(project, recordType);
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
          <span>{targetRecordLabel(recordType)} Records</span>
          <small>{records.length.toLocaleString()} editable Realmz fixed-record entr{records.length === 1 ? "y" : "ies"}</small>
        </div>
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
      </header>
      <div className="domain-target-layout">
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
        <div className="domain-target-editor">
          {editorReady ? (
            <TargetRecordEditor project={project} catalog={catalog} opcode={opcode} targetId={selectedId} recordType={recordType} onApplyCommand={onApplyCommand} />
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

function nextTargetRecordId(project: Project, recordType: RealmzTargetRecordKind) {
  const used = new Set(targetRecords(project, recordType).map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + 1;
}

function targetRecordSummary(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  if (recordType === "message") return project.messages.find((record) => record.id === id)?.text.slice(0, 80) || "empty message";
  if (recordType === "battle") {
    const record = project.battles.find((candidate) => candidate.id === id);
    return record ? `${record.grid.filter(Boolean).length} monster slot(s), messages ${record.messageBefore}/${record.messageAfter}` : "missing battle";
  }
  if (recordType === "monster") {
    const record = project.monsters.find((candidate) => candidate.id === id);
    return record ? `${record.displayName || `Monster ${id}`}, HD ${record.hitDice}, icon ${record.iconId}` : "missing monster";
  }
  if (recordType === "treasure") {
    const record = project.treasures.find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold, ${record.exp} exp` : "missing treasure";
  }
  if (recordType === "shop") {
    const record = project.shops.find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation` : "missing shop";
  }
  if (recordType === "simpleEncounter") {
    const record = project.simpleEncounters.find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing simple encounter";
  }
  if (recordType === "complexEncounter") {
    const record = project.complexEncounters.find((candidate) => candidate.id === id);
    return record ? `${record.actions.length} action row(s), prompt ${record.prompt}` : "missing complex encounter";
  }
  if (recordType === "thiefEncounter") {
    const record = project.thiefEncounters.find((candidate) => candidate.id === id);
    return record ? `${record.typeFlags.filter(Boolean).length} enabled action(s), trap ${record.lowDamage}-${record.highDamage}, spell ${record.spell}` : "missing rogue encounter";
  }
  if (recordType === "timedEncounter") {
    const record = project.timedEncounters.find((candidate) => candidate.id === id);
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
  for (const entity of project.semanticSchema.entities) {
    if (entity.type !== "item" && entity.type !== "item-reference") continue;
    const id = itemIdFromEntityId(entity.id) ?? numericSummaryValue(entity.summary, ["itemId", "id", "recordIndex"]);
    if (id != null && isCatalogItemId(id)) ids.add(id);
  }
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
  for (const link of project.semanticSchema.links ?? []) {
    if (!link.to.startsWith("item:")) continue;
    const id = trailingNumber(link.to);
    if (id != null && isCatalogItemId(id)) ids.add(id);
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
  detail: SemanticEntity | LibraryEntity | { id: string; label: string; type: string; editState: string; confidence: string; summary: Record<string, unknown>; source?: string; recordRef?: string | null; byteRange?: unknown } | null;
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
  const summary = detail.summary ?? {};
  const canEditDraft = isDraftEntity(detail.id) && onUpdateDraft;
  const sourceLabel = source ? catalog?.sources.find((candidate) => candidate.id === source)?.relativePath ?? source : "none";
  const contentFacts = getContentFacts(detail);
  return (
    <aside className="domain-detail-panel">
      <header>
        <span>{ENTITY_TYPE_LABELS[detail.type] ?? detail.type}</span>
        <b>{detail.editState}</b>
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
            <code>{userFacingConfidence(detail.confidence)}</code>
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

function findLibraryAssetForDetail(detail: { id: string; label?: string; type: string; summary: Record<string, unknown>; source?: string } | null, catalog: LibraryCatalog | null) {
  if (!detail || !catalog) return null;
  const resourceType = typeof detail.summary.type === "string" ? detail.summary.type : null;
  const resourceId = typeof detail.summary.resourceId === "number" ? detail.summary.resourceId : null;
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
  entities: Array<SemanticEntity | LibraryEntity>;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const visible = entities.slice(0, 80);
  return (
    <ScrollArea className="domain-entity-list" aria-label="Domain entities">
      {visible.map((entity, index) => {
        const selected = selectedEntity?.id === entity.id;
        return (
          <button
            key={renderListKey("domain-entity", entity, index)}
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

function entitySubtitle(entity: SemanticEntity | LibraryEntity | { type: string; editState: string; summary: Record<string, unknown> }) {
  const summary = entity.summary ?? {};
  if (summary.draft) return `draft | ${entity.editState}`;
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
    return `entry ${summary.index}${bytes} | ${entity.editState}`;
  }
  if (summary.family) return `${summary.family} | ${entity.editState}`;
  return `${ENTITY_TYPE_LABELS[entity.type] ?? entity.type} | ${entity.editState}`;
}

function getContentFacts(detail: { type: string; editState: string; summary: Record<string, unknown> }) {
  const summary = detail.summary ?? {};
  const facts: Array<{ label: string; value: string }> = [
    { label: "Kind", value: ENTITY_TYPE_LABELS[detail.type] ?? detail.type },
    { label: "State", value: detail.editState }
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
