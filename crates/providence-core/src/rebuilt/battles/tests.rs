use super::*;
use crate::model::{BattleRecord, StableId};
use crate::{
    codecs::{BATTLE_GRID_SLOTS, MONSTER_RECORD_BYTES, decode_monster_set},
    model::{BlobId, ExtraActionPoint, NativeRecordId, ProjectOrigin, ScenarioMessage},
};

fn source_backed_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rebuilt-battles".into()));
    snapshot.monster_sets.push(decode_monster_set(
        &vec![0; MONSTER_RECORD_BYTES * 8],
        "Data MD",
        0,
    ));
    snapshot.messages = [4, 5]
        .into_iter()
        .map(|id| ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Message {id}"),
            authored: true,
        })
        .collect();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:6".into()),
        native_id: NativeRecordId(6),
        classic_door_id: 6,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut grid = vec![0; BATTLE_GRID_SLOTS];
    grid[14] = -7;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid,
        distance: 9,
        message_before: -4,
        message_after: 5,
        battle_macro: -6,
        authored: true,
    });
    snapshot
}

#[test]
fn projection_matches_the_pinned_schema_v3_battle_shape() {
    let snapshot = source_backed_snapshot();
    let projection = project_rebuilt_v3_battles(&snapshot).expect("battle projection");
    let encoded = serde_json::to_string(&projection).expect("serialize battles");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_battles(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("battle JSON");
    assert_eq!(value[0]["id"], "classic.battle.2");
    assert_eq!(value[0]["classicId"], 2);
    assert_eq!(value[0]["monsterSlots"][0]["x"], 1);
    assert_eq!(value[0]["monsterSlots"][0]["y"], 1);
    assert_eq!(
        value[0]["monsterSlots"][0]["monsterId"],
        "classic.monster.7"
    );
    assert_eq!(value[0]["monsterSlots"][0]["invertTraitor"], true);
    assert_eq!(value[0]["messageBeforeId"], -4);
    assert_eq!(value[0]["messageAfterId"], 5);
    assert_eq!(value[0]["macroId"], -6);

    let reopened: Vec<RebuiltV3BattleDefinition> =
        serde_json::from_str(&encoded).expect("reimport battle projection");
    assert_eq!(reopened, projection);
}

#[test]
fn selected_projection_preserves_unselected_source_rows_without_emitting_them() {
    let mut snapshot = source_backed_snapshot();
    let mut unselected = snapshot.battles[0].clone();
    unselected.identity = StableId("battle:3".into());
    unselected.native_id = NativeRecordId(3);
    unselected.grid[0] = 30_000;
    snapshot.battles.push(unselected);

    let selected = project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([2]))
        .expect("selected valid battle projects without claiming an unselected source row");
    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].classic_id, 2);
    assert!(matches!(
        project_rebuilt_v3_battles(&snapshot),
        Err(RebuiltV3BattleError::MissingMonster {
            battle: StableId(value),
            monster_id: 30_000,
            ..
        }) if value == "battle:3"
    ));
    assert_eq!(
        project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([99])),
        Err(RebuiltV3BattleError::MissingSelectedClassicId(99))
    );
}

#[test]
fn imported_selected_projection_preserves_missing_optional_message_and_macro_operands() {
    let mut snapshot = source_backed_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.messages.clear();
    snapshot.extra_action_points.clear();

    let selected = project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([2]))
        .expect("imported optional battle references are deferred by the runtime selection");
    assert_eq!(selected[0].message_before_id, -4);
    assert_eq!(selected[0].message_after_id, 5);
    assert_eq!(selected[0].macro_id, -6);
    assert!(project_rebuilt_v3_battles(&snapshot).is_err());
}

#[test]
fn imported_selected_projection_preserves_missing_monster_slot_for_runtime_encounter_error() {
    let mut snapshot = source_backed_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.monster_sets.clear();

    let selected = project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([2]))
        .expect("imported battle retains unavailable source monster identity");
    assert_eq!(selected[0].monster_slots.len(), 1);
    assert_eq!(
        selected[0].monster_slots[0].monster_id.0,
        "classic.monster.7"
    );

    snapshot.origin = ProjectOrigin::Authored;
    assert!(matches!(
        project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([2])),
        Err(RebuiltV3BattleError::MissingMonster { monster_id: 7, .. })
    ));
}

#[test]
fn projection_refuses_to_silently_drop_runtime_references() {
    let mut snapshot = source_backed_snapshot();
    snapshot.monster_sets.clear();
    assert_eq!(
        project_rebuilt_v3_battles(&snapshot),
        Err(RebuiltV3BattleError::MissingMonster {
            battle: StableId("battle:2".into()),
            slot: 14,
            monster_id: 7,
        })
    );

    let mut snapshot = source_backed_snapshot();
    snapshot.messages.retain(|message| message.native_id.0 != 4);
    assert_eq!(
        project_rebuilt_v3_battles(&snapshot),
        Err(RebuiltV3BattleError::MissingMessage {
            battle: StableId("battle:2".into()),
            field: "messageBeforeId",
            message_id: 4,
        })
    );

    let mut snapshot = source_backed_snapshot();
    snapshot.extra_action_points.clear();
    assert_eq!(
        project_rebuilt_v3_battles(&snapshot),
        Err(RebuiltV3BattleError::MissingMacro {
            battle: StableId("battle:2".into()),
            macro_id: 6,
        })
    );
}

#[test]
fn selected_availability_precedes_catalog_and_record_errors() {
    let mut snapshot = source_backed_snapshot();
    snapshot.monster_sets.push(snapshot.monster_sets[0].clone());
    snapshot.battles[0].identity = StableId("invalid-battle".into());
    assert_eq!(
        project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([99])),
        Err(RebuiltV3BattleError::MissingSelectedClassicId(99))
    );
    assert_eq!(
        project_rebuilt_v3_battles_by_classic_ids(&snapshot, &BTreeSet::from([2])),
        Err(RebuiltV3BattleError::AmbiguousNormalMonsterSet)
    );
    snapshot.monster_sets.pop();
    snapshot.battles[0].identity = StableId("battle:2".into());
    snapshot.messages.clear();
    snapshot.extra_action_points.clear();
    snapshot.battles[0].grid[0] = 30_000;
    assert_eq!(
        project_rebuilt_v3_battles(&snapshot),
        Err(RebuiltV3BattleError::MissingMessage {
            battle: StableId("battle:2".into()),
            field: "messageBeforeId",
            message_id: 4,
        })
    );
}

#[test]
fn grid_coordinates_preserve_native_column_order() {
    let mut snapshot = source_backed_snapshot();
    snapshot.battles[0].grid.fill(0);
    let slot = 2 * crate::codecs::BATTLE_GRID_WIDTH + 3;
    snapshot.battles[0].grid[slot] = -7;
    let battle = project_rebuilt_v3_battles(&snapshot).unwrap().remove(0);
    assert_eq!(
        battle.monster_slots,
        [RebuiltV3BattleMonsterSlot {
            x: 2,
            y: 3,
            monster_id: StableId("classic.monster.7".into()),
            invert_traitor: true,
        }]
    );
}
