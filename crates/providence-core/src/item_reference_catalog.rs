//! Item field choices and previews are derived; accepted values remain a local draft.
use crate::model::{AssetDescriptor, ItemRuleDefinition, ProjectSnapshot};
use crate::rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[path = "item_effects.rs"]
mod item_effects;
pub use item_effects::describe_item_effects;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemReferenceQuery {
    pub field: String,
    pub current_value: i32,
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub ownership: String,
    #[serde(default)]
    pub show_unavailable: bool,
    #[serde(default)]
    pub offset: usize,
    #[serde(default)]
    pub seek_current: bool,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemReferenceChoice {
    pub identity: String,
    pub target_identity: Option<String>,
    pub value: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_id: Option<u8>,
    pub label: String,
    pub detail: String,
    pub ownership: String,
    pub available: bool,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemReferencePage {
    pub items: Vec<ItemReferenceChoice>,
    pub offset: usize,
    pub total: usize,
    pub limit: usize,
    pub unavailable_total: usize,
}

pub fn item_reference_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    stock_items: &[ItemRuleDefinition],
    definition: &ItemRuleDefinition,
    query: &ItemReferenceQuery,
) -> Result<ItemReferencePage, String> {
    let mut choices = field_choices(snapshot, application, stock_items, definition, &query.field)?;
    if query.field != "itemType" && query.field != "special.4" {
        choices.push(choice(
            "none".into(),
            0,
            "None".into(),
            "Clear only this field in the local draft.".into(),
            "none",
            true,
            "",
        ));
    }
    if !choices.iter().any(|row| row.value == query.current_value) {
        choices.push(choice(format!("preserved:{}:{}", query.field, query.current_value), query.current_value,
            format!("Current value {}", query.current_value), "Cancel preserves the exact imported value.".into(), "unavailable", false,
            "This value has no supported choice in the current field. Edit its exact value in Advanced or choose a resolved target."));
    }
    Ok(paginate(choices, query))
}

fn paginate(
    mut choices: Vec<ItemReferenceChoice>,
    query: &ItemReferenceQuery,
) -> ItemReferencePage {
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i32>().ok();
    choices.sort_by(|a, b| {
        (exact != Some(a.value), !a.available, a.value, &a.identity).cmp(&(
            exact != Some(b.value),
            !b.available,
            b.value,
            &b.identity,
        ))
    });
    let unavailable_total = choices.iter().filter(|row| !row.available).count();
    let rows = choices
        .into_iter()
        .filter(|row| {
            (query.show_unavailable
                || row.available
                || (needle.is_empty() && row.value == query.current_value))
                && (query.ownership.is_empty()
                    || query.ownership == "all"
                    || row.ownership == query.ownership
                    || row.ownership == "rule"
                    || row.value == 0)
                && (needle.is_empty()
                    || exact == Some(row.value)
                    || format!(
                        "{} {} {} {}",
                        row.label, row.detail, row.value, row.ownership
                    )
                    .to_lowercase()
                    .contains(&needle))
        })
        .collect::<Vec<_>>();
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        rows.iter()
            .position(|row| row.value == query.current_value)
            .map_or(0, |index| index / limit * limit)
    } else {
        query.offset
    };
    ItemReferencePage {
        total: rows.len(),
        items: rows.into_iter().skip(offset).take(limit).collect(),
        offset,
        limit,
        unavailable_total,
    }
}

