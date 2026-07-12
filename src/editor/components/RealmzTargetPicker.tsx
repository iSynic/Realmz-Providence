import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Eye, Volume2 } from "lucide-react";
import { LibraryCatalog, Project, RealmzTargetRecordKind, SelectedEntity, SemanticEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { actionOptionFor, normalizeStepOpcode } from "../realmzActions";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { divinityCompatibleSoundIds, divinitySoundReferenceLabel, isDivinityCompatibleSoundId } from "../soundReferences";

export type ScriptTargetOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  summary?: string;
  compatibility?: string;
  sourceState?: string;
  entity?: SelectedEntity;
  previewPath?: string | null;
  previewMimeType?: string | null;
  managedAsset?: Project["assets"][number];
  libraryAsset?: LibraryCatalog["assets"][number];
};

const targetOptionsCache = new Map<string, ScriptTargetOption[]>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const MAX_TARGET_OPTIONS_CACHE_ENTRIES = 96;

const SIGNED_DIRECT_TARGET_BEHAVIOR: Record<number, string> = {
  1: "no wait",
  6: "opens directly",
  9: "waits for sound",
  29: "displays immediately",
  47: "clears quest"
};

export function resolveSignedTargetValue(opcode: number, value: number) {
  const code = normalizeStepOpcode(opcode);
  return SIGNED_DIRECT_TARGET_BEHAVIOR[code] ? Math.abs(value) : value;
}

export function resolveSignedMessageTarget(opcode: number, value: number) {
  return resolveSignedTargetValue(opcode, value);
}

export function signedTargetValueForSelection(opcode: number, currentValue: number, selectedValue: number) {
  const code = normalizeStepOpcode(opcode);
  if (SIGNED_DIRECT_TARGET_BEHAVIOR[code] && currentValue < 0 && selectedValue > 0) return -Math.abs(selectedValue);
  return selectedValue;
}

export function supportsSignedSoundReference(opcode: number) {
  return normalizeStepOpcode(opcode) === 9;
}

export function signedSoundWaitsForCompletion(value: number) {
  return value < 0;
}

export function signedSoundValueForSelection(soundId: number, waitForCompletion: boolean) {
  if (!soundId) return 0;
  return waitForCompletion ? -Math.abs(soundId) : Math.abs(soundId);
}

export function signedTargetBehaviorLabel(opcode: number, value: number) {
  const code = normalizeStepOpcode(opcode);
  if (code === 9 && value < 0) return "Wait for sound to finish";
  return value < 0 ? SIGNED_DIRECT_TARGET_BEHAVIOR[code] ?? "" : "";
}

