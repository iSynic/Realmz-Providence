use std::collections::BTreeSet;

use crate::{
    model::{ProjectSnapshot, StableId},
    references::{FieldPath, ReferenceDescriptor, RepairAction, ResolutionState, TargetKind},
};

pub(crate) fn references_for_rules(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let race_ids = snapshot
        .race_rules
        .iter()
        .map(|rule| rule.definition.id.clone())
        .collect::<BTreeSet<_>>();
    let caste_ids = snapshot
        .caste_rules
        .iter()
        .map(|rule| rule.definition.id.clone())
        .collect::<BTreeSet<_>>();
    let item_ids = snapshot
        .item_rules
        .iter()
        .map(|rule| rule.definition.id.clone())
        .chain(
            snapshot
                .scenario_item_rules
                .iter()
                .map(|rule| rule.definition.id.clone()),
        )
        .collect::<BTreeSet<_>>();
    let mut references = Vec::new();
    references.extend(campaign_references(snapshot, &race_ids, &caste_ids));
    for race in &snapshot.race_rules {
        for (index, target) in race.definition.eligible_caste_ids.iter().enumerate() {
            references.push(reference_for_stable_target(
                race.definition.id.clone(),
                format!("eligibleCasteIds[{index}]"),
                TargetKind::Caste,
                target.clone(),
                caste_ids.contains(target),
            ));
        }
    }
    for caste in &snapshot.caste_rules {
        for (index, target) in caste.definition.eligible_race_ids.iter().enumerate() {
            references.push(reference_for_stable_target(
                caste.definition.id.clone(),
                format!("eligibleRaceIds[{index}]"),
                TargetKind::Race,
                target.clone(),
                race_ids.contains(target),
            ));
        }
        for (index, target) in caste.definition.starting_item_ids.iter().enumerate() {
            references.push(reference_for_stable_target(
                caste.definition.id.clone(),
                format!("startingItemIds[{index}]"),
                TargetKind::Item,
                target.clone(),
                item_ids.contains(target),
            ));
        }
    }
    references.extend(crate::item_behavior_references::references(
        snapshot, &item_ids, &race_ids, &caste_ids,
    ));
    references
}

fn campaign_references(
    snapshot: &ProjectSnapshot,
    race_ids: &BTreeSet<StableId>,
    caste_ids: &BTreeSet<StableId>,
) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    if let Some(campaign) = &snapshot.campaign {
        for (index, target) in campaign.restrictions.banned_races.iter().enumerate() {
            references.push(reference_for_stable_target(
                snapshot.project_id.clone(),
                format!("campaign.restrictions.bannedRaces[{index}]"),
                TargetKind::Race,
                target.clone(),
                race_ids.contains(target),
            ));
        }
        for (index, target) in campaign.restrictions.banned_castes.iter().enumerate() {
            references.push(reference_for_stable_target(
                snapshot.project_id.clone(),
                format!("campaign.restrictions.bannedCastes[{index}]"),
                TargetKind::Caste,
                target.clone(),
                caste_ids.contains(target),
            ));
        }
    }
    references
}

pub(crate) fn reference_for_stable_target(
    source: StableId,
    field: String,
    target_kind: TargetKind,
    target: StableId,
    resolved: bool,
) -> ReferenceDescriptor {
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind,
        target_id: target.0,
        required: true,
        stock_fallback: None,
        resolution: if resolved {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: if resolved {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::CreateTarget]
        },
        byte_provenance: None,
    }
}
