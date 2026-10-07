use crate::model::{LevelType, ProjectSnapshot, StableId};
use crate::rebuilt::ApplicationMediaCatalog;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

mod media;
use media::resources;
mod monster_appearances;
mod monster_name_tags;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionTargetKind {
    Message,
    OptionLabel,
    Quest,
    Battle,
    Treasure,
    Item,
    Shop,
    SimpleEncounter,
    ComplexEncounter,
    RogueEncounter,
    TimedEncounter,
    ExtraActionPoint,
    SameMapActionPoint,
    Sound,
    Picture,
    Monster,
    MonsterAppearance,
    MonsterNameTag,
    Map,
    MapTile,
    PlayerMap,
    RandomRectangle,
    TextResource,
    Spell,
    Race,
    Caste,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionTargetContext {
    pub map_identity: Option<StableId>,
    pub level_type: Option<LevelType>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionTargetStatus {
    Resolved,
    CompatibilityResource,
    ApplicationResource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionTarget {
    pub identity: StableId,
    pub value: i32,
    pub label: String,
    pub detail: String,
    pub status: ActionTargetStatus,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionTargetQuery {
    pub kind: ActionTargetKind,
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub cursor: Option<String>,
    pub limit: usize,
    #[serde(default)]
    pub context: ActionTargetContext,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionTargetPage {
    pub items: Vec<ActionTarget>,
    pub total: usize,
    pub next_cursor: Option<String>,
}

pub fn list_targets(
    snapshot: &ProjectSnapshot,
    query: &ActionTargetQuery,
) -> Result<ActionTargetPage, String> {
    list_targets_with_application(snapshot, None, query)
}

pub fn list_targets_with_application(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionTargetQuery,
) -> Result<ActionTargetPage, String> {
    let offset = query
        .cursor
        .as_deref()
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| "action target cursor is invalid".to_owned())?;
    let limit = query.limit.clamp(1, 128);
    let needle = query.search.trim().to_ascii_lowercase();
    let mut items = targets(snapshot, application, query.kind, &query.context);
    items.sort_by(|left, right| (left.value, &left.label).cmp(&(right.value, &right.label)));
    items.dedup_by(|left, right| left.identity == right.identity && left.value == right.value);
    if !needle.is_empty() {
        items.retain(|item| {
            format!(
                "{} {} {} {}",
                item.value, item.identity.0, item.label, item.detail
            )
            .to_ascii_lowercase()
            .contains(&needle)
        });
    }
    let total = items.len();
    let page = items
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let next = offset
        .checked_add(page.len())
        .filter(|next| *next < total)
        .map(|next| next.to_string());
    Ok(ActionTargetPage {
        items: page,
        total,
        next_cursor: next,
    })
}

fn targets(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    kind: ActionTargetKind,
    context: &ActionTargetContext,
) -> Vec<ActionTarget> {
    match kind {
        ActionTargetKind::Message => messages(snapshot),
        ActionTargetKind::OptionLabel => option_labels(snapshot),
        ActionTargetKind::Quest => quests(snapshot),
        ActionTargetKind::Battle => battles(snapshot),
        ActionTargetKind::Treasure => treasures(snapshot),
        ActionTargetKind::Shop => shops(snapshot),
        ActionTargetKind::SimpleEncounter => simple_encounters(snapshot),
        ActionTargetKind::ComplexEncounter => complex_encounters(snapshot),
        ActionTargetKind::RogueEncounter => rogue_encounters(snapshot),
        ActionTargetKind::TimedEncounter => timed_encounters(snapshot),
        ActionTargetKind::ExtraActionPoint => extra_action_points(snapshot),
        ActionTargetKind::SameMapActionPoint => same_map_action_points(snapshot, context),
        ActionTargetKind::Map => maps(snapshot, context),
        ActionTargetKind::MapTile => super::map_tiles::targets(snapshot, application, context),
        ActionTargetKind::PlayerMap => player_maps(snapshot),
        ActionTargetKind::RandomRectangle => random_rectangles(snapshot, context),
        ActionTargetKind::Item => items(snapshot),
        ActionTargetKind::Spell => spells(snapshot),
        ActionTargetKind::Race => super::rule_targets::races(snapshot),
        ActionTargetKind::Caste => super::rule_targets::castes(snapshot),
        ActionTargetKind::Monster => monsters(snapshot),
        ActionTargetKind::MonsterAppearance => monster_appearances::targets(snapshot, application),
        ActionTargetKind::MonsterNameTag => monster_name_tags::targets(snapshot),
        ActionTargetKind::Sound => resources(snapshot, application, "sound", "snd "),
        ActionTargetKind::Picture => resources(snapshot, application, "picture", "PICT"),
        ActionTargetKind::TextResource => resources(snapshot, application, "text", "TEXT"),
    }
}

pub(crate) fn target_preview(
    snapshot: &ProjectSnapshot,
    kind: ActionTargetKind,
    value: i16,
    context: &ActionTargetContext,
) -> Option<ActionTarget> {
    target_preview_with_application(snapshot, None, kind, value, context)
}

pub(crate) fn target_preview_with_application(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    kind: ActionTargetKind,
    value: i16,
    context: &ActionTargetContext,
) -> Option<ActionTarget> {
    let absolute = if matches!(
        kind,
        ActionTargetKind::Message
            | ActionTargetKind::OptionLabel
            | ActionTargetKind::PlayerMap
            | ActionTargetKind::Battle
            | ActionTargetKind::Shop
            | ActionTargetKind::Sound
            | ActionTargetKind::Quest
    ) && value < 0
    {
        i32::from(value).checked_abs()?
    } else {
        i32::from(value)
    };
    targets(snapshot, application, kind, context)
        .into_iter()
        .find(|target| target.value == absolute)
}

fn messages(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .messages
        .iter()
        .map(|row| {
            target(
                &row.identity,
                row.native_id.0 as i32,
                format!("String {}", row.native_id.0),
                clip(&row.text),
            )
        })
        .collect()
}

fn option_labels(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .option_labels
        .iter()
        .map(|row| {
            target(
                &row.identity,
                row.native_id.0 as i32,
                format!("Option Label {}", row.native_id.0),
                clip(&row.text),
            )
        })
        .collect()
}

fn quests(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    (crate::model::CLASSIC_QUEST_FLAG_MIN..=crate::model::CLASSIC_QUEST_FLAG_MAX)
        .map(|id| {
            let label = snapshot.quest_labels.iter().find(|row| row.id == id);
            target(
                &StableId(format!("quest:{id}")),
                i32::from(id),
                label
                    .map(|row| row.label.clone())
                    .unwrap_or_else(|| format!("Quest {id}")),
                label.map(|row| clip(&row.note)).unwrap_or_default(),
            )
        })
        .collect()
}

fn battles(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .battles
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Battle",
                format!("Distance {} · {} grid values", row.distance, row.grid.len()),
            )
        })
        .collect()
}

fn treasures(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .treasures
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Treasure",
                format!("{} item slots · {} gold", row.item_ids.len(), row.gold),
            )
        })
        .collect()
}

