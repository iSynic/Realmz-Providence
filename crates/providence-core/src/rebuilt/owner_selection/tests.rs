use super::*;
use crate::model::{BlobId, NativeRecordId, ProjectOrigin, StableId};
use crate::rebuilt::{RebuiltV3ShopError, RebuiltV3TreasureError};

use super::fixtures::{fixture, instruction};

#[test]
fn selection_is_exact_deterministic_and_causal() {
    let (mut snapshot, scenario) = fixture();
    let mut invalid_treasure = snapshot.treasures[0].clone();
    invalid_treasure.native_id = NativeRecordId(9);
    invalid_treasure.identity = StableId("invalid-unselected-treasure".into());
    snapshot.treasures.push(invalid_treasure);
    let first = project_rebuilt_v3_reachable_owners(&snapshot, &scenario).unwrap();
    let second = project_rebuilt_v3_reachable_owners(&snapshot, &scenario).unwrap();

    assert_eq!(first, second);
    assert_eq!(first.reachable_treasure_ids, [3]);
    assert_eq!(first.reachable_shop_ids, [4]);
    assert_eq!(first.timed_encounters.len(), 1);
    assert_eq!(first.treasures.len(), 1);
    assert_eq!(first.shops.len(), 1);
    assert_eq!(first.references.len(), 5);
    assert!(first.references.iter().any(|reference| {
        reference.runtime_opcode == 48
            && reference.field_path == "actions[2].extraCode[4]"
            && reference.raw_native_id == -3
            && reference.target_native_id == 3
    }));
}

#[test]
fn selection_refuses_missing_targets_and_extra_code() {
    let (snapshot, mut scenario) = fixture();
    scenario.programs[0].instructions = vec![instruction(0, 10, 8, None)];
    assert_eq!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::Treasure(
            RebuiltV3TreasureError::MissingRequested(8)
        ))
    );

    scenario.programs[0].instructions = vec![instruction(2, 51, 99, None)];
    assert_eq!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::MissingExtraCode {
            program: StableId("xap:1".into()),
            slot: 2,
            opcode: 51,
            native_id: 99,
        })
    );
}

#[test]
fn catalog_failures_keep_instruction_timed_and_owner_precedence() {
    let (mut snapshot, mut scenario) = fixture();
    scenario.programs[0].instructions =
        vec![instruction(0, 10, 8, None), instruction(1, 6, 9, None)];
    assert_eq!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::Treasure(
            RebuiltV3TreasureError::MissingRequested(8)
        ))
    );
    snapshot.treasures = vec![];
    scenario.programs[0].instructions.remove(0);
    assert_eq!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::Shop(
            RebuiltV3ShopError::MissingRequested(9)
        ))
    );
    snapshot.timed_encounters[0].door = 999;
    assert!(matches!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::TimedEncounter(_))
    ));
    scenario.programs[0]
        .instructions
        .push(instruction(2, 51, 99, None));
    assert_eq!(
        project_rebuilt_v3_reachable_owners(&snapshot, &scenario),
        Err(RebuiltV3ReachableOwnerError::MissingExtraCode {
            program: StableId("xap:1".into()),
            slot: 2,
            opcode: 51,
            native_id: 99,
        })
    );
}

#[test]
fn imported_missing_catalogs_retain_exact_signed_callers() {
    let (mut snapshot, mut scenario) = fixture();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    scenario.programs[0].instructions =
        vec![instruction(0, 10, -8, None), instruction(1, 6, -9, None)];
    let selected = project_rebuilt_v3_reachable_owners(&snapshot, &scenario).unwrap();
    assert!(selected.reachable_treasure_ids.is_empty() && selected.treasures.is_empty());
    assert!(selected.reachable_shop_ids.is_empty() && selected.shops.is_empty());
    assert_eq!(
        selected
            .references
            .iter()
            .map(|r| (r.raw_native_id, r.target_native_id))
            .collect::<Vec<_>>(),
        [(-9, 9), (-8, 8)]
    );
}

#[test]
fn treasure_zero_sentinel_does_not_hide_shop_zero() {
    let (mut snapshot, mut scenario) = fixture();
    snapshot.shops[0].identity = StableId("shop:0".into());
    snapshot.shops[0].native_id = NativeRecordId(0);
    scenario.programs[0].instructions = vec![
        instruction(0, 48, 9, Some([0; 5])),
        instruction(1, 51, 10, Some([0; 5])),
        instruction(2, 73, 11, Some([0; 5])),
    ];
    let selected = project_rebuilt_v3_reachable_owners(&snapshot, &scenario).unwrap();
    assert!(selected.reachable_treasure_ids.is_empty());
    assert_eq!(selected.reachable_shop_ids, [0]);
    assert_eq!(
        selected
            .references
            .iter()
            .map(|r| r.runtime_opcode)
            .collect::<Vec<_>>(),
        [51, 73]
    );
}
