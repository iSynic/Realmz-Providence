//! Bounded authoring inventory, with application Stock kept outside the project.
use crate::{request_params::required_string, stock_items::StockItems};
use providence_core::{
    model::{ItemRuleDefinition, ProjectSnapshot, StableId},
    references::TargetKind,
    session::EditorSession,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(crate) fn dispatch(
    session: &mut EditorSession,
    stock: Option<&StockItems>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "item.list" => list(session, stock, &params),
        "item.open" => open(session, stock, &params),
        "item.recovery.read" => Ok(
            json!({"revision": session.revision(), "canUndo": !session.undo_history().is_empty(), "canRedo": !session.redo_history().is_empty()}),
        ),
        _ => Err(format!("unknown item catalog command {method}")),
    }
}

pub(crate) fn definition_hash(definition: &ItemRuleDefinition) -> String {
    format!(
        "sha256:{:x}",
        Sha256::digest(serde_json::to_vec(definition).expect("Item definition serializes"))
    )
}

fn definitions<'a>(
    snapshot: &'a ProjectSnapshot,
    stock: Option<&'a StockItems>,
) -> BTreeMap<i16, (&'a ItemRuleDefinition, &'static str, Option<u16>)> {
    let mut rows = snapshot
        .item_rules
        .iter()
        .map(|rule| {
            (
                rule.definition.classic_id,
                (&rule.definition, "standard", None),
            )
        })
        .collect::<BTreeMap<_, _>>();
    if let Some(stock) = stock {
        for definition in &stock.definitions {
            rows.insert(definition.classic_id, (definition, "standard", None));
        }
    }
    for rule in &snapshot.scenario_item_rules {
        rows.insert(
            rule.definition.classic_id,
            (&rule.definition, "scenario", Some(rule.record_index)),
        );
    }
    rows
}

fn list(
    session: &EditorSession,
    stock: Option<&StockItems>,
    params: &Value,
) -> Result<Value, String> {
    let (scope, category) = filters(params)?;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let requested_offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(8)
        .clamp(1, 128) as usize;
    let references = session.references();
    let diagnostics = session.diagnostics();
    let mut use_counts = BTreeMap::<String, usize>::new();
    for row in references
        .iter()
        .filter(|row| row.target_kind == TargetKind::Item)
    {
        *use_counts.entry(row.target_id.clone()).or_default() += 1;
    }
    let rows = definitions(session.snapshot(), stock)
        .into_values()
        .filter(|(item, source, _)| {
            (scope == "all" || *source == scope)
                && in_category(item.classic_id, category)
                && matches_query(item, source, &query)
        })
        .collect::<Vec<_>>();
    let total = rows.len();
    let offset = params
        .get("seekIdentity")
        .and_then(Value::as_str)
        .and_then(|identity| rows.iter().position(|(item, _, _)| item.id.0 == identity))
        .map_or(requested_offset, |index| index / limit * limit);
    let items = rows.into_iter().skip(offset).take(limit).map(|(item, source, record)|
        json!({"identity": item.id, "classicId": item.classic_id, "recordIndex": record,
            "name": item.name, "unidentifiedName": item.unidentified_name, "scope": source,
            "editable": source == "scenario", "itemType": item.item_type, "iconId": item.icon_id,
            "cost": item.cost, "usedBy": use_counts.get(&item.id.0).copied().unwrap_or_default(),
            "problems": diagnostics.iter().filter(|row| row.entity.as_ref() == Some(&item.id)).count()}))
        .collect::<Vec<_>>();
    let stock_available = stock.is_some() || !session.snapshot().item_rules.is_empty();
    Ok(
        json!({"revision": session.revision(), "items": items, "offset": offset, "limit": limit,
        "total": total, "truncated": offset.saturating_add(limit) < total, "stockAvailable": stock_available,
        "stockReason": if stock_available { "" } else { "Configure the bundled application item catalog to browse Stock." }}),
    )
}

fn filters(params: &Value) -> Result<(&str, &str), String> {
    let scope = params.get("scope").and_then(Value::as_str).unwrap_or("all");
    let category = params
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("all");
    if !["all", "standard", "scenario"].contains(&scope) {
        return Err(
            "item scope must be all, standard, or scenario; choose All, Scenario or Stock.".into(),
        );
    }
    if !["all", "weapon", "armor", "accessory", "magic", "supply"].contains(&category) {
        return Err("item category must be all, weapon, armor, accessory, magic, or supply; choose a category or All Items.".into());
    }
    Ok((scope, category))
}

