import { DragEvent, MouseEvent, ReactNode } from "react";
import type { LibraryCatalog } from "../../types";
import { ScrollArea, SearchField, SegmentedControl } from "../../ui";
import type { MonsterLibraryScopeFilter } from "./monsterLibraryFilters";
import "./monster-library-audit.css";

type MonsterLibraryEntry = LibraryCatalog["entities"][number];

type MonsterLibraryListProps = {
  entries: MonsterLibraryEntry[];
  query: string;
  scope: MonsterLibraryScopeFilter;
  scopeCounts: { all: number; builtIn: number; custom: number };
  selectedId: string | null;
  selectedIds: string[];
  selectionActive: boolean;
  populateMenuOpen: boolean;
  dropActive: boolean;
  hasCustomEntries: boolean;
  onQuery: (query: string) => void;
  onScopeChange: (scope: MonsterLibraryScopeFilter) => void;
  onTogglePopulateMenu: () => void;
  onPopulateStock: () => void;
  onPopulateVisible: () => void;
  onPopulateCustom: () => void;
  onSelect: (entry: MonsterLibraryEntry, event: MouseEvent<HTMLButtonElement>) => void;
  onDragStart: (entry: MonsterLibraryEntry, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  isCustom: (entry: MonsterLibraryEntry) => boolean;
  entryName: (entry: MonsterLibraryEntry) => string;
  entryFacts: (entry: MonsterLibraryEntry) => string;
  renderIcon: (entry: MonsterLibraryEntry) => ReactNode;
};

export function MonsterLibraryList({
  entries,
  query,
  scope,
  scopeCounts,
  selectedId,
  selectedIds,
  selectionActive,
  populateMenuOpen,
  dropActive,
  hasCustomEntries,
  onQuery,
  onScopeChange,
  onTogglePopulateMenu,
  onPopulateStock,
  onPopulateVisible,
  onPopulateCustom,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  isCustom,
  entryName,
  entryFacts,
  renderIcon
}: MonsterLibraryListProps) {
  return (
    <aside
      className={`combat-record-list scrapbook-list combined-scrapbook-list${dropActive ? " drop-active" : ""}`}
      aria-label="Monster Library entries"
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="monster-list-header">
        <div className="monster-list-heading-row">
          <strong className="combat-pane-title">Monster Library</strong>
          <div className="monster-list-actions">
            <button type="button" className="btn btn-primary btn-xs" onClick={onTogglePopulateMenu}>
              Populate Scenario...
            </button>
          </div>
        </div>
        {populateMenuOpen ? (
          <div className="monster-populate-menu" role="menu" aria-label="Populate scenario from monster library">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onPopulateStock}>
              Copy Stock Monsters
              <small>Fill missing built-in IDs.</small>
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onPopulateVisible} disabled={entries.length === 0}>
              Copy Visible Library
              <small>{entries.length} visible entr{entries.length === 1 ? "y" : "ies"}.</small>
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onPopulateCustom} disabled={!hasCustomEntries}>
              Copy Custom Library
              <small>Providence entries only.</small>
            </button>
          </div>
        ) : null}
      </header>
      <div className="monster-list-filter-stack">
        <SearchField value={query} onChange={onQuery} placeholder="Search monster library..."
          ariaLabel="Search monster library" resultCount={entries.length} resultNoun="monster" />
        <SegmentedControl
          className="monster-library-scope-filter"
          ariaLabel="Monster library ownership"
          value={scope}
          options={[
            { value: "all", label: "All", meta: scopeCounts.all },
            { value: "built-in", label: "Built-in", meta: scopeCounts.builtIn },
            { value: "custom", label: "Custom", meta: scopeCounts.custom }
          ]}
          onChange={onScopeChange}
        />
      </div>
      <ScrollArea shellClassName="combat-record-scroll-shell" className="combat-record-scroll" aria-label="Monster Library results">
        {entries.map((entry) => {
          const selectedForCopy = selectionActive && selectedIds.includes(entry.id);
          const selectedEntry = selectionActive && entry.id === selectedId;
          return (
            <button
              key={entry.id}
              type="button"
              draggable
              className={`${selectedEntry ? "selected" : ""}${selectedForCopy ? " multi-selected" : ""}`}
              aria-selected={selectedForCopy}
              onClick={(event) => onSelect(entry, event)}
              onDragStart={(event) => onDragStart(entry, event)}
              onDragEnd={onDragEnd}
            >
              {renderIcon(entry)}
              <span>
                <strong>{entryName(entry)}</strong>
                <small>{isCustom(entry) ? "Providence Custom Library" : "Protected Built-in Reference"} | {entryFacts(entry)}</small>
                {selectedForCopy && selectedIds.length > 1 ? <small className="monster-selected-badge">Selected for copy</small> : null}
              </span>
            </button>
          );
        })}
        {entries.length === 0 && <p className="empty-copy compact">No library monsters match that search.</p>}
      </ScrollArea>
    </aside>
  );
}