export function TargetPicker({
  project,
  catalog,
  opcode,
  value,
  onChange,
  onInspect,
  onCreate,
  emptyLabel,
  showSearch = true,
  showDetail = true,
  showTargetCount = true,
  previewContext = {}
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  opcode: number;
  value: number;
  onChange: (id: number) => void;
  onInspect?: (entity: SelectedEntity) => void;
  onCreate?: (recordType: RealmzTargetRecordKind, id?: number) => void;
  emptyLabel?: string;
  showSearch?: boolean;
  showDetail?: boolean;
  showTargetCount?: boolean;
  previewContext?: PreviewRuntimeContext;
}) {
  const config = targetPickerConfig(opcode);
  const [query, setQuery] = useState("");
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const projectLoadKey = project ? `${project.scenario.projectPath || project.source?.sourcePath || project.scenario.name}` : "none";
  const targetDependencyKey = targetOptionsDependencyKey(project, opcode, catalog);
  useEffect(() => {
    setQuery("");
    setTargetsLoaded(false);
  }, [opcode, projectLoadKey]);
  const resolvedValue = resolveSignedTargetValue(opcode, value);
  const selectedStub = useMemo(() => targetOptionForOpcodeValue(project, opcode, value, catalog), [opcode, projectLoadKey, targetDependencyKey, value]);
  const shouldShowSearch = showSearch && config?.searchable !== false;
  const isSearchDrivenPicker = shouldShowSearch;
  const effectiveTargetsLoaded = !shouldShowSearch || targetsLoaded;
  const targets = useMemo(() => {
    if (!effectiveTargetsLoaded && !query.trim()) return selectedStub ? [selectedStub] : [];
    return targetOptionsForOpcode(project, opcode, catalog);
  }, [effectiveTargetsLoaded, opcode, projectLoadKey, query, selectedStub, targetDependencyKey]);
  const filteredTargetBase = effectiveTargetsLoaded || query.trim() ? filterTargetOptions(targets, query) : selectedStub ? [selectedStub] : [];
  const typedSoundTarget = soundReferenceOptionForQuery(opcode, query);
  const filteredTargets = typedSoundTarget && !filteredTargetBase.some((target) => target.value === typedSoundTarget.value)
    ? [typedSoundTarget, ...filteredTargetBase]
    : filteredTargetBase;
  const selected = targets.find((target) => target.value === resolvedValue) ?? selectedStub ?? null;
  const previewResourceType = normalizeStepOpcode(opcode) === 9
    ? "snd "
    : normalizeStepOpcode(opcode) === 27
      ? targetPreviewResourceType(selected)
      : null;
  const selectedPreviewUrl = useResolvedPreviewUrl(
    previewResourceType ? selected?.previewPath ?? null : null,
    previewResourceType ? selected?.managedAsset ?? null : null,
    previewResourceType ? selected?.libraryAsset ?? null : null,
    {
      ...previewContext,
      project,
      resourceType: previewResourceType,
      resourceId: previewResourceType ? selected?.value ?? resolvedValue : null
    }
  );
  if (!config) return null;
  const visibleTargets = selected && !filteredTargets.some((target) => target.key === selected.key)
    ? [selected, ...filteredTargets.slice(0, 159)]
    : filteredTargets.slice(0, 160);
  const normalizedQuery = query.trim();
  const searchResultTargets = normalizedQuery && isSearchDrivenPicker
    ? filteredTargets.slice(0, 8)
    : [];
  const hasCurrentValue = Number.isFinite(resolvedValue) && resolvedValue !== 0 && !selected;
  const canCreateTarget = Boolean(config.recordType && onCreate && (!selected || hasCurrentValue));
  const behavior = signedTargetBehaviorLabel(opcode, value);
  const showWaitControl = supportsSignedSoundReference(opcode) && resolvedValue !== 0;
  const detail = selected
    ? targetPickerSelectedDetail(selected, normalizeStepOpcode(opcode), behavior)
    : "";
  const selectedDetail = selected
    ? showDetail
      ? targetPickerSelectedDetail(selected, normalizeStepOpcode(opcode), behavior) || `Selected ${config.label.toLowerCase()}`
      : ""
    : hasCurrentValue ? `${targetFallbackLabel(config.label, resolvedValue)} does not exist yet.` : "";
  const chooseTarget = (target: ScriptTargetOption) => {
    onChange(signedTargetValueForSelection(opcode, value, target.value));
    setQuery("");
    setTargetsLoaded(false);
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setTargetsLoaded(false);
      return;
    }
    if (event.key !== "Enter") return;
    const firstTarget = searchResultTargets[0];
    if (!firstTarget) return;
    event.preventDefault();
    chooseTarget(firstTarget);
  };
  return (
    <div className="realmz-target-picker">
      {isSearchDrivenPicker ? (
        <>
          <label className="target-picker-search-label">
            <span>{config.label}</span>
            <input
              value={query}
              onChange={(event) => {
                const nextQuery = event.currentTarget.value;
                setTargetsLoaded(Boolean(nextQuery.trim()));
                setQuery(nextQuery);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={config.searchPlaceholder ?? `Search ${config.label.toLowerCase()}...`}
              aria-label={`Search ${config.label}`}
            />
          </label>
          <div className={`target-picker-selected-row${selected ? "" : " missing"}`}>
            <div>
              <strong>{selected ? selected.label : hasCurrentValue ? targetFallbackLabel(config.label, resolvedValue) : emptyLabel ?? `No ${config.label.toLowerCase()} selected`}</strong>
              {selectedDetail && <small>{selectedDetail}</small>}
            </div>
            {selected?.entity && onInspect && (
              <button className="btn btn-secondary btn-xs icon-only target-picker-open-button" type="button" title={`Open ${selected.label}`} onClick={() => onInspect(selected.entity!)}>
                <Eye size={12} />
              </button>
            )}
          </div>
          {isDirectMacroOpcode(normalizeStepOpcode(opcode)) && <TargetMacroFlowPreview project={project} catalog={catalog} macroId={resolvedValue} />}
          {normalizedQuery && (
            <div className="target-picker-search-preview target-picker-string-results" aria-live="polite">
              {searchResultTargets.map((target) => {
                const resultDetail = targetPickerSearchResultDetail(target, normalizeStepOpcode(opcode));
                return (
                  <button
                    key={target.key}
                    type="button"
                    className={target.value === resolvedValue ? "selected" : ""}
                    title={targetOptionTitle(target)}
                    onClick={() => chooseTarget(target)}
                  >
                    <strong>{target.label}</strong>
                    {resultDetail && <small>{resultDetail}</small>}
                  </button>
                );
              })}
              {searchResultTargets.length === 0 && <span className="target-picker-empty">No {config.label.toLowerCase()} targets match this search.</span>}
              {filteredTargets.length > searchResultTargets.length && (
                <small>{filteredTargets.length - searchResultTargets.length} more matching target(s); keep typing to narrow.</small>
              )}
            </div>
          )}
        </>
      ) : (
        <label className="target-picker-select-label">
          <span>{config.label}</span>
          <div className={selected?.entity ? "target-picker-select-row with-open-action" : "target-picker-select-row"}>
            <select
              onFocus={() => setTargetsLoaded(true)}
              onMouseDown={() => setTargetsLoaded(true)}
              value={hasCurrentValue ? `raw:${resolvedValue}` : selected ? String(selected.value) : ""}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                if (!raw || raw.startsWith("raw:")) return;
                onChange(signedTargetValueForSelection(opcode, value, Number(raw)));
              }}
            >
              <option value="">{emptyLabel ?? `Choose ${config.label.toLowerCase()}`}</option>
              {hasCurrentValue && <option value={`raw:${resolvedValue}`}>Current value {resolvedValue}</option>}
              {visibleTargets.map((target) => (
                <option key={target.key} value={target.value} title={targetOptionTitle(target)}>
                  {target.label}
                </option>
              ))}
            </select>
            {selected?.entity && onInspect && (
              <button
                className="btn btn-secondary btn-xs icon-only target-picker-open-button"
                type="button"
                title={`Open ${selected.label}`}
                aria-label={`Open ${selected.label}`}
                onClick={() => onInspect(selected.entity!)}
              >
                <Eye size={12} />
              </button>
            )}
          </div>
        </label>
      )}
      {showWaitControl && (
        <label className="realmz-target-picker-wait">
          <input
            type="checkbox"
            checked={signedSoundWaitsForCompletion(value)}
            onChange={(event) => onChange(signedSoundValueForSelection(resolvedValue, event.currentTarget.checked))}
          />
          <span>Wait for sound to finish</span>
        </label>
      )}
      {!isSearchDrivenPicker && showDetail && detail && <small>{detail}</small>}
      {normalizeStepOpcode(opcode) === 9 && selected && (
        <button
          className="btn btn-secondary btn-xs"
          type="button"
          disabled={!selectedPreviewUrl}
          title={selectedPreviewUrl ? "Play this sound preview." : "No preview is available for this sound reference."}
          onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
        >
          <Volume2 size={12} /> Play
        </button>
      )}
      {normalizeStepOpcode(opcode) === 27 && selected && selectedPreviewUrl && onInspect && (
        <button
          className="realmz-target-picker-preview"
          type="button"
          title="Open picture target"
          onClick={() => selected?.entity && onInspect(selected.entity)}
        >
          <img src={selectedPreviewUrl} alt={selected.label} />
        </button>
      )}
      {canCreateTarget && (
        <button
          className="btn btn-secondary btn-xs"
          type="button"
          onClick={() => onCreate?.(config.recordType!, hasCurrentValue ? resolvedValue : undefined)}
        >
          {createTargetButtonLabel(config.recordType!, hasCurrentValue ? resolvedValue : undefined)}
        </button>
      )}
      {!isSearchDrivenPicker && showTargetCount && targets.length === 0 && <span className="target-picker-empty">No targets are available yet.</span>}
      {!isSearchDrivenPicker && showTargetCount && targets.length > 0 && filteredTargets.length === 0 && <span className="target-picker-empty">No targets match this search.</span>}
      {!isSearchDrivenPicker && showTargetCount && filteredTargets.length > visibleTargets.length && <span className="target-picker-empty">{filteredTargets.length - visibleTargets.length} more target(s); search to narrow.</span>}
    </div>
  );
}

