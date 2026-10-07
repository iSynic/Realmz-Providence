//! Contextual Monster references resolve exact identities before searching or paging.
use crate::model::ProjectSnapshot;
use crate::rebuilt::ApplicationMediaCatalog;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
#[path = "monster_reference_catalog_tests.rs"]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterReferenceQuery {
    pub field: String,
    pub current_value: i16,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterReferenceChoice {
    pub identity: String,
    pub target_identity: Option<String>,
    pub value: i16,
    pub label: String,
    pub detail: String,
    pub ownership: String,
    pub available: bool,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterReferencePage {
    pub items: Vec<MonsterReferenceChoice>,
    pub offset: usize,
    pub total: usize,
    pub limit: usize,
    pub unavailable_total: usize,
}

pub fn monster_reference_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &MonsterReferenceQuery,
) -> Result<MonsterReferencePage, String> {
    let mut choices = field_choices(snapshot, application, &query.field)?;
    retain_current_choice(&mut choices, query);
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i16>().ok();
    choices.sort_by(|a, b| {
        (exact != Some(a.value), !a.available, a.value, &a.identity).cmp(&(
            exact != Some(b.value),
            !b.available,
            b.value,
            &b.identity,
        ))
    });
    let unavailable_total = choices.iter().filter(|row| !row.available).count();
    let filtered = choices
        .into_iter()
        .filter(|row| matches_query(row, query, &needle, exact))
        .collect::<Vec<_>>();
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        filtered
            .iter()
            .position(|row| row.value == query.current_value)
            .map_or(0, |index| index / limit * limit)
    } else {
        query.offset
    };
    let total = filtered.len();
    Ok(MonsterReferencePage {
        items: filtered.into_iter().skip(offset).take(limit).collect(),
        offset,
        total,
        limit,
        unavailable_total,
    })
}

fn field_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    field: &str,
) -> Result<Vec<MonsterReferenceChoice>, String> {
    Ok(match field {
        "specialLand" => crate::special_land_artwork::choices(snapshot, application),
        "deathMacro" => snapshot
            .extra_action_points
            .iter()
            .filter_map(|row| {
                i16::try_from(row.native_id.0)
                    .ok()
                    .filter(|id| *id != 0)
                    .map(|id| {
                        choice(
                            row.identity.0.clone(),
                            id,
                            format!("Extra Action Point {id}"),
                            format!("{} ordered actions", row.actions.len()),
                            "scenario",
                            true,
                            "",
                        )
                    })
            })
            .collect(),
        "iconId" => appearance_choices(snapshot, application),
        "requiredWeapon" => required_weapon_choices(),
        "replacementMonster" => replacement_monster_choices(snapshot),
        "weapon" => {
            let mut rows = item_choices(snapshot, false);
            rows.extend(random_weapon_choices());
            rows
        }
        field if valid_slot(field, "spells", 10) => spell_choices(snapshot),
        field if valid_slot(field, "items", 6) => item_choices(snapshot, true),
        _ => return Err("This field does not use the Monster reference picker.".into()),
    })
}

fn retain_current_choice(choices: &mut Vec<MonsterReferenceChoice>, query: &MonsterReferenceQuery) {
    if query.field == "specialLand" {
        if query.current_value != 0 && !choices.iter().any(|row| row.value == query.current_value) {
            choices.push(choice(
                format!("preserved:specialLand:{}", query.current_value),
                query.current_value,
                format!("Current ID {}", query.current_value),
                "Cancel preserves the existing signed placement.".into(),
                "unavailable",
                false,
                "Choose an available Special Land resource to replace this placement.",
            ));
        }
        return;
    }
    choices.push(choice(
        "none".into(),
        0,
        if query.field == "requiredWeapon" {
            "All weapons"
        } else {
            "None"
        }
        .into(),
        "Clears this local reference when accepted.".into(),
        "none",
        query.field != "replacementMonster",
        if query.field == "replacementMonster" {
            "A retarget requires an active Normal Monster."
        } else {
            ""
        },
    ));
    if !choices
        .iter()
        .any(|choice| choice.value == query.current_value)
    {
        choices.push(choice(
            format!("preserved:{}:{}", query.field, query.current_value),
            query.current_value,
            format!("Current ID {}", query.current_value),
            "The existing value remains unchanged when you cancel.".into(),
            "unavailable",
            false,
            "This signed identity or target is unavailable in the current context.",
        ));
    }
}

