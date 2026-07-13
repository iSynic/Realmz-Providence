import type { ItemReferenceOption } from "../../itemReferences";
import type { Project } from "../../types";

export type EconomyTargetRecordKind = "treasure" | "shop";

export function economyTargetRecords(project: Project, recordType: EconomyTargetRecordKind): Array<{ id: number }> {
  const records = recordType === "treasure" ? project.treasures : project.shops;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

export function includeSelectedEconomyRecord<T extends { id: number }>(records: T[], selectedId: number, limit: number) {
  const visible = records.slice(0, limit);
  if (visible.some((record) => record.id === selectedId)) return visible;
  const selected = records.find((record) => record.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}

export function economyTargetIdFromSelection(entityId: string, recordType: EconomyTargetRecordKind) {
  const prefix = `${recordType}:`;
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

export function nextEconomyTargetRecordId(project: Project, recordType: EconomyTargetRecordKind) {
  const records = economyTargetRecords(project, recordType);
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id <= 9999; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.max(0, ...records.map((record) => record.id)) + 1;
}

export function economyTargetRecordSummary(project: Project, recordType: EconomyTargetRecordKind, id: number) {
  if (recordType === "treasure") {
    const record = (project.treasures ?? []).find((candidate) => candidate.id === id);
    return record ? `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold, ${record.exp} exp` : "missing treasure";
  }
  const record = (project.shops ?? []).find((candidate) => candidate.id === id);
  return record ? `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation` : "missing shop";
}

export function itemOptionName(option: ItemReferenceOption) {
  return option.label.replace(/\s+\(-?\d+\)$/, "");
}