fn field_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    stock: &[ItemRuleDefinition],
    definition: &ItemRuleDefinition,
    field: &str,
) -> Result<Vec<ItemReferenceChoice>, String> {
    Ok(match field {
        "itemType" => item_effects::type_choices(),
        "special.0" => item_effects::effect_choices(),
        "special.1" => crate::monster_reference_catalog::spell_choices(snapshot).into_iter().map(|row| {
            let available = row.available && row.value > 1100;
            let mut result = choice(row.identity, i32::from(row.value), row.label, row.detail, &row.ownership, available,
                if available { "" } else { "This field stores a spell only when its packed ID is greater than 1100. Otherwise it is an effect amount." });
            result.target_identity = row.target_identity; result
        }).collect(),
        "special.2" if definition.special[0] == -10 => item_effects::inflicted_condition_choices(),
        "special.2" | "special.3" => item_effects::attribute_choices(),
        "special.4" if definition.item_type.unsigned_abs() == 23 || definition.special[0] == -23 => snapshot.extra_action_points.iter().filter_map(|row| {
            let id = i32::from(i16::try_from(row.native_id.0).ok()?);
            Some(choice(row.identity.0.clone(), id, format!("Extra Action Point {id}"), format!("{} ordered actions. Item use runs this reusable script.", row.actions.len()), "scenario", true, ""))
        }).collect(),
        "special.4" => return Err("Special 5 is an effect amount for this item, rather than an Extra Action Point reference.".into()),
        "cursedItemId" => item_choices(snapshot, stock),
        "specificRaceId" => snapshot.race_rules.iter().map(|row| choice(row.definition.id.0.clone(), i32::from(row.definition.classic_id), crate::rule_presentation::record_label(crate::session::rule_authoring::RuleKind::Race, row.definition.classic_id, &row.definition.name), row.definition.description.clone(), "scenario", row.definition.classic_id != 0, if row.definition.classic_id == 0 { "Zero clears this field in Classic. Use the restriction matrix for this race." } else { "" })).collect(),
        "specificCasteId" => snapshot.caste_rules.iter().map(|row| choice(row.definition.id.0.clone(), i32::from(row.definition.classic_id), crate::rule_presentation::record_label(crate::session::rule_authoring::RuleKind::Caste, row.definition.classic_id, &row.definition.name), row.definition.description.clone(), "scenario", row.definition.classic_id != 0, if row.definition.classic_id == 0 { "Zero clears this field in Classic. Use the restriction matrix for this caste." } else { "" })).collect(),
        "iconId" => media_choices(snapshot, application, "cicn", "icon"),
        "soundId" => sound_choices(snapshot, application, definition.sound_id),
        _ => return Err("This item field does not use a reference picker.".into()),
    })
}

fn sound_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    current: i32,
) -> Vec<ItemReferenceChoice> {
    let mut rows = media_choices(snapshot, application, "snd ", "sound");
    for row in &mut rows {
        let resource = row.value;
        row.value = resource.saturating_sub(600);
        row.identity = format!("item-sound:{}", row.value);
        row.detail = format!(
            "Stored item sound {} plays snd {resource}. {}",
            row.value, row.detail
        );
        if row.value == 0 || i16::try_from(row.value).is_err() {
            row.available = false;
            row.reason =
                "Zero means no item sound; other selections must fit the stored signed word."
                    .into();
        }
    }
    if current != 0
        && !rows.iter().any(|row| row.value == current)
        && let Some(resource) = crate::item_sound::resource_id(current)
    {
        let mut row = media_choice(snapshot, application, "snd ", "sound", resource);
        row.identity = format!("item-sound:{current}");
        row.value = current;
        row.detail = format!(
            "Exact stored item sound {current} plays snd {resource}. {}",
            row.detail
        );
        row.available &= i16::try_from(current).is_ok();
        rows.push(row);
    }
    rows
}