function TargetMacroFlowPreview({
  project,
  catalog,
  macroId
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  macroId: number;
}) {
  const trigger = project?.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === macroId);
  if (!trigger) return null;
  const actions = trigger.actions
    .filter((action) => action.rawCode !== 0)
    .slice()
    .sort((a, b) => a.slot - b.slot);
  if (actions.length === 0) return <small className="target-picker-flow-empty">Extra Action Point {macroId} has no occupied action slots.</small>;
  return (
    <div className="target-picker-flow-preview" aria-label={`Extra Action Point ${macroId} flow preview`}>
      {actions.slice(0, 5).map((action) => (
        <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
          <span>{action.slot + 1}</span>
          <small>{targetPickerFlowActionSummary(project, catalog, action.rawCode, action.id)}</small>
        </div>
      ))}
      {actions.length > 5 && <small>{actions.length - 5} more action slot(s).</small>}
    </div>
  );
}

function targetPickerFlowActionSummary(project: Project | null, catalog: LibraryCatalog | null | undefined, rawCode: number, id: number) {
  const code = normalizeStepOpcode(rawCode);
  const action = actionOptionFor(code);
  if (code === 0) return "Empty";
  const target = targetOptionForOpcodeValue(project, rawCode, id, catalog);
  if (target) return `${action.shortLabel}: ${target.label}`;
  if (id !== 0) return `${action.shortLabel}: ${id}`;
  return action.shortLabel;
}

function targetFallbackLabel(label: string, value: number) {
  const base = label
    .replace(/\s+Target$/i, "")
    .replace(/\s+Resource$/i, "");
  if (label === "String Target") return `String ${value}`;
  if (label === "Sound Resource") return `Sound ${value}`;
  if (label === "Picture Resource") return `Picture ${value}`;
  if (label === "Scrolling Text") return `Scrolling Text ${value}`;
  return `${base} ${value}`;
}

export function targetPickerConfig(opcode: number) {
  const code = normalizeStepOpcode(opcode);
  if (actionOptionFor(code).edcdShape) return null;
  const configs: Record<number, { label: string; hint: string; recordType?: RealmzTargetRecordKind; searchable?: boolean; searchPlaceholder?: string }> = {
    1: { label: "String Target", hint: "Select the scenario string this action displays.", recordType: "message", searchPlaceholder: "Search string # or text..." },
    2: { label: "Battle Target", hint: "Select the battle record this action starts.", recordType: "battle", searchPlaceholder: "Search battle # or details..." },
    4: { label: "Simple Encounter", hint: "Select a simple encounter record.", recordType: "simpleEncounter" },
    5: { label: "Complex Encounter", hint: "Select a complex encounter record.", recordType: "complexEncounter" },
    6: { label: "Shop Target", hint: "Select a shop record.", recordType: "shop" },
    9: { label: "Sound Resource", hint: "Select a playable sound resource or managed sound asset." },
    10: { label: "Treasure Target", hint: "Select a treasure record.", recordType: "treasure" },
    27: { label: "Picture Resource", hint: "Select a picture resource or managed picture asset." },
    29: { label: "Player Map", hint: "Select the Maps/Notes entry to give or display.", searchPlaceholder: "Search map #, name, or note..." },
    35: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates.", recordType: "simpleEncounter" },
    39: { label: "Extra Action Point", hint: "Select the Extra Action Point this action runs." },
    44: { label: "Complex Encounter", hint: "Select the complex encounter this action mutates.", recordType: "complexEncounter" },
    47: { label: "Quest Flag", hint: "Select a quest flag to write.", recordType: "questLabel" },
    49: { label: "Shop Target", hint: "Select a shop record.", recordType: "shop" },
    62: { label: "Scrolling Text", hint: "Select a scenario TEXT resource for the scrolling-text movie window.", searchPlaceholder: "Search scrolling text # or body..." },
    97: { label: "Map Record", hint: "Select a map record." },
    104: { label: "Simple Encounter", hint: "Select the simple encounter this action mutates.", recordType: "simpleEncounter" },
    127: { label: "Monster Target", hint: "Select a monster record.", recordType: "monster" }
  };
  return configs[code] ?? null;
}

function encounterPromptDetail(prompt: number) {
  return prompt > 0 ? `Prompt String ${prompt}` : "No prompt string";
}

