import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, MonsterRecord, MonsterSetId, Project } from "../../types";
import type { CombatLookups } from "./combatLookups";
import { FieldLabel } from "./CombatFields";
import { MonsterIcon } from "./MonsterIconPreview";
import { monsterBattleFootprintLabel } from "./battleMonsterIcons";
import { monsterBattleStats, monsterSetLabel } from "./battleMonsterPaletteModel";

export function BattleMonsterDetail({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  forcedFriendly = false
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  forcedFriendly?: boolean;
}) {
  return (
    <div className="monster-battle-detail-card">
      <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />
      <div className="monster-battle-detail-body">
        <b>{monster.displayName || `Monster ${monster.id}`}</b>
        <small>Monster {monster.id} | icon {monster.iconId} | {monsterBattleFootprintLabel(monster, iconEntries, project, lookups)}</small>
        <dl className="monster-battle-stat-grid">
          {monsterBattleStats(monster).map(([label, value]) => (
            <div key={label}>
              <dt>
                {forcedFriendly && label === "Alliance" ? (
                  <TutorialTip
                    title="Forced Friend"
                    body={`This placed battle monster stores a negative monster ID. The source monster's Alliance value remains ${monster.traitor}; Realmz treats this placement as friendly during combat.`}
                    side="left"
                  >
                    <span>Alliance</span>
                  </TutorialTip>
                ) : label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function BattleMonsterSelect({
  monsters,
  setId,
  value,
  onCommit
}: {
  monsters: MonsterRecord[];
  setId: MonsterSetId;
  value: number;
  onCommit: (value: number) => void;
}) {
  const placeableMonsters = monsters.filter((monster) => monster.id !== 0);
  const hasValue = value === 0 || placeableMonsters.some((monster) => monster.id === value);
  return (
    <label className="combat-field">
      <FieldLabel label="Anchor Cell Monster" help="This writes the absolute monster ID for the selected anchor cell. Data BD uses 0 for empty cells, so Monster 0 cannot be selected here. Use Force Friends to preserve Realmz's negative side-flip encoding." />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty</option>
        {!hasValue ? <option value={value}>{monsterSetLabel(setId)} Monster {value} missing</option> : null}
        {placeableMonsters.map((monster) => (
          <option key={monster.id} value={monster.id}>{monster.displayName || `Monster ${monster.id}`} ({monster.id})</option>
        ))}
      </select>
    </label>
  );
}
