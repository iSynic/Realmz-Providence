//! Author-facing labels decorate bounded typed links without changing navigation authority.
use crate::{stock_items::StockItems, stock_rules::StockRules};
use providence_core::{model::ProjectSnapshot, references::ReferenceDescriptor};
use serde_json::Value;

pub(crate) fn decorate(
    snapshot: &ProjectSnapshot,
    rules: &StockRules,
    items: Option<&StockItems>,
    caste_bytes: &[u8],
    reference: &ReferenceDescriptor,
) -> Value {
    let mut row = serde_json::to_value(reference).expect("Typed references serialize");
    row["sourceLabel"] = label(snapshot, rules, items, &reference.source.0).into();
    if reference.field.0.starts_with("campaign.restrictions.") {
        row["sourceLabel"] = "Scenario restrictions".into();
    }
    row["targetLabel"] = label(snapshot, rules, items, &reference.target_id).into();
    row["fieldLabel"] = field_label(reference, caste_bytes).into();
    row
}

fn label(
    snapshot: &ProjectSnapshot,
    rules: &StockRules,
    items: Option<&StockItems>,
    identity: &str,
) -> String {
    let parts: Vec<_> = identity.split('.').collect();
    let id = parts.last().and_then(|v| v.parse::<usize>().ok());
    let family = parts.get(1).copied().unwrap_or("");
    let display_id = providence_core::rule_presentation::identity_author_number(identity)
        .map(usize::from)
        .or(id);
    let names = snapshot.rule_names.as_ref().unwrap_or(&rules.names);
    let name = match (family, id) {
        ("race", Some(id)) => names
            .race_names
            .get(id.saturating_sub(1))
            .map(String::as_str),
        ("caste", Some(id)) => names
            .caste_names
            .get(id.saturating_sub(1))
            .map(String::as_str),
        ("item", _) => snapshot
            .scenario_item_rules
            .iter()
            .find(|r| r.definition.id.0 == identity)
            .map(|r| r.definition.name.as_str())
            .or_else(|| {
                snapshot
                    .item_rules
                    .iter()
                    .find(|r| r.definition.id.0 == identity)
                    .map(|r| r.definition.name.as_str())
            })
            .or_else(|| {
                items.and_then(|s| {
                    s.definitions
                        .iter()
                        .find(|r| r.id.0 == identity)
                        .map(|r| r.name.as_str())
                })
            }),
        _ => None,
    };
    if let (Some(id), Some(name)) = (display_id, name.filter(|name| !name.is_empty())) {
        return format!("{} {id} · {name}", title(family));
    }
    if let Some(id) = display_id {
        return format!("{} {id}", title(family));
    }
    identity.replace(['.', '-', ':'], " ")
}

fn title(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().to_string() + chars.as_str())
        .unwrap_or_default()
}

fn field_label(reference: &ReferenceDescriptor, caste_bytes: &[u8]) -> String {
    let field = reference.field.0.trim_start_matches("definition.");
    let (name, slot) = field.split_once('[').map_or((field, None), |(name, tail)| {
        (name, tail.trim_end_matches(']').parse::<usize>().ok())
    });
    let label = match name {
        "eligibleRaceIds" => "Permitted race",
        "eligibleCasteIds" => "Permitted caste",
        "startingItemIds" | "startingItems" | "nativeFields.startingItems" => "Starting item slot",
        "defaultIcon" | "defaultIconSet" => "Portrait",
        "campaign.restrictions.bannedRaces" => "Race cannot play · restriction",
        "campaign.restrictions.bannedCastes" => "Caste cannot play · restriction",
        _ => name,
    };
    if matches!(
        name,
        "eligibleRaceIds"
            | "eligibleCasteIds"
            | "campaign.restrictions.bannedRaces"
            | "campaign.restrictions.bannedCastes"
    ) {
        return format!(
            "{label} {}",
            providence_core::rule_presentation::identity_author_number(&reference.target_id)
                .map(|id| id.to_string())
                .unwrap_or_else(|| reference
                    .target_id
                    .rsplit('.')
                    .next()
                    .unwrap_or(&reference.target_id)
                    .to_string())
        );
    }
    if name == "startingItemIds" {
        let id = reference
            .source
            .0
            .rsplit('.')
            .next()
            .and_then(|id| id.parse().ok());
        let native_slot = id
            .and_then(|id| providence_core::codecs::read_caste_native_fields(caste_bytes, id).ok())
            .and_then(|fields| {
                fields
                    .starting_items
                    .iter()
                    .enumerate()
                    .filter(|(_, item)| item.is_some())
                    .nth(slot?)
                    .map(|(index, _)| index)
            });
        return native_slot.map_or_else(
            || "Starting item · native slot unavailable".into(),
            |index| format!("Starting item slot {:02}", index + 1),
        );
    }
    slot.map_or_else(|| label.into(), |slot| format!("{label} {}", slot + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::{
        model::StableId,
        references::{FieldPath, ResolutionState, TargetKind},
    };
    fn reference(field: &str, target: &str) -> ReferenceDescriptor {
        ReferenceDescriptor {
            source: StableId("classic.caste.21".into()),
            field: FieldPath(field.into()),
            target_kind: TargetKind::Item,
            target_id: target.into(),
            required: false,
            stock_fallback: None,
            resolution: ResolutionState::Resolved,
            repair_actions: vec![],
            byte_provenance: None,
        }
    }
    #[test]
    fn item_labels_preserve_native_holes_and_late_duplicate_slots() {
        let mut bytes = vec![0; 30 * 576];
        for slot in [0, 2, 19] {
            let offset = 20 * 576 + 386 + slot * 2;
            bytes[offset..offset + 2].copy_from_slice(&14i16.to_be_bytes());
        }
        for (ordinal, slot) in [(0, 1), (1, 3), (2, 20)] {
            assert_eq!(
                field_label(
                    &reference(&format!("startingItemIds[{ordinal}]"), "classic.item.14"),
                    &bytes
                ),
                format!("Starting item slot {slot:02}")
            );
        }
    }
    #[test]
    fn permission_labels_use_fixed_target_id_instead_of_array_ordinal() {
        assert_eq!(
            field_label(&reference("eligibleRaceIds[10]", "classic.race.20"), &[]),
            "Permitted race 19"
        );
        assert_eq!(
            field_label(&reference("eligibleCasteIds[2]", "classic.caste.21"), &[]),
            "Permitted caste 20"
        );
        assert_eq!(
            field_label(
                &reference("campaign.restrictions.bannedRaces[0]", "classic.race.30"),
                &[]
            ),
            "Race cannot play · restriction 29"
        );
    }
}