export function targetOptionsForOpcode(project: Project | null, opcode: number, catalog?: LibraryCatalog | null): ScriptTargetOption[] {
  if (!project) return [];
  const code = normalizeStepOpcode(opcode);
  const cacheKey = targetOptionsDependencyKey(project, code, catalog);
  const cached = targetOptionsCache.get(cacheKey);
  if (cached) return cached;
  const options: ScriptTargetOption[] = [];
  addTypedProjectTargets(project, code, options, catalog);
  if (code === 62) {
    addTextResourceTargets(project, options, catalog);
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
        entity: { type: "resource", id: asset.id },
        previewPath: asset.previewPath,
        previewMimeType: asset.mimeType,
        managedAsset: asset
      });
    }
    if (code === 9) {
      for (const asset of project.assetCatalog.sounds ?? []) {
        options.push({
          key: `resource:${asset.resourceType}:${asset.resourceId}`,
          value: asset.resourceId,
          label: `${asset.name || `${asset.resourceType.trim()} ${asset.resourceId}`} (${asset.resourceType.trim()} ${asset.resourceId})`,
          detail: `sound | ${asset.source}`,
          entity: { type: "resource", id: `resource:${asset.resourceType}:${asset.resourceId}` },
          previewPath: asset.previewPath,
          previewMimeType: "audio/wav",
          compatibility: "Realmz resource",
          sourceState: "Scenario resource"
        });
      }
    }
    if (code === 27) {
      for (const asset of project.assetCatalog.pictures ?? []) {
        options.push({
          key: `resource:${asset.resourceType}:${asset.resourceId}`,
          value: asset.resourceId,
          label: `${asset.name || `${asset.resourceType} ${asset.resourceId}`} (${asset.resourceType.trim()} ${asset.resourceId})`,
          detail: `picture | ${asset.source}`,
          entity: { type: "resource", id: `resource:${asset.resourceType}:${asset.resourceId}` },
          previewPath: asset.previewPath
        });
      }
      for (const asset of project.assetCatalog.icons ?? []) {
        options.push({
          key: `resource:${asset.resourceType}:${asset.resourceId}`,
          value: asset.resourceId,
          label: `${asset.name || `${asset.resourceType} ${asset.resourceId}`} (${asset.resourceType.trim()} ${asset.resourceId})`,
          detail: `icon | ${asset.source}`,
          entity: { type: "resource", id: `resource:${asset.resourceType}:${asset.resourceId}` },
          previewPath: asset.previewPath
        });
      }
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
        entity: { type: "resource", id: asset.id },
        previewPath: asset.previewPath,
        previewMimeType: asset.mimeType,
        libraryAsset: asset
      });
    }
    if (code === 9) {
      for (const id of divinityCompatibleSoundIds()) {
        options.push(soundReferenceOption(id));
      }
    }
  }
  if (code === 29) {
    addPlayerMapTargets(project, options);
  }
  if (code === 97 || code === 106) {
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
    for (const trigger of project.triggers.filter((candidate) => candidate.source === "Data ED3")) {
      options.push({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.length} action slot(s)`,
        entity: selectEntityFromId(`macro:${trigger.recordIndex}`)
      });
    }
  }
  const result = dedupeTargetOptions(options).sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
  targetOptionsCache.set(cacheKey, result);
  if (targetOptionsCache.size > MAX_TARGET_OPTIONS_CACHE_ENTRIES) {
    const oldest = targetOptionsCache.keys().next().value;
    if (oldest) targetOptionsCache.delete(oldest);
  }
  return result;
}

export function targetOptionForOpcodeValue(project: Project | null, opcode: number, value: number, catalog?: LibraryCatalog | null): ScriptTargetOption | null {
  if (!project || !Number.isFinite(value)) return null;
  const code = normalizeStepOpcode(opcode);
  const resolvedValue = resolveSignedTargetValue(code, value);
  const id = code === 62 ? resolvedValue : Math.abs(resolvedValue);
  const selected = optionFromTypedProjectTarget(project, code, id, catalog);
  return selected;
}

function objectCacheKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIds.get(value);
  if (existing) return existing;
  const next = nextObjectId++;
  objectIds.set(value, next);
  return next;
}

function targetOptionsDependencyKey(project: Project | null, opcode: number, catalog?: LibraryCatalog | null) {
  if (!project) return `none:${normalizeStepOpcode(opcode)}:${objectCacheKey(catalog?.assets)}`;
  const code = normalizeStepOpcode(opcode);
  const catalogAssets = objectCacheKey(catalog?.assets);
  const assetCatalog = project.assetCatalog;
  const parts: Array<string | number> = [code];
  if (code === 1) parts.push("messages", objectCacheKey(project.messages), "triggers", objectCacheKey(project.triggers));
  else if ([2, 48, 56, 107].includes(code)) parts.push("battles", objectCacheKey(project.battles), "triggers", objectCacheKey(project.triggers));
  else if (code === 127) parts.push("monsters", objectCacheKey(project.monsters), "triggers", objectCacheKey(project.triggers));
  else if (code === 10) parts.push("treasures", objectCacheKey(project.treasures), "triggers", objectCacheKey(project.triggers));
  else if ([6, 49, 51].includes(code)) parts.push("shops", objectCacheKey(project.shops), "triggers", objectCacheKey(project.triggers));
  else if ([4, 35, 104].includes(code)) parts.push("simple", objectCacheKey(project.simpleEncounters), "triggers", objectCacheKey(project.triggers));
  else if ([5, 44].includes(code)) parts.push("complex", objectCacheKey(project.complexEncounters), "triggers", objectCacheKey(project.triggers));
  else if (code === 47) parts.push("quests", objectCacheKey(project.questLabels));
  else if (code === 62) parts.push("assets", objectCacheKey(project.assets), "resources", objectCacheKey(project.semanticSchema?.entities), "catalog", catalogAssets);
  else if (code === 9) parts.push("assets", objectCacheKey(project.assets), "sounds", objectCacheKey(assetCatalog?.sounds), "catalog", catalogAssets);
  else if (code === 27) parts.push("assets", objectCacheKey(project.assets), "pictures", objectCacheKey(assetCatalog?.pictures), "icons", objectCacheKey(assetCatalog?.icons), "catalog", catalogAssets);
  else if (code === 29) parts.push("mapRecords", objectCacheKey(project.mapRecords), "triggers", objectCacheKey(project.triggers), "assets", objectCacheKey(project.assets), "resources", objectCacheKey(project.semanticSchema?.entities));
  else if (code === 97 || code === 106) parts.push("maps", objectCacheKey(project.maps));
  else if (isDirectMacroOpcode(code)) parts.push("triggers", objectCacheKey(project.triggers));
  else parts.push("project", objectCacheKey(project));
  return parts.join(":");
}

function optionFromTypedProjectTarget(project: Project, code: number, id: number, catalog?: LibraryCatalog | null): ScriptTargetOption | null {
  if (code === 1) {
    const record = project.messages?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `message:${record.id}`,
          value: record.id,
          label: `String ${record.id}`,
          detail: record.text || "empty",
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "message", id: `message:${record.id}` }
        }
      : id >= 10000
        ? {
            key: `legacy-message:${id}`,
            value: id,
            label: `Legacy String Reference ${id}`,
            detail: "High Realmz text/resource reference",
            compatibility: "Legacy scenario reference",
            sourceState: "No editable string record"
          }
        : null;
  }
  if ([2, 48, 56, 107].includes(code)) {
    const record = project.battles?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `battle:${record.id}`,
          value: record.id,
          label: `Battle ${record.id}`,
          detail: `${record.grid.filter(Boolean).length} monster slot(s)`,
          summary: `strings ${record.messageBefore}/${record.messageAfter}, battle action ${record.battleMacro}`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "battle", id: `battle:${record.id}` }
        }
      : null;
  }
  if (code === 127) {
    const record = project.monsters?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `monster:${record.id}`,
          value: record.id,
          label: `${record.displayName || `Monster ${record.id}`} (${record.id})`,
          detail: `HD ${record.hitDice}, armor ${record.armor}, move ${record.movementMax}`,
          summary: `${record.items.filter(Boolean).length} item(s), ${record.spells.filter(Boolean).length} spell(s)`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "monster", id: `monster:${record.id}` }
        }
      : null;
  }
  if (code === 10) {
    const record = project.treasures?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `treasure:${record.id}`,
          value: record.id,
          label: `Treasure ${record.id}`,
          detail: `${record.itemIds.filter(Boolean).length} item(s), ${record.gold} gold`,
          summary: `${record.exp} exp`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "record", id: `treasure:${record.id}` }
        }
      : null;
  }
  if ([6, 49, 51].includes(code)) {
    const record = project.shops?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `shop:${record.id}`,
          value: record.id,
          label: `Shop ${record.id}`,
          detail: `${record.itemIds.filter(Boolean).length} stocked slot(s), ${record.inflation}% inflation`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "shop", id: `shop:${record.id}` }
        }
      : null;
  }
  if ([4, 35, 104].includes(code)) {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `simple:${record.id}`,
          value: record.id,
          label: `Simple Encounter ${record.id}`,
          detail: `${record.actions.length} action(s), ${encounterPromptDetail(record.prompt)}`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "encounter", id: `encounter:simple:${record.id}` }
        }
      : null;
  }
  if ([5, 44].includes(code)) {
    const record = project.complexEncounters?.find((candidate) => candidate.id === id);
    return record
      ? {
          key: `complex:${record.id}`,
          value: record.id,
          label: `Complex Encounter ${record.id}`,
          detail: `${record.actions.length} action(s), ${encounterPromptDetail(record.prompt)}`,
          compatibility: "Editable",
          sourceState: record.authored ? "Authored" : "Imported",
          entity: { type: "encounter", id: `encounter:complex:${record.id}` }
        }
      : null;
  }
  if (code === 47) {
    const quest = project.questLabels?.find((candidate) => candidate.id === id);
    return quest
      ? { key: `quest:${quest.id}`, value: quest.id, label: quest.label, detail: quest.note || "Quest metadata", entity: { type: "questFlag", id: `quest:${quest.id}` } }
      : { key: `quest:${id}`, value: id, label: `Quest Flag ${id}`, detail: "Scenario state flag", entity: { type: "questFlag", id: `quest:${id}` } };
  }
  if (code === 62) {
    return textResourceOptionForId(project, id, catalog);
  }
  if (code === 29) {
    const record = project.mapRecords?.find((candidate) => candidate.id === id);
    if (record) return playerMapTargetOption(project, record, usageCounts(project, [29]));
    return id >= 0 && id <= 19 ? fallbackPlayerMapTargetOption(id) : null;
  }
  if (code === 97 || code === 106) {
    const map = project.maps.find((candidate) => candidate.index === id);
    return map
      ? {
          key: `map:${map.id}`,
          value: map.index,
          label: `${map.name} (${map.levelType} ${map.index})`,
          detail: `${map.levelType} map | ${map.render.tilesetId}`,
          entity: { type: "map", id: `map:${map.levelType}:${map.index}` }
        }
      : null;
  }
  if (isDirectMacroOpcode(code)) {
    const trigger = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === id);
    return trigger
      ? {
          key: `macro:${trigger.recordIndex}`,
          value: trigger.recordIndex,
          label: `Extra Action Point ${trigger.recordIndex}`,
          detail: `${trigger.actions.length} action slot(s)`,
          entity: selectEntityFromId(`macro:${trigger.recordIndex}`)
        }
      : null;
  }
  if (code === 9 || code === 27) {
    const wantedKinds = code === 9 ? new Set(["sound"]) : new Set(["picture", "icon"]);
    const asset = (project.assets ?? []).find((candidate) => targetResourceIdMatches(code, candidate.resourceId, id) && wantedKinds.has(candidate.kind));
    if (asset) {
      return {
        key: asset.id,
        value: id,
        label: `${asset.label} (${asset.resourceType.trim()} ${asset.resourceId})`,
        detail: `${asset.kind} | ${asset.exportState}`,
        entity: { type: "resource", id: asset.id },
        previewPath: asset.previewPath,
        previewMimeType: asset.mimeType,
        managedAsset: asset
      };
    }
    if (code === 9) {
      const soundAsset = (project.assetCatalog.sounds ?? []).find((candidate) => targetResourceIdMatches(code, candidate.resourceId, id));
      if (soundAsset) {
        const fallbackLibraryAsset = findCatalogResourceAsset(catalog, "snd", id, "sound");
        return {
          key: `resource:${soundAsset.resourceType}:${soundAsset.resourceId}`,
          value: id,
          label: `${soundAsset.name || `${soundAsset.resourceType.trim()} ${soundAsset.resourceId}`} (${soundAsset.resourceType.trim()} ${soundAsset.resourceId})`,
          detail: `sound | ${soundAsset.source}`,
          compatibility: "Realmz resource",
          sourceState: soundAsset.previewPath ? "Scenario resource" : fallbackLibraryAsset ? "Scenario resource; preview from bundled library" : "Scenario resource",
          entity: { type: "resource", id: `resource:${soundAsset.resourceType}:${soundAsset.resourceId}` },
          previewPath: soundAsset.previewPath,
          previewMimeType: "audio/wav",
          libraryAsset: fallbackLibraryAsset ?? undefined
        };
      }
      const fallbackLibraryAsset = findCatalogResourceAsset(catalog, "snd", id, "sound");
      if (fallbackLibraryAsset) {
        return {
          key: fallbackLibraryAsset.id,
          value: id,
          label: `${fallbackLibraryAsset.label} (${fallbackLibraryAsset.resourceType?.trim() || "snd"} ${fallbackLibraryAsset.resourceId})`,
          detail: `${fallbackLibraryAsset.type} | bundled library`,
          summary: fallbackLibraryAsset.relativePath,
          compatibility: "Realmz resource",
          sourceState: "Preview from bundled library",
          entity: { type: "resource", id: fallbackLibraryAsset.id },
          previewPath: fallbackLibraryAsset.previewPath,
          previewMimeType: fallbackLibraryAsset.mimeType,
          libraryAsset: fallbackLibraryAsset
        };
      }
      return id > 0 ? soundReferenceOption(id) : null;
    }
    if (code === 27) {
      const pictureAsset = (project.assetCatalog.pictures ?? []).find((candidate) => candidate.resourceId === id);
      if (pictureAsset) {
        return {
          key: `resource:${pictureAsset.resourceType}:${pictureAsset.resourceId}`,
          value: pictureAsset.resourceId,
          label: `${pictureAsset.name || `${pictureAsset.resourceType.trim()} ${pictureAsset.resourceId}`} (${pictureAsset.resourceType.trim()} ${pictureAsset.resourceId})`,
          detail: `picture | ${pictureAsset.source}`,
          compatibility: "Realmz resource",
          sourceState: "Scenario resource",
          entity: { type: "resource", id: `resource:${pictureAsset.resourceType}:${pictureAsset.resourceId}` },
          previewPath: pictureAsset.previewPath
        };
      }
      const iconAsset = (project.assetCatalog.icons ?? []).find((candidate) => candidate.resourceId === id);
      if (iconAsset) {
        return {
          key: `resource:${iconAsset.resourceType}:${iconAsset.resourceId}`,
          value: iconAsset.resourceId,
          label: `${iconAsset.name || `${iconAsset.resourceType.trim()} ${iconAsset.resourceId}`} (${iconAsset.resourceType.trim()} ${iconAsset.resourceId})`,
          detail: `icon | ${iconAsset.source}`,
          compatibility: "Realmz resource",
          sourceState: "Scenario resource",
          entity: { type: "resource", id: `resource:${iconAsset.resourceType}:${iconAsset.resourceId}` },
          previewPath: iconAsset.previewPath
        };
      }
      if (id >= 30000) {
        return {
          key: `resource:PICT:${id}`,
          value: id,
          label: `Scenario Picture ${id}`,
          detail: "Realmz PICT reference",
          compatibility: "Realmz resource",
          sourceState: "No preview source loaded",
          entity: { type: "resource", id: `resource:PICT:${id}` },
          previewPath: null
        };
      }
    }
    const libraryAsset = (catalog?.assets ?? []).find((candidate) => candidate.resourceId === id && wantedKinds.has(candidate.type));
    if (libraryAsset) {
      const resourceType = libraryAsset.resourceType?.trim() || libraryAsset.type;
      return {
        key: libraryAsset.id,
        value: libraryAsset.resourceId!,
        label: `${libraryAsset.label} (${resourceType} ${libraryAsset.resourceId})`,
        detail: `${libraryAsset.type} | library catalog`,
        summary: libraryAsset.relativePath,
        compatibility: "Realmz resource",
        sourceState: "Imported library asset",
        entity: { type: "resource", id: libraryAsset.id },
        previewPath: libraryAsset.previewPath,
        previewMimeType: libraryAsset.mimeType,
        libraryAsset
      };
    }
  }
  return null;
}

function targetPreviewResourceType(option: ScriptTargetOption | null) {
  const managedType = option?.managedAsset?.resourceType?.trim();
  if (managedType) return managedType;
  const libraryType = option?.libraryAsset?.resourceType?.trim();
  if (libraryType) return libraryType;
  const entityId = option?.entity?.id ?? "";
  const match = entityId.match(/^resource:([^:]+):/);
  return match?.[1]?.trim() || "PICT";
}

function targetResourceIdMatches(opcode: number, availableId: number, requestedId: number) {
  if (availableId === requestedId) return true;
  return opcode === 9 && Math.abs(availableId) === Math.abs(requestedId);
}

function findCatalogResourceAsset(catalog: LibraryCatalog | null | undefined, resourceType: string, resourceId: number, wantedType?: string) {
  const normalizedType = resourceType.trim().toLowerCase();
  const absId = Math.abs(resourceId);
  return catalog?.assets.find((asset) => {
    if (asset.resourceId == null || Math.abs(asset.resourceId) !== absId) return false;
    if ((asset.resourceType ?? "").trim().toLowerCase() !== normalizedType) return false;
    return !wantedType || asset.type === wantedType;
  }) ?? null;
}

function soundReferenceOption(id: number): ScriptTargetOption {
  const compatible = isDivinityCompatibleSoundId(id);
  return {
    key: `resource:snd:${Math.abs(id)}`,
    value: Math.abs(id),
    label: divinitySoundReferenceLabel(id),
    detail: compatible ? "sound | built-in Realmz/Divinity reference" : "sound | Realmz snd reference",
    compatibility: compatible ? "Divinity-compatible sound ID" : "Realmz resource",
    sourceState: "Reference only; no preview source loaded",
    entity: { type: "resource", id: `resource:snd :${Math.abs(id)}` },
    previewPath: null,
    previewMimeType: "audio/wav"
  };
}

export function soundReferenceOptionForQuery(opcode: number, query: string) {
  if (normalizeStepOpcode(opcode) !== 9) return null;
  const match = query.trim().toLowerCase().match(/^(?:sound|snd)?\s*(-?\d+)$/);
  if (!match) return null;
  const id = Math.abs(Number(match[1]));
  if (!Number.isInteger(id) || id === 0) return null;
  return soundReferenceOption(id);
}

function addTypedProjectTargets(project: Project, code: number, options: ScriptTargetOption[], catalog?: LibraryCatalog | null) {
  if (code === 1) {
    const used = usageCounts(project, [1]);
    for (const record of project.messages ?? []) {
      options.push({ key: `message:${record.id}`, value: record.id, label: `String ${record.id}`, detail: record.text || "empty", summary: `${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "message", id: `message:${record.id}` } });
    }
  }
  if ([2, 48, 56, 107].includes(code)) {
    const used = usageCounts(project, [2, 48, 56, 107]);
    for (const record of project.battles ?? []) {
      options.push({ key: `battle:${record.id}`, value: record.id, label: `Battle ${record.id}`, detail: `${record.grid.filter(Boolean).length} monster slot(s)`, summary: `strings ${record.messageBefore}/${record.messageAfter}, battle action ${record.battleMacro}, ${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "battle", id: `battle:${record.id}` } });
    }
  }
  if (code === 127) {
    const used = usageCounts(project, [127]);
    for (const record of project.monsters ?? []) {
      options.push({
        key: `monster:${record.id}`,
        value: record.id,
        label: `${record.displayName || `Monster ${record.id}`} (${record.id})`,
        detail: `HD ${record.hitDice}, armor ${record.armor}, move ${record.movementMax}`,
        summary: `${record.items.filter(Boolean).length} item(s), ${record.spells.filter(Boolean).length} spell(s), ${used.get(record.id) ?? 0} script use(s)`,
        compatibility: "Editable",
        sourceState: record.authored ? "Authored" : "Imported",
        entity: { type: "monster", id: `monster:${record.id}` }
      });
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
      options.push({ key: `simple:${record.id}`, value: record.id, label: `Simple Encounter ${record.id}`, detail: `${record.actions.length} action(s), ${encounterPromptDetail(record.prompt)}`, summary: `${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "encounter", id: `encounter:simple:${record.id}` } });
    }
  }
  if ([5, 44].includes(code)) {
    const used = usageCounts(project, [5, 44]);
    for (const record of project.complexEncounters ?? []) {
      options.push({ key: `complex:${record.id}`, value: record.id, label: `Complex Encounter ${record.id}`, detail: `${record.actions.length} action(s), ${encounterPromptDetail(record.prompt)}`, summary: `${used.get(record.id) ?? 0} script use(s)`, compatibility: "Editable", sourceState: record.authored ? "Authored" : "Imported", entity: { type: "encounter", id: `encounter:complex:${record.id}` } });
    }
  }
  if (code === 47) {
    for (const quest of project.questLabels ?? []) {
      options.push({ key: `quest:${quest.id}`, value: quest.id, label: quest.label, detail: quest.note || "Quest metadata", entity: { type: "questFlag", id: `quest:${quest.id}` } });
    }
  }
}

