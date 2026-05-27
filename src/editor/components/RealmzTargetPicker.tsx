import { useMemo, useState } from "react";
import { LibraryCatalog, Project, RealmzTargetRecordKind, SelectedEntity, SemanticEntity } from "../types";
import { isCallableMacro, schemaEntities } from "../semanticGraph";
import { selectEntityFromId } from "../utils";
import { actionOptionFor, normalizeStepOpcode } from "../realmzActions";

export type ScriptTargetOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  summary?: string;
  compatibility?: string;
  sourceState?: string;
  entity?: SelectedEntity;
};

const targetOptionsCache = new WeakMap<Project, Map<string, ScriptTargetOption[]>>();
const catalogIds = new WeakMap<LibraryCatalog, number>();
let nextCatalogId = 1;

export function TargetPicker({
  project,
  catalog,
  opcode,
  value,
  onChange,
  onInspect,
  onCreate
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  opcode: number;
  value: number;
  onChange: (id: number) => void;
  onInspect: (entity: SelectedEntity) => void;
  onCreate?: (recordType: RealmzTargetRecordKind, id?: number) => void;
}) {
  const config = targetPickerConfig(opcode);
  const targets = useMemo(() => targetOptionsForOpcode(project, opcode, catalog), [project, opcode, catalog]);
  const [query, setQuery] = useState("");
  if (!config) return null;
  const filteredTargets = filterTargetOptions(targets, query);
  const selected = targets.find((target) => target.value === value) ?? null;
  const hasCurrentValue = Number.isFinite(value) && value !== 0 && !selected;
  const canCreateTarget = Boolean(config.recordType && onCreate && (!selected || hasCurrentValue || value === 0));
  const detail = selected ? [selected.detail, selected.summary, selected.compatibility, selected.sourceState].filter(Boolean).join(" | ") : config.hint;
  return (
    <div className="realmz-target-picker">
      <label>
        <span>{config.label}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${config.label.toLowerCase()}...`}
          aria-label={`Search ${config.label}`}
        />
        <select
          value={hasCurrentValue ? `raw:${value}` : selected ? String(selected.value) : ""}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            if (!raw || raw.startsWith("raw:")) return;
            onChange(Number(raw));
          }}
        >
          <option value="">Choose {config.label.toLowerCase()}</option>
          {hasCurrentValue && <option value={`raw:${value}`}>Current raw ID {value}</option>}
          {filteredTargets.map((target) => (
            <option key={target.key} value={target.value}>
              {target.label}
            </option>
          ))}
        </select>
      </label>
      <small>{detail}</small>
      {selected?.entity && (
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => onInspect(selected.entity!)}>
          Inspect Target
        </button>
      )}
      {canCreateTarget && (
        <button
          className="btn btn-secondary btn-xs"
          type="button"
          onClick={() => onCreate?.(config.recordType!, hasCurrentValue ? value : undefined)}
        >
          {createTargetButtonLabel(config.recordType!, hasCurrentValue ? value : undefined)}
        </button>
      )}
      {targets.length === 0 && <span className="target-picker-empty">No authorable targets are available yet.</span>}
      {targets.length > 0 && filteredTargets.length === 0 && <span className="target-picker-empty">No targets match this search.</span>}
    </div>
  );
}

export function targetPickerConfig(opcode: number) {
  const code = normalizeStepOpcode(opcode);
  if (actionOptionFor(code).edcdShape) return null;
  const configs: Record<number, { label: string; hint: string; recordType?: RealmzTargetRecordKind }> = {
    1: { label: "Message Target", hint: "Select the scenario message this action displays.", recordType: "message" },
    4: { label: "Simple Encounter", hint: "Select a simple encounter record.", recordType: "simpleEncounter" },
    5: { label: "Complex Encounter", hint: "Select a complex encounter record.", recordType: "complexEncounter" },
    6: { label: "Shop Target", hint: "Select a shop record.", recordType: "shop" },
    8: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    9: { label: "Sound Resource", hint: "Select a playable sound resource or managed sound asset." },
    10: { label: "Treasure Target", hint: "Select a treasure record.", recordType: "treasure" },
    19: { label: "Message Target", hint: "Select the scenario message this action displays.", recordType: "message" },
    27: { label: "Picture Resource", hint: "Select a picture resource or managed picture asset." },
    29: { label: "Map Reference", hint: "Select a map or map record." },
    35: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates.", recordType: "simpleEncounter" },
    40: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    44: { label: "Complex Encounter", hint: "Select the complex encounter this action mutates.", recordType: "complexEncounter" },
    47: { label: "Quest Flag", hint: "Select a quest flag to write.", recordType: "questLabel" },
    49: { label: "Shop Target", hint: "Select a shop record.", recordType: "shop" },
    51: { label: "Shop Target", hint: "Select a shop record.", recordType: "shop" },
    55: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    62: { label: "Message Target", hint: "Select the scenario message this action displays.", recordType: "message" },
    64: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    71: { label: "Message Target", hint: "Select the scenario message this action displays.", recordType: "message" },
    97: { label: "Map Record", hint: "Select a map record." },
    104: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates.", recordType: "simpleEncounter" },
    106: { label: "Map Record", hint: "Select the map record this action mutates." },
    127: { label: "Monster Target", hint: "Select a monster record." }
  };
  return configs[code] ?? null;
}

export function targetOptionsForOpcode(project: Project | null, opcode: number, catalog?: LibraryCatalog | null): ScriptTargetOption[] {
  if (!project) return [];
  const code = normalizeStepOpcode(opcode);
  const cacheKey = `${catalogCacheKey(catalog)}:${code}`;
  let projectCache = targetOptionsCache.get(project);
  if (!projectCache) {
    projectCache = new Map();
    targetOptionsCache.set(project, projectCache);
  }
  const cached = projectCache.get(cacheKey);
  if (cached) return cached;
  const semanticTypes = targetSemanticTypes(code);
  const options: ScriptTargetOption[] = [];
  addTypedProjectTargets(project, code, options, catalog);
  for (const type of semanticTypes) {
    for (const entity of schemaEntities(project, type)) {
      if (!entityMatchesOpcodeTarget(entity, code)) continue;
      const value = numericTargetValue(entity);
      if (value == null) continue;
      options.push({
        key: entity.id,
        value,
        label: `${entity.label} (${value})`,
        detail: `${entity.type} | ${entity.editState}`,
        entity: selectEntityFromId(entity.id)
      });
    }
  }
  if (code === 9 || code === 27) {
    const wantedKinds = code === 9 ? new Set(["sound"]) : new Set(["picture", "icon"]);
    for (const asset of project.assets ?? []) {
      if (!wantedKinds.has(asset.kind)) continue;
      options.push({
        key: asset.id,
        value: asset.resourceId,
        label: `${asset.label} (${asset.resourceType.trim()} ${asset.resourceId})`,
        detail: `${asset.kind} | ${asset.exportState}`,
        entity: { type: "resource", id: asset.id }
      });
    }
    for (const asset of catalog?.assets ?? []) {
      if (asset.resourceId == null || !wantedKinds.has(asset.type)) continue;
      const resourceType = asset.resourceType?.trim() || asset.type;
      options.push({
        key: asset.id,
        value: asset.resourceId,
        label: `${asset.label} (${resourceType} ${asset.resourceId})`,
        detail: `${asset.type} | library catalog`,
        summary: asset.relativePath,
        compatibility: "Realmz resource",
        sourceState: "Imported library asset",
        entity: { type: "resource", id: asset.id }
      });
    }
  }
  if (code === 29 || code === 97 || code === 106) {
    for (const map of project.maps) {
      options.push({
        key: `map:${map.id}`,
        value: map.index,
        label: `${map.name} (${map.levelType} ${map.index})`,
        detail: `${map.levelType} map | ${map.render.tilesetId}`,
        entity: { type: "map", id: `map:${map.levelType}:${map.index}` }
      });
    }
  }
  if (isDirectMacroOpcode(code)) {
    for (const trigger of project.triggers.filter((candidate) => candidate.source === "Data ED3" && isCallableMacro(project, candidate))) {
      options.push({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Macro ${trigger.recordIndex}`,
        detail: `${trigger.actions.length} action slot(s)`,
        entity: selectEntityFromId(`macro:${trigger.recordIndex}`)
      });
    }
  }
  const result = dedupeTargetOptions(options).sort((a, b) => a.value - b.value || a.label.localeCompare(b.label)).slice(0, 320);
  projectCache.set(cacheKey, result);
  return result;
}

