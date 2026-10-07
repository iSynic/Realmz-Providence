//! Bounded authoring discovery combines exact project rows with cached Stock sources.
use crate::{request_params::required_string, stock_spells::StockSpells};
use providence_core::{
    model::SpellDefinition,
    session::{
        EditorSession,
        spell_authoring::{SpellCopySource, new_scenario_spell, spell_definition_hash},
    },
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub(crate) fn dispatch(
    session: &EditorSession,
    stock: Option<&StockSpells>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    match method {
        "spell.catalog" => list(session, stock, params),
        "spell.open-authoring" => open(session, stock, &required_string(params, "identity")?),
        _ => Err(format!("Unknown spell catalog command {method}")),
    }
}

pub(crate) fn definitions(
    session: &EditorSession,
    stock: Option<&StockSpells>,
) -> Vec<(SpellDefinition, &'static str, bool)> {
    let snapshot = session.snapshot();
    let mut rows = if snapshot.standard_spells.is_empty() {
        stock
            .map(|stock| {
                stock
                    .definitions
                    .iter()
                    .cloned()
                    .map(|row| (row, "standard", true))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        snapshot
            .standard_spells
            .iter()
            .map(|row| (row.definition.clone(), "standard", true))
            .collect::<Vec<_>>()
    };
    if snapshot.scenario_spells.is_empty()
        && !snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data Spell")
    {
        rows.extend((0..105).map(|index| {
            (
                new_scenario_spell(index).expect("Bounded slot"),
                "scenario",
                false,
            )
        }));
    } else {
        rows.extend(
            snapshot
                .scenario_spells
                .iter()
                .map(|row| (row.definition.clone(), "scenario", true)),
        );
    }
    rows.sort_by_key(|(row, _, _)| row.classic_id);
    rows
}

fn list(
    session: &EditorSession,
    stock: Option<&StockSpells>,
    params: &Value,
) -> Result<Value, String> {
    let class = filter(params, "class", 5)?;
    let level = filter(params, "level", 7)?;
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let show_unused = params
        .get("showUnused")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let references = session.references();
    let called = references
        .iter()
        .filter(|r| r.target_kind == providence_core::references::TargetKind::Spell)
        .map(|r| r.target_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let rows = definitions(session, stock)
        .into_iter()
        .filter(|(row, scope, _)| {
            (show_unused || !unused(session, row, &called))
                && (class == 0 || i32::from(row.classic_id) / 1000 == class)
                && (level == 0 || i32::from(row.classic_id) / 100 % 10 == level)
                && format!(
                    "{} {} {} {}",
                    row.classic_id, row.name, row.description, scope
                )
                .to_lowercase()
                .contains(&query)
        })
        .collect::<Vec<_>>();
    let offset = params
        .get("seekIdentity")
        .and_then(Value::as_str)
        .and_then(|id| rows.iter().position(|(row, _, _)| row.id.0 == id))
        .map(|i| i / limit * limit)
        .unwrap_or_else(|| params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize);
    let total = rows.len();
    let items = rows.into_iter().skip(offset).take(limit).map(|(row, scope, present)| {
        let empty = scope == "scenario" && vacant(session, &row);
        json!({"identity":row.id,"classicId":row.classic_id,"recordIndex":row.record_index,
            "name":row.name,"scope":scope,"present":present,"empty":empty,"unused":unused(session, &row, &called),"editable":scope=="scenario"&&!empty,
            "usedBy":references.iter().filter(|r|r.target_kind==providence_core::references::TargetKind::Spell&&r.target_id==row.id.0).count()})
    }).collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"items":items,"offset":offset,"limit":limit,"total":total,
        "truncated":offset.saturating_add(limit)<total,"stockAvailable":stock.is_some()||!session.snapshot().standard_spells.is_empty()}),
    )
}

fn unused(
    session: &EditorSession,
    row: &SpellDefinition,
    called: &std::collections::BTreeSet<&str>,
) -> bool {
    if row.authored
        || session
            .snapshot()
            .scenario_spells
            .iter()
            .any(|source| source.definition.id == row.id && source.name_authored)
        || !row.description.trim().is_empty()
        || !providence_core::codecs::spell_has_empty_native_values(row)
        || called.contains(row.id.0.as_str())
        || called.contains(row.classic_id.to_string().as_str())
    {
        return false;
    }
    let unnamed = row.name.trim().is_empty()
        || row.name == providence_core::codecs::default_standard_spell_name(row.classic_id)
        || row.name == providence_core::codecs::default_scenario_spell_name(row.record_index);
    let untouched_custom_name = session.snapshot().scenario_spells.iter().any(|source| {
        source.definition.id == row.id
            && !source.name_authored
            && row.name
                == format!(
                    "Level {} Spell {}",
                    row.record_index / 15 + 1,
                    row.record_index % 15 + 1
                )
    });
    unnamed || untouched_custom_name
}

fn filter(params: &Value, key: &str, maximum: i32) -> Result<i32, String> {
    let value = params.get(key).and_then(Value::as_i64).unwrap_or(0);
    if !(0..=i64::from(maximum)).contains(&value) {
        return Err(format!("Invalid spell {key} filter."));
    }
    Ok(value as i32)
}

pub(crate) fn open(
    session: &EditorSession,
    stock: Option<&StockSpells>,
    identity: &str,
) -> Result<Value, String> {
    let (definition, scope, present) = definitions(session, stock)
        .into_iter()
        .find(|(row, _, _)| row.id.0 == identity)
        .ok_or("The selected spell is no longer present in its catalog.")?;
    let empty = scope == "scenario" && vacant(session, &definition);
    let copy = SpellCopySource {
        identity: definition.id.clone(),
        scope: scope.into(),
        catalog_fingerprint: fingerprint(session, stock, scope),
        definition_hash: spell_definition_hash(&definition),
    };
    let references = session.references();
    let uses = references
        .iter()
        .filter(|row| {
            row.target_kind == providence_core::references::TargetKind::Spell
                && row.target_id == identity
        })
        .collect::<Vec<_>>();
    let outgoing = references
        .iter()
        .filter(|row| row.source.0 == identity)
        .take(64)
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"definition":definition,"scope":scope,"present":present,
        "editable":scope=="scenario"&&!empty,"empty":empty,"copySource":copy,"usedBy":uses.len(),
        "uses":uses.iter().take(64).collect::<Vec<_>>(),"usesTruncated":uses.len()>64,"outgoing":outgoing}),
    )
}

