//! Race sets, direct portraits and starting items retain distinct stored identities.
use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ItemRuleDefinition, ProjectSnapshot},
    monster_reference_catalog::MonsterReferenceQuery,
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleResource {
    pub identity: Option<String>,
    pub resource_id: i32,
    pub ownership: String,
    pub label: String,
    pub available: bool,
    pub reason: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleChoice {
    pub identity: String,
    pub value: i32,
    pub label: String,
    pub ownership: String,
    pub detail: String,
    pub available: bool,
    pub reason: String,
    pub target_identity: Option<String>,
    pub resources: Vec<RuleResource>,
}

pub fn portrait_choice(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    field: &str,
    value: i32,
) -> Result<RuleChoice, String> {
    if i16::try_from(value).is_err() {
        return Err("Choose an exact signed 16-bit portrait identity.".into());
    }
    let ids = match field {
        "defaultIconSet" => (0..6).map(|i| 251 + 6 * value + i).collect::<Vec<_>>(),
        "defaultIcon" => vec![value],
        _ => return Err("Choose a Race portrait set or a direct Caste portrait.".into()),
    };
    let resources = ids
        .into_iter()
        .map(|id| resolve(snapshot, application, id))
        .collect::<Vec<_>>();
    let available = resources.iter().all(|r| r.available) && i16::try_from(value).is_ok();
    let ownership = resources
        .first()
        .map(|r| r.ownership.clone())
        .unwrap_or_default();
    let mixed = resources.iter().any(|r| r.ownership != ownership);
    Ok(RuleChoice {
        identity: format!("{field}:{value}"),
        value,
        label: if field == "defaultIconSet" {
            format!("Set {value} · six portraits")
        } else {
            resources[0].label.clone()
        },
        ownership: if mixed { "mixed".into() } else { ownership },
        detail: resources
            .iter()
            .map(|r| format!("CICN {} · {} · {}", r.resource_id, r.label, r.ownership))
            .collect::<Vec<_>>()
            .join("\n"),
        reason: resources
            .iter()
            .filter(|r| !r.available)
            .map(|r| format!("CICN {}: {}", r.resource_id, r.reason))
            .collect::<Vec<_>>()
            .join("\n"),
        target_identity: resources.first().and_then(|r| r.identity.clone()),
        resources,
        available,
    })
}

fn resolve(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    id: i32,
) -> RuleResource {
    let key = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: id,
    };
    let owners = snapshot
        .assets
        .iter()
        .filter(|a| a.classic_resource.as_ref() == Some(&key))
        .collect::<Vec<_>>();
    let (asset, ownership, reason) = if owners.len() == 1 {
        (Some(owners[0]), "scenario", "")
    } else if !owners.is_empty() {
        (
            None,
            "scenario",
            "The exact scenario key is ambiguous. Stock cannot substitute.",
        )
    } else {
        match application.map(|a| a.resolve_resource(&key, None)) {
            Some(ApplicationMediaResolution::Resolved(a)) => (Some(&a.descriptor), "stock", ""),
            _ => (None, "stock", "The exact resource is missing or ambiguous."),
        }
    };
    let available = asset.is_some_and(valid_portrait);
    RuleResource {
        identity: asset.map(|a| a.identity.0.clone()),
        resource_id: id,
        ownership: ownership.into(),
        label: asset
            .map(|a| a.label.clone())
            .unwrap_or_else(|| format!("Missing CICN {id}")),
        available,
        reason: if !available && reason.is_empty() {
            "The exact owner has the wrong kind or no complete portrait preview."
        } else {
            reason
        }
        .into(),
    }
}

fn valid_portrait(asset: &AssetDescriptor) -> bool {
    matches!(asset.kind.as_str(), "portrait" | "icon")
        && asset.mime_type.as_deref() == Some("image/png")
        && asset.byte_length > 0
        && asset.classic_payload_blob.is_some()
        && asset.classic_payload_byte_length.is_some_and(|n| n > 0)
        && asset.width.is_some_and(|v| v > 0)
        && asset.height.is_some_and(|v| v > 0)
}

