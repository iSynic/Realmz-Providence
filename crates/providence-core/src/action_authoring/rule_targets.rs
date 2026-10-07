use super::{ActionTarget, ActionTargetStatus};
use crate::model::{ProjectSnapshot, StableId};

pub(super) fn races(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .race_rules
        .iter()
        .map(|row| {
            let definition = &row.definition;
            rule(
                &definition.id,
                definition.classic_id,
                &definition.name,
                &definition.description,
                "Race",
                "Data Race",
            )
        })
        .collect()
}

pub(super) fn castes(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .caste_rules
        .iter()
        .map(|row| {
            let definition = &row.definition;
            rule(
                &definition.id,
                definition.classic_id,
                &definition.name,
                &definition.description,
                "Caste",
                "Data Caste",
            )
        })
        .collect()
}

fn rule(
    identity: &StableId,
    classic_id: u8,
    name: &str,
    description: &str,
    family: &str,
    source: &str,
) -> ActionTarget {
    let label = if name.trim().is_empty() {
        format!("{family} {classic_id}")
    } else {
        name.trim().into()
    };
    let detail = if description.trim().is_empty() {
        format!("{source} record {classic_id}")
    } else {
        clip(description)
    };
    ActionTarget {
        identity: identity.clone(),
        value: i32::from(classic_id),
        label,
        detail,
        status: ActionTargetStatus::Resolved,
        preview: None,
    }
}

fn clip(value: &str) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.chars().count() <= 96 {
        clean
    } else {
        format!("{}…", clean.chars().take(95).collect::<String>())
    }
}
