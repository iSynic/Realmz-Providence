import { useState } from "react";
import { X } from "lucide-react";
import type { MonsterSetId } from "../../types";
import type { BattleMonsterReference } from "../../battleReferences";
import { ModalDialog, ReferenceField, type ReferencePickerOption } from "../../ui";
import type { ScenarioMonsterListEntry } from "./ScenarioMonsterList";

export type PendingBattleReferenceRepair =
  | { kind: "clear"; monsterId: number; setId: MonsterSetId }
  | { kind: "switch"; fromId: number; toId: number; setId: MonsterSetId };

export type BattleReferenceReplacement = {
  id: number;
  label: string;
  detail: string;
};

export function battleReferenceReplacementCandidates(
  entries: ScenarioMonsterListEntry[],
  excludedId = 0
): BattleReferenceReplacement[] {
  return entries
    .filter((entry) => entry.id > 0 && entry.id !== excludedId)
    .map((entry) => {
      const record = entry.active ?? entry.fallback;
      const availableSets = [
        entry.normal ? "Normal" : "",
        entry.monster ? "Monster" : "",
        entry.mega ? "Mega" : ""
      ].filter(Boolean).join(", ");
      return {
        id: entry.id,
        label: record?.displayName?.trim() || `Monster ${entry.id}`,
        detail: [
          availableSets || "No decoded set record",
          record ? `HD ${record.hitDice}, armor ${record.armor}, agility ${record.agility}, icon ${record.iconId}` : ""
        ].filter(Boolean).join(" | ")
      };
    });
}

export function battleRepairReplacementOptions(
  replacements: BattleReferenceReplacement[]
): ReferencePickerOption<number>[] {
  return replacements.map((replacement) => ({
    key: `battle-repair-monster:${replacement.id}`,
    value: replacement.id,
    label: `${replacement.label} (${replacement.id})`,
    detail: replacement.detail,
    searchText: `${replacement.id} ${replacement.label} ${replacement.detail} battle replacement monster`
  }));
}

export function BattleReferenceRepairDialog({
  action,
  references,
  replacements,
  onCancel,
  onClearOnly,
  onClearPlacements,
  onReplacePlacements,
  onSwitchRecordsOnly,
  onSwitchAndSwapCells
}: {
  action: PendingBattleReferenceRepair;
  references: BattleMonsterReference[];
  replacements: BattleReferenceReplacement[];
  onCancel: () => void;
  onClearOnly: () => void;
  onClearPlacements: () => void;
  onReplacePlacements: (replacementId: number) => void;
  onSwitchRecordsOnly: () => void;
  onSwitchAndSwapCells: () => void;
}) {
  const replacementOptions = battleRepairReplacementOptions(replacements);
  const [replacementId, setReplacementId] = useState(replacements[0]?.id ?? 0);
  const selectedReplacement = replacementOptions.find((option) => option.value === replacementId) ?? null;
  const battleCount = new Set(references.map((reference) => reference.battleId)).size;
  const referenceSummary = references.slice(0, 8);
  return (
    <ModalDialog
      backdropClassName="battle-reference-repair-backdrop"
      className="battle-reference-repair-dialog"
      ariaLabel="Battle reference repair"
      onDismiss={onCancel}
    >
        <header>
          <strong>Battle References</strong>
          <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label="Close battle reference repair" onClick={onCancel}>
            <X size={14} />
          </button>
        </header>
        <p>
          {references.length} placed battle cell{references.length === 1 ? "" : "s"} across {battleCount} battle{battleCount === 1 ? "" : "s"} reference {action.kind === "clear" ? `monster ${action.monsterId}` : `monster ${action.fromId} or ${action.toId}`}.
          Data BD stores raw monster IDs shared by Normal, Monster, and Mega sets.
        </p>
        <div className="battle-reference-repair-list">
          {referenceSummary.map((reference) => (
            <small key={`${reference.battleId}:${reference.slot}`}>
              Battle {reference.battleId}, cell {reference.col}, {reference.row}
              {reference.forcedFriendly ? " | Force Friends" : ""}
            </small>
          ))}
          {references.length > referenceSummary.length ? <small>+{references.length - referenceSummary.length} more placement{references.length - referenceSummary.length === 1 ? "" : "s"}</small> : null}
        </div>
        {action.kind === "clear" ? (
          <>
            <div className="combat-field battle-reference-replacement">
              <span>Replace With</span>
              <ReferenceField
                ariaLabel="Search replacement monster"
                placeholder="Search monster #, name, stats, or available set..."
                options={replacementOptions}
                value={replacementId}
                selectedValue={selectedReplacement?.value ?? null}
                current={selectedReplacement ? {
                  label: selectedReplacement.label,
                  detail: selectedReplacement.detail,
                  state: "resolved"
                } : {
                  label: "No replacement available",
                  detail: "No other scenario monster record can receive these battle placements.",
                  state: "empty"
                }}
                resultNoun="monster"
                resultNounPlural="monsters"
                emptyTitle="No matching replacement monsters"
                emptyBody="Try a monster ID, name, combat stat, or Normal/Monster/Mega availability."
                initialVisibleCount={80}
                visibleCountStep={80}
                onChange={setReplacementId}
              />
            </div>
            <div className="battle-reference-repair-actions">
              <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn btn-danger btn-xs" onClick={onClearPlacements}>Clear Battle Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" disabled={!replacementId} onClick={() => onReplacePlacements(replacementId)}>Replace Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={onClearOnly}>Clear Monster Only</button>
            </div>
          </>
        ) : (
          <div className="battle-reference-repair-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onSwitchRecordsOnly}>Switch Records Only</button>
            <button type="button" className="btn btn-primary btn-xs" onClick={onSwitchAndSwapCells}>Also Swap Battle Cell IDs</button>
          </div>
        )}
    </ModalDialog>
  );
}
