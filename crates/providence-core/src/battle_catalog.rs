//! Battle palettes and field pickers retain exact signed and difficulty identities.

use crate::model::{MonsterRecord, ProjectSnapshot};
use crate::monster_reference_catalog::{
    MonsterReferenceChoice, MonsterReferencePage, MonsterReferenceQuery,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[cfg(test)]
#[path = "battle_catalog_tests.rs"]
mod tests;

pub fn references(
    snapshot: &ProjectSnapshot,
    query: &MonsterReferenceQuery,
) -> Result<MonsterReferencePage, String> {
    let mut rows = reference_rows(snapshot, &query.field)?;
    if !rows.iter().any(|row| row.value == query.current_value) {
        rows.push(choice(
            format!("preserved:{}:{}", query.field, query.current_value),
            None,
            query.current_value,
            format!("Current ID {}", query.current_value),
            "Cancel preserves this exact existing value.".into(),
            false,
            "The exact target is unavailable. Choose an available reference to repair this field.",
        ));
    }
    let search = query.search.trim().to_lowercase();
    let exact = search.parse::<i16>().ok();
    rows.sort_by_key(|row| (exact != Some(row.value), !row.available));
    let unavailable_total = rows.iter().filter(|row| !row.available).count();
    let rows: Vec<_> = rows
        .into_iter()
        .filter(|row| {
            (query.show_unavailable
                || row.available
                || (search.is_empty() && row.value == query.current_value))
                && (query.ownership.is_empty()
                    || query.ownership == "all"
                    || query.ownership == "scenario"
                    || row.value == 0)
                && (search.is_empty()
                    || exact == Some(row.value)
                    || format!("{} {} {}", row.label, row.detail, row.value)
                        .to_lowercase()
                        .contains(&search))
        })
        .collect();
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && search.is_empty() {
        rows.iter()
            .position(|row| row.value == query.current_value)
            .map_or(0, |index| index / limit * limit)
    } else {
        query.offset
    };
    let total = rows.len();
    Ok(MonsterReferencePage {
        items: rows.into_iter().skip(offset).take(limit).collect(),
        offset,
        total,
        limit,
        unavailable_total,
    })
}

fn reference_rows(
    snapshot: &ProjectSnapshot,
    field: &str,
) -> Result<Vec<MonsterReferenceChoice>, String> {
    let mut rows = vec![choice(
        "none".into(),
        None,
        0,
        "None".into(),
        "Clears this local reference when accepted.".into(),
        true,
        "",
    )];
    match field {
        "messageBefore" | "messageAfter" => append_strings(snapshot, &mut rows),
        "battleMacro" => append_macros(snapshot, &mut rows),
        _ => return Err("This field does not use the Battle reference picker.".into()),
    }
    Ok(rows)
}

fn append_strings(snapshot: &ProjectSnapshot, rows: &mut Vec<MonsterReferenceChoice>) {
    for record in &snapshot.messages {
        let Ok(value) = i16::try_from(record.native_id.0) else {
            continue;
        };
        rows.push(choice(
            record.identity.0.clone(),
            Some(record.identity.0.clone()),
            value,
            record.text.chars().take(80).collect(),
            record.text.clone(),
            value > 0,
            if value == 0 {
                "String 0 is reference-only here. Choose None to clear this field."
            } else {
                ""
            },
        ));
    }
}

fn append_macros(snapshot: &ProjectSnapshot, rows: &mut Vec<MonsterReferenceChoice>) {
    for record in &snapshot.extra_action_points {
        let Ok(id) = i16::try_from(record.native_id.0) else {
            continue;
        };
        let text = format!("{} ordered steps", record.actions.len());
        if id > 0 {
            rows.push(choice(
                format!("battle-macro:-{id}"),
                Some(record.identity.0.clone()),
                -id,
                format!("Extra Action Point {id}"),
                text.clone(),
                true,
                "",
            ));
        }
        rows.push(choice(format!("battle-macro:+{id}"), Some(record.identity.0.clone()), id,
                    format!("Extra Action Point {id} · reference only"), text, false,
                    if id == 0 { "XAP 0 cannot run as a round macro. Choose None to clear this field." }
                    else { "A positive imported macro is retained but does not run. Choose the negative XAP identity to run it." }));
    }
}

fn choice(
    identity: String,
    target_identity: Option<String>,
    value: i16,
    label: String,
    detail: String,
    available: bool,
    reason: &str,
) -> MonsterReferenceChoice {
    MonsterReferenceChoice {
        identity,
        target_identity,
        value,
        label,
        detail,
        ownership: "scenario".into(),
        available,
        reason: reason.into(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaletteQuery {
    pub set_id: i16,
    #[serde(default)]
    pub current_id: u32,
    #[serde(default)]
    pub retained_ids: Vec<u32>,
    #[serde(default)]
    pub only_retained: bool,
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub show_unavailable: bool,
    #[serde(default)]
    pub offset: usize,
    pub limit: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaletteRow {
    pub native_id: u32,
    pub identity: String,
    pub label: String,
    pub monster: Option<MonsterRecord>,
    pub available: bool,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PalettePage {
    pub items: Vec<PaletteRow>,
    pub offset: usize,
    pub limit: usize,
    pub total: usize,
    pub placeable_total: usize,
}

pub fn palette(snapshot: &ProjectSnapshot, query: &PaletteQuery) -> Result<PalettePage, String> {
    if ![-1, 0, 1].contains(&query.set_id) || query.retained_ids.len() > 169 {
        return Err("Invalid Battle palette context.".into());
    }
    let mut ids: BTreeSet<_> = if query.only_retained {
        BTreeSet::new()
    } else {
        snapshot
            .monster_sets
            .iter()
            .flat_map(|set| set.monsters.iter().map(|row| row.native_id.0))
            .collect()
    };
    ids.extend(query.retained_ids.iter().copied());
    if query.current_id > 0 {
        ids.insert(query.current_id);
    }
    let mut rows: Vec<_> = ids
        .into_iter()
        .map(|id| palette_row(snapshot, query.set_id, id))
        .collect();
    let placeable_total = rows.iter().filter(|row| row.available).count();
    let search = query.search.trim().to_lowercase();
    let exact = search.parse::<u32>().ok();
    rows.sort_by_key(|row| (exact != Some(row.native_id), !row.available));
    let rows: Vec<_> = rows
        .into_iter()
        .filter(|row| {
            (row.available
                || query.show_unavailable
                || (query.current_id > 0 && row.native_id == query.current_id))
                && (search.is_empty()
                    || exact == Some(row.native_id)
                    || format!(
                        "{} {} icon {}",
                        row.native_id,
                        row.label,
                        row.monster.as_ref().map_or(0, |record| record.icon_id)
                    )
                    .to_lowercase()
                    .contains(&search))
        })
        .collect();
    let total = rows.len();
    let limit = query.limit.clamp(1, 128);
    Ok(PalettePage {
        items: rows.into_iter().skip(query.offset).take(limit).collect(),
        offset: query.offset,
        limit,
        total,
        placeable_total,
    })
}

fn palette_row(snapshot: &ProjectSnapshot, set_id: i16, id: u32) -> PaletteRow {
    let selected = monster(snapshot, set_id, id);
    let normal = monster(snapshot, 0, id);
    let reason = availability(snapshot, set_id, id);
    PaletteRow {
        native_id: id,
        identity: format!("monster:{}:{id}", set_id),
        label: selected
            .or(normal)
            .map(|row| row.display_name.clone())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("Monster {id}")),
        monster: selected.cloned(),
        available: reason.is_empty(),
        reason,
    }
}

fn monster(snapshot: &ProjectSnapshot, set_id: i16, id: u32) -> Option<&MonsterRecord> {
    snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == set_id)?
        .monsters
        .iter()
        .find(|row| row.native_id.0 == id)
}

fn availability(snapshot: &ProjectSnapshot, set_id: i16, id: u32) -> String {
    if id == 0 {
        return "Monster 0 is the empty-cell value, not a paintable occupant.".into();
    }
    if id > 217 {
        return "Outside the supported 1–217 painting palette; existing placements remain preserved and inspectable.".into();
    }
    if monster(snapshot, 0, id).is_none() {
        return "The required Normal record is missing. Create the exact record or choose a replacement.".into();
    }
    let Some(selected) = monster(snapshot, set_id, id) else {
        return "The exact preview-set record is missing; another set will not be substituted."
            .into();
    };
    if selected.hit_dice == 0 || selected.hit_dice == 255 {
        return "This is an empty or terminator Monster record.".into();
    }
    for set in &snapshot.monster_sets {
        if monster(snapshot, set.set_id, id).is_none() {
            return format!(
                "Difficulty set {} is present but lacks Monster {id}. Create that exact variant before placing it.",
                set.set_id
            );
        }
    }
    String::new()
}
