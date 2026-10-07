use crate::request_params::required_string;
use providence_core::model::AssetDescriptor;
use providence_core::model::ItemRuleDefinition;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn list_reference_strings(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let resource_type = params
        .get("resourceType")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let groups = collect_reference_string_groups(session, store)?;
    let matches = groups
        .iter()
        .filter(|group| reference_group_matches(group, resource_type, &query))
        .collect::<Vec<_>>();
    let total = matches.len();
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(reference_string_group_summary)
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "counts": reference_group_counts(&groups),
    }))
}

pub(crate) fn open_reference_string(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let identity = required_string(&params, "identity")?;
    let entry_offset = params
        .get("entryOffset")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let entry_limit = params
        .get("entryLimit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let group = collect_reference_string_groups(session, store)?
        .into_iter()
        .find(|group| group.identity == identity)
        .ok_or_else(|| format!("Reference String group '{identity}' was not found"))?;
    let entry_total = group.entries.len();
    let entries = group
        .entries
        .iter()
        .enumerate()
        .skip(entry_offset)
        .take(entry_limit)
        .map(|(index, text)| {
            let preview = text.chars().take(512).collect::<String>();
            json!({
                "index": index,
                "text": preview,
                "textTruncated": text.chars().count() > 512,
            })
        })
        .collect::<Vec<_>>();
    let summary = reference_string_group_summary(&group);

    Ok(json!({
        "revision": session.revision(),
        "group": summary,
        "entries": entries,
        "entryOffset": entry_offset,
        "entryLimit": entry_limit,
        "entryTotal": entry_total,
        "entriesTruncated": entry_offset.saturating_add(entry_limit) < entry_total,
        "editableDocument": group.editable.then_some(json!({
            "kind": "text-resource",
            "identity": group.identity.strip_prefix("reference-string:asset:").unwrap_or(&group.identity),
            "command": "text-resource.open",
        })),
    }))
}

pub(crate) fn reference_string_group_summary(group: &ReferenceStringGroup) -> Value {
    let first = group.entries.iter().find(|entry| !entry.trim().is_empty());
    let preview = first
        .map(|entry| entry.chars().take(120).collect::<String>())
        .unwrap_or_default();
    json!({
        "identity": group.identity,
        "resourceType": group.resource_type,
        "resourceId": group.resource_id,
        "label": group.label,
        "source": group.source,
        "ownership": group.ownership,
        "editable": group.editable,
        "contentAvailable": group.content_available,
        "payloadBytes": group.payload_bytes,
        "entryCount": group.entries.len(),
        "preview": preview,
        "previewTruncated": first.is_some_and(|entry| entry.chars().count() > 120),
    })
}

pub(crate) fn collect_reference_string_groups(
    session: &EditorSession,
    store: Option<&ProjectStore>,
) -> Result<Vec<ReferenceStringGroup>, String> {
    let snapshot = session.snapshot();
    let mut groups = Vec::new();
    append_asset_groups(&mut groups, &snapshot.assets, store)?;
    append_named_catalog_groups(&mut groups, snapshot);
    append_item_reference_groups(
        &mut groups,
        "standard-items",
        snapshot
            .item_rules
            .iter()
            .map(|rule| (&rule.definition, None)),
        snapshot
            .item_rules
            .first()
            .map_or("Data ID.rsrc", |rule| rule.source.as_str()),
        &[0, 200, 400, 600],
    );
    append_item_reference_groups(
        &mut groups,
        "scenario-items",
        snapshot
            .scenario_item_rules
            .iter()
            .map(|rule| (&rule.definition, Some(rule.record_index))),
        "Data NI.rsrc",
        &[800],
    );
    append_spell_reference_groups(
        &mut groups,
        "standard-spells",
        &snapshot.standard_spells,
        "Custom Names.rsrc",
        true,
    );
    append_spell_reference_groups(
        &mut groups,
        "scenario-spells",
        &snapshot.scenario_spells,
        "Data Spell.rsrc",
        false,
    );
    groups.sort_by(|left, right| left.identity.cmp(&right.identity));
    Ok(groups)
}

pub(crate) fn reference_string_group(
    scope: &str,
    resource_id: i32,
    label: &str,
    source: &str,
    ownership: &str,
    entries: Vec<String>,
) -> ReferenceStringGroup {
    ReferenceStringGroup {
        identity: format!("reference-string:{scope}:STR#:{resource_id}"),
        resource_type: "STR#".into(),
        resource_id,
        label: label.into(),
        source: source.into(),
        ownership: ownership.into(),
        editable: false,
        content_available: true,
        payload_bytes: None,
        entries,
    }
}

pub(crate) fn append_item_reference_groups<'a>(
    groups: &mut Vec<ReferenceStringGroup>,
    scope: &str,
    rules: impl Iterator<Item = (&'a ItemRuleDefinition, Option<u16>)> + Clone,
    source: &str,
    bases: &[i16],
) {
    if rules.clone().next().is_none() {
        return;
    }
    for base in bases {
        for offset in 0..=2_i16 {
            let mut entries = vec![String::new(); 200];
            for (definition, record_index) in rules.clone() {
                let index = record_index.map_or_else(
                    || i32::from(definition.classic_id) - i32::from(*base),
                    i32::from,
                );
                if let Ok(index) = usize::try_from(index)
                    && let Some(entry) = entries.get_mut(index)
                {
                    *entry = match offset {
                        0 => definition.unidentified_name.clone(),
                        1 => definition.name.clone(),
                        _ => definition.description.clone(),
                    };
                }
            }
            let resource_id = i32::from(*base + offset);
            let kind =
                ["Unidentified Item Names", "Item Names", "Item Descriptions"][offset as usize];
            groups.push(reference_string_group(
                &format!("{scope}-{base}"),
                resource_id,
                &format!("{kind} {base}"),
                source,
                if scope == "standard-items" {
                    "reference-library"
                } else {
                    "project-string-list"
                },
                entries,
            ));
        }
    }
}

pub(crate) fn append_spell_reference_groups(
    groups: &mut Vec<ReferenceStringGroup>,
    scope: &str,
    spells: &[providence_core::model::SourcedSpellDefinition],
    source: &str,
    standard: bool,
) {
    if spells.is_empty() {
        return;
    }
    let classes = if standard { 4 } else { 1 };
    for class in 0..classes {
        for level in 0..7 {
            let mut entries = vec![String::new(); 15];
            let record_base = class * 105 + level * 15;
            for spell in spells {
                let record_index = usize::from(spell.definition.record_index);
                if (record_base..record_base + 15).contains(&record_index) {
                    entries[record_index - record_base] = spell.definition.name.clone();
                }
            }
            let resource_id = if standard {
                ((class + 1) * 1000 + level) as i32
            } else {
                5000 + level as i32
            };
            groups.push(reference_string_group(
                &format!("{scope}-class-{}", class + 1),
                resource_id,
                &format!(
                    "{} Spell Names Level {}",
                    if standard { "Standard" } else { "Scenario" },
                    level + 1
                ),
                source,
                if standard {
                    "reference-library"
                } else {
                    "project-string-list"
                },
                entries,
            ));
        }
    }
}

pub(crate) fn text_resource_id(asset: &AssetDescriptor) -> Result<i32, String> {
    asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "TEXT")
        .map(|resource| resource.resource_id)
        .ok_or_else(|| {
            format!(
                "Text Resource '{}' does not identify a Classic TEXT resource",
                asset.identity.0
            )
        })
}
#[derive(Debug, Clone)]
pub(crate) struct ReferenceStringGroup {
    pub(crate) identity: String,
    pub(crate) resource_type: String,
    pub(crate) resource_id: i32,
    pub(crate) label: String,
    pub(crate) source: String,
    pub(crate) ownership: String,
    pub(crate) editable: bool,
    pub(crate) content_available: bool,
    pub(crate) payload_bytes: Option<u64>,
    pub(crate) entries: Vec<String>,
}