fn vacant(session: &EditorSession, row: &SpellDefinition) -> bool {
    session.scenario_spell_is_vacant(row.record_index)
}

pub(crate) fn fingerprint(
    session: &EditorSession,
    stock: Option<&StockSpells>,
    scope: &str,
) -> String {
    if scope == "standard" && session.snapshot().standard_spells.is_empty() {
        return stock
            .map(|stock| stock.fingerprint.clone())
            .unwrap_or_default();
    }
    let rows = if scope == "standard" {
        &session.snapshot().standard_spells
    } else {
        &session.snapshot().scenario_spells
    };
    format!(
        "sha256:{:x}",
        Sha256::digest(serde_json::to_vec(rows).expect("Spell catalog serializes"))
    )
}

pub(crate) fn copy_definition(
    session: &EditorSession,
    stock: Option<&StockSpells>,
    source: &SpellCopySource,
) -> Result<SpellDefinition, String> {
    let document = open(session, stock, &source.identity.0)?;
    if document["copySource"] != serde_json::to_value(source).expect("Spell copy source serializes")
    {
        return Err(
            "The copied spell or its catalog changed. Keep the draft and review its source again."
                .into(),
        );
    }
    serde_json::from_value(document["definition"].clone()).map_err(|error| error.to_string())
}
