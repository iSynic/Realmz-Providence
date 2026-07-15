import { ReactNode, useEffect, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { TutorialTip } from "../../components/TutorialTip";
import { LibraryAsset, LibraryCatalog, ScenarioCasteOverride, ScenarioRaceOverride } from "../../types";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_ATTRIBUTES } from "../../rulesCatalog";
import { fastplotTileId, spellAnimationFrameIds, spellAnimationHint, spellAnimationIsBlank, SpellAnimationZeroMode } from "../../resourceIds";
import { findLibraryResourceAsset } from "../../resourceResolver";
import { capitalize, classNames, victoryPointLabels } from "./ruleUtils";
import { RulesRecordPicker, rulesRecordPickerOptions } from "./RulesRecordPicker";

type TutorialSide = "right" | "left" | "below" | "above";

function HelpLabel({ label, help, side = "below" }: { label: string; help?: string; side?: TutorialSide }) {
  if (!help) return <span>{label}</span>;
  return (
    <TutorialTip title={label} body={help} side={side}>
      <span>{label}</span>
    </TutorialTip>
  );
}

export function RulesLayout<T extends { id: number }>({
  title,
  note,
  records,
  fallbackEntityType,
  catalog,
  selectedId,
  onSelect,
  onCreate,
  onClear,
  maxRecords,
  labelFor,
  summaryFor,
  fallbackLabelFor,
  fallbackSummaryFor,
  recordNoun,
  createLabel,
  createHelp,
  createDisabled = false,
  secondaryCreateLabel,
  secondaryCreateHelp,
  secondaryCreateDisabled = false,
  onSecondaryCreate,
  showGoToField = true,
  showCreateButton = true,
  pickerLabel,
  children
}: {
  title: string;
  note: string;
  records: T[];
  fallbackEntityType: string;
  catalog: LibraryCatalog | null;
  selectedId: number;
  onSelect: (id: number) => void;
  onCreate: (id: number) => void;
  onClear: (id: number) => void;
  maxRecords: number;
  labelFor: (record: T) => string;
  summaryFor: (record: T) => string;
  fallbackLabelFor: (id: number) => string;
  fallbackSummaryFor: (id: number) => string;
  recordNoun: string;
  createLabel?: string;
  createHelp?: string;
  createDisabled?: boolean;
  secondaryCreateLabel?: string;
  secondaryCreateHelp?: string;
  secondaryCreateDisabled?: boolean;
  onSecondaryCreate?: () => void;
  showGoToField?: boolean;
  showCreateButton?: boolean;
  pickerLabel?: string;
  children: ReactNode;
}) {
  const libraryCount = catalog?.entities.filter((entity) => entity.type === fallbackEntityType).length ?? 0;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;
  const selectedIsScenario = selectedRecord ? entryHasScenarioVersion(selectedRecord) : false;
  const scenarioCount = records.filter(entryHasScenarioVersion).length;
  const selectedLabel = selectedRecord ? labelFor(selectedRecord) : fallbackLabelFor(selectedId);
  const selectedSummary = selectedRecord ? summaryFor(selectedRecord) : fallbackSummaryFor(selectedId);
  const previousId = selectedId <= 0 ? maxRecords - 1 : selectedId - 1;
  const nextId = selectedId >= maxRecords - 1 ? 0 : selectedId + 1;
  const help = rulesFamilyHelp(recordNoun);
  const customizeHelp = createHelp ?? `Create or update this scenario's ${recordNoun.toLowerCase()} override. The shared Realmz ${recordNoun.toLowerCase()} table remains the reference source.`;
  const clearHelp = `Remove this scenario's ${recordNoun.toLowerCase()} override and fall back to the shared Realmz ${recordNoun.toLowerCase()} definition.`;
  const recordPickerOptions = rulesRecordPickerOptions(Array.from({ length: maxRecords }, (_, id) => {
    const record = records.find((candidate) => candidate.id === id);
    const label = record ? labelFor(record) : `${id}: ${fallbackLabelFor(id)}`;
    const summary = record ? summaryFor(record) : fallbackSummaryFor(id);
    const status = record && entryHasScenarioVersion(record) ? "Scenario custom" : "Reference/default";
    return { id, label, detail: `${summary} | ${status}`, searchText: status };
  }));
  return (
    <div className="rules-layout rules-layout-single">
      <section className="rules-selector">
        <div className="rules-selector-title">
          <div>
            <h2>
              <TutorialTip title={title} body={help} side="right">
                <span>{title}</span>
              </TutorialTip>
            </h2>
            <p>{note}</p>
          </div>
          <small>{scenarioCount} scenario custom, {libraryCount} built-in reference(s)</small>
        </div>
        <div className={classNames("rules-record-picker", !showGoToField && "rules-record-picker-compact")}>
          <div className="rules-step-buttons" aria-label={`Step through ${recordNoun.toLowerCase()} records`}>
            <button type="button" className="btn btn-secondary btn-xs" title={`Previous ${recordNoun.toLowerCase()}`} onClick={() => onSelect(previousId)}>‹</button>
            <button type="button" className="btn btn-secondary btn-xs" title={`Next ${recordNoun.toLowerCase()}`} onClick={() => onSelect(nextId)}>›</button>
          </div>
          {showGoToField && (
            <label>
              <HelpLabel label={`Go To ${recordNoun}`} help={`Jump to a fixed ${recordNoun.toLowerCase()} table slot. Realmz keeps ${recordNoun.toLowerCase()} IDs dense, so the number is part of the scenario contract.`} />
              <input
                type="number"
                min={0}
                max={maxRecords - 1}
                value={selectedId}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (Number.isInteger(next) && next >= 0 && next < maxRecords) onSelect(next);
                }}
              />
            </label>
          )}
          <RulesRecordPicker
            label={pickerLabel ?? recordNoun}
            help={`Select a ${recordNoun.toLowerCase()} record.`}
            options={recordPickerOptions}
            value={selectedId}
            placeholder={`Search ${recordNoun.toLowerCase()} # or name...`}
            storageKey={`rules.${recordNoun.toLowerCase()}.picker.position`}
            onChange={onSelect}
          />
          {showCreateButton && (
            <button type="button" className="btn btn-primary btn-xs" title={customizeHelp} disabled={selectedIsScenario || createDisabled} onClick={() => onCreate(selectedId)}>
              {createLabel ?? "Customize In This Scenario"}
            </button>
          )}
          {secondaryCreateLabel && onSecondaryCreate && (
            <button type="button" className="btn btn-secondary btn-xs" title={secondaryCreateHelp} disabled={secondaryCreateDisabled} onClick={onSecondaryCreate}>
              {secondaryCreateLabel}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger btn-xs"
            title={clearHelp}
            disabled={!selectedIsScenario}
            onClick={() => selectedRecord && onClear(selectedId)}
          >
            Clear Scenario Custom
          </button>
        </div>
        <div className="rules-selected-summary">
          <strong>{selectedLabel}</strong>
          <span>{selectedSummary}</span>
          <b>{selectedIsScenario ? "Scenario custom" : "Built-in Realmz"}</b>
        </div>
      </section>
      <main className="rules-detail">
        {children}
      </main>
    </div>
  );
}

