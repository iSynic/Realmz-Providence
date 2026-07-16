import { Image, PackageOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { LibraryCatalog, LibraryEntity, SelectedEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { EntityRow, IncrementalListFooter, ScrollArea, SearchField, useIncrementalListLimit } from "../../ui";
import { DomainDetailPanel, entitySubtitle } from "../suite/DomainDetailPanel";

const REFERENCE_LIBRARY_PAGE_SIZE = 120;

export type EconomyReferenceLibraryKind = "bag" | "vault";

const LIBRARY_CONFIG: Record<EconomyReferenceLibraryKind, {
  title: string;
  description: string;
  entityType: "bag-item" | "vault-icon";
  noun: string;
  nounPlural: string;
}> = {
  bag: {
    title: "Bag of Holding",
    description: "Protected item reference material. Use Items when a scenario needs an editable custom item.",
    entityType: "bag-item",
    noun: "Bag entry",
    nounPlural: "Bag entries"
  },
  vault: {
    title: "Vault of Arcana",
    description: "Protected item-icon reference material. Scenario ownership and export are handled through custom items and their selected icon art.",
    entityType: "vault-icon",
    noun: "Vault icon",
    nounPlural: "Vault icons"
  }
};

export function EconomyReferenceLibrary({
  kind,
  catalog,
  selectedEntity,
  onSelectEntity
}: {
  kind: EconomyReferenceLibraryKind;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const config = LIBRARY_CONFIG[kind];
  const [query, setQuery] = useState("");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const entries = useMemo(
    () => filterEconomyReferenceEntries(catalog?.entities ?? [], config.entityType, query),
    [catalog?.entities, config.entityType, query]
  );
  const [visibleLimit, showMore] = useIncrementalListLimit(
    REFERENCE_LIBRARY_PAGE_SIZE,
    `${kind}:${query.trim().toLowerCase()}`
  );
  const visibleEntries = entries.slice(0, visibleLimit);
  const selectedId =
    (selectedEntity && entries.some((entry) => entry.id === selectedEntity.id) ? selectedEntity.id : null) ??
    (localSelectedId && entries.some((entry) => entry.id === localSelectedId) ? localSelectedId : null) ??
    entries[0]?.id ??
    null;
  const selectedDetail = entries.find((entry) => entry.id === selectedId) ?? null;

  const selectEntry = (entry: LibraryEntity) => {
    setLocalSelectedId(entry.id);
    onSelectEntity(selectEntityFromId(entry.id));
  };

  return (
    <article className="item-workbench economy-reference-library">
      <header className="item-workbench-header">
        <div>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
        </div>
        <strong>{entries.length.toLocaleString()} {entries.length === 1 ? config.noun.toLowerCase() : config.nounPlural.toLowerCase()}</strong>
      </header>
      <div className="item-workbench-layout">
        <aside className="item-browser-panel">
          <SearchField
            className="item-search"
            value={query}
            onChange={setQuery}
            placeholder={`Search ${config.title}...`}
            ariaLabel={`Search ${config.title}`}
            resultCount={entries.length}
            resultNoun={config.noun}
            resultNounPlural={config.nounPlural}
          />
          <ScrollArea className="economy-reference-library-list" aria-label={`${config.title} entries`}>
            {visibleEntries.map((entry) => (
              <EntityRow
                key={entry.id}
                icon={kind === "vault" ? <Image size={16} /> : <PackageOpen size={16} />}
                title={entry.label}
                subtitle={entitySubtitle(entry)}
                selected={entry.id === selectedId}
                onSelect={() => selectEntry(entry)}
              />
            ))}
            {entries.length === 0 && (
              <p className="empty-copy compact">No {config.nounPlural.toLowerCase()} match that search.</p>
            )}
            <IncrementalListFooter
              visibleCount={visibleEntries.length}
              totalCount={entries.length}
              step={REFERENCE_LIBRARY_PAGE_SIZE}
              noun={config.noun.toLowerCase()}
              nounPlural={config.nounPlural.toLowerCase()}
              onShowMore={showMore}
            />
          </ScrollArea>
        </aside>
        <DomainDetailPanel detail={selectedDetail} catalog={catalog} />
      </div>
    </article>
  );
}

export function filterEconomyReferenceEntries(
  entities: LibraryEntity[],
  entityType: "bag-item" | "vault-icon",
  query: string
) {
  const normalized = query.trim().toLowerCase();
  return entities.filter((entry) => {
    if (entry.type !== entityType) return false;
    if (!normalized) return true;
    const summary = typeof entry.summary === "object" ? JSON.stringify(entry.summary) : String(entry.summary);
    return `${entry.label} ${entry.source} ${summary}`.toLowerCase().includes(normalized);
  });
}
