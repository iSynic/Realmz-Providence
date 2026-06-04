import { CustomMapStamp, Project } from "../types";
import { normalizedEditorMetadata } from "./tilePaletteCommands";

type StampCreateCommand = {
  id?: string;
  name: string;
  width: number;
  height: number;
  cells?: CustomMapStamp["cells"];
};

export function createMapStamp(project: Project, command: StampCreateCommand) {
  const metadata = normalizedEditorMetadata(project);
  const now = new Date().toISOString();
  const name = normalizeStampName(command.name, metadata.mapStamps.length + 1);
  const width = normalizeDimension(command.width);
  const height = normalizeDimension(command.height);
  const stamp: CustomMapStamp = {
    id: uniqueStampId(metadata.mapStamps, command.id ?? stampIdFromName(name)),
    name,
    width,
    height,
    cells: normalizeCells(command.cells ?? [], width, height),
    createdAt: now,
    updatedAt: now
  };
  return { ...project, editorMetadata: { ...metadata, mapStamps: [...metadata.mapStamps, stamp] } };
}

export function renameMapStamp(project: Project, stampId: string, name: string) {
  const nextName = name.trim();
  if (!nextName) return project;
  return updateStamp(project, stampId, (stamp) => stamp.name === nextName ? stamp : { ...stamp, name: nextName });
}

export function deleteMapStamp(project: Project, stampId: string) {
  const metadata = normalizedEditorMetadata(project);
  const mapStamps = metadata.mapStamps.filter((stamp) => stamp.id !== stampId);
  return mapStamps.length === metadata.mapStamps.length ? project : { ...project, editorMetadata: { ...metadata, mapStamps } };
}

export function duplicateMapStamp(project: Project, stampId: string, id?: string, name?: string) {
  const metadata = normalizedEditorMetadata(project);
  const original = metadata.mapStamps.find((stamp) => stamp.id === stampId);
  if (!original) return project;
  const now = new Date().toISOString();
  const nextName = normalizeStampName(name ?? `Copy of ${original.name}`, metadata.mapStamps.length + 1);
  const duplicate: CustomMapStamp = {
    ...original,
    id: uniqueStampId(metadata.mapStamps, id ?? stampIdFromName(nextName)),
    name: nextName,
    cells: original.cells.map((cell) => ({ ...cell })),
    createdAt: now,
    updatedAt: now
  };
  return { ...project, editorMetadata: { ...metadata, mapStamps: [...metadata.mapStamps, duplicate] } };
}

export function updateMapStamp(project: Project, stampId: string, changes: Partial<Pick<CustomMapStamp, "name" | "width" | "height" | "cells">>) {
  return updateStamp(project, stampId, (stamp) => {
    const width = changes.width == null ? stamp.width : normalizeDimension(changes.width);
    const height = changes.height == null ? stamp.height : normalizeDimension(changes.height);
    const name = changes.name == null ? stamp.name : normalizeStampName(changes.name, 1);
    const cells = normalizeCells(changes.cells ?? stamp.cells, width, height);
    return { ...stamp, name, width, height, cells };
  });
}

function updateStamp(project: Project, stampId: string, update: (stamp: CustomMapStamp) => CustomMapStamp) {
  const metadata = normalizedEditorMetadata(project);
  let changed = false;
  const mapStamps = metadata.mapStamps.map((stamp) => {
    if (stamp.id !== stampId) return stamp;
    const next = update(stamp);
    if (stampsEqual(stamp, next)) return stamp;
    changed = true;
    return { ...next, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...project, editorMetadata: { ...metadata, mapStamps } } : project;
}

function normalizeCells(cells: CustomMapStamp["cells"], width: number, height: number) {
  const out: CustomMapStamp["cells"] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const x = normalizeInt(cell.x);
    const y = normalizeInt(cell.y);
    const tile = normalizeInt(cell.tile);
    if (x == null || y == null || tile == null || x < 0 || y < 0 || x >= width || y >= height) continue;
    const key = `${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, tile });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeInt(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(32, Math.trunc(value)));
}

function normalizeStampName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Stamp ${index}`;
}

function stampIdFromName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `map-stamp:${slug || "stamp"}`;
}

function uniqueStampId(stamps: CustomMapStamp[], preferred: string) {
  const used = new Set(stamps.map((stamp) => stamp.id));
  const base = preferred.trim() || "map-stamp:stamp";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function stampsEqual(a: CustomMapStamp, b: CustomMapStamp) {
  return a.id === b.id &&
    a.name === b.name &&
    a.width === b.width &&
    a.height === b.height &&
    a.cells.length === b.cells.length &&
    a.cells.every((cell, index) => {
      const other = b.cells[index];
      return cell.x === other.x && cell.y === other.y && cell.tile === other.tile;
    });
}