function entryHasScenarioVersion(record: unknown) {
  return typeof record === "object" && record !== null && "hasScenarioVersion" in record && Boolean((record as { hasScenarioVersion?: boolean }).hasScenarioVersion);
}

function rulesFamilyHelp(recordNoun: string) {
  if (recordNoun === "Race") return "Realmz normally uses the shared race table. Customizing a race creates or updates this scenario's Data Race override for that race ID.";
  if (recordNoun === "Caste") return "Realmz normally uses the shared caste table. Customizing a caste creates or updates this scenario's Data Caste override for that caste ID.";
  return "Rules data is shared by default and scenario-local only when an override exists.";
}

export function RuleSection({ title, badge, help, wide = false, children }: { title: string; badge: string; help?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={classNames("rules-section", wide && "rules-section-wide")}>
      <header title={help}>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : (
          <span>{title}</span>
        )}
        <b>{badge}</b>
      </header>
      <div className="rules-field-grid">{children}</div>
    </section>
  );
}

export function EmptyRulesState({ label, selectedLabel, onCreate }: { label: string; selectedLabel: string; onCreate: () => void }) {
  return (
    <div className="scenario-empty-state rules-empty-state">
      <p>{selectedLabel} is currently using the shared Realmz definition.</p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>Create Scenario {capitalize(label)}</button>
    </div>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  wide = false,
  span = false,
  disabled = false,
  maxLength,
  help
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  wide?: boolean;
  span?: boolean;
  disabled?: boolean;
  maxLength?: number;
  help?: string;
}) {
  const commit = (next: string) => {
    if (!disabled && next !== value) onCommit(next);
  };
  return (
    <label className={classNames("scenario-field", wide && "scenario-field-wide", span && "rules-field-span")} title={help}>
      <HelpLabel label={label} help={help} />
      {wide ? (
        <textarea
          key={value}
          defaultValue={value}
          disabled={disabled}
          maxLength={maxLength}
          rows={3}
          onBlur={(event) => commit(event.currentTarget.value)}
        />
      ) : (
        <input
          key={value}
          type="text"
          defaultValue={value}
          disabled={disabled}
          maxLength={maxLength}
          onBlur={(event) => commit(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

export function NumberField({ label, value, onCommit, disabled = false, compact = false, longLabel = false, hint, help }: { label: string; value: number; onCommit?: (value: number) => void; disabled?: boolean; compact?: boolean; longLabel?: boolean; hint?: string; help?: string }) {
  return (
    <label className={classNames("scenario-field", compact && "rules-field-compact", longLabel && "rules-field-long-label")} title={help}>
      <HelpLabel label={label} help={help} />
      <input
        key={value}
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (!disabled && Number.isFinite(next) && next !== value) onCommit?.(next);
        }}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function SelectField({ label, value, options, onCommit, disabled = false, help }: { label: string; value: number; options: string[]; onCommit: (value: number) => void; disabled?: boolean; help?: string }) {
  return (
    <label className="scenario-field rules-field-medium" title={help}>
      <HelpLabel label={label} help={help} />
      <select value={value} disabled={disabled} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        {options.map((option, index) => <option key={option} value={index}>{index} - {option}</option>)}
      </select>
    </label>
  );
}

export function CheckboxField({ label, checked, onCommit, disabled = false, help }: { label: string; checked: boolean; onCommit: (value: boolean) => void; disabled?: boolean; help?: string }) {
  return (
    <label className="rules-checkbox-field" title={help}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onCommit(event.currentTarget.checked)} />
      <HelpLabel label={label} help={help} />
    </label>
  );
}

export function SpellAnimationIconField({
  label,
  value,
  assets,
  onCommit,
  disabled = false,
  zeroMode,
  help
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  onCommit: (value: number) => void;
  disabled?: boolean;
  zeroMode: SpellAnimationZeroMode;
  help?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const draftNumber = Number(draft);
  const previewValue = draft.trim() !== "" && Number.isFinite(draftNumber) ? draftNumber : value;
  const range = spellAnimationIconRange(previewValue, zeroMode);
  const frameAssets = range.frameIconIds.map((iconId) => findLibraryResourceAsset(assets, "cicn", iconId, "icon"));
  const previews = useRuleIconPreviews(frameAssets);
  const preview = useAnimatedPreview(previews);
  const title = [help, range.hint].filter(Boolean).join("\n");
  return (
    <label className="scenario-field rules-icon-number" title={title}>
      <HelpLabel label={label} help={help} />
      <div>
        {preview ? (
          <span className="rules-animation-preview">
            <img src={preview} alt={`${label} animation`} />
          </span>
        ) : range.blank ? <span className="rules-blank-icon-preview" aria-hidden="true" /> : <b>{value || "-"}</b>}
        <input
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!disabled && Number.isFinite(next) && next !== value) onCommit(next);
            else setDraft(String(value));
          }}
        />
      </div>
    </label>
  );
}

export function FastplotTileNumberField({
  label,
  value,
  atlasUrl,
  onCommit,
  disabled = false,
  help
}: {
  label: string;
  value: number;
  atlasUrl: string | null;
  onCommit: (value: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const draftNumber = Number(draft);
  const previewValue = draft.trim() !== "" && Number.isFinite(draftNumber) ? draftNumber : value;
  const tile = fastplotTileId(previewValue);
  const rect = tile === null ? null : fastplotTileRect(tile);
  const hint = tile ? `Combat tile ${tile}` : "No queued spell icon";
  const style = atlasUrl && rect ? {
    backgroundImage: `url(${atlasUrl})`,
    backgroundSize: "2000% 2000%",
    backgroundPosition: `${(rect.column / 19) * 100}% ${(rect.row / 19) * 100}%`
  } : undefined;
  return (
    <label className="scenario-field rules-icon-number" title={[help, hint].filter(Boolean).join("\n")}>
      <HelpLabel label={label} help={help} />
      <div>
        {style ? <span className="rules-fastplot-preview" style={style} aria-hidden="true" /> : <b>{value || "-"}</b>}
        <input
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!disabled && Number.isFinite(next) && next !== value) onCommit(next);
            else setDraft(String(value));
          }}
        />
      </div>
    </label>
  );
}

export function IconNumberField({
  label,
  value,
  assets,
  onCommit,
  disabled = false,
  iconId,
  assetPreference,
  hint,
  compact = false,
  help
}: {
  label: string;
  value: number;
  assets: LibraryAsset[];
  onCommit: (value: number) => void;
  disabled?: boolean;
  iconId?: ((value: number) => number) | null;
  assetPreference?: (asset: LibraryAsset) => boolean;
  hint?: (value: number) => string;
  compact?: boolean;
  help?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const parsedDraft = Number(draft);
  const previewValue = Number.isFinite(parsedDraft) ? parsedDraft : value;
  const resolvedIconId = iconId === null ? null : iconId ? iconId(previewValue) : previewValue;
  const asset = resolvedIconId === null ? null : findLibraryResourceAsset(assets, "cicn", resolvedIconId, "icon", assetPreference);
  const preview = useRuleIconPreview(asset);
  return (
    <label className={classNames("scenario-field", "rules-icon-number", compact && "rules-icon-number-compact")} title={help}>
      <HelpLabel label={label} help={help} />
      <div>
        {preview ? <img src={preview} alt={`${label} ${resolvedIconId}`} /> : <b>{previewValue || "-"}</b>}
        <input
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!disabled && Number.isFinite(next) && next !== value) onCommit(next);
            else setDraft(String(value));
          }}
        />
      </div>
      <small>{hint ? hint(previewValue) : resolvedIconId !== null ? `cicn ${resolvedIconId}` : "Combat tile preview pending"}</small>
    </label>
  );
}