function catalogCacheKey(catalog?: LibraryCatalog | null) {
  if (!catalog) return "none";
  const existing = catalogIds.get(catalog);
  if (existing) return existing;
  const next = nextCatalogId++;
  catalogIds.set(catalog, next);
  return next;
}

function addTypedProjectTargets(project: Project, code: number, options: ScriptTargetOption[], catalog?: LibraryCatalog | null) {
  if ([1, 19, 62, 71].includes(code)) {
    const used = usageCounts(project, [1, 19, 62, 71]);
    for (const record of project.messages ?? []) {
      options.push({ key: `message:${record.id}`, value: record.id, label: `Message ${record.id}`, detail: record.text.slice(0, 80) || "empty", summary: `${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "message", id: `message:${record.id}` } });
    }
  }
  if ([2, 48, 56, 107].includes(code)) {
    const used = usageCounts(project, [2, 48, 56, 107]);
    for (const record of project.battles ?? []) {
      options.push({ key: `battle:${record.id}`, value: record.id, label: `Battle ${record.id}`, detail: `${record.grid.filter(Boolean).length} monster slot(s)`, summary: `messages ${record.messageBefore}/${record.messageAfter}, macro ${record.battleMacro}, ${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "battle", id: `battle:${record.id}` } });
    }
  }
  if (code === 10) {
    const used = usageCounts(project, [10]);
    for (const record of project.treasures ?? []) {
      options.push({ key: `treasure:${record.id}`, value: record.id, label: `Treasure ${record.id}`, detail: `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold`, summary: `${record.exp} exp, ${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "record", id: `treasure:${record.id}` } });
    }
  }
  if ([6, 49, 51].includes(code)) {
    const used = usageCounts(project, [6, 49, 51]);
    for (const record of project.shops ?? []) {
      options.push({ key: `shop:${record.id}`, value: record.id, label: `Shop ${record.id}`, detail: `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation`, summary: `${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "shop", id: `shop:${record.id}` } });
    }
  }
  if ([4, 35, 104].includes(code)) {
    const used = usageCounts(project, [4, 35, 104]);
    for (const record of project.simpleEncounters ?? []) {
      options.push({ key: `simple:${record.id}`, value: record.id, label: `Simple Encounter ${record.id}`, detail: `${record.actions.length} action(s), prompt ${record.prompt}`, summary: `${record.texts.find(Boolean) ?? "no text"} | ${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "encounter", id: `encounter:simple:${record.id}` } });
    }
  }
  if ([5, 44].includes(code)) {
    const used = usageCounts(project, [5, 44]);
    for (const record of project.complexEncounters ?? []) {
      options.push({ key: `complex:${record.id}`, value: record.id, label: `Complex Encounter ${record.id}`, detail: `${record.actions.length} action(s), prompt ${record.prompt}`, summary: `${record.texts.find(Boolean) ?? "no text"} | ${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "encounter", id: `encounter:complex:${record.id}` } });
    }
  }
  if (code === 47) {
    for (const quest of project.questLabels ?? []) {
      options.push({ key: `quest:${quest.id}`, value: quest.id, label: quest.label, detail: quest.note || "Providence metadata; Realmz value is opcode-driven", entity: { type: "questFlag", id: `quest:${quest.id}` } });
    }
  }
}

