//! Presentation choices retain stored byte identities and exact resource ownership.
use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot, SpellDefinition},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpellReferenceQuery {
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
pub struct SpellResource {
    pub resource_type: String,
    pub resource_id: i32,
    pub identity: Option<String>,
    pub label: String,
    pub ownership: String,
    pub available: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellReferenceChoice {
    pub identity: String,
    pub target_identity: Option<String>,
    pub value: i32,
    pub label: String,
    pub detail: String,
    pub ownership: String,
    pub available: bool,
    pub reason: String,
    pub resources: Vec<SpellResource>,
    pub tile_rect: Option<[u32; 4]>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellReferencePage {
    pub items: Vec<SpellReferenceChoice>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub unavailable_total: usize,
}

pub fn spell_reference_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    definition: &SpellDefinition,
    query: &SpellReferenceQuery,
) -> Result<SpellReferencePage, String> {
    let field = query.field.as_str();
    if field == "spellClass" && definition.special != 58 {
        return Err("Summon selection is available only for effect 58. This field otherwise retains its exact numeric value.".into());
    }
    if !matches!(
        field,
        "soundStart" | "soundEnd" | "lookStart" | "lookEnd" | "queueIcon" | "spellClass"
    ) {
        return Err("This spell field does not use a presentation or summon picker.".into());
    }
    let values = stored_values(snapshot, field);
    let mut rows = values
        .into_iter()
        .map(|value| spell_reference_choice(snapshot, application, field, value))
        .collect::<Result<Vec<_>, _>>()?;
    if !rows.iter().any(|row| row.value == query.current_value) {
        rows.push(spell_reference_choice(
            snapshot,
            application,
            field,
            query.current_value,
        )?);
    }
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i32>().ok();
    rows.sort_by_key(|row| (exact != Some(row.value), !row.available, row.value));
    let unavailable_total = rows.iter().filter(|row| !row.available).count();
    rows.retain(|row| matches_query(row, query, &needle, exact));
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        rows.iter()
            .position(|r| r.value == query.current_value)
            .map_or(0, |i| i / limit * limit)
    } else {
        query.offset
    };
    Ok(SpellReferencePage {
        total: rows.len(),
        items: rows.into_iter().skip(offset).take(limit).collect(),
        offset,
        limit,
        unavailable_total,
    })
}

fn stored_values(snapshot: &ProjectSnapshot, field: &str) -> Vec<i32> {
    if field == "spellClass" {
        let mut values = vec![0];
        values.extend(
            snapshot
                .monster_sets
                .iter()
                .filter(|set| set.set_id == 0)
                .flat_map(|set| set.monsters.iter())
                .filter_map(|row| i32::try_from(row.native_id.0).ok())
                .filter(|id| *id > 0 && *id <= 255),
        );
        values.sort();
        values.dedup();
        values
    } else {
        (0..=if field == "queueIcon" { 200 } else { 255 }).collect()
    }
}

fn matches_query(
    row: &SpellReferenceChoice,
    query: &SpellReferenceQuery,
    needle: &str,
    exact: Option<i32>,
) -> bool {
    (query.show_unavailable
        || row.available
        || (needle.is_empty() && row.value == query.current_value))
        && (query.ownership.is_empty()
            || query.ownership == "all"
            || row.ownership == query.ownership
            || (row.value == 0 && row.resources.is_empty()))
        && (needle.is_empty()
            || exact == Some(row.value)
            || format!(
                "{} {} {}",
                row.label,
                row.detail,
                row.resources
                    .iter()
                    .map(|r| r.resource_id.to_string())
                    .collect::<Vec<_>>()
                    .join(" ")
            )
            .to_lowercase()
            .contains(needle))
}

pub fn spell_reference_choice(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    field: &str,
    value: i32,
) -> Result<SpellReferenceChoice, String> {
    let mut row = SpellReferenceChoice {
        identity: format!("spell:{field}:{value}"),
        target_identity: None,
        value,
        label: String::new(),
        detail: String::new(),
        ownership: "none".into(),
        available: (0..=255).contains(&value),
        reason: String::new(),
        resources: Vec::new(),
        tile_rect: None,
    };
    match field {
        "soundStart" | "soundEnd" if value == 0 => row.label = "None".into(),
        "soundStart" | "soundEnd" => set_sound(&mut row, snapshot, application, value),
        "lookStart" if value == 0 => row.label = "Blank cast".into(),
        "lookStart" | "lookEnd" => set_animation(&mut row, snapshot, application, field, value),
        "queueIcon" if value == 0 => row.label = "Blank queue icon".into(),
        "queueIcon" => set_queue(&mut row, snapshot, application, value),
        "spellClass" if value == 0 => {
            row.label = "Random eligible monster".into();
            row.detail =
                "Effect 58 selects an eligible monster at runtime; this is not Monster 0.".into();
        }
        "spellClass" => set_summon(&mut row, snapshot, value),
        _ => return Err("This spell field does not have a reference choice.".into()),
    }
    finish_resources(&mut row);
    Ok(row)
}

fn set_sound(
    row: &mut SpellReferenceChoice,
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    value: i32,
) {
    row.resources.push(resource(
        snapshot,
        application,
        "snd ",
        600 + value,
        "sound",
    ));
    row.label = row.resources[0].label.clone();
    row.detail = format!("Stored {value} · exact snd {}", 600 + value);
}

fn set_animation(
    row: &mut SpellReferenceChoice,
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    field: &str,
    value: i32,
) {
    let first = if field == "lookEnd" && value == 0 {
        12032
    } else {
        11992 + value * 8
    };
    row.label = if value == 0 {
        "Default resolution".into()
    } else {
        format!("Animation {value}")
    };
    row.detail = format!(
        "Eight exact CICN frames {first}–{}. {}",
        first + 7,
        if field == "lookStart" && value >= 20 {
            "Resource preview; Classic uses a procedural cast path."
        } else {
            "Scenario resources precede Stock."
        }
    );
    row.resources
        .extend((0..8).map(|frame| resource(snapshot, application, "cicn", first + frame, "icon")));
}

fn set_queue(
    row: &mut SpellReferenceChoice,
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    value: i32,
) {
    row.label = format!("Queue {value} · Battle tile {}", 200 + value);
    row.resources
        .push(resource(snapshot, application, "PICT", 302, "tileset"));
    if (1..=200).contains(&value) {
        let tile = (value + 199) as u32;
        row.tile_rect = Some([(tile % 20) * 32, (tile / 20) * 32, 32, 32]);
    } else {
        row.available = false;
        row.reason="Queue icons support stored values 1–200. The imported value is preserved until changed.".into();
    }
}

fn set_summon(row: &mut SpellReferenceChoice, snapshot: &ProjectSnapshot, value: i32) {
    row.ownership = "scenario".into();
    let matches = snapshot
        .monster_sets
        .iter()
        .filter(|set| set.set_id == 0)
        .flat_map(|set| set.monsters.iter())
        .filter(|monster| i32::try_from(monster.native_id.0).ok() == Some(value))
        .collect::<Vec<_>>();
    row.label = matches.first().map_or_else(
        || format!("Missing monster {value}"),
        |m| format!("{} · {value}", m.display_name),
    );
    row.available &= matches.len() == 1;
    row.target_identity = matches.first().map(|m| m.identity.0.clone());
    if !row.available {
        row.reason = "Choose one existing Normal-set monster with an ID from 1–255.".into();
    }
}

fn finish_resources(row: &mut SpellReferenceChoice) {
    if !row.resources.is_empty() {
        row.target_identity = row.resources[0].identity.clone();
        row.ownership = row.resources[0].ownership.clone();
        if row.resources.iter().any(|r| r.ownership != row.ownership) {
            row.ownership = "mixed".into();
        }
        row.available &= row.resources.iter().all(|r| r.available);
        if row.reason.is_empty() {
            row.reason = row
                .resources
                .iter()
                .filter(|r| !r.available)
                .map(|r| format!("{} {}: {}", r.resource_type, r.resource_id, r.reason))
                .collect::<Vec<_>>()
                .join("\n");
        }
        row.detail += &format!(
            "\n{}",
            row.resources
                .iter()
                .map(|r| format!("{} {} · {}", r.resource_type, r.resource_id, r.ownership))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    if !row.available && row.reason.is_empty() {
        row.reason = "This stored byte value is unsupported. Cancel preserves it.".into();
    }
}

fn resource(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    resource_type: &str,
    id: i32,
    kind: &str,
) -> SpellResource {
    let key = ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id: id,
    };
    let scenario = snapshot
        .assets
        .iter()
        .filter(|row| row.classic_resource.as_ref() == Some(&key))
        .collect::<Vec<_>>();
    let (asset, ownership, reason) = if scenario.len() == 1 {
        (Some(scenario[0]), "scenario", "")
    } else if !scenario.is_empty() {
        (
            None,
            "scenario",
            "The scenario key is ambiguous; Stock cannot substitute.",
        )
    } else {
        match application.map(|catalog| catalog.resolve_resource(&key, Some(kind))) {
            Some(ApplicationMediaResolution::Resolved(asset)) => {
                (Some(&asset.descriptor), "stock", "")
            }
            _ => (None, "stock", "The exact resource is missing or ambiguous."),
        }
    };
    let available = asset.is_some_and(|asset| valid_resource(asset, kind));
    SpellResource {
        resource_type: resource_type.into(),
        resource_id: id,
        identity: asset.map(|row| row.identity.0.clone()),
        label: asset.map_or_else(
            || format!("Missing {resource_type} {id}"),
            |row| row.label.clone(),
        ),
        ownership: ownership.into(),
        available,
        reason: if !available && reason.is_empty() {
            "The exact owner has the wrong kind or malformed presentation."
        } else {
            reason
        }
        .into(),
    }
}

fn valid_resource(asset: &AssetDescriptor, kind: &str) -> bool {
    asset.kind == kind
        && asset.byte_length > 0
        && asset.classic_payload_blob.is_some()
        && asset.classic_payload_byte_length.is_some_and(|n| n > 0)
        && asset.mime_type.as_deref()
            == Some(if kind == "sound" {
                "audio/wav"
            } else {
                "image/png"
            })
        && (kind != "tileset" || (asset.width == Some(640) && asset.height == Some(640)))
}

#[cfg(test)]
mod tests;