export function spellAnimationIconRange(value: number, zeroMode: SpellAnimationZeroMode) {
  const frameIconIds = spellAnimationFrameIds(value, zeroMode);
  return {
    blank: spellAnimationIsBlank(value, zeroMode),
    frameIconIds,
    hint: spellAnimationHint(value, zeroMode)
  };
}

export function fastplotTileRect(tile: number) {
  const normalized = tile > 999 ? tile - 1000 : tile;
  const tileGroup = Math.floor((normalized - 1) / 20);
  const column = normalized - tileGroup * 20 - 1;
  return { column, row: tileGroup };
}

export function useRuleIconPreview(asset: LibraryAsset | null) {
  const [preview, setPreview] = useState<string | null>(asset?.previewPath ?? null);
  useEffect(() => {
    let disposed = false;
    if (!asset) {
      setPreview(null);
      return;
    }
    setPreview(asset.previewPath ?? null);
    loadBrowserBundledLibraryAssetPreview(asset).then((url) => {
      if (!disposed) setPreview(url ?? asset.previewPath ?? null);
    }).catch(() => {
      if (!disposed) setPreview(asset.previewPath ?? null);
    });
    return () => {
      disposed = true;
    };
  }, [asset]);
  return preview;
}

export function useRuleIconPreviews(assets: Array<LibraryAsset | null>) {
  const [previews, setPreviews] = useState<string[]>([]);
  const key = assets.map((asset) => asset ? `${asset.resourceType}:${asset.resourceId}:${asset.relativePath ?? ""}` : "none").join("|");
  useEffect(() => {
    let disposed = false;
    setPreviews([]);
    const load = async () => {
      const urls = await Promise.all(assets.map(async (asset) => {
        if (!asset) return null;
        if (asset.previewPath) return asset.previewPath;
        try {
          return await loadBrowserBundledLibraryAssetPreview(asset);
        } catch {
          return asset.previewPath ?? null;
        }
      }));
      if (!disposed) setPreviews(urls.filter((url): url is string => Boolean(url)));
    };
    load();
    return () => {
      disposed = true;
    };
  }, [key]);
  return previews;
}