fn append_asset_groups(
    groups: &mut Vec<ReferenceStringGroup>,
    assets: &[AssetDescriptor],
    store: Option<&ProjectStore>,
) -> Result<(), String> {
    for asset in assets
        .iter()
        .filter(|asset| matches!(asset.kind.as_str(), "text-resource" | "text-style-resource"))
    {
        let Some(resource) = asset.classic_resource.as_ref() else {
            continue;
        };
        let entries = if asset.kind == "text-resource" {
            match store {
                Some(store) => {
                    let bytes = store
                        .read_blob(&asset.blob)
                        .map_err(|error| error.to_string())?;
                    vec![String::from_utf8(bytes).map_err(|_| {
                        format!(
                            "Text Resource '{}' runtime payload is not UTF-8",
                            asset.identity.0
                        )
                    })?]
                }
                None => Vec::new(),
            }
        } else {
            Vec::new()
        };
        groups.push(ReferenceStringGroup {
            identity: format!("reference-string:asset:{}", asset.identity.0),
            resource_type: resource.resource_type.clone(),
            resource_id: resource.resource_id,
            label: asset.label.clone(),
            source: asset.source.clone(),
            ownership: if asset.kind == "text-resource" {
                "project-text".into()
            } else {
                "compatibility-preserved-style".into()
            },
            editable: asset.kind == "text-resource",
            content_available: asset.kind != "text-resource" || store.is_some(),
            payload_bytes: Some(asset.byte_length),
            entries,
        });
    }

    Ok(())
}

