import { DragEvent, MouseEvent, ReactNode } from "react";
import type { LibraryCatalog } from "../../types";

type MonsterLibraryEntry = LibraryCatalog["entities"][number];

type MonsterLibraryListProps = {
  entries: MonsterLibraryEntry[];
  query: string;
  selectedId: string | null;
  selectedIds: string[];
  selectionActive: boolean;
  populateMenuOpen: boolean;
  dropActive: boolean;
  hasCustomEntries: boolean;
  onQuery: (query: string) => void;
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
  selectedId,
  selectedIds,
  selectionActive,
  populateMenuOpen,
  dropActive,
  hasCustomEntries,
  onQuery,
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
      <input value={query} onChange={(event) => onQuery(event.currentTarget.value)} placeholder="Search monster library..." />
      <div className="combat-record-scroll">
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
                <small>{isCustom(entry) ? "Providence library" : "Built-in"} | {entryFacts(entry)}</small>
                {selectedForCopy && selectedIds.length > 1 ? <small className="monster-selected-badge">Selected for copy</small> : null}
              </span>
            </button>
          );
        })}
        {entries.length === 0 && <p className="empty-copy compact">No library monsters match that search.</p>}
      </div>
    </aside>
  );
}