export function useAnimatedPreview(previews: string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (previews.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % previews.length);
    }, 180);
    return () => window.clearInterval(timer);
  }, [previews]);
  return previews[index] ?? null;
}

export function PairGrid({ labels, values, leftLabel, rightLabel, columns = 1, onChange }: { labels: string[]; values: number[]; leftLabel: string; rightLabel: string; columns?: number; onChange: (values: number[]) => void }) {
  if (columns > 1) {
    const rowsPerColumn = Math.ceil(labels.length / columns);
    return (
      <div className="rules-pair-grid rules-pair-grid-split" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, columnIndex) => {
          const start = columnIndex * rowsPerColumn;
          const columnLabels = labels.slice(start, start + rowsPerColumn);
          return (
            <div className="rules-pair-column" key={columnIndex}>
              <b></b><b>{leftLabel}</b><b>{rightLabel}</b>
              {columnLabels.map((label, index) => {
                const valueIndex = start + index;
                return (
                  <RowPair key={label} label={label} left={values[valueIndex * 2] ?? 0} right={values[valueIndex * 2 + 1] ?? 0} onChange={(left, right) => {
                    const next = [...values];
                    next[valueIndex * 2] = left;
                    next[valueIndex * 2 + 1] = right;
                    onChange(next);
                  }} />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="rules-pair-grid">
      <b></b><b>{leftLabel}</b><b>{rightLabel}</b>
      {labels.map((label, index) => (
        <RowPair key={label} label={label} left={values[index * 2] ?? 0} right={values[index * 2 + 1] ?? 0} onChange={(left, right) => {
          const next = [...values];
          next[index * 2] = left;
          next[index * 2 + 1] = right;
          onChange(next);
        }} />
      ))}
    </div>
  );
}

export function RowPair({ label, left, right, onChange }: { label: string; left: number; right: number; onChange: (left: number, right: number) => void }) {
  return (
    <>
      <span>{label}</span>
      <input type="number" defaultValue={left} onBlur={(event) => onChange(Number(event.currentTarget.value), right)} />
      <input type="number" defaultValue={right} onBlur={(event) => onChange(left, Number(event.currentTarget.value))} />
    </>
  );
}

export function ArrayFields({ title, labels, values, onChange, compact = false }: { title: string; labels: string[]; values: number[]; onChange: (values: number[]) => void; compact?: boolean }) {
  return (
    <div className={compact ? "rules-array compact" : "rules-array"}>
      <strong>{title}</strong>
      {labels.map((label, index) => (
        <label key={`${title}:${label}`}>
          <span>{label}</span>
          <input type="number" defaultValue={values[index] ?? 0} onBlur={(event) => {
            const next = [...values];
            next[index] = Number(event.currentTarget.value);
            onChange(next);
          }} />
        </label>
      ))}
    </div>
  );
}

export function CheckboxMatrix({ labels, values, onChange }: { labels: string[]; values: number[]; onChange: (values: number[]) => void }) {
  return (
    <div className="rules-checkbox-grid">
      {Array.from({ length: 30 }, (_, index) => {
        const label = labels[index] ?? `Unused ${index + 1}`;
        const checked = (values[index] ?? 0) !== 0;
        return (
          <label key={index} className={index >= labels.length ? "is-unused" : ""}>
            <input type="checkbox" checked={checked} disabled={index >= labels.length} onChange={(event) => {
              const next = [...values];
              next[index] = event.currentTarget.checked ? 1 : 0;
              onChange(next);
            }} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function BitsetEditor({ labels, values, onChange }: { labels: string[]; values: number[]; onChange: (values: number[]) => void }) {
  return (
    <div className="rules-checkbox-grid">
      {labels.map((label, index) => {
        const word = Math.floor(index / 32);
        const bit = index % 32;
        const checked = Boolean((values[word] ?? 0) & (1 << bit));
        return (
          <label key={label}>
            <input type="checkbox" checked={checked} onChange={(event) => {
              const next = [...values];
              const current = next[word] ?? 0;
              next[word] = event.currentTarget.checked ? current | (1 << bit) : current & ~(1 << bit);
              onChange(next);
            }} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function MatrixFields({ rows, columns, values, onChange }: { rows: string[]; columns: string[]; values: number[][]; onChange: (values: number[][]) => void }) {
  return (
    <div className="rules-matrix" style={{ gridTemplateColumns: `minmax(90px, 1fr) repeat(${columns.length}, minmax(70px, 1fr))` }}>
      <b></b>
      {columns.map((column) => <b key={column}>{column}</b>)}
      {rows.map((row, rowIndex) => (
        <MatrixRow key={row} row={row} rowIndex={rowIndex} columns={columns} values={values} onChange={onChange} />
      ))}
    </div>
  );
}

export function MatrixRow({ row, rowIndex, columns, values, onChange }: { row: string; rowIndex: number; columns: string[]; values: number[][]; onChange: (values: number[][]) => void }) {
  return (
    <>
      <span>{row}</span>
      {columns.map((column, columnIndex) => (
        <input key={`${row}:${column}`} type="number" defaultValue={values[rowIndex]?.[columnIndex] ?? 0} onBlur={(event) => {
          const next = values.map((rowValues) => [...rowValues]);
          while (next.length <= rowIndex) next.push([]);
          next[rowIndex][columnIndex] = Number(event.currentTarget.value);
          onChange(next);
        }} />
      ))}
    </>
  );
}

type CasteProgressionKey = "stamina" | "strength" | "dodge" | "toHit" | "missile" | "hand2Hand";

export const CASTE_PROGRESSION_ROWS: Array<{ key: CasteProgressionKey; label: string; left: string; right: string }> = [
  { key: "stamina", label: "Stamina", left: "Start", right: "Level Up" },
  { key: "strength", label: "Strength Damage Bonus", left: "Start", right: "Max" },
  { key: "dodge", label: "Dodge Missile", left: "Bonus", right: "Level Up" },
  { key: "toHit", label: "Melee ToHit", left: "Start", right: "Level Up" },
  { key: "missile", label: "Missile ToHit", left: "Start", right: "Level Up" },
  { key: "hand2Hand", label: "Hand To Hand", left: "Start", right: "Level Up" }
];

export function CasteProgressionGrid({ record, onChange }: { record: ScenarioCasteOverride; onChange: (changes: Partial<ScenarioCasteOverride>) => void }) {
  return (
    <div className="rules-progress-grid">
      <strong>Special Ability Progression</strong>
      {CASTE_PROGRESSION_ROWS.map((row) => {
        const values = record[row.key] ?? [];
        return (
          <section key={row.key}>
            <b>{row.label}</b>
            <label>
              <span>{row.left}</span>
              <input type="number" defaultValue={values[0] ?? 0} onBlur={(event) => {
                onChange({ [row.key]: [Number(event.currentTarget.value), values[1] ?? 0] } as Partial<ScenarioCasteOverride>);
              }} />
            </label>
            <label>
              <span>{row.right}</span>
              <input type="number" defaultValue={values[1] ?? 0} onBlur={(event) => {
                onChange({ [row.key]: [values[0] ?? 0, Number(event.currentTarget.value)] } as Partial<ScenarioCasteOverride>);
              }} />
            </label>
          </section>
        );
      })}
    </div>
  );
}

export function VictoryPointsGrid({ values, onChange }: { values: number[]; onChange: (values: number[]) => void }) {
  const labels = victoryPointLabels();
  return (
    <div className="rules-victory-grid">
      <strong>Points Required</strong>
      {labels.map((label, index) => (
        <label key={label}>
          <span>{label}</span>
          <input type="number" defaultValue={values[index] ?? 0} onBlur={(event) => {
            const next = [...values];
            next[index] = Number(event.currentTarget.value);
            onChange(next);
          }} />
        </label>
      ))}
    </div>
  );
}

export function AgeBands({ record, onChange }: { record: ScenarioRaceOverride; onChange: (ageRange: number[][], ageChange: number[][]) => void }) {
  const labels = ["Youth", "Young", "Prime", "Adult", "Senior"];
  return (
    <div className="rules-age-grid">
      {labels.map((label, band) => (
        <section key={label}>
          <strong>{label}</strong>
          <div className="rules-age-range">
            <label>
              <span>Age Min</span>
              <input type="number" defaultValue={record.ageRange[band]?.[0] ?? 0} onBlur={(event) => {
                const ageRange = record.ageRange.map((range) => [...range]);
                ageRange[band] = [Number(event.currentTarget.value), record.ageRange[band]?.[1] ?? 0];
                onChange(ageRange, record.ageChange);
              }} />
            </label>
            <label>
              <span>Age Max</span>
              <input type="number" defaultValue={record.ageRange[band]?.[1] ?? 0} onBlur={(event) => {
                const ageRange = record.ageRange.map((range) => [...range]);
                ageRange[band] = [record.ageRange[band]?.[0] ?? 0, Number(event.currentTarget.value)];
                onChange(ageRange, record.ageChange);
              }} />
            </label>
          </div>
          {RACE_ATTRIBUTES.map((attribute, index) => (
            <label key={attribute}>
              <span>{attribute}</span>
              <input type="number" defaultValue={record.ageChange[band]?.[index] ?? 0} onBlur={(event) => {
                const ageChange = record.ageChange.map((range) => [...range]);
                while (ageChange.length <= band) ageChange.push([]);
                ageChange[band][index] = Number(event.currentTarget.value);
                onChange(record.ageRange, ageChange);
              }} />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