function addPlayerMapTargets(project: Project, options: ScriptTargetOption[]) {
  const used = usageCounts(project, [29]);
  const seen = new Set<number>();
  for (const record of project.mapRecords ?? []) {
    if (record.id < 0 || record.id > 19) continue;
    seen.add(record.id);
    options.push(playerMapTargetOption(project, record, used));
  }
  for (let id = 0; id <= 19; id += 1) {
    if (seen.has(id)) continue;
    options.push(fallbackPlayerMapTargetOption(id, used.get(id) ?? 0));
  }
}

function playerMapTargetOption(project: Project, record: Project["mapRecords"][number], used: Map<number, number>): ScriptTargetOption {
  const primaryName = record.primaryName?.trim() || record.name?.trim() || `Player Map ${record.id}`;
  const secondaryName = record.secondaryName?.trim();
  const target = `${record.isDungeon ? "Dungeon" : "Land"} ${record.level} at ${record.startX},${record.startY}`;
  const display = playerMapTargetDisplay(record);
  const linkedTextPreview = record.pictId === 0 && record.show < 0 ? playerMapLinkedTextPreview(project, record.show) : "";
  const summaryParts = [
    secondaryName && secondaryName !== primaryName ? `Secondary: ${secondaryName}` : "",
    record.pictId === 0 && record.show < 0 ? `Opens TEXT ${record.show}` : "",
    linkedTextPreview,
    record.note?.trim() || "",
    `${used.get(record.id) ?? 0} script use(s)`
  ].filter(Boolean);
  return {
    key: `map-item:${record.id}`,
    value: record.id,
    label: `Map ${record.id}: ${primaryName}`,
    detail: `${target} | ${display}`,
    summary: summaryParts.join(" | "),
    compatibility: "Maps/Notes entry",
    sourceState: record.authored || record.mapNameAuthored ? "Authored" : "Imported",
    entity: selectEntityFromId(`map-record:${record.id}`)
  };
}

