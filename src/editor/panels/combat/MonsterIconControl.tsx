import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, MonsterRecord, Project } from "../../types";
import type { CombatLookups } from "./combatLookups";
import { IconPairPreview } from "./IconPairResources";
import { monsterIconPickerOptions, monsterIconSourceStatusLabel } from "./iconSetModel";
import { MonsterIcon, resolveMonsterIcon } from "./MonsterIconPreview";

export function MonsterIconControl({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  onCommit,
  onOpenIconSet
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (iconId: number) => void;
  onOpenIconSet?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const statusLabel = monsterIconSourceStatusLabel(resolution.sourceStatus);
  const canPickTargetIcon = Boolean(onOpenIconSet);
  const iconTitle = `${canPickTargetIcon ? "Choose monster icon" : "Monster icon"} (${statusLabel}: ${resolution.label})`;
  const showSourceBadge = resolution.sourceStatus !== "default-art";
  const preview = <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />;
  return (
    <div className="monster-icon-control">
      {canPickTargetIcon ? (
        <button
          type="button"
          className="monster-icon-button"
          onClick={() => setPickerOpen(true)}
          title={iconTitle}
          aria-label="Choose monster icon"
        >
          {preview}
        </button>
      ) : <span title={iconTitle}>{preview}</span>}
      {showSourceBadge ? (
        <span className={`monster-icon-source-badge ${resolution.sourceStatus}`} title={resolution.label}>
          {statusLabel}
        </span>
      ) : null}
      {canPickTargetIcon ? (
        <MonsterIconPickerModal
          open={pickerOpen}
          currentIconId={Math.abs(monster.iconId)}
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelect={onCommit}
          onOpenIconSet={onOpenIconSet}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MonsterIconPickerModal({
  open,
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  open: boolean;
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <MonsterIconPickerDialog
      currentIconId={currentIconId}
      project={project}
      iconEntries={iconEntries}
      lookups={lookups}
      previewContext={previewContext}
      query={query}
      onQuery={setQuery}
      onSelect={onSelect}
      onOpenIconSet={onOpenIconSet}
      onClose={onClose}
    />
  );
}

function MonsterIconPickerDialog({
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  query,
  onQuery,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => monsterIconPickerOptions(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [
        String(option.baseId),
        `icon ${option.baseId}`,
        option.sourceLabel,
        monsterIconSourceStatusLabel(option.sourceStatus)
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);
  return (
    <div className="monster-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="monster-icon-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-icon-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="monster-icon-picker-header">
          <div>
            <h3 id="monster-icon-picker-title">Choose Monster Icon</h3>
          </div>
          <div className="monster-icon-picker-actions">
            {onOpenIconSet ? (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  onClose();
                  onOpenIconSet();
                }}
              >
                Open Icon Set
              </button>
            ) : null}
            <button type="button" className="btn btn-icon btn-xs" aria-label="Close icon picker" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <input
          className="monster-icon-picker-search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          placeholder="Search icon ID or source..."
          autoFocus
        />
        <div className="monster-icon-picker-grid" role="listbox" aria-label="Scenario monster icon targets">
          {filteredOptions.map((option) => {
            const selected = option.baseId === currentIconId;
            return (
              <button
                key={option.key}
                type="button"
                className={`monster-icon-picker-option${selected ? " selected" : ""}`}
                aria-selected={selected}
                role="option"
                onClick={() => {
                  onSelect(option.baseId);
                  onClose();
                }}
              >
                <IconPairPreview baseAsset={option.asset} pairedAsset={option.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>Icon {option.baseId}</strong>
                  <small>{monsterIconSourceStatusLabel(option.sourceStatus)}</small>
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 ? <p className="empty-copy compact">No scenario target icons match that search.</p> : null}
        </div>
      </section>
    </div>
  );
}