fn append_named_catalog_groups(
    groups: &mut Vec<ReferenceStringGroup>,
    snapshot: &providence_core::model::ProjectSnapshot,
) {
    if let Some(catalog) = &snapshot.rule_names {
        groups.push(reference_string_group(
            "rule-races",
            catalog.race_resource_id.into(),
            "Race Names",
            &catalog.source,
            "reference-library",
            catalog.race_names.clone(),
        ));
        groups.push(reference_string_group(
            "rule-castes",
            catalog.caste_resource_id.into(),
            "Caste Names",
            &catalog.source,
            "reference-library",
            catalog.caste_names.clone(),
        ));
    }
    if let Some(catalog) = &snapshot.player_map_names {
        groups.push(reference_string_group(
            "player-map-available",
            -102,
            "Available Player Map Names",
            "Scenario.rsrc",
            "project-string-list",
            catalog.available_names.clone(),
        ));
        groups.push(reference_string_group(
            "player-map-unavailable",
            -101,
            "Unavailable Player Map Names",
            "Scenario.rsrc",
            "project-string-list",
            catalog.unavailable_names.clone(),
        ));
    }
}

fn reference_group_matches(
    group: &ReferenceStringGroup,
    resource_type: Option<&str>,
    query: &str,
) -> bool {
    resource_type.is_none_or(|wanted| group.resource_type == wanted)
        && (query.is_empty()
            || group.identity.to_lowercase().contains(query)
            || group.label.to_lowercase().contains(query)
            || group.source.to_lowercase().contains(query)
            || group.resource_type.to_lowercase().contains(query)
            || group.resource_id.to_string().contains(query)
            || group
                .entries
                .iter()
                .any(|entry| entry.to_lowercase().contains(query)))
}

fn reference_group_counts(groups: &[ReferenceStringGroup]) -> Value {
    let text_count = groups
        .iter()
        .filter(|group| group.resource_type == "TEXT")
        .count();
    let string_list_count = groups
        .iter()
        .filter(|group| group.resource_type == "STR#")
        .count();
    let style_count = groups
        .iter()
        .filter(|group| group.resource_type == "styl")
        .count();

    json!({ "groups": groups.len(), "text": text_count, "stringLists": string_list_count, "styles": style_count })
}