fn shops(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .shops
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Shop",
                format!(
                    "{} item slots · inflation {}",
                    row.item_ids.len(),
                    row.inflation
                ),
            )
        })
        .collect()
}

fn simple_encounters(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .simple_encounters
        .iter()
        .map(|row| {
            encounter_target(
                &row.identity,
                row.native_id.0,
                "Simple Encounter",
                &row.texts,
            )
        })
        .collect()
}

fn complex_encounters(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .complex_encounters
        .iter()
        .map(|row| {
            encounter_target(
                &row.identity,
                row.native_id.0,
                "Complex Encounter",
                &row.texts,
            )
        })
        .collect()
}

fn encounter_target(identity: &StableId, id: u32, label: &str, texts: &[String]) -> ActionTarget {
    numeric(
        identity,
        id,
        label,
        format!(
            "{} authored choices",
            texts.iter().filter(|text| !text.trim().is_empty()).count()
        ),
    )
}

fn rogue_encounters(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .rogue_encounters
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Rogue Encounter",
                format!("spell {} · tumblers {}", row.spell, row.tumblers),
            )
        })
        .collect()
}

fn timed_encounters(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .timed_encounters
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Timed Encounter",
                format!("day {} · {}%", row.day, row.percent),
            )
        })
        .collect()
}

fn extra_action_points(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .extra_action_points
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Extra Action Point",
                format!("{} populated steps", row.actions.len()),
            )
        })
        .collect()
}

fn maps(snapshot: &ProjectSnapshot, context: &ActionTargetContext) -> Vec<ActionTarget> {
    snapshot
        .world
        .maps
        .iter()
        .filter(|row| {
            context
                .level_type
                .is_some_and(|kind| kind == row.level_type)
        })
        .map(|row| {
            target(
                &row.identity,
                row.native_index as i32,
                row.name.clone(),
                format!("{} level {}", level_label(row.level_type), row.native_index),
            )
        })
        .collect()
}

