import { ENTITY_TYPE_LABELS } from "../constants";
import { isDraftEntity, LibraryDraftSpec } from "../libraryDrafts";
import { EditorTab, LibraryCatalog, LibraryEntity, Project, SemanticEntity, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";

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
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onCreateDraft,
  onUpdateDraft
}: {
  tab: EditorTab;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onCreateDraft?: (spec: LibraryDraftSpec) => void;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
}) {
  const config = DOMAIN_CONFIG[tab];
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
  return (
    <section className="domain-workbench">
      <header className="domain-header">
        <div>
          <h1>{config.title}</h1>
          <p>{config.subtitle}</p>
        </div>
        <small>{project ? project.scenario.name : "Library workbench"}</small>
      </header>
      <div className="domain-main-layout">
        <div className="domain-main-column">
      {tab === "records" && (
        <div className="domain-editor-grid">
          <article className="domain-editor-card">
            <header>
              <span>Decoded Records</span>
              <b>{records.length.toLocaleString()}</b>
            </header>
            <div className="domain-entity-list">
              {records.slice(0, 240).map((record) => (
                <button key={record.id} type="button" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
                  <strong>{record.label}</strong>
                  <small>{record.type} | {record.editState}</small>
                </button>
              ))}
            </div>
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
            <div className="domain-entity-list">
              {catalog?.diagnostics.slice(0, 240).map((diagnostic) => (
                <button key={diagnostic.id} type="button">
                  <strong>{diagnostic.message}</strong>
                  <small>{diagnostic.severity} | {diagnostic.type}</small>
                </button>
              ))}
            </div>
            {!catalog?.diagnostics.length && <p>No library diagnostics.</p>}
          </article>
        </div>
      )}
      <div className="domain-editor-grid">
        {tab !== "records" && tab !== "linter" && config.editors.map((editor) => {
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

function matchingEntities(editor: DomainEditor, projectEntities: SemanticEntity[], libraryEntities: LibraryEntity[]) {
  const wanted = new Set(editor.entityTypes);
  const projectMatches = projectEntities.filter((entity) => wanted.has(entity.type));
  const libraryMatches = libraryEntities.filter((entity) => wanted.has(entity.type));
  return [...projectMatches, ...libraryMatches];
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
  if (!detail) {
    return (
      <aside className="domain-detail-panel">
        <header>
          <span>Selection</span>
        </header>
        <p>Select an entry or create a new draft to inspect its content, decoded fields, and export state.</p>
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
          <span>Confidence</span>
          <code>{detail.confidence}</code>
        </div>
      </section>
    </aside>
  );
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
    <div className="domain-entity-list">
      {entities.map((entity) => {
        const selected = selectedEntity?.id === entity.id;
        return (
          <button
            key={entity.id}
            className={selected ? "selected" : ""}
            type="button"
            onClick={() => onSelectEntity(selectEntityFromId(entity.id))}
          >
            <strong>{entity.label}</strong>
            <small>{entitySubtitle(entity)}</small>
          </button>
        );
      })}
    </div>
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
