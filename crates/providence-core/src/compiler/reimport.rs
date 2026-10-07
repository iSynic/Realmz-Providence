use super::NativeManifest;
use crate::codecs::{
    decode_battles, decode_caste_rules, decode_complex_encounters, decode_custom_landlook_mapstats,
    decode_dungeon_action_points, decode_dungeon_maps, decode_dungeon_random_levels,
    decode_extra_action_points, decode_extra_codes, decode_global_macro_hooks,
    decode_land_action_points, decode_land_layout, decode_land_maps, decode_land_random_levels,
    decode_messages, decode_monster_descriptions, decode_monster_set, decode_option_labels,
    decode_player_map_name_catalog, decode_player_maps, decode_rogue_encounters, decode_shops,
    decode_simple_encounters, decode_timed_encounters, decode_treasures,
};
use crate::model::{
    ActionPoint, BattleRecord, BlobId, CampaignMetadata, ComplexEncounter, ExtraActionPoint,
    ExtraCodeRow, LandLayout, LandlookCatalogMetadata, MapLevel, MonsterDescription, MonsterSet,
    OptionLabelRecord, PlayerMapNameCatalog, PlayerMapRecord, RogueEncounter,
    ScenarioApplicationContract, ScenarioMessage, ShopRecord, SimpleEncounter, SourcedCasteRule,
    SourcedScenarioItemRule, StartLocation, TerrainProfile, TimedEncounter, TreasureRecord,
};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicSliceSemantics {
    pub campaign: Option<CampaignMetadata>,
    pub start_location: Option<StartLocation>,
    pub maps: Vec<MapLevel>,
    pub land_layout: Option<LandLayout>,
    pub player_maps: Vec<PlayerMapRecord>,
    pub player_map_names: Option<PlayerMapNameCatalog>,
    pub action_points: Vec<ActionPoint>,
    pub extra_action_points: Vec<ExtraActionPoint>,
    pub messages: Vec<ScenarioMessage>,
    pub option_labels: Vec<OptionLabelRecord>,
    pub simple_encounters: Vec<SimpleEncounter>,
    pub complex_encounters: Vec<ComplexEncounter>,
    pub rogue_encounters: Vec<RogueEncounter>,
    pub timed_encounters: Vec<TimedEncounter>,
    pub extra_codes: Vec<ExtraCodeRow>,
    pub scenario_application: Option<ScenarioApplicationContract>,
    pub monster_sets: Vec<MonsterSet>,
    pub monster_descriptions: Vec<MonsterDescription>,
    pub battles: Vec<BattleRecord>,
    pub treasures: Vec<TreasureRecord>,
    pub shops: Vec<ShopRecord>,
    pub caste_rules: Vec<SourcedCasteRule>,
    pub scenario_item_rules: Vec<SourcedScenarioItemRule>,
    pub special_land_solidity: Option<Vec<bool>>,
    pub landlook_catalogs: Vec<LandlookCatalogMetadata>,
    pub terrain_catalog: Vec<TerrainProfile>,
}

pub fn reimport_classic_slice(manifest: &NativeManifest) -> ClassicSliceSemantics {
    let bootstrap = super::scenario::reimport_bootstrap(manifest);
    let mut result = empty();
    world(manifest, &mut result);
    text(manifest, &mut result);
    encounters(manifest, &mut result);
    programs(manifest, &mut result);
    combat(manifest, &mut result);
    economy(manifest, bootstrap.is_some(), &mut result);
    landlooks(manifest, &mut result);
    result.campaign = bootstrap.as_ref().map(|decoded| decoded.campaign.clone());
    if let (Some(campaign), Some(contact)) = (result.campaign.as_mut(), manifest.get("Data CI"))
        && let Ok(decoded) = crate::codecs::decode_scenario_contact_info(&contact.bytes)
    {
        decoded.apply_to_campaign(campaign);
    }
    result.start_location = bootstrap.map(|decoded| decoded.start_location);
    result
}

fn empty() -> ClassicSliceSemantics {
    ClassicSliceSemantics {
        campaign: None,
        start_location: None,
        maps: Vec::new(),
        land_layout: None,
        player_maps: Vec::new(),
        player_map_names: None,
        action_points: Vec::new(),
        extra_action_points: Vec::new(),
        messages: Vec::new(),
        option_labels: Vec::new(),
        simple_encounters: Vec::new(),
        complex_encounters: Vec::new(),
        rogue_encounters: Vec::new(),
        timed_encounters: Vec::new(),
        extra_codes: Vec::new(),
        scenario_application: None,
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
        battles: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
        caste_rules: Vec::new(),
        scenario_item_rules: Vec::new(),
        special_land_solidity: None,
        landlook_catalogs: Vec::new(),
        terrain_catalog: Vec::new(),
    }
}