function usageCounts(project: Project, opcodes: number[]) {
  const codes = new Set(opcodes);
  const counts = new Map<number, number>();
  for (const trigger of project.triggers) {
    for (const action of trigger.actions) {
      if (!codes.has(normalizeStepOpcode(action.rawCode))) continue;
      counts.set(action.id, (counts.get(action.id) ?? 0) + 1);
    }
  }
  return counts;
}

function filterTargetOptions(options: ScriptTargetOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.compatibility,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function createTargetButtonLabel(recordType: RealmzTargetRecordKind, id?: number) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "Message",
    battle: "Battle",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
    questLabel: "Quest Label"
  };
  return id != null ? `Create ${labels[recordType]} ${id}` : `Create Next ${labels[recordType]}`;
}

function entityMatchesOpcodeTarget(entity: SemanticEntity, code: number) {
  if (code === 9 && entity.type === "resource") return String(entity.summary.type ?? "").trim() === "snd";
  if (code === 27 && entity.type === "resource") {
    const resourceType = String(entity.summary.type ?? "").trim();
    return resourceType === "PICT" || resourceType === "cicn";
  }
  return true;
}

export function targetSemanticTypes(code: number) {
  const types: Record<number, string[]> = {
    1: ["message"],
    2: ["battle"],
    4: ["simple encounter"],
    5: ["complex encounter"],
    6: ["shop"],
    8: ["macro"],
    9: ["sound", "resource"],
    10: ["treasure"],
    19: ["message"],
    27: ["picture", "resource"],
    29: ["map", "map record"],
    35: ["simple encounter"],
    40: ["macro"],
    44: ["complex encounter"],
    47: ["quest flag"],
    48: ["battle"],
    49: ["shop"],
    51: ["shop"],
    55: ["macro"],
    56: ["battle"],
    62: ["message"],
    64: ["macro"],
    71: ["message"],
    97: ["map", "map record"],
    104: ["simple encounter"],
    107: ["battle"],
    106: ["map", "map record"],
    127: ["monster"]
  };
  return types[code] ?? [];
}

export function isDirectMacroOpcode(code: number) {
  return code === 8 || code === 40 || code === 55 || code === 64;
}

function numericTargetValue(entity: SemanticEntity) {
  for (const key of ["id", "messageId", "battleId", "shopId", "treasureId", "resourceId", "flagId", "questId", "index", "levelIndex", "recordIndex"]) {
    const value = entity.summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return trailingNumber(entity.id);
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function dedupeTargetOptions(options: ScriptTargetOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.value}:${option.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