fn player_maps(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .world
        .player_maps
        .iter()
        .map(|row| {
            numeric(
                &row.identity,
                row.native_id.0,
                "Map Record",
                clip(&row.note),
            )
        })
        .collect()
}

fn spells(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .standard_spells
        .iter()
        .chain(&snapshot.scenario_spells)
        .map(|row| {
            let definition = &row.definition;
            let label = if definition.name.trim().is_empty() {
                format!("Spell {}", definition.classic_id)
            } else {
                definition.name.clone()
            };
            target(
                &definition.id,
                i32::from(definition.classic_id),
                label,
                clip(&definition.description),
            )
        })
        .collect()
}

fn same_map_action_points(
    snapshot: &ProjectSnapshot,
    context: &ActionTargetContext,
) -> Vec<ActionTarget> {
    let map = context.map_identity.as_ref().and_then(|identity| {
        snapshot
            .world
            .maps
            .iter()
            .find(|map| &map.identity == identity)
    });
    snapshot
        .world
        .action_points
        .iter()
        .filter(|row| {
            map.is_some_and(|map| {
                row.level_type == map.level_type && row.level_index == map.native_index
            })
        })
        .map(|row| {
            target(
                &row.identity,
                i32::from(row.record_index),
                format!("Action Point {}", row.record_index),
                row.coordinate
                    .map(|cell| {
                        format!(
                            "{}, {} · {} populated steps",
                            cell.x,
                            cell.y,
                            row.actions.len()
                        )
                    })
                    .unwrap_or_else(|| "Unplaced preserved row".into()),
            )
        })
        .collect()
}

fn random_rectangles(
    snapshot: &ProjectSnapshot,
    context: &ActionTargetContext,
) -> Vec<ActionTarget> {
    snapshot
        .world
        .maps
        .iter()
        .filter(|map| {
            context
                .map_identity
                .as_ref()
                .is_some_and(|identity| &map.identity == identity)
        })
        .flat_map(|map| {
            map.runtime.iter().flat_map(move |runtime| {
                runtime
                    .random_rectangles
                    .iter()
                    .enumerate()
                    .map(move |(slot, row)| {
                        target(
                            &row.identity,
                            slot as i32,
                            format!("{} · Area {}", map.name, slot),
                            format!(
                                "({}, {}) to ({}, {}) · {} / 10,000",
                                row.left, row.top, row.right, row.bottom, row.chance_ten_thousand
                            ),
                        )
                    })
            })
        })
        .collect()
}

fn items(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    let mut by_value = BTreeMap::new();
    for row in &snapshot.item_rules {
        let definition = &row.definition;
        by_value.insert(
            i32::from(definition.classic_id),
            target(
                &definition.id,
                i32::from(definition.classic_id),
                definition.name.clone(),
                clip(&definition.description),
            ),
        );
    }
    for row in &snapshot.scenario_item_rules {
        let definition = &row.definition;
        by_value.insert(
            i32::from(definition.classic_id),
            target(
                &definition.id,
                i32::from(definition.classic_id),
                definition.name.clone(),
                clip(&definition.description),
            ),
        );
    }
    by_value.into_values().collect()
}

fn monsters(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    snapshot
        .monster_sets
        .iter()
        .flat_map(|set| set.monsters.iter())
        .map(|row| {
            target(
                &row.identity,
                row.native_id.0 as i32,
                if row.display_name.trim().is_empty() {
                    format!("Monster {}", row.native_id.0)
                } else {
                    row.display_name.clone()
                },
                format!(
                    "{} stamina · {} experience",
                    row.stamina_max, row.experience
                ),
            )
        })
        .collect()
}

fn numeric(identity: &StableId, value: u32, noun: &str, detail: String) -> ActionTarget {
    target(identity, value as i32, format!("{noun} {value}"), detail)
}

fn target(identity: &StableId, value: i32, label: String, detail: String) -> ActionTarget {
    ActionTarget {
        identity: identity.clone(),
        value,
        label,
        detail,
        status: ActionTargetStatus::Resolved,
        preview: None,
    }
}

fn level_label(kind: LevelType) -> &'static str {
    match kind {
        LevelType::Land => "Land",
        LevelType::Dungeon => "Dungeon",
    }
}

fn clip(value: &str) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.chars().count() <= 96 {
        clean
    } else {
        format!("{}…", clean.chars().take(95).collect::<String>())
    }
}
