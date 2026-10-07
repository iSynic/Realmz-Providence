use crate::{
    model::ProjectSnapshot,
    references::{ReferenceDescriptor, TargetKind},
    validation::{
        Diagnostic,
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
    all.iter()
        .filter(|finding| is_actionable(snapshot, finding, &called))
        .cloned()
        .collect()
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
                called.contains(&(&TargetKind::Battle, battle.identity.0.as_str()))
                    || called
                        .contains(&(&TargetKind::Battle, battle.native_id.0.to_string().as_str()))
            });
    }
    // Empty response targets cannot be chosen, even when the encounter is called.
    !matches!(
        finding.code.as_str(),
        "complex-encounter.spell.result-without-target"
            | "complex-encounter.item.result-without-target"
    )
}