function fallbackPlayerMapTargetOption(id: number, used = 0): ScriptTargetOption {
  return {
    key: `map-item:${id}`,
    value: id,
    label: `Map ${id}`,
    detail: id === 0 ? "Maps/Notes entry | given automatically at adventure start" : "Maps/Notes entry",
    summary: `${used} script use(s)`,
    compatibility: "Maps/Notes entry"
  };
}

function playerMapTargetDisplay(record: Project["mapRecords"][number]) {
  if (record.pictId !== 0) return `PICT ${record.pictId}`;
  if (record.show < 0) return `opens TEXT ${record.show}`;
  return "Map view";
}

function playerMapLinkedTextPreview(project: Project, resourceId: number) {
  for (const asset of project.assets ?? []) {
    if ((asset.resourceType.trim() === "TEXT" || asset.kind === "text") && asset.resourceId === resourceId) {
      return decodeTextAssetPreview(asset) ?? "";
    }
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    if (textResourceOptionFromSemanticEntity(entity)?.value !== resourceId) continue;
    return typeof entity.summary.textPreview === "string" ? entity.summary.textPreview : "";
  }
  return "";
}

function addTextResourceTargets(project: Project, options: ScriptTargetOption[], catalog?: LibraryCatalog | null) {
  for (const asset of project.assets ?? []) {
    if (asset.resourceType.trim() !== "TEXT" && asset.kind !== "text") continue;
    options.push({
      key: asset.id,
      value: asset.resourceId,
      label: `${asset.label} (Scrolling Text ${asset.resourceId})`,
      detail: `scrolling TEXT | ${asset.exportState}`,
      summary: decodeTextAssetPreview(asset),
      entity: { type: "resource", id: asset.id },
      previewPath: asset.previewPath,
      previewMimeType: asset.mimeType,
      managedAsset: asset
    });
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    const option = textResourceOptionFromSemanticEntity(entity);
    if (option) options.push(option);
  }
  for (const asset of catalog?.assets ?? []) {
    if (asset.resourceId == null || asset.resourceType?.trim() !== "TEXT") continue;
    options.push({
      key: asset.id,
      value: asset.resourceId,
      label: `${asset.label} (Scrolling Text ${asset.resourceId})`,
      detail: "scrolling TEXT | library catalog",
      summary: asset.relativePath,
      compatibility: "Realmz TEXT resource",
      sourceState: "Imported library asset",
      entity: { type: "resource", id: asset.id },
      previewPath: asset.previewPath,
      previewMimeType: asset.mimeType,
      libraryAsset: asset
    });
  }
}

