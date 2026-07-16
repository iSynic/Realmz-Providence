import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";
import {
  buildGlobalSearchIndex,
  GlobalSearchResult,
  GlobalSearchScope,
  searchGlobalIndex
} from "../globalSearch";
import { LibraryCatalog, ManagedAsset, Project } from "../types";
import { ModalDialog, SearchField } from "../ui";

const scopeLabels: Record<GlobalSearchScope, string> = {
  scenario: "Scenario",
  assets: "Assets",
  libraries: "Libraries",
  docs: "Docs",
  diagnostics: "Diagnostics"
};
const scopeOrder: GlobalSearchScope[] = ["scenario", "assets", "libraries", "docs", "diagnostics"];
const initialGroupLimit = 8;
const GLOBAL_SEARCH_RESULTS_ID = "global-search-results";
const GLOBAL_SEARCH_HELP =
  "Global Search indexes the current scenario, scenario assets, bundled libraries, documentation, validation, and diagnostics. It is the fastest way to jump to a record, resource, topic, or warning.";
const SEARCH_SCOPES_HELP =
  "Scopes narrow the result set without changing the project. Scenario is editable project data, Assets includes project and reference media, Libraries are bundled reference entries, Docs are handbook topics, and Diagnostics are linter/export clues.";
const SEARCH_RESULTS_HELP =
  "Results are grouped by scope and scored by exact ID, title, aliases, snippets, and numeric shortcuts. Opening a result navigates to its workbench or Documents topic.";
const SEARCH_SHORTCUTS_HELP =
  "Shortcut searches support record/resource phrases such as string 349, macro 143, ap 4, monster 12, item 900, pict 304, sound 208, icon 139, map 0, or a bare numeric ID.";

