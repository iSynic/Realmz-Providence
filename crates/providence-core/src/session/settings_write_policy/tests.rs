use super::*;
use crate::model::{ClassicAction, ExtraActionPoint, NativeRecordId};

fn row(id: u32, values: [i16; 5]) -> ExtraCodeRow {
    ExtraCodeRow {
        native_id: NativeRecordId(id),
        values,
    }
}

fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("allocator".into()))
}

#[test]
fn reuses_zero_rows_but_never_nonzero_or_referenced_rows() {
    let mut snapshot = snapshot();
    snapshot.extra_codes = vec![row(0, [1; 5]), row(1, [0; 5]), row(2, [0; 5])];
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: -1,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: -92,
            target_native_id: 1,
        }],
    });
    assert_eq!(available_id(&snapshot, false).unwrap(), 3);
    snapshot.extra_action_points.clear();
    assert_eq!(available_id(&snapshot, false).unwrap(), 1);
    assert_eq!(available_id(&snapshot, true).unwrap(), 1);
}

#[test]
fn duplicate_zero_ids_are_ambiguous_not_free() {
    let mut snapshot = snapshot();
    snapshot.extra_codes = vec![row(0, [0; 5]), row(0, [0; 5])];
    assert_eq!(available_id(&snapshot, false).unwrap(), 1);
}

#[test]
fn reservation_does_not_depend_on_values_written_later() {
    let mut snapshot = snapshot();
    snapshot.extra_codes = vec![row(0, [0; 5]), row(1, [0; 5]), row(2, [0; 5])];
    let mut allocator = SettingsAllocator::new(&snapshot);
    assert_eq!(allocator.allocate(true).unwrap(), 0);
    assert_eq!(allocator.allocate(false).unwrap(), 2);
    assert_eq!(allocator.allocate(true).unwrap(), 3);
    assert_eq!(snapshot.extra_codes[0].values, [0; 5]);
}

#[test]
fn last_signed_id_can_own_a_companion_beyond_signed_range() {
    let mut snapshot = snapshot();
    snapshot.extra_codes = (0..i16::MAX as u32).map(|id| row(id, [1; 5])).collect();
    let mut allocator = SettingsAllocator::new(&snapshot);
    assert_eq!(allocator.allocate(true).unwrap(), i16::MAX as u32);
    assert!(allocator.allocate(false).is_err());
}

#[test]
fn failed_pair_search_does_not_consume_a_free_single_row() {
    let mut snapshot = snapshot();
    snapshot.extra_codes = (0..=i16::MAX as u32 + 1)
        .filter(|id| *id != 4)
        .map(|id| row(id, [1; 5]))
        .collect();
    let mut allocator = SettingsAllocator::new(&snapshot);
    assert!(allocator.allocate(true).is_err());
    assert_eq!(allocator.allocate(false).unwrap(), 4);
    assert!(allocator.allocate(false).is_err());
}
