import { useMemo } from "react";
import { Project, SelectedEntity, SemanticEntity } from "../types";
import { isCallableMacro, schemaEntities } from "../semanticGraph";
import { selectEntityFromId } from "../utils";
import { normalizeStepOpcode } from "../realmzActions";

export type ScriptTargetOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  entity?: SelectedEntity;
};

export function TargetPicker({
  project,
  opcode,
  value,
  onChange,
  onInspect
}: {
  project: Project | null;
  opcode: number;
  value: number;
  onChange: (id: number) => void;
  onInspect: (entity: SelectedEntity) => void;
}) {
  const config = targetPickerConfig(opcode);
  const targets = useMemo(() => targetOptionsForOpcode(project, opcode), [project, opcode]);
  if (!config) return null;
  const selected = targets.find((target) => target.value === value) ?? null;
  const hasCurrentValue = Number.isFinite(value) && value !== 0 && !selected;
  return (
    <div className="realmz-target-picker">
      <label>
        <span>{config.label}</span>
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
          {targets.map((target) => (
            <option key={target.key} value={target.value}>
              {target.label}
            </option>
          ))}
        </select>
      </label>
      <small>{selected?.detail ?? config.hint}</small>
      {selected?.entity && (
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => onInspect(selected.entity!)}>
          Inspect Target
        </button>
      )}
      {targets.length === 0 && <span className="target-picker-empty">No source-backed targets are available yet.</span>}
    </div>
  );
}

export function targetPickerConfig(opcode: number) {
  const code = normalizeStepOpcode(opcode);
  const configs: Record<number, { label: string; hint: string }> = {
    1: { label: "Message Target", hint: "Select the scenario message this action displays." },
    4: { label: "Simple Encounter", hint: "Select a simple encounter record." },
    5: { label: "Complex Encounter", hint: "Select a complex encounter record." },
    6: { label: "Shop Target", hint: "Select a shop record." },
    8: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    9: { label: "Sound Resource", hint: "Select a playable sound resource or managed sound asset." },
    10: { label: "Treasure Target", hint: "Select a treasure record." },
    19: { label: "Message Target", hint: "Select the scenario message this action displays." },
    27: { label: "Picture Resource", hint: "Select a picture resource or managed picture asset." },
    29: { label: "Map Reference", hint: "Select a map or map record." },
    35: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates." },
    40: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    44: { label: "Complex Encounter", hint: "Select the complex encounter this action mutates." },
    47: { label: "Quest Flag", hint: "Select a quest flag to write." },
    49: { label: "Shop Target", hint: "Select a shop record." },
    51: { label: "Shop Target", hint: "Select a shop record." },
    55: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    62: { label: "Message Target", hint: "Select the scenario message this action displays." },
    64: { label: "Macro Target", hint: "Select a reusable Data ED3 macro." },
    71: { label: "Message Target", hint: "Select the scenario message this action displays." },
    97: { label: "Map Record", hint: "Select a map record." },
    104: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates." },
    106: { label: "Map Record", hint: "Select the map record this action mutates." },
    127: { label: "Monster Target", hint: "Select a monster record." }
  };
  return configs[code] ?? null;
}

export function targetOptionsForOpcode(project: Project | null, opcode: number): ScriptTargetOption[] {
  if (!project) return [];
  const code = normalizeStepOpcode(opcode);
  const semanticTypes = targetSemanticTypes(code);
  const options: ScriptTargetOption[] = [];
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
  return dedupeTargetOptions(options).sort((a, b) => a.value - b.value || a.label.localeCompare(b.label)).slice(0, 320);
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
    49: ["shop"],
    51: ["shop"],
    55: ["macro"],
    62: ["message"],
    64: ["macro"],
    71: ["message"],
    97: ["map", "map record"],
    104: ["simple encounter"],
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
