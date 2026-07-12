import { useEffect, useMemo, useState } from "react";
import {
  filterTargetOptions,
  resolveSignedMessageTarget,
  signedTargetBehaviorLabel,
  signedTargetValueForSelection,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode
} from "../../components/RealmzTargetPicker";
import type { LibraryCatalog, Project, RealmzTargetRecordKind } from "../../types";

export function ReferenceIdField({
  project,
  catalog,
  label,
  emptyLabel,
  opcode,
  value,
  createRecordType,
  compact = false,
  showSelectedResult = true,
  onCommit,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  emptyLabel: string;
  opcode: number;
  value: number;
  createRecordType?: RealmzTargetRecordKind;
  compact?: boolean;
  showSelectedResult?: boolean;
  onCommit: (value: number) => void;
  onCreateTarget?: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  useEffect(() => {
    setQuery("");
    setOptionsLoaded(false);
  }, [opcode, project]);
  const resolvedValue = resolveSignedMessageTarget(opcode, value);
  const selected = useMemo(() => targetOptionForOpcodeValue(project, opcode, value, catalog), [catalog, opcode, project, value]);
  const options = useMemo(() => {
    if (!optionsLoaded && !query.trim()) return selected ? [selected] : [];
    return targetOptionsForOpcode(project, opcode, catalog);
  }, [catalog, opcode, optionsLoaded, project, query, selected]);
  const filteredOptions = useMemo(() => filterTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  const resultOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 8);
    if (selected && !query.trim() && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 7)];
    return visible;
  }, [filteredOptions, query, selected]);
  const hasRawValue = resolvedValue !== 0 && !selected;
  const canCreate = Boolean(createRecordType && onCreateTarget && (!selected || hasRawValue || value === 0));
  const createId = resolvedValue > 0 && !selected ? resolvedValue : createRecordType ? nextAuthorableTargetId(project, createRecordType) : resolvedValue;
  const selectTarget = (next: number) => {
    onCommit(signedTargetValueForSelection(opcode, value, next));
    setQuery("");
  };
  return (
    <label className={compact ? "script-reference-id-field compact" : "script-reference-id-field"}>
      <span>{label}</span>
      {!compact && (
        <>
          <input
            value={query}
            onFocus={() => setOptionsLoaded(true)}
            onChange={(event) => {
              setOptionsLoaded(true);
              setQuery(event.currentTarget.value);
            }}
            placeholder={`Search ${label.toLowerCase()}...`}
            aria-label={`Search ${label}`}
          />
          <div className="script-reference-results" aria-live="polite">
            {query.trim() && resultOptions.length === 0 && <small>No matching {label.toLowerCase()} targets.</small>}
            {(query.trim() ? resultOptions : showSelectedResult && selected ? [selected] : []).map((option) => (
              <button
                key={option.key}
                type="button"
                className={option.value === resolvedValue ? "selected" : ""}
                onClick={() => selectTarget(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{[option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ")}</span>
              </button>
            ))}
            {query.trim() && filteredOptions.length > resultOptions.length && <small>{filteredOptions.length - resultOptions.length} more match(es); keep typing to narrow.</small>}
          </div>
        </>
      )}
      <select
        value={hasRawValue ? `raw:${resolvedValue}` : selected ? String(selected.value) : ""}
        onFocus={() => setOptionsLoaded(true)}
        onMouseDown={() => setOptionsLoaded(true)}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          if (!raw || raw.startsWith("raw:")) return;
          selectTarget(Number(raw));
        }}
      >
        <option value="">{emptyLabel}</option>
        {hasRawValue && <option value={`raw:${resolvedValue}`}>Current value {resolvedValue}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} value`} />
      <small>{selected ? [selected.detail, selected.summary, signedTargetBehaviorLabel(opcode, value), selected.compatibility, selected.sourceState].filter(Boolean).join(" | ") : hasRawValue ? "Current value has no matching target yet." : filteredOptions.length === 0 && query.trim() ? "No targets match this search." : emptyLabel}</small>
      {canCreate && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
          onCreateTarget?.(createId);
          onCommit(signedTargetValueForSelection(opcode, value, createId));
        }}>
          Create {label} {createId}
        </button>
      )}
    </label>
  );
}
export function nextAuthorableTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  const used = new Set((records ?? []).map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + 1;
}