fn land_maps(manifest: &NativeManifest) -> Vec<MapLevel> {
    let mut maps = manifest
        .get("Data LD")
        .map(|entry| decode_land_maps(&entry.bytes).records)
        .unwrap_or_default();
    if let Some(runtime_records) = manifest
        .get("Data RD")
        .map(|entry| decode_land_random_levels(&entry.bytes).records)
    {
        let runtimes = runtime_records
            .into_iter()
            .map(|record| (record.native_index, record.runtime))
            .collect::<BTreeMap<_, _>>();
        for map in maps
            .iter_mut()
            .filter(|map| map.level_type == crate::model::LevelType::Land)
        {
            map.runtime = runtimes.get(&map.native_index).cloned();
        }
    }
    maps
}

fn dungeon_maps(manifest: &NativeManifest) -> Vec<MapLevel> {
    let mut maps = manifest
        .get("Data DL")
        .map(|entry| decode_dungeon_maps(&entry.bytes).records)
        .unwrap_or_default();
    if let Some(runtime_records) = manifest
        .get("Data RDD")
        .map(|entry| decode_dungeon_random_levels(&entry.bytes).records)
    {
        let runtimes = runtime_records
            .into_iter()
            .map(|record| (record.native_index, record.runtime))
            .collect::<BTreeMap<_, _>>();
        for map in maps
            .iter_mut()
            .filter(|map| map.level_type == crate::model::LevelType::Dungeon)
        {
            map.runtime = runtimes.get(&map.native_index).cloned();
        }
    }
    maps
}

