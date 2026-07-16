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
