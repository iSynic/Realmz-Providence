use super::{CompatibilityBlocker, blocker};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};

pub(super) fn classify_opcode_92(
    snapshot: &ProjectSnapshot,
    blockers: &mut Vec<super::CompatibilityBlocker>,
    warnings: &mut Vec<super::CompatibilityBlocker>,
) {
    for finding in opcode_92_extra_code_blockers(snapshot) {
        if finding
            .entity
            .as_ref()
            .is_some_and(|id| owner(snapshot, id))
        {
            warnings.push(finding);
        } else {
            blockers.push(finding);
        }
    }
}

pub(super) fn owner(snapshot: &ProjectSnapshot, id: &StableId) -> bool {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return false;
    }
    let captured = |path: &str, row: u64, stride: u64| {
        snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == path && source.byte_length / stride > row)
    };
    if let Some(row) = snapshot
        .simple_encounters
        .iter()
        .find(|row| row.identity == *id)
    {
        return !row.authored && captured("Data ED", row.native_id.0 as u64, 426);
    }
    if let Some(row) = snapshot
        .complex_encounters
        .iter()
        .find(|row| row.identity == *id)
    {
        return !row.authored
            && captured(
                "Data ED2",
                row.native_id.0 as u64,
                crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES as u64,
            );
    }
    // Placed/XAP records have no authored-state witness. A captured row count
    // alone cannot prove a newly changed instruction came from that source.
    false
}

fn opcode_92_extra_code_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let available = snapshot
        .extra_codes
        .iter()
        .map(|row| row.native_id.0)
        .collect::<std::collections::BTreeSet<_>>();
    let action_sets = snapshot
        .world
        .action_points
        .iter()
        .map(|row| (&row.identity, row.actions.as_slice()))
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .simple_encounters
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .complex_encounters
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        );
    let mut blockers = Vec::new();
    for (identity, actions) in action_sets {
        for action in actions.iter().filter(|action| action.opcode() == 92) {
            opcode_92_rows(identity, action, &available, &mut blockers);
        }
    }
    blockers
}

fn opcode_92_rows(
    identity: &StableId,
    action: &crate::model::ClassicAction,
    available: &std::collections::BTreeSet<u32>,
    blockers: &mut Vec<CompatibilityBlocker>,
) {
    let Ok(primary) = u32::try_from(action.target_native_id) else {
        blockers.push(blocker(
            "classic.edcd.opcode-92-primary-missing",
            format!(
                "Opcode 92 action slot {} requires a nonnegative Data EDCD row ID.",
                action.slot
            ),
            Some(identity.clone()),
        ));
        return;
    };
    if !available.contains(&primary) {
        blockers.push(blocker(
            "classic.edcd.opcode-92-primary-missing",
            format!(
                "Opcode 92 action slot {} requires Data EDCD row {primary}.",
                action.slot
            ),
            Some(identity.clone()),
        ));
    }
    if !available.contains(&primary.saturating_add(1)) {
        blockers.push(blocker(
            "classic.edcd.opcode-92-secondary-missing",
            format!(
                "Opcode 92 action slot {} requires companion Data EDCD row {}.",
                action.slot,
                primary.saturating_add(1)
            ),
            Some(identity.clone()),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BlobId, ClassicAction, ClassicSourceBlob, ExtraCodeRow, NativeRecordId};

    #[test]
    fn imported_negative_primary_and_missing_companion_remain_separate_classic_warnings() {
        for (operand, expected) in [
            (-1, "classic.edcd.opcode-92-primary-missing"),
            (8, "classic.edcd.opcode-92-secondary-missing"),
        ] {
            let mut snapshot = ProjectSnapshot::new_authored(StableId("opcode92-source".into()));
            snapshot.origin = ProjectOrigin::Imported {
                compatibility_annex: BlobId("fixture".into()),
            };
            snapshot.classic_sources.push(ClassicSourceBlob {
                native_path: "Data ED".into(),
                blob: BlobId("fixture-ed".into()),
                byte_length: 426,
            });
            snapshot.simple_encounters =
                crate::codecs::decode_simple_encounters(&vec![0; 426]).records;
            snapshot.simple_encounters[0].actions = vec![ClassicAction {
                slot: 9,
                raw_opcode: 92,
                target_native_id: operand,
            }];
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(8),
                values: [0; 5],
            });
            let imported = super::super::classify_classic_slice(&snapshot);
            assert!(
                imported
                    .warnings
                    .iter()
                    .any(|finding| finding.code == expected)
            );
            assert!(
                !imported
                    .blockers
                    .iter()
                    .any(|finding| finding.code == expected)
            );
            snapshot.simple_encounters[0].authored = true;
            let edited = super::super::classify_classic_slice(&snapshot);
            assert!(
                edited
                    .blockers
                    .iter()
                    .any(|finding| finding.code == expected)
            );
            assert_eq!(
                snapshot.simple_encounters[0].actions[0].target_native_id,
                operand
            );
        }
    }
}