function textResourceOptionForId(project: Project, id: number, catalog?: LibraryCatalog | null): ScriptTargetOption | null {
  for (const asset of project.assets ?? []) {
    if ((asset.resourceType.trim() === "TEXT" || asset.kind === "text") && asset.resourceId === id) {
      return {
        key: asset.id,
        value: asset.resourceId,
        label: `${asset.label} (Scrolling Text ${asset.resourceId})`,
        detail: `scrolling TEXT | ${asset.exportState}`,
        summary: decodeTextAssetPreview(asset),
        entity: { type: "resource", id: asset.id },
        previewPath: asset.previewPath,
        previewMimeType: asset.mimeType,
        managedAsset: asset
      };
    }
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    const option = textResourceOptionFromSemanticEntity(entity);
    if (option?.value === id) return option;
  }
  for (const asset of catalog?.assets ?? []) {
    if (asset.resourceId == null || asset.resourceId !== id || asset.resourceType?.trim() !== "TEXT") continue;
    return {
      key: asset.id,
      value: asset.resourceId,
      label: `${asset.label} (Scrolling Text ${asset.resourceId})`,
      detail: "scrolling TEXT | library catalog",
      summary: asset.relativePath,
      compatibility: "Realmz TEXT resource",
      sourceState: "Imported library asset",
      entity: { type: "resource", id: asset.id },
      previewPath: asset.previewPath,
      previewMimeType: asset.mimeType,
      libraryAsset: asset
    };
  }
  return null;
}