fn matches_query(
    row: &MonsterReferenceChoice,
    query: &MonsterReferenceQuery,
    needle: &str,
    exact: Option<i16>,
) -> bool {
    (query.show_unavailable
        || row.available
        || (needle.is_empty() && row.value == query.current_value))
        && (query.ownership.is_empty()
            || query.ownership == "all"
            || row.ownership == query.ownership
            || row.value == 0)
        && (needle.is_empty()
            || exact == Some(row.value)
            || format!(
                "{} {} {} {}",
                row.label, row.detail, row.value, row.ownership
            )
            .to_lowercase()
            .contains(needle))
}

fn item_choices(snapshot: &ProjectSnapshot, signed: bool) -> Vec<MonsterReferenceChoice> {
    let mut effective = BTreeMap::new();
    for row in &snapshot.item_rules {
        effective.insert(row.definition.id.clone(), (&row.definition, "stock"));
    }
    for row in &snapshot.scenario_item_rules {
        effective.insert(row.definition.id.clone(), (&row.definition, "scenario"));
    }
    let mut counts = BTreeMap::<i16, usize>::new();
    for (definition, _) in effective.values() {
        *counts.entry(definition.classic_id).or_default() += 1;
    }
    let mut choices = Vec::new();
    for (identity, (definition, ownership)) in effective {
        let id = definition.classic_id;
        if id <= 0 {
            continue;
        }
        for value in if signed { vec![id, -id] } else { vec![id] } {
            let available = counts[&id] == 1;
            let mut row = choice(
                format!("{}:{value}", identity.0),
                value,
                definition.name.clone(),
                format!("{}\nSigned native ID {value}", definition.description),
                ownership,
                available,
                if available {
                    ""
                } else {
                    "Distinct effective item identities share this native ID. Resolve the collision before selecting it."
                },
            );
            row.target_identity = available.then(|| identity.0.clone());
            choices.push(row);
        }
    }
    choices
}

fn random_weapon_choices() -> Vec<MonsterReferenceChoice> {
    // Pinned donor 56ac232c, monsterReferenceModel.ts: RANDOM_WEAPON_OPTIONS.
    [
        "swords",
        "clubs",
        "clubs / spears",
        "axes",
        "small swords / small axes",
        "clubs / flails / spears",
        "spears / pole weapons",
        "axes / spears",
        "swords / dagger / cutlass / nunchucka",
    ]
    .iter()
    .enumerate()
    .map(|(index, group)| {
        let value = -(index as i16 + 1);
        let mut row = choice(
            format!("random-weapon:{value}"),
            value,
            format!("Random {group}"),
            "Choose a runtime weapon group rather than one item record.".into(),
            "rule",
            true,
            "",
        );
        row.target_identity = None;
        row
    })
    .collect()
}

fn required_weapon_choices() -> Vec<MonsterReferenceChoice> {
    // Display codes 128..253 retain their signed byte identity in the record.
    (-2..=-1).chain(1..=253).map(|code| {
        let stored = if code > 127 { code - 256 } else { code };
        let label = match code { -1 => "Blunt only".into(), -2 => "Sharp only".into(), _ => format!("Weapon {code}") };
        let mut row = choice(format!("required-weapon:{code}"), stored, label,
            format!("Required weapon code {code}. Stored as {stored}; the restriction compares the attacker's weapon number."), "rule", true, "");
        row.target_identity = None;
        row
    }).collect()
}

fn replacement_monster_choices(snapshot: &ProjectSnapshot) -> Vec<MonsterReferenceChoice> {
    snapshot
        .monster_sets
        .iter()
        .filter(|set| set.set_id == 0)
        .flat_map(|set| &set.monsters)
        .filter(|row| row.hit_dice > 0 && row.native_id.0 > 0 && row.native_id.0 <= i16::MAX as u32)
        .map(|row| {
            choice(
                row.identity.0.clone(),
                row.native_id.0 as i16,
                row.display_name.clone(),
                format!(
                    "Normal Monster · Stamina level {} · Armor {} · Difficulty selected at runtime",
                    row.hit_dice, row.armor
                ),
                "scenario",
                true,
                "",
            )
        })
        .collect()
}