pub fn rule_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    stock_items: &[ItemRuleDefinition],
    query: &MonsterReferenceQuery,
) -> Result<serde_json::Value, String> {
    let mut rows = if query.field == "startingItem" {
        starting_item_choices(snapshot, stock_items)
    } else {
        portrait_choices(snapshot, application, query)?
    };
    if !rows
        .iter()
        .any(|r| r.value == i32::from(query.current_value))
    {
        rows.push(RuleChoice {
            identity: format!("missing:{}", query.current_value),
            value: i32::from(query.current_value),
            label: "Current missing item (preserved)".into(),
            ownership: "unavailable".into(),
            detail: "Cancel retains this exact slot.".into(),
            available: false,
            reason: "This item does not exist in either scenario or Stock.".into(),
            target_identity: None,
            resources: Vec::new(),
        });
    }
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i32>().ok();
    rows.sort_by_key(|r| (exact != Some(r.value), !r.available, r.value));
    let unavailable = rows.iter().filter(|r| !r.available).count();
    rows.retain(|r| {
        (query.show_unavailable || r.available)
            && (query.ownership.is_empty()
                || query.ownership == "all"
                || r.ownership == query.ownership)
            && (needle.is_empty()
                || exact == Some(r.value)
                || format!("{} {} {} {}", r.label, r.detail, r.identity, r.ownership)
                    .to_lowercase()
                    .contains(&needle))
    });
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        rows.iter()
            .position(|r| r.value == i32::from(query.current_value))
            .map_or(0, |i| i / limit * limit)
    } else {
        query.offset
    };
    Ok(
        serde_json::json!({"total":rows.len(),"offset":offset,"limit":limit,"unavailableTotal":unavailable,
        "items":rows.into_iter().skip(offset).take(limit).collect::<Vec<_>>()}),
    )
}

fn portrait_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &MonsterReferenceQuery,
) -> Result<Vec<RuleChoice>, String> {
    let mut values = BTreeSet::new();
    for key in snapshot
        .assets
        .iter()
        .filter_map(|a| a.classic_resource.as_ref())
        .chain(application.into_iter().flat_map(|a| {
            a.assets
                .iter()
                .filter_map(|r| r.descriptor.classic_resource.as_ref())
        }))
    {
        if key.resource_type != "cicn" {
            continue;
        }
        let value = if query.field == "defaultIconSet" {
            (i64::from(key.resource_id) - 251).div_euclid(6)
        } else {
            i64::from(key.resource_id)
        };
        if i16::try_from(value).is_ok() && (query.field != "defaultIconSet" || value >= 0) {
            values.insert(value as i32);
        }
    }
    values.insert(i32::from(query.current_value));
    values
        .into_iter()
        .map(|v| portrait_choice(snapshot, application, &query.field, v))
        .collect()
}

pub fn starting_item_choices(
    snapshot: &ProjectSnapshot,
    stock: &[ItemRuleDefinition],
) -> Vec<RuleChoice> {
    let mut definitions = BTreeMap::new();
    for item in stock {
        definitions.insert(item.classic_id, (item, "stock"));
    }
    for item in &snapshot.item_rules {
        definitions.insert(item.definition.classic_id, (&item.definition, "stock"));
    }
    for item in &snapshot.scenario_item_rules {
        definitions.insert(item.definition.classic_id, (&item.definition, "scenario"));
    }
    definitions
        .into_iter()
        .filter(|(id, _)| *id != 0)
        .map(|(id, (item, ownership))| RuleChoice {
            identity: item.id.0.clone(),
            value: i32::from(id),
            label: item.name.clone(),
            ownership: ownership.into(),
            detail: format!("Item {id} · {} · {}", item.name, item.description),
            available: true,
            reason: String::new(),
            target_identity: Some(item.id.0.clone()),
            resources: Vec::new(),
        })
        .collect()
}

#[cfg(test)]
#[path = "rule_reference_catalog_tests.rs"]
mod tests;