export function GlobalSearchDialog({
  project,
  catalog,
  customAssets = [],
  onClose,
  onOpenResult
}: {
  project: Project | null;
  catalog: LibraryCatalog | null;
  customAssets?: ManagedAsset[];
  onClose: () => void;
  onOpenResult: (result: GlobalSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<GlobalSearchScope>>(() => new Set(scopeOrder));
  const [expandedScopes, setExpandedScopes] = useState<Set<GlobalSearchScope>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const index = useMemo(() => buildGlobalSearchIndex(project, catalog, customAssets), [catalog, customAssets, project]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDeferredQuery(query), exactShortcutCandidate(query) ? 0 : 120);
    return () => window.clearTimeout(handle);
  }, [query]);

  const results = useMemo(
    () => searchGlobalIndex(index, deferredQuery, { scopes: [...selectedScopes] }),
    [deferredQuery, index, selectedScopes]
  );
  const groups = useMemo(() => groupedResults(results), [results]);
  const visibleResults = useMemo(() => {
    return scopeOrder.flatMap((scope) => {
      const rows = groups.get(scope) ?? [];
      return expandedScopes.has(scope) ? rows : rows.slice(0, initialGroupLimit);
    });
  }, [expandedScopes, groups]);
  const searchPending = query !== deferredQuery;
  const searchStatus = globalSearchStatus(deferredQuery, results.length, searchPending);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, selectedScopes]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, visibleResults.length - 1)));
  }, [visibleResults.length]);

  useEffect(() => {
    const activeResult = visibleResults[activeIndex];
    if (!activeResult) return;
    resultsRef.current?.ownerDocument
      .getElementById(globalSearchOptionId(activeResult.id))
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visibleResults]);

  function toggleScope(scope: GlobalSearchScope) {
    setSelectedScopes((current) => {
      const next = new Set(current);
      if (next.has(scope) && next.size > 1) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  function openResult(result: GlobalSearchResult) {
    onOpenResult(result);
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const action = globalSearchKeyboardAction(activeIndex, visibleResults.length, event.key);
    if (!action) return;
    event.preventDefault();
    if (action.kind === "open") openResult(visibleResults[action.index]);
    else setActiveIndex(action.index);
  }

  return (
    <ModalDialog
      backdropClassName="global-search-backdrop"
      className="global-search-dialog"
      ariaLabel="Global search"
      onDismiss={onClose}
    >
        <header className="global-search-header">
          <TutorialTip title="Global Search" body={GLOBAL_SEARCH_HELP} side="below" focusable={false}>
            <SearchField
              className="global-search-input"
              value={query}
              onChange={setQuery}
              placeholder="Search scenario, libraries, assets, docs..."
              ariaLabel="Search Providence"
              modalInitialFocus
              onKeyDown={handleKeyDown}
              combobox={{
                controls: GLOBAL_SEARCH_RESULTS_ID,
                expanded: Boolean(deferredQuery.trim()),
                activeDescendant: visibleResults[activeIndex]
                  ? globalSearchOptionId(visibleResults[activeIndex].id)
                  : undefined
              }}
            />
          </TutorialTip>
          <button type="button" className="global-search-close" onClick={onClose} aria-label="Close search">
            <X size={16} />
          </button>
        </header>

        <div className="global-search-scopes" role="group" aria-label="Search scopes">
          <TutorialTip title="Search Scopes" body={SEARCH_SCOPES_HELP} side="below">
            <span className="global-search-scope-label">Scopes</span>
          </TutorialTip>
          {scopeOrder.map((scope) => (
            <button
              key={scope}
              type="button"
              className={selectedScopes.has(scope) ? "active" : ""}
              aria-pressed={selectedScopes.has(scope)}
              onClick={() => toggleScope(scope)}
            >
              {scopeLabels[scope]}
            </button>
          ))}
        </div>

        <div
          ref={resultsRef}
          id={GLOBAL_SEARCH_RESULTS_ID}
          className="global-search-results"
          role="listbox"
          aria-label="Search results"
          aria-busy={searchPending}
        >
          {!deferredQuery.trim() && (
            <div className="global-search-empty">
              <TutorialTip title="Shortcut Searches" body={SEARCH_SHORTCUTS_HELP} side="below">
                <strong>Search everything Providence knows about right now.</strong>
              </TutorialTip>
              <span>Try `registration`, `string 349`, `macro 143`, `sound 208`, `pict 304`, an item name, a monster, or a map.</span>
            </div>
          )}
          {deferredQuery.trim() && results.length === 0 && (
            <div className="global-search-empty">
              <strong>No matches found.</strong>
              <span>Try a shorter phrase, a record type plus ID, or enable more search scopes.</span>
            </div>
          )}
          {scopeOrder.map((scope) => {
            const rows = groups.get(scope) ?? [];
            if (rows.length === 0) return null;
            const expanded = expandedScopes.has(scope);
            const visible = expanded ? rows : rows.slice(0, initialGroupLimit);
            return (
              <section key={scope} className="global-search-group" role="group" aria-label={`${scopeLabels[scope]} results`}>
                <header>
                  <TutorialTip title={`${scopeLabels[scope]} Results`} body={SEARCH_RESULTS_HELP} side="below">
                    <span>{scopeLabels[scope]}</span>
                  </TutorialTip>
                  <b>{rows.length.toLocaleString()}</b>
                </header>
                {visible.map((result) => {
                  const visibleIndex = visibleResults.findIndex((candidate) => candidate.id === result.id);
                  return (
                    <button
                      key={result.id}
                      id={globalSearchOptionId(result.id)}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={visibleIndex === activeIndex}
                      aria-posinset={visibleIndex + 1}
                      aria-setsize={visibleResults.length}
                      className={visibleIndex === activeIndex ? "active" : ""}
                      onMouseEnter={() => setActiveIndex(visibleIndex)}
                      onClick={() => openResult(result)}
                    >
                      {result.preview && <img src={result.preview} alt="" />}
                      <span>
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                        {result.snippet && <em>{result.snippet}</em>}
                      </span>
                      <i>
                        {result.badges.slice(0, 3).map((badge) => (
                          <b key={badge}>{badge}</b>
                        ))}
                      </i>
                    </button>
                  );
                })}
                {rows.length > initialGroupLimit && (
                  <button
                    type="button"
                    className="global-search-more"
                    onClick={() => setExpandedScopes((current) => {
                      const next = new Set(current);
                      if (next.has(scope)) next.delete(scope);
                      else next.add(scope);
                      return next;
                    })}
                  >
                    {expanded ? "Show fewer" : `Show ${rows.length - initialGroupLimit} more`}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        <footer className="global-search-footer">
          <TutorialTip title="Search Keyboard Flow" body={SEARCH_SHORTCUTS_HELP} side="above">
            <span>Enter opens</span>
          </TutorialTip>
          <span>Esc closes</span>
          <span>Ctrl+K toggles</span>
          <span className="global-search-status" aria-live="polite">{searchStatus}</span>
        </footer>
    </ModalDialog>
  );
}

function groupedResults(results: GlobalSearchResult[]) {
  const groups = new Map<GlobalSearchScope, GlobalSearchResult[]>();
  for (const result of results) {
    const rows = groups.get(result.scope);
    if (rows) rows.push(result);
    else groups.set(result.scope, [result]);
  }
  return groups;
}

function exactShortcutCandidate(query: string) {
  return /^(\D+\s+)?-?\d+$/.test(query.trim());
}

export function globalSearchOptionId(resultId: string) {
  return `global-search-option-${encodeURIComponent(resultId)}`;
}

export function globalSearchStatus(query: string, resultCount: number, pending: boolean) {
  if (pending) return "Searching...";
  if (!query.trim()) return "Type to search";
  return `${resultCount.toLocaleString()} ${resultCount === 1 ? "match" : "matches"}`;
}

export function globalSearchKeyboardAction(activeIndex: number, resultCount: number, key: string) {
  if (resultCount <= 0) return null;
  if (key === "ArrowDown") return { kind: "move" as const, index: Math.min(activeIndex + 1, resultCount - 1) };
  if (key === "ArrowUp") return { kind: "move" as const, index: Math.max(0, activeIndex - 1) };
  if (key === "Home") return { kind: "move" as const, index: 0 };
  if (key === "End") return { kind: "move" as const, index: resultCount - 1 };
  if (key === "Enter" && activeIndex >= 0 && activeIndex < resultCount) return { kind: "open" as const, index: activeIndex };
  return null;
}