fn item_choices(
    snapshot: &ProjectSnapshot,
    stock: &[ItemRuleDefinition],
) -> Vec<ItemReferenceChoice> {
    let mut definitions = BTreeMap::new();
    for row in &snapshot.item_rules {
        definitions.insert(row.definition.id.clone(), (&row.definition, "stock"));
    }
    for row in stock {
        definitions.insert(row.id.clone(), (row, "stock"));
    }
    for row in &snapshot.scenario_item_rules {
        definitions.insert(row.definition.id.clone(), (&row.definition, "scenario"));
    }
    let mut counts = BTreeMap::<i16, usize>::new();
    for (row, _) in definitions.values() {
        *counts.entry(row.classic_id).or_default() += 1;
    }
    definitions
        .into_values()
        .map(|(row, ownership)| {
            let available =
                row.classic_id > 0 && row.classic_id < 1000 && counts[&row.classic_id] == 1;
            choice(
                row.id.0.clone(),
                i32::from(row.classic_id),
                row.name.clone(),
                format!("{}\n{}", row.unidentified_name, row.description),
                ownership,
                available,
                if available {
                    ""
                } else {
                    "This item identity is unsupported or ambiguous."
                },
            )
        })
        .collect()
}

fn media_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    resource_type: &str,
    kind: &str,
) -> Vec<ItemReferenceChoice> {
    let mut keys = BTreeMap::<i32, ()>::new();
    for asset in &snapshot.assets {
        if let Some(key) = &asset.classic_resource
            && key.resource_type == resource_type
        {
            keys.insert(key.resource_id, ());
        }
    }
    if let Some(catalog) = application {
        for asset in &catalog.assets {
            if let Some(key) = &asset.descriptor.classic_resource
                && key.resource_type == resource_type
            {
                keys.insert(key.resource_id, ());
            }
        }
    }
    keys.into_keys()
        .map(|id| media_choice(snapshot, application, resource_type, kind, id))
        .collect()
}

fn media_choice(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    resource_type: &str,
    kind: &str,
    id: i32,
) -> ItemReferenceChoice {
    let key = crate::model::ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id: id,
    };
    let scenario = snapshot
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(&key))
        .collect::<Vec<_>>();
    let (asset, ownership) = if scenario.len() == 1 {
        (Some(scenario[0]), "scenario")
    } else if scenario.is_empty() {
        (
            application.and_then(|catalog| match catalog.resolve_resource(&key, Some(kind)) {
                ApplicationMediaResolution::Resolved(row) => Some(&row.descriptor),
                _ => None,
            }),
            "stock",
        )
    } else {
        (None, "scenario")
    };
    let available =
        asset.is_some_and(|row| valid_media(row, kind)) && id != 0 && i16::try_from(id).is_ok();
    let mut row = choice(
        format!("{resource_type}:{id}"),
        id,
        asset.map_or_else(|| format!("{kind} {id}"), |row| row.label.clone()),
        format!("Exact {kind} resource {id}. Scenario ownership takes precedence."),
        ownership,
        available,
        if available {
            ""
        } else {
            "The exact resource is missing, malformed, ambiguous or outside the supported signed range. A scenario override cannot fall through to Stock."
        },
    );
    row.target_identity = asset.map(|row| row.identity.0.clone());
    row
}

pub fn item_artwork_choice(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    id: i32,
) -> ItemReferenceChoice {
    media_choice(snapshot, application, "cicn", "icon", id)
}

fn valid_media(asset: &AssetDescriptor, kind: &str) -> bool {
    asset.kind == kind
        && asset.byte_length > 0
        && asset.classic_payload_blob.is_some()
        && asset
            .classic_payload_byte_length
            .is_some_and(|size| size > 0)
        && asset.mime_type.as_deref()
            == Some(if kind == "icon" {
                "image/png"
            } else {
                "audio/wav"
            })
}

pub(super) fn choice(
    identity: String,
    value: i32,
    label: String,
    detail: String,
    ownership: &str,
    available: bool,
    reason: &str,
) -> ItemReferenceChoice {
    ItemReferenceChoice {
        author_id: crate::rule_presentation::identity_author_number(&identity),
        target_identity: Some(identity.clone()),
        identity,
        value,
        label,
        detail,
        ownership: ownership.into(),
        available,
        reason: reason.into(),
    }
}

#[cfg(test)]
#[path = "item_reference_catalog_tests.rs"]
mod tests;
