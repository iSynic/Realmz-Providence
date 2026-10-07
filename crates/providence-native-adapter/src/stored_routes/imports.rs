use crate::classic_dungeon_import::import_classic_dungeon_slice;
use crate::classic_land_import::import_classic_land_slice;
use crate::classic_media_import::import_classic_media;
use crate::combat_import::import_classic_battles;
use crate::combat_import::import_classic_monsters;
use crate::economy_import::import_classic_option_labels;
use crate::economy_import::import_classic_shops;
use crate::economy_import::import_classic_treasures;
use crate::encounter_import::import_classic_complex_encounters;
use crate::encounter_import::import_classic_rogue_encounters;
use crate::encounter_import::import_classic_timed_encounters;
use crate::mapstats_import::import_mapstats_reference;
use crate::player_map_import::import_classic_player_map_names;
use crate::player_map_import::import_classic_player_maps;
use crate::rule_import::import_caste_rules;
use crate::rule_import::import_race_rules;
use crate::rule_import::import_rule_names;
use crate::rule_import::import_scenario_items;
use crate::rule_import::import_standard_items;
use crate::scenario_import::import_classic_scenario;
use crate::scenario_preflight::inspect_classic_scenario_import;
use crate::spell_import::import_classic_spells;
use crate::spell_import::import_standard_spells;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "race-rules.import" => import_race_rules(session, store, params),
        "caste-rules.import" => import_caste_rules(session, store, params),
        "rule-names.import" => import_rule_names(session, store, params),
        "item-rules.import-standard" => import_standard_items(session, store, params),
        "item-rules.import-scenario" => import_scenario_items(session, store, params),
        "project.inspect-classic-scenario-import" => inspect_classic_scenario_import(params),
        "project.import-classic-scenario" => import_classic_scenario(session, store, params),
        "project.import-classic-land-slice" => import_classic_land_slice(session, store, params),
        "terrain.import-mapstats-reference" => import_mapstats_reference(session, store, params),
        "custom-landlook.metadata.import" => {
            crate::mapstats_import::import_custom_mapstats(session, store, &params)
        }
        "project.import-classic-dungeon-slice" => {
            import_classic_dungeon_slice(session, store, params)
        }
        "project.import-classic-player-maps" => import_classic_player_maps(session, store, params),
        "project.import-classic-player-map-names" => {
            import_classic_player_map_names(session, store, params)
        }
        "project.import-classic-monsters" => import_classic_monsters(session, store, params),
        "project.import-classic-battles" => import_classic_battles(session, store, params),
        "project.import-classic-treasures" => import_classic_treasures(session, store, params),
        "project.import-classic-shops" => import_classic_shops(session, store, params),
        "project.import-classic-option-labels" => {
            import_classic_option_labels(session, store, params)
        }
        "project.import-classic-complex-encounters" => {
            import_classic_complex_encounters(session, store, params)
        }
        "project.import-classic-rogue-encounters" => {
            import_classic_rogue_encounters(session, store, params)
        }
        "project.import-classic-timed-encounters" => {
            import_classic_timed_encounters(session, store, params)
        }
        "project.import-classic-spells" => import_classic_spells(session, store, params),
        "project.import-classic-media" => import_classic_media(session, store, params),
        "spell-rules.import-standard" => import_standard_spells(session, store, params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}
