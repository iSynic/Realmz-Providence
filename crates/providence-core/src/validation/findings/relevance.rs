use crate::{
    model::{NativeRecordId, ProjectOrigin, ProjectSnapshot, StableId},
    references::{ReferenceDescriptor, TargetKind},
    validation::{
        Diagnostic, Severity,
        presentation::{FindingImpact, impact},
    },
};
use std::collections::BTreeSet;

pub(super) fn actionable(
    snapshot: &ProjectSnapshot,
    all: &[Diagnostic],
    references: &[ReferenceDescriptor],
) -> Vec<Diagnostic> {
    let called = references
        .iter()
        .map(|reference| (&reference.target_kind, reference.target_id.as_str()))
        .collect::<BTreeSet<_>>();
    let uncalled = if matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        let mut records = uncalled_imported_records(snapshot, &called);
        records.extend(super::monster_tails::uncalled(snapshot, references));
        records
    } else {
        BTreeSet::new()
    };
    all.iter()
        .filter(|finding| {
            is_actionable(snapshot, finding, &called)
                && !(finding.severity == Severity::Warning
                    && finding
                        .entity
                        .as_ref()
                        .is_some_and(|id| uncalled.contains(id)))
        })
        .cloned()
        .collect()
}

fn uncalled_imported_records(
    snapshot: &ProjectSnapshot,
    called: &BTreeSet<(&TargetKind, &str)>,
) -> BTreeSet<StableId> {
    let mut uncalled = BTreeSet::new();
    let mut include =
        |kind: TargetKind, identity: &StableId, native: NativeRecordId, authored: bool| {
            if !authored && !has_caller(called, &kind, identity, native) {
                uncalled.insert(identity.clone());
            }
        };
    // Only caller-driven families belong here. Maps, timed events and bestiary
    // monsters can be runtime roots without an incoming record reference.
    for row in &snapshot.shops {
        include(TargetKind::Shop, &row.identity, row.native_id, row.authored);
    }
    for row in &snapshot.treasures {
        include(
            TargetKind::Treasure,
            &row.identity,
            row.native_id,
            row.authored,
        );
    }
    for row in &snapshot.battles {
        include(
            TargetKind::Battle,
            &row.identity,
            row.native_id,
            row.authored,
        );
    }
    for row in &snapshot.simple_encounters {
        include(
            TargetKind::SimpleEncounter,
            &row.identity,
            row.native_id,
            row.authored,
        );
    }
    for row in &snapshot.complex_encounters {
        include(
            TargetKind::ComplexEncounter,
            &row.identity,
            row.native_id,
            row.authored,
        );
    }
    for row in &snapshot.rogue_encounters {
        include(
            TargetKind::RogueEncounter,
            &row.identity,
            row.native_id,
            row.authored,
        );
    }
    uncalled
}

fn has_caller(
    called: &BTreeSet<(&TargetKind, &str)>,
    kind: &TargetKind,
    identity: &StableId,
    native: NativeRecordId,
) -> bool {
    called.contains(&(kind, identity.0.as_str()))
        || called.contains(&(kind, native.0.to_string().as_str()))
}

fn is_actionable(
    snapshot: &ProjectSnapshot,
    finding: &Diagnostic,
    called: &BTreeSet<(&TargetKind, &str)>,
) -> bool {
    if impact(&finding.code, finding.severity, false, false) == FindingImpact::PreservationDetail {
        return false;
    }
    if finding.code == "battle.empty" {
        return snapshot
            .battles
            .iter()
            .find(|battle| Some(&battle.identity) == finding.entity.as_ref())
            .is_none_or(|battle| {
                has_caller(
                    called,
                    &TargetKind::Battle,
                    &battle.identity,
                    battle.native_id,
                )
            });
    }
    // Empty response targets cannot be chosen, even when the encounter is called.
    !matches!(
        finding.code.as_str(),
        "complex-encounter.spell.result-without-target"
            | "complex-encounter.item.result-without-target"
    )
}