function textResourceOptionFromSemanticEntity(entity: SemanticEntity): ScriptTargetOption | null {
  if (entity.type !== "resource") return null;
  const resourceType = String(entity.summary.type ?? entity.summary.resourceType ?? "").trim();
  if (resourceType !== "TEXT") return null;
  const resourceId = semanticResourceId(entity);
  if (resourceId == null) return null;
  return {
    key: entity.id,
    value: resourceId,
    label: `${entity.label || `Scrolling Text ${resourceId}`} (Scrolling Text ${resourceId})`,
    detail: `scrolling TEXT | ${entity.source}`,
    summary: typeof entity.summary.textPreview === "string" ? entity.summary.textPreview : undefined,
    compatibility: "Realmz TEXT resource",
    sourceState: entity.editState === "editable" ? "Scenario resource" : "Reference resource",
    entity: selectEntityFromId(entity.id),
    previewMimeType: "text/plain"
  };
}

function decodeTextAssetPreview(asset: Project["assets"][number]) {
  for (const value of [asset.resourcePath, asset.previewPath, asset.originalPath]) {
    const text = decodeTextDataUrlPreview(value);
    if (text) return text.slice(0, 240);
  }
  return undefined;
}

function decodeTextDataUrlPreview(value: string | null | undefined) {
  if (!value?.startsWith("data:")) return "";
  const comma = value.indexOf(",");
  if (comma < 0) return "";
  try {
    const metadata = value.slice(0, comma).toLowerCase();
    const payload = value.slice(comma + 1);
    if (!metadata.includes(";base64")) return decodeURIComponent(payload);
    const binary = atob(payload);
    let text = "";
    for (let index = 0; index < binary.length; index += 1) text += String.fromCharCode(binary.charCodeAt(index));
    return text;
  } catch {
    return "";
  }
}

function semanticResourceId(entity: SemanticEntity) {
  for (const key of ["resourceId", "id", "index"]) {
    const value = entity.summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return trailingNumber(entity.id);
}

function usageCounts(project: Project, opcodes: number[]) {
  const codes = new Set(opcodes);
  const counts = new Map<number, number>();
  for (const trigger of project.triggers) {
    for (const action of trigger.actions) {
      const code = normalizeStepOpcode(action.rawCode);
      if (!codes.has(code)) continue;
      const id = resolveSignedTargetValue(code, action.id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function filterTargetOptions(options: ScriptTargetOption[], query: string) {
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

function targetOptionTitle(option: ScriptTargetOption) {
  return [option.label, option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ");
}

function targetPickerSelectedDetail(option: ScriptTargetOption, opcode: number, behavior: string) {
  return [
    targetPickerVisibleDetail(option, opcode),
    option.summary,
    behavior,
    option.compatibility,
    option.sourceState
  ].filter(Boolean).join(" | ");
}

function targetPickerSearchResultDetail(option: ScriptTargetOption, opcode: number) {
  return [
    targetPickerVisibleDetail(option, opcode),
    option.summary,
    option.compatibility,
    option.sourceState
  ].filter(Boolean).join(" | ");
}

function targetPickerVisibleDetail(option: ScriptTargetOption, opcode: number) {
  const detail = option.detail.trim();
  if (!detail) return "";
  if (opcode === 9 && targetPickerSoundDetailIsGeneric(detail)) return "";
  return detail;
}

function targetPickerSoundDetailIsGeneric(detail: string) {
  const normalized = detail.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "library sound reference" ||
    normalized === "built-in realmz/divinity sound reference" ||
    normalized === "raw sound reference";
}

function createTargetButtonLabel(recordType: RealmzTargetRecordKind, id?: number) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "String",
    battle: "Battle",
    monster: "Monster",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
    thiefEncounter: "Rogue Encounter",
    timedEncounter: "Time Encounter",
    questLabel: "Quest Label"
  };
  return id != null ? `Create ${labels[recordType]} ${id}` : `Create Next ${labels[recordType]}`;
}

function entityMatchesOpcodeTarget(entity: SemanticEntity, code: number) {
  if (code === 9 && entity.type === "resource") return String(entity.summary.type ?? "").trim() === "snd";
  if (code === 62 && entity.type === "resource") return String(entity.summary.type ?? entity.summary.resourceType ?? "").trim() === "TEXT";
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
    9: ["sound", "resource"],
    10: ["treasure"],
    27: ["picture", "resource"],
    29: ["map", "map record"],
    35: ["simple encounter"],
    39: ["macro"],
    44: ["complex encounter"],
    47: ["quest flag"],
    48: ["battle"],
    49: ["shop"],
    56: ["battle"],
    62: ["resource"],
    97: ["map", "map record"],
    104: ["simple encounter"],
    107: ["battle"],
    127: ["monster"]
  };
  return types[code] ?? [];
}

export function isDirectMacroOpcode(code: number) {
  return code === 39;
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
  const seenKeys = new Set<string>();
  const byValue = new Map<number, ScriptTargetOption>();
  for (const option of options) {
    if (seenKeys.has(option.key)) continue;
    seenKeys.add(option.key);
    const existing = byValue.get(option.value);
    if (!existing || targetOptionScore(option) > targetOptionScore(existing)) {
      byValue.set(option.value, option);
    }
  }
  return [...byValue.values()];
}

function targetOptionScore(option: ScriptTargetOption) {
  let score = 0;
  if (option.previewPath || option.libraryAsset || option.managedAsset) score += 8;
  if (option.compatibility) score += 3;
  if (option.sourceState) score += 2;
  if (option.entity && option.entity.type !== "resource") score += 1;
  return score;
}

