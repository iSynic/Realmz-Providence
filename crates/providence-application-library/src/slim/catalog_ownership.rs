use providence_core::model::ClassicResourceKey;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn retain_non_application(
    scenario: &mut Value,
    application: &Value,
    section: &str,
    scenario_resource_keys: &BTreeSet<ClassicResourceKey>,
) -> Result<usize, String> {
    let application_entries = application
        .get(section)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("application content has no {section} array"))?;
    let scenario_entries = scenario
        .get_mut(section)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("scenario content has no {section} array"))?;
    let by_id = application_entries
        .iter()
        .map(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|id| (id.to_string(), entry))
                .ok_or_else(|| format!("application {section} entry has no string id"))
        })
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    let before = scenario_entries.len();
    scenario_entries.retain_mut(|entry| {
        let Some(id) = entry.get("id").and_then(Value::as_str) else {
            return true;
        };
        let Some(application_entry) = by_id.get(id) else {
            return true;
        };
        normalize_stock_record(entry, application_entry, section, scenario_resource_keys)
    });
    Ok(before - scenario_entries.len())
}

fn normalize_stock_record(
    entry: &mut Value,
    application_entry: &Value,
    section: &str,
    scenario_resource_keys: &BTreeSet<ClassicResourceKey>,
) -> bool {
    let classic_id = application_entry["classicId"].as_i64().unwrap_or(0);
    if section == "items" && classic_id >= 800 {
        return true;
    }
    let text_fields = match section {
        "items" => {
            let base = (classic_id / 200 * 200) as i32;
            vec![
                ("unidentifiedName", base),
                ("name", base + 1),
                ("description", base + 2),
            ]
        }
        "spells" => {
            let family = (classic_id / 1000 * 1000 + classic_id % 1000 / 100 - 1) as i32;
            vec![("name", family), ("description", -family)]
        }
        _ => Vec::new(),
    };
    // Native text keys own overrides; differing stock mechanics alone do not.
    let mut normalized = application_entry.clone();
    for (field, resource_id) in text_fields {
        if scenario_resource_keys.contains(&ClassicResourceKey {
            resource_type: "STR#".into(),
            resource_id,
        }) && let Some(value) = entry.get(field)
        {
            normalized[field] = value.clone();
        }
    }
    *entry = normalized;
    *entry != *application_entry
}
