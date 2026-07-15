import { useMemo } from "react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, MonsterRecord, Project } from "../../types";
import {
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import type { CombatLookups } from "./combatLookups";
import { IconPairPreview } from "./IconPairResources";
import {
  monsterIconPickerOptions,
  monsterIconSourceStatusLabel,
  type MonsterIconPickerOption
} from "./iconSetModel";
import { MonsterIcon, resolveMonsterIcon } from "./MonsterIconPreview";

export function monsterIconReferenceOptions(
  options: MonsterIconPickerOption[],
  previewContext: PreviewRuntimeContext
): ReferencePickerOption<number>[] {
  return options.map((option) => {
    const status = monsterIconSourceStatusLabel(option.sourceStatus);
    return {
      key: option.key,
      value: option.baseId,
      label: `Icon ${option.baseId}`,
      detail: `${status} | ${option.sourceLabel}`,
      searchText: `${option.baseId} icon cicn ${status} ${option.sourceLabel}`,
      preview: {
        kind: "custom",
        key: `monster-icon-pair:${option.baseId}`,
        title: `Icon ${option.baseId}`,
        content: (
          <IconPairPreview
            baseAsset={option.asset}
            pairedAsset={option.pairedAsset}
            previewContext={previewContext}
          />
        )
      }
    };
  });
}

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
  const targets = useMemo(
    () => monsterIconPickerOptions(project, lookups, iconEntries),
    [iconEntries, lookups, project]
  );
  const options = useMemo(
    () => monsterIconReferenceOptions(targets, previewContext),
    [previewContext, targets]
  );
  const iconId = Math.abs(monster.iconId);
  const selectedTarget = targets.find((target) => target.baseId === iconId) ?? null;
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const statusLabel = monsterIconSourceStatusLabel(resolution.sourceStatus);
  const canPickTargetIcon = Boolean(onOpenIconSet);
  const iconTitle = `${canPickTargetIcon ? "Choose monster icon" : "Monster icon"} (${statusLabel}: ${resolution.label})`;
  const showSourceBadge = resolution.sourceStatus !== "default-art";
  const current = {
    label: `Icon ${iconId}`,
    detail: `${statusLabel} | ${resolution.label}`,
    state: resolution.sourceStatus === "missing-art" ? "unresolved" as const : "resolved" as const
  };

  return (
    <div className="monster-icon-control" title={iconTitle}>
      <MonsterIcon
        monster={monster}
        iconEntries={iconEntries}
        project={project}
        lookups={lookups}
        previewContext={previewContext}
        large
      />
      {showSourceBadge ? (
        <span className={`monster-icon-source-badge ${resolution.sourceStatus}`} title={resolution.label}>
          {statusLabel}
        </span>
      ) : null}
      {canPickTargetIcon ? (
        <ReferenceField
          ariaLabel="Search monster icon"
          placeholder="Search icon ID or source..."
          options={options}
          value={iconId}
          selectedValue={selectedTarget?.baseId ?? null}
          current={current}
          currentActions={(
            <button type="button" className="btn btn-secondary btn-xs" onClick={onOpenIconSet}>
              Open Icon Set
            </button>
          )}
          currentSupplement={(
            <ReferencePreview
              preview={selectedTarget ? {
                kind: "custom",
                key: `monster-icon-current:${iconId}`,
                title: `Monster icon ${iconId}`,
                detail: `${statusLabel} | ${selectedTarget.sourceLabel}`,
                content: (
                  <IconPairPreview
                    baseAsset={selectedTarget.asset}
                    pairedAsset={selectedTarget.pairedAsset}
                    previewContext={previewContext}
                  />
                )
              } : {
                kind: "missing",
                key: `monster-icon-current:${iconId}:missing`,
                title: `Monster icon ${iconId}`,
                detail: resolution.label,
                body: "Choose a complete base and alternate monster icon pair, or open Icon Set to import one.",
                state: "missing"
              }}
            />
          )}
          resultNoun="icon"
          resultNounPlural="icons"
          emptyTitle="No matching monster icons"
          emptyBody="Try a target icon ID, source name, or source status. Only complete monster icon pairs are available."
          compact
          compactPanelTitle="Monster Icon Picker"
          compactStorageKey="combat.monster.icon.picker.position"
          className="monster-icon-reference-field"
          onChange={onCommit}
        />
      ) : null}
    </div>
  );
}
