pub(crate) mod action_authoring;
mod action_points;
mod battle_authoring;
mod battles;
mod catalog_page;
pub(crate) mod discovery;
#[cfg(test)]
mod discovery_tests;
mod economy;
mod encounter_authoring;
mod encounter_catalog;
mod encounters;
mod extra_action_points;
mod global_macro_catalog;
mod global_macros;
mod icons;
mod items;
mod land_layout;
mod map_history;
mod maps;
mod monster_drafts;
mod monster_operations;
mod monsters;
mod overview;
mod pictures;
mod player_maps;
mod project;
mod random_rectangles;
mod references;
mod rules;
mod scenario;
mod scenario_validation;
mod sounds;
mod special_land;
mod spells;
mod story_labels;
mod string_navigation;
mod terrain;
mod text;

use providence_core::session::EditorSession;
use serde_json::Value;

type SessionHandler = fn(&mut EditorSession, &str, Value) -> Result<Value, String>;

const FAMILY_HANDLERS: &[(&str, SessionHandler)] = &[
    (
        "classic-rule-selection",
        crate::classic_rule_selection::dispatch,
    ),
    ("action-definition", action_authoring::dispatch),
    ("action-form", action_authoring::dispatch),
    ("action-target", action_authoring::dispatch),
    ("session", overview::dispatch),
    ("project-asset", overview::dispatch),
    ("source-evidence", overview::dispatch),
    ("record", overview::dispatch),
    ("validation", overview::dispatch),
    ("compatibility", overview::dispatch),
    ("history", overview::dispatch),
    ("race-rule", rules::dispatch),
    ("caste-rule", rules::dispatch),
    ("rule-names", rules::dispatch),
    ("spell", spells::dispatch),
    ("battle", battles::dispatch),
    ("battle-reference", battles::dispatch),
    ("battle-monster-reference", battles::dispatch),
    ("treasure", economy::dispatch),
    ("treasure-reference", economy::dispatch),
    ("shop", economy::dispatch),
    ("shop-reference", economy::dispatch),
    ("option-label", story_labels::dispatch),
    ("quest", story_labels::dispatch),
    ("quest-label", story_labels::dispatch),
    ("monster", monsters::dispatch),
    ("monster-description", monsters::dispatch),
    ("monster-reference", monsters::dispatch),
    ("special-land", special_land::dispatch),
    ("icon", icons::dispatch),
    ("picture", pictures::dispatch),
    ("sound", sounds::dispatch),
    ("text-resource", text::dispatch),
    ("message", text::dispatch),
    ("text", text::dispatch),
    ("reference", references::dispatch),
    ("action-reference", references::dispatch),
    ("action", references::dispatch),
    ("encounter", encounters::dispatch),
    ("rogue-encounter", encounters::dispatch),
    ("timed-encounter", encounters::dispatch),
    ("global-macro", global_macros::dispatch),
    ("extra-action-point", extra_action_points::dispatch),
    ("action-point", action_points::dispatch),
    ("item", items::dispatch),
    ("item-rules", items::dispatch),
    ("scenario-item-rules", items::dispatch),
    ("scenario-item", items::dispatch),
    ("map", maps::dispatch),
    ("dungeon-cell", maps::dispatch),
    ("map-runtime", maps::dispatch),
    ("player-map", player_maps::dispatch),
    ("land-layout", land_layout::dispatch),
    ("random-rectangle", random_rectangles::dispatch),
    ("campaign", scenario::dispatch),
    ("scenario-contact", scenario::dispatch),
    ("scenario-startup", scenario::dispatch),
    ("scenario-restrictions", scenario::dispatch),
    ("start-location", scenario::dispatch),
    ("scenario-application", scenario::dispatch),
    ("terrain-profile", terrain::dispatch),
    ("landlook-base", terrain::dispatch),
    ("landlook-range", terrain::dispatch),
    ("project", project::dispatch),
];

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if let Some(result) = special_route(session, method, &params) {
        return result;
    }
    let family = method.split('.').next().unwrap_or(method);
    let handler = FAMILY_HANDLERS
        .iter()
        .find_map(|(name, handler)| (*name == family).then_some(handler))
        .ok_or_else(|| format!("unknown method {method}"))?;
    handler(session, method, params)
}

fn special_route(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    if crate::extra_code_commands::handles(method) {
        Some(crate::extra_code_commands::dispatch(
            session, method, params,
        ))
    } else if method.starts_with("discovery.") || method == "quest.flow" {
        Some(discovery::dispatch(session, method, params.clone()))
    } else if method == "world.recovery.read" {
        Some(overview::dispatch(
            session,
            "session.describe",
            params.clone(),
        ))
    } else if method.starts_with("smart-terrain.") || method == "smart-terrain" {
        Some(crate::smart_terrain::dispatch(session, method, params))
    } else if method.starts_with("land-cell.") || method == "land-cell" {
        Some(crate::land_cell_behavior::dispatch(session, method, params))
    } else {
        None
    }
}
