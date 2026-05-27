import { useEffect, useMemo, useState } from "react";
import { ENTITY_TYPE_LABELS } from "../constants";
import { loadBrowserBundledLibraryAssetPreview } from "../browser/library";
import { isDraftEntity, LibraryDraftSpec } from "../libraryDrafts";
import { EditorTab, LibraryAsset, LibraryCatalog, LibraryEntity, ManagedAssetKind, Project, ProjectCommand, RealmzTargetRecordKind, SemanticEntity, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { TargetRecordEditor } from "./ScriptsPanel";

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
    title: "Scripts",
    subtitle: "Action Points, GOSUBs, macros, global macros, and quests.",
    editors: [
      { id: "action-points", label: "Action Points / GOSUBs", entityTypes: ["trigger", "action-slot"] },
      { id: "macros", label: "Macros", entityTypes: ["macro"], createType: "macro" },
      { id: "ed3-evidence", label: "Imported ED3 Rows", entityTypes: ["ed3-action-record"] },
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
  const focusedEditor = config.editors.find((editor) => editor.id === activeEditor) ?? null;
  const visibleEditors = focusedEditor ? [focusedEditor] : config.editors;
  const projectEntities = project?.semanticSchema.entities ?? [];
  const libraryEntities = catalog?.entities ?? [];
  const allRecords = [
    ...(project?.semanticSchema.records ?? []),
    ...(catalog?.records ?? [])
  ];
  const records = [
    ...(project?.semanticSchema.records.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? []),
    ...(catalog?.records.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? [])
  ];
  const selectedDetail =
    projectEntities.find((entity) => entity.id === selectedEntity?.id) ??
    libraryEntities.find((entity) => entity.id === selectedEntity?.id) ??
    allRecords.find((record) => record.id === selectedEntity?.id) ??
    null;
  const targetRecordTypes = project ? targetRecordTypesForEditor(tab, activeEditor) : [];
  const focusedTargetEditor = targetRecordTypes.length > 0 && activeEditor !== "domain";
  const selectedTargetRecordType = selectedTargetRecordTypeFromEntity(selectedEntity?.id ?? "", targetRecordTypes);
  const [overviewTargetRecordType, setOverviewTargetRecordType] = useState<RealmzTargetRecordKind | null>(() => readStoredOverviewTargetRecordType(tab));
  useEffect(() => {
    if (targetRecordTypes.length === 0) return;
    setOverviewTargetRecordType((current) => {
      const stored = readStoredOverviewTargetRecordType(tab);
      const next =
        selectedTargetRecordType ??
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
  return (
    <section className="domain-workbench">
      <header className="domain-header">
        <div>
          <h1>{focusedEditor ? focusedEditor.label : config.title}</h1>
          <p>{focusedEditor ? editorSubtitle(focusedEditor) : config.subtitle}</p>
        </div>
        <small>{project ? project.scenario.name : "Library workbench"}</small>
      </header>
      <div className="domain-main-layout">
        <div className="domain-main-column">
      {project && targetRecordTypes.length > 0 && (
        <div className="domain-target-stack">
          {!focusedTargetEditor && targetRecordTypes.length > 1 && (
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
        {tab !== "records" && tab !== "linter" && !focusedTargetEditor && visibleEditors.map((editor) => {
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
        <DomainDetailPanel detail={selectedDetail} catalog={catalog} onUpdateDraft={onUpdateDraft} />
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
  const selectedId = targetIdFromSelection(selectedEntity?.id ?? "", recordType) ?? records[0]?.id ?? 1;
  const opcode = opcodeForTargetRecord(recordType);
  const nextId = nextTargetRecordId(project, recordType);
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
          {records.map((record) => (
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
          {records.length === 0 && <p>No {targetRecordLabel(recordType).toLowerCase()} records yet.</p>}
        </ScrollArea>
        <div className="domain-target-editor">
          <TargetRecordEditor project={project} catalog={catalog} opcode={opcode} targetId={selectedId} onApplyCommand={onApplyCommand} />
        </div>
      </div>
    </article>
  );
}

function targetRecordTypesForEditor(tab: EditorTab, activeEditor: string): RealmzTargetRecordKind[] {
  if (tab === "text" && (activeEditor === "domain" || activeEditor === "messages")) return ["message"];
  if (tab === "combat" && (activeEditor === "domain" || activeEditor === "battles")) return ["battle"];
  if (tab === "economy" && activeEditor === "domain") return ["treasure", "shop"];
  if (tab === "economy" && activeEditor === "treasure") return ["treasure"];
  if (tab === "economy" && activeEditor === "shops") return ["shop"];
  if (tab === "encounters" && activeEditor === "domain") return ["simpleEncounter", "complexEncounter"];
  if (tab === "encounters" && activeEditor === "simple") return ["simpleEncounter"];
  if (tab === "encounters" && activeEditor === "complex") return ["complexEncounter"];
  return [];
}

function targetRecords(project: Project, recordType: RealmzTargetRecordKind): Array<{ id: number }> {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    project.questLabels;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

function targetIdFromSelection(entityId: string, recordType: RealmzTargetRecordKind) {
  const prefix = targetEntityPrefix(recordType);
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
  if (recordType === "questLabel") return "quest:";
  return `${recordType}:`;
}

function opcodeForTargetRecord(recordType: RealmzTargetRecordKind) {
  if (recordType === "message") return 1;
  if (recordType === "battle") return 2;
  if (recordType === "treasure") return 10;
  if (recordType === "shop") return 6;
  if (recordType === "simpleEncounter") return 4;
  if (recordType === "complexEncounter") return 5;
  return 47;
}

function targetRecordLabel(recordType: RealmzTargetRecordKind) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "Message",
    battle: "Battle",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
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
  return (
    <ScrollArea className="domain-entity-list" aria-label="Domain entities">
      {entities.map((entity, index) => {
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
