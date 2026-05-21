type RenderKeySource = {
  id?: string | number;
  label?: string;
  type?: string;
  source?: string | null;
  relativePath?: string | null;
  recordRef?: string | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  summary?: Record<string, unknown>;
};

export function renderListKey(scope: string, item: RenderKeySource, index: number) {
  const summary = item.summary ?? {};
  return [
    scope,
    item.id,
    item.source,
    item.relativePath,
    item.recordRef,
    item.type,
    item.resourceType,
    item.resourceId,
    primitiveSummaryValue(summary.type),
    primitiveSummaryValue(summary.resourceId),
    primitiveSummaryValue(summary.index),
    primitiveSummaryValue(summary.family),
    item.label,
    index
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .join(":");
}

function primitiveSummaryValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}