pub(crate) fn spell_choices(snapshot: &ProjectSnapshot) -> Vec<MonsterReferenceChoice> {
    let mut effective = BTreeMap::new();
    for row in &snapshot.standard_spells {
        effective.insert(row.definition.id.clone(), (&row.definition, "stock"));
    }
    for row in &snapshot.scenario_spells {
        effective.insert(row.definition.id.clone(), (&row.definition, "scenario"));
    }
    let valid = (0..crate::codecs::STANDARD_SPELL_RECORDS)
        .filter_map(|id| crate::codecs::standard_spell_classic_id(id as u16))
        .chain(
            (0..crate::codecs::SCENARIO_SPELL_RECORDS)
                .filter_map(|id| crate::codecs::scenario_spell_classic_id(id as u16)),
        )
        .collect::<BTreeSet<_>>();
    let mut counts = BTreeMap::<i16, usize>::new();
    for (definition, _) in effective.values() {
        *counts.entry(definition.classic_id).or_default() += 1;
    }
    effective
        .into_iter()
        .map(|(identity, (definition, ownership))| {
            let id = definition.classic_id;
            let available = valid.contains(&id) && counts[&id] == 1;
            choice(
                identity.0,
                id,
                definition.name.clone(),
                definition.description.clone(),
                ownership,
                available,
                if available {
                    ""
                } else {
                    "This packed spell ID is unsupported or has more than one effective definition."
                },
            )
        })
        .collect()
}

fn appearance_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<MonsterReferenceChoice> {
    crate::monster_appearance::monster_appearance_candidate_ids(snapshot, application).into_iter().map(|id| {
        let pair = crate::monster_appearance::resolve_monster_appearance(snapshot, application, id as i16);
        let ownership = if pair.base.as_ref().and_then(|base| base.source_role) == Some(crate::monster_appearance::MonsterAppearanceSourceRole::Scenario) { "scenario" } else { "stock" };
        let label = pair.base.as_ref().and_then(|base| base.asset.as_ref()).map(|asset| asset.label.clone()).unwrap_or_else(|| format!("Appearance {id}"));
        let detail = format!("Exact resources {id} / {}\nBase: {}\nFacing: {}", id + pair.pair_offset,
            appearance_description(pair.base.as_ref()), appearance_description(pair.facing.as_ref()));
        let mut row = choice(format!("monster-appearance:{id}"), id as i16, label, detail, ownership, pair.complete(),
            if pair.complete() { "" } else { "Both exact appearance resources must resolve without malformed or ambiguous overrides." });
        row.target_identity = pair.base.as_ref().and_then(|base| base.asset.as_ref()).map(|asset| asset.identity.0.clone());
        row
    }).collect()
}

fn valid_slot(field: &str, prefix: &str, length: usize) -> bool {
    field
        .strip_prefix(&format!("{prefix}."))
        .and_then(|index| index.parse::<usize>().ok())
        .is_some_and(|index| index < length && field == format!("{prefix}.{index}"))
}

fn choice(
    identity: String,
    value: i16,
    label: String,
    detail: String,
    ownership: &str,
    available: bool,
    reason: &str,
) -> MonsterReferenceChoice {
    let target_identity = (available && value != 0).then(|| identity.clone());
    MonsterReferenceChoice {
        identity,
        target_identity,
        value,
        label,
        detail,
        ownership: ownership.into(),
        available,
        reason: reason.into(),
    }
}

fn appearance_description(
    resource: Option<&crate::monster_appearance::MonsterAppearanceResource>,
) -> String {
    use crate::monster_appearance::{
        MonsterAppearanceResolution as Resolution, MonsterAppearanceSourceRole as Source,
    };
    let Some(resource) = resource else {
        return "Unavailable".into();
    };
    let status = match resource.resolution {
        Resolution::Resolved => "available",
        Resolution::Missing => "missing",
        Resolution::Ambiguous => "ambiguous",
        Resolution::UnsupportedPreview => "preview unsupported",
        Resolution::WrongKind => "wrong resource kind",
    };
    format!(
        "{} · {status}",
        if resource.source_role == Some(Source::Scenario) {
            "Scenario"
        } else {
            "Stock"
        }
    )
}
