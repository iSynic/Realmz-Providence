use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::{
    RebuiltV3BattleDefinition, RebuiltV3BattleError, RebuiltV3MonsterDefinition,
    RebuiltV3MonsterDescription, RebuiltV3MonsterError, RebuiltV3MonsterSetDefinition,
    RebuiltV3ReachabilityError, RebuiltV3ReachabilityReference, derive_rebuilt_v3_reachability,
    project_rebuilt_v3_battles_by_classic_ids, project_rebuilt_v3_monsters_by_classic_ids,
};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableCombatSelection {
    pub reachable_battle_ids: Vec<u32>,
    pub reachable_monster_ids: Vec<u32>,
    pub battles: Vec<RebuiltV3BattleDefinition>,
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
    pub monster_sets: Vec<RebuiltV3MonsterSetDefinition>,
    pub monster_descriptions: Vec<RebuiltV3MonsterDescription>,
}

impl RebuiltV3ReachableCombatSelection {
    pub fn all_monsters(&self) -> impl Iterator<Item = &RebuiltV3MonsterDefinition> {
        self.monsters
            .iter()
            .chain(self.monster_sets.iter().flat_map(|set| &set.monsters))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableCombatError {
    Reachability(RebuiltV3ReachabilityError),
    UnresolvedReferences(Vec<RebuiltV3ReachabilityReference>),
    Battles(RebuiltV3BattleError),
    Monsters(RebuiltV3MonsterError),
    MissingSelectedMonster { battle: StableId, monster: StableId },
}

impl std::fmt::Display for RebuiltV3ReachableCombatError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Reachability(error) => write!(formatter, "reachability failed: {error}"),
            Self::UnresolvedReferences(references) => write!(
                formatter,
                "reachable combat selection refused {} unresolved runtime reference(s)",
                references.len()
            ),
            Self::Battles(error) => {
                write!(formatter, "reachable Battle projection failed: {error}")
            }
            Self::Monsters(error) => {
                write!(formatter, "reachable Monster projection failed: {error}")
            }
            Self::MissingSelectedMonster { battle, monster } => write!(
                formatter,
                "reachable Battle '{}' requires Monster '{}' outside the selected closure",
                battle.0, monster.0
            ),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableCombatError {}

pub fn project_rebuilt_v3_reachable_combat(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ReachableCombatSelection, RebuiltV3ReachableCombatError> {
    let reachability = derive_rebuilt_v3_reachability(snapshot)
        .map_err(RebuiltV3ReachableCombatError::Reachability)?;
    project_rebuilt_v3_reachable_combat_from_report(snapshot, &reachability)
}

pub(crate) fn project_rebuilt_v3_reachable_combat_from_report(
    snapshot: &ProjectSnapshot,
    reachability: &super::RebuiltV3ReachabilityReport,
) -> Result<RebuiltV3ReachableCombatSelection, RebuiltV3ReachableCombatError> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        && !reachability.unresolved_references.is_empty()
    {
        return Err(RebuiltV3ReachableCombatError::UnresolvedReferences(
            reachability.unresolved_references.clone(),
        ));
    }

    let battle_ids = reachability
        .reachable_battle_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    let monster_ids = reachability
        .reachable_monster_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    let battles = project_rebuilt_v3_battles_by_classic_ids(snapshot, &battle_ids)
        .map_err(RebuiltV3ReachableCombatError::Battles)?;
    let monster_selection = project_rebuilt_v3_monsters_by_classic_ids(snapshot, &monster_ids)
        .map_err(RebuiltV3ReachableCombatError::Monsters)?;
    let selected_monsters = monster_selection
        .monsters
        .iter()
        .map(|monster| monster.id.clone())
        .collect::<BTreeSet<_>>();
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        for battle in &battles {
            for slot in &battle.monster_slots {
                if !selected_monsters.contains(&slot.monster_id) {
                    return Err(RebuiltV3ReachableCombatError::MissingSelectedMonster {
                        battle: battle.id.clone(),
                        monster: slot.monster_id.clone(),
                    });
                }
            }
        }
    }

    Ok(RebuiltV3ReachableCombatSelection {
        reachable_battle_ids: reachability.reachable_battle_ids.clone(),
        reachable_monster_ids: reachability.reachable_monster_ids.clone(),
        battles,
        monsters: monster_selection.monsters,
        monster_sets: monster_selection.monster_sets,
        monster_descriptions: monster_selection.monster_descriptions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codecs::{BATTLE_GRID_SLOTS, MONSTER_RECORD_BYTES, decode_monster_set},
        model::{
            ActionPoint, BattleRecord, ClassicAction, ExtraActionPoint, ExtraCodeRow, LevelType,
            MapCoordinate, MonsterDescription, NativeRecordId,
        },
    };

    fn action(slot: u8, opcode: i16, target_native_id: i16) -> ClassicAction {
        ClassicAction {
            slot,
            raw_opcode: opcode,
            target_native_id,
        }
    }

    fn xap(id: u32, actions: Vec<ClassicAction>) -> ExtraActionPoint {
        ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: id as i32,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions,
        }
    }

    fn selection_snapshot() -> ProjectSnapshot {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("combat-selection".into()));
        snapshot.world.action_points.push(ActionPoint {
            identity: StableId("action-point:land:0:0".into()),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: 0,
            classic_door_id: 1,
            coordinate: Some(MapCoordinate { x: 1, y: 1 }),
            post_action_level: 0,
            post_action_x: 1,
            post_action_y: 1,
            chance_percent: 100,
            actions: vec![action(0, 39, 1)],
        });
        snapshot.extra_action_points = vec![
            xap(1, vec![action(0, 56, 10), action(1, 127, 99)]),
            xap(4, Vec::new()),
            xap(5, Vec::new()),
        ];
        snapshot.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(10),
            values: [2, 2, 4, 0, 0],
        });

        let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 6], "Data MD", 0);
        normal.monsters[3].display_name = "Reachable Sentinel".into();
        normal.monsters[3].death_macro = 5;
        normal.monsters[4].magic_to_hit = -1;
        snapshot.monster_sets.push(normal);
        snapshot.monster_descriptions.extend([
            MonsterDescription {
                identity: StableId("monster-description:3".into()),
                native_id: NativeRecordId(3),
                text: "Guards the selected Battle.".into(),
                authored: true,
            },
            MonsterDescription {
                identity: StableId("invalid-unselected-description".into()),
                native_id: NativeRecordId(4),
                text: "Must remain outside this bounded proof.".into(),
                authored: true,
            },
        ]);

        let mut grid = vec![0; BATTLE_GRID_SLOTS];
        grid[0] = -3;
        snapshot.battles.push(BattleRecord {
            identity: StableId("battle:2".into()),
            native_id: NativeRecordId(2),
            grid,
            distance: 1,
            message_before: 0,
            message_after: 0,
            battle_macro: -4,
            authored: false,
        });
        let mut unreachable = snapshot.battles[0].clone();
        unreachable.identity = StableId("battle:9".into());
        unreachable.native_id = NativeRecordId(9);
        unreachable.grid[0] = 30_000;
        snapshot.battles.push(unreachable);
        snapshot
    }

    #[test]
    fn selection_is_deterministic_closed_and_does_not_mutate_unselected_source() {
        let snapshot = selection_snapshot();
        let source = snapshot.clone();

        let first = project_rebuilt_v3_reachable_combat(&snapshot).expect("reachable selection");
        let second = project_rebuilt_v3_reachable_combat(&snapshot).expect("repeat selection");

        assert_eq!(first, second);
        assert_eq!(snapshot, source);
        assert_eq!(first.reachable_battle_ids, vec![2]);
        assert_eq!(first.reachable_monster_ids, vec![3]);
        assert_eq!(first.battles.len(), 1);
        assert_eq!(first.battles[0].classic_id, 2);
        assert_eq!(first.monsters.len(), 1);
        assert_eq!(first.monsters[0].classic_id, 3);
        assert_eq!(first.monster_descriptions.len(), 1);
        assert_eq!(first.monster_descriptions[0].id, 3);
        assert_eq!(
            serde_json::to_vec(&first).expect("serialize selection"),
            serde_json::to_vec(&second).expect("repeat serialization")
        );

        assert!(super::super::project_rebuilt_v3_battles(&snapshot).is_err());
        assert!(super::super::project_rebuilt_v3_monster_catalog(&snapshot).is_err());
    }

    #[test]
    fn selection_refuses_any_unresolved_runtime_dependency_before_projection() {
        let mut snapshot = selection_snapshot();
        snapshot
            .extra_action_points
            .retain(|row| row.native_id.0 != 5);

        let error =
            project_rebuilt_v3_reachable_combat(&snapshot).expect_err("missing death macro");
        let RebuiltV3ReachableCombatError::UnresolvedReferences(references) = error else {
            panic!("expected unresolved references, got {error:?}");
        };
        assert!(references.iter().any(|reference| {
            reference.target
                == super::super::RebuiltV3ReachabilityTarget::Program(StableId("xap:5".into()))
        }));
    }
}