fn world(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.maps = land_maps(manifest);
    result.maps.extend(dungeon_maps(manifest));
    result.land_layout = manifest
        .get("Layout")
        .and_then(|entry| decode_land_layout(&entry.bytes).ok());
    result.player_maps = manifest
        .get("Data MD2")
        .map(|entry| decode_player_maps(&entry.bytes).records)
        .unwrap_or_default();
    result.player_map_names = manifest
        .get("Scenario.rsrc")
        .and_then(|entry| decode_player_map_name_catalog(&entry.bytes, None).ok());
    result.action_points = manifest
        .get("Data DD")
        .map(|entry| decode_land_action_points(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(action_point_has_semantics)
        .collect::<Vec<_>>();
    result.action_points.extend(
        manifest
            .get("Data DDD")
            .map(|entry| decode_dungeon_action_points(&entry.bytes).records)
            .unwrap_or_default()
            .into_iter()
            .filter(action_point_has_semantics),
    );
}

fn text(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.messages = manifest
        .get("Data SD2")
        .map(|entry| decode_messages(&entry.bytes).messages)
        .unwrap_or_default()
        .into_iter()
        .filter(|message| !message.text.is_empty())
        .collect();
    result.option_labels = manifest
        .get("Data OD")
        .map(|entry| decode_option_labels(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(|label| !label.text.is_empty())
        .collect();
}

fn encounters(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.simple_encounters = manifest
        .get("Data ED")
        .map(|entry| decode_simple_encounters(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(simple_encounter_has_semantics)
        .collect();
    result.complex_encounters = manifest
        .get("Data ED2")
        .map(|entry| decode_complex_encounters(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(complex_encounter_has_semantics)
        .collect();
    result.rogue_encounters = manifest
        .get("Data TD2")
        .map(|entry| decode_rogue_encounters(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(rogue_encounter_has_semantics)
        .collect();
    result.timed_encounters = manifest
        .get("Data TD3")
        .map(|entry| decode_timed_encounters(&entry.bytes).records)
        .unwrap_or_default()
        .into_iter()
        .filter(timed_encounter_has_semantics)
        .collect();
}

fn programs(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.extra_action_points = manifest
        .get("Data ED3")
        .map(|entry| decode_extra_action_points(&entry.bytes).records)
        .unwrap_or_default();
    result.extra_codes = manifest
        .get("Data EDCD")
        .map(|entry| decode_extra_codes(&entry.bytes).rows)
        .unwrap_or_default();
    result.scenario_application = manifest
        .get("Global")
        .map(|entry| decode_global_macro_hooks(&entry.bytes).contract);
}

fn combat(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.monster_sets = [("Data MD", 0), ("Data MD1", 1), ("Data MD-1", -1)]
        .into_iter()
        .filter_map(|(path, set_id)| {
            manifest
                .get(path)
                .map(|entry| decode_monster_set(&entry.bytes, path, set_id))
        })
        .collect();
    result.monster_descriptions = manifest
        .get("Data DES")
        .map(|entry| decode_monster_descriptions(&entry.bytes).records)
        .unwrap_or_default();
    result.battles = manifest
        .get("Data BD")
        .map(|entry| decode_battles(&entry.bytes).records)
        .unwrap_or_default();
}

fn economy(manifest: &NativeManifest, full_scenario: bool, result: &mut ClassicSliceSemantics) {
    result.treasures = manifest
        .get("Data TD")
        .map(|entry| decode_treasures(&entry.bytes).records)
        .unwrap_or_default();
    result.shops = manifest
        .get("Data SD")
        .map(|entry| decode_shops(&entry.bytes).records)
        .unwrap_or_default();
    result.caste_rules = manifest
        .get("Data Caste")
        .map(|entry| {
            decode_caste_rules(
                &entry.bytes,
                Some(BlobId("sha256:classic-reimport-data-caste".into())),
            )
            .rules
        })
        .unwrap_or_default();
    let item_text = super::retained::item_text(manifest, full_scenario);
    result.scenario_item_rules = manifest
        .get("Data NI")
        .and_then(|entry| {
            crate::codecs::decode_scenario_item_rules(
                &entry.bytes,
                item_text.map(|resources| resources.bytes.as_slice()),
                BlobId("sha256:classic-reimport-data-ni".into()),
                item_text.map(|_| BlobId("sha256:classic-reimport-data-ni-text".into())),
            )
            .ok()
        })
        .map(|decoded| decoded.rules)
        .unwrap_or_default();
}

fn landlooks(manifest: &NativeManifest, result: &mut ClassicSliceSemantics) {
    result.special_land_solidity = manifest
        .get("Data Solids")
        .and_then(|entry| crate::codecs::decode_special_land_solidity(&entry.bytes).ok());
    for (landlook, native_path) in [
        (6_i8, "Data Custom 1 BD"),
        (7_i8, "Data Custom 2 BD"),
        (8_i8, "Data Custom 3 BD"),
    ] {
        if let Some(decoded) = manifest.get(native_path).and_then(|entry| {
            decode_custom_landlook_mapstats(
                &entry.bytes,
                landlook,
                BlobId(format!("sha256:classic-reimport-custom-{landlook}")),
            )
            .ok()
        }) {
            result.landlook_catalogs.push(decoded.catalog);
            result.terrain_catalog.extend(decoded.profiles);
        }
    }
}

fn action_point_has_semantics(action_point: &ActionPoint) -> bool {
    action_point.classic_door_id != 0
        || action_point.post_action_level != 0
        || action_point.post_action_x != 0
        || action_point.post_action_y != 0
        || action_point.chance_percent != 0
        || !action_point.actions.is_empty()
}

fn simple_encounter_has_semantics(encounter: &SimpleEncounter) -> bool {
    !encounter.actions.is_empty()
        || encounter.choice_results.iter().any(|result| *result != 0)
        || encounter.can_back_out
        || encounter.max_times != 0
        || encounter.caste_success != 0
        || encounter.prompt_message_native_id != 0
        || encounter.texts.iter().any(|text| !text.is_empty())
}

fn complex_encounter_has_semantics(encounter: &ComplexEncounter) -> bool {
    !encounter.actions.is_empty()
        || encounter.action_result != 0
        || encounter.word_result != 0
        || encounter.groups.iter().any(|value| *value != 0)
        || encounter.spell_ids.iter().any(|value| *value != 0)
        || encounter.spell_results.iter().any(|value| *value != 0)
        || encounter.item_ids.iter().any(|value| *value != 0)
        || encounter.item_results.iter().any(|value| *value != 0)
        || encounter.can_back_out
        || encounter.thief
        || encounter.max_times != 0
        || encounter.caste_success != 0
        || encounter.thief_success != 0
        || encounter.thief_fail != 0
        || encounter.prompt_message_native_id != 0
        || encounter.texts.iter().any(|text| !text.is_empty())
}

fn rogue_encounter_has_semantics(encounter: &RogueEncounter) -> bool {
    encounter.type_flags.iter().any(|value| *value)
        || encounter.modifiers.iter().any(|value| *value != 0)
        || encounter.success_codes.iter().any(|value| *value != 0)
        || encounter.failure_codes.iter().any(|value| *value != 0)
        || encounter.success_text.iter().any(|value| *value != 0)
        || encounter.failure_text.iter().any(|value| *value != 0)
        || encounter.success_sounds.iter().any(|value| *value != 0)
        || encounter.failure_sounds.iter().any(|value| *value != 0)
        || encounter.spell != 0
        || encounter.low_damage != 0
        || encounter.high_damage != 0
        || encounter.tumblers != 0
        || encounter.prompts.iter().any(|value| *value != 0)
        || encounter.prompt_sounds.iter().any(|value| *value != 0)
}

fn timed_encounter_has_semantics(encounter: &TimedEncounter) -> bool {
    encounter.day != 0
        || encounter.increment != 0
        || encounter.percent != 0
        || encounter.door != 0
        || encounter.required_level != 0
        || encounter.required_random_rect != 0
        || encounter.required_x != 0
        || encounter.required_y != 0
        || encounter.required_item != 0
        || encounter.required_quest != 0
        || encounter.location_kind != crate::model::TimedEncounterLocationKind::Any
}