fn matches_query(item: &ItemRuleDefinition, scope: &str, query: &str) -> bool {
    query.is_empty()
        || format!(
            "{} {} {} {} {} {} {}",
            item.classic_id,
            item.name,
            item.unidentified_name,
            item.description,
            item.item_type,
            scope,
            category_name(item.classic_id)
        )
        .to_lowercase()
        .contains(query)
}

fn category_name(id: i16) -> &'static str {
    match id {
        1..=199 => "Weapons",
        200..=399 => "Armor",
        400..=599 => "Accessories",
        600..=799 => "Magic",
        _ => "Supplies Special",
    }
}

fn in_category(id: i16, category: &str) -> bool {
    category == "all"
        || matches!(
            (category, id),
            ("weapon", 1..=199)
                | ("armor", 200..=399)
                | ("accessory", 400..=599)
                | ("magic", 600..=799)
                | ("supply", 800..=999)
        )
}

fn open(
    session: &EditorSession,
    stock: Option<&StockItems>,
    params: &Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    let rows = definitions(session.snapshot(), stock);
    let (item, scope, record) = rows
        .values()
        .find(|(item, _, _)| item.id == identity)
        .ok_or_else(|| format!("Item {} is no longer available.", identity.0))?;
    let references = session.references();
    let used_by = references
        .iter()
        .filter(|row| row.target_kind == TargetKind::Item && row.target_id == identity.0)
        .collect::<Vec<_>>();
    let outgoing = references
        .iter()
        .filter(|row| row.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|row| row.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let fingerprint = source_fingerprint(session.snapshot(), stock, &identity, scope);
    Ok(
        json!({"revision": session.revision(), "item": item, "scope": scope,
        "editable": *scope == "scenario", "recordIndex": record,
        "textFeedback": providence_core::codecs::inspect_item_text(item),
        "effects": providence_core::item_reference_catalog::describe_item_effects(item),
        "referenceLabels": reference_labels(session.snapshot(), &rows, item),
        "source": {"nativePath": if *scope == "scenario" { format!("Data NI record {}", record.unwrap()) }
            else { format!("Data ID record {}", item.classic_id) }, "binaryRetained": true, "textRetained": true},
        "copySource": {"identity": identity, "scope": scope, "catalogFingerprint": fingerprint,
            "definitionHash": definition_hash(item)},
        "references": outgoing.into_iter().take(64).collect::<Vec<_>>(),
        "usedBy": used_by.iter().take(64).collect::<Vec<_>>(), "usedByTotal": used_by.len(),
        "usedByTruncated": used_by.len() > 64,
        "diagnostics": diagnostics.iter().take(64).collect::<Vec<_>>(), "diagnosticsTotal": diagnostics.len()}),
    )
}

fn reference_labels(
    snapshot: &ProjectSnapshot,
    rows: &BTreeMap<i16, (&ItemRuleDefinition, &'static str, Option<u16>)>,
    item: &ItemRuleDefinition,
) -> Value {
    let mut labels = serde_json::Map::new();
    for (field, target) in [
        ("cursedItemId", &item.cursed_item_id),
        ("specificRaceId", &item.specific_race_id),
        ("specificCasteId", &item.specific_caste_id),
    ] {
        let Some(target) = target else { continue };
        let name = match field {
            "cursedItemId" => rows
                .values()
                .find(|(row, _, _)| row.id == *target)
                .map(|(row, _, _)| row.name.clone()),
            "specificRaceId" => snapshot
                .race_rules
                .iter()
                .find(|row| row.definition.id == *target)
                .map(|row| row.definition.name.clone()),
            _ => snapshot
                .caste_rules
                .iter()
                .find(|row| row.definition.id == *target)
                .map(|row| row.definition.name.clone()),
        };
        labels.insert(field.into(), json!({"identity": target, "label": name.map_or_else(|| format!("Unavailable · {}", target.0), |name| format!("{name} · {}", target.0))}));
    }
    Value::Object(labels)
}

fn source_fingerprint(
    snapshot: &ProjectSnapshot,
    stock: Option<&StockItems>,
    identity: &StableId,
    scope: &str,
) -> String {
    if scope == "standard" {
        if let Some(stock) = stock {
            return stock.fingerprint.clone();
        }
        return snapshot
            .item_rules
            .iter()
            .find(|rule| rule.definition.id == *identity)
            .map(|rule| format!("{}:{}", rule.source_blob.0, rule.text_source_blob.0))
            .unwrap_or_default();
    }
    snapshot
        .scenario_item_rules
        .iter()
        .find(|rule| rule.definition.id == *identity)
        .map(|rule| {
            format!(
                "{}:{}",
                rule.source_blob.0,
                rule.text_source_blob
                    .as_ref()
                    .map(|blob| blob.0.as_str())
                    .unwrap_or_default()
            )
        })
        .unwrap_or_default()
}
