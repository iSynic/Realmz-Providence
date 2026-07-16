import { useMemo, useState } from "react";
import type { LibraryCatalog } from "../../types";
import { isProvidenceMonsterLibraryEntry } from "../../monsterLibrary";
import { scrapbookSearchText } from "./monsterLibraryWorkflow";

type MonsterLibraryEntry = LibraryCatalog["entities"][number];

export type MonsterLibraryScopeFilter = "all" | "built-in" | "custom";

export function filterMonsterLibraryEntries(entries: MonsterLibraryEntry[], query: string, scope: MonsterLibraryScopeFilter) {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const custom = isProvidenceMonsterLibraryEntry(entry);
    if (scope === "built-in" && custom) return false;
    if (scope === "custom" && !custom) return false;
    return !needle || scrapbookSearchText(entry).toLowerCase().includes(needle);
  });
}

export function monsterLibraryScopeCounts(entries: MonsterLibraryEntry[]) {
  const custom = entries.filter(isProvidenceMonsterLibraryEntry).length;
  return { all: entries.length, builtIn: entries.length - custom, custom };
}

export function useMonsterLibraryFilter(entries: MonsterLibraryEntry[], query: string) {
  const [libraryScope, setLibraryScope] = useState<MonsterLibraryScopeFilter>("all");
  const filteredLibrary = useMemo(
    () => filterMonsterLibraryEntries(entries, query, libraryScope),
    [entries, libraryScope, query]
  );
  const libraryScopeCounts = useMemo(() => monsterLibraryScopeCounts(entries), [entries]);
  return { libraryScope, setLibraryScope, filteredLibrary, libraryScopeCounts };
}
