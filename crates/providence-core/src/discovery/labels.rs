use super::DiscoveryRecord;

pub(super) fn source_label(record: &DiscoveryRecord, field: &str) -> String {
    let kind = record
        .kind
        .split('-')
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().to_string() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ");
    let mut label = if record.kind == "action-point" {
        record.name.clone()
    } else {
        format!(
            "{kind} {}",
            crate::rule_presentation::identity_author_number(&record.identity)
                .map(|id| id.to_string())
                .unwrap_or_else(|| record.native_id.clone())
        )
    };
    if matches!(record.kind.as_str(), "race" | "caste")
        && !record.name.is_empty()
        && record.name != format!("{} {}", record.kind, record.native_id)
    {
        label.push_str(&format!(" · {}", record.name));
    }
    let slot = field
        .split_once("actions[")
        .and_then(|(_, tail)| tail.split(']').next())
        .and_then(|value| value.parse::<usize>().ok());
    if let Some(slot) = slot {
        if matches!(
            record.kind.as_str(),
            "simple-encounter" | "complex-encounter"
        ) {
            label.push_str(&format!(
                " · Result {} · Step {}",
                slot / 8 + 1,
                slot % 8 + 1
            ));
        } else {
            label.push_str(&format!(" · Step {}", slot + 1));
        }
    }
    label
}
