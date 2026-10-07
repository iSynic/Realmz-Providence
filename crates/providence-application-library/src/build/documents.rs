use providence_core::{
    model::{
        CampaignContact, CampaignContactProvenance, CampaignMetadata, CampaignRestrictions,
        LevelType, StableId,
    },
    rebuilt::{
        REALMZ_CLASSIC_APPLICATION_LIBRARY_ID, RebuiltV3ApplicationHooks,
        RebuiltV3BoatReplacementProfiles, RebuiltV3Campaign, RebuiltV3CampaignContact,
        RebuiltV3CompactCell, RebuiltV3CompactEdge, RebuiltV3CompactLandTileProfile,
        RebuiltV3ContentDocument, RebuiltV3ItemDefinition, RebuiltV3MapMetadata,
        RebuiltV3RuleCatalog, RebuiltV3ScenarioDocument, RebuiltV3SpellDefinition,
        RebuiltV3WorldDocument, RebuiltV3WorldMap,
    },
};

pub(super) fn application_campaign_metadata() -> CampaignMetadata {
    CampaignMetadata {
        name: "Realmz Classic Application Library".into(),
        version: "1".into(),
        author: "Tim Phillips".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Absent,
        description: "Licensed stock Realmz rules and media for application fallback.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 0,
        maximum_party_levels: 0,
        guidance_authored: false,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 40,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    }
}

fn application_campaign() -> RebuiltV3Campaign {
    RebuiltV3Campaign {
        id: StableId(REALMZ_CLASSIC_APPLICATION_LIBRARY_ID.into()),
        name: "Realmz Classic Application Library".into(),
        version: "1".into(),
        author: "Tim Phillips".into(),
        contact: RebuiltV3CampaignContact {
            email: String::new(),
            web: String::new(),
            date: String::new(),
            fee: String::new(),
        },
        description: "Licensed stock Realmz rules and media for application fallback.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 0,
        maximum_party_levels: 0,
        guidance_authored: false,
        restrictions: application_campaign_metadata().restrictions,
    }
}

pub(super) fn content(
    items: Vec<RebuiltV3ItemDefinition>,
    spells: Vec<RebuiltV3SpellDefinition>,
    rules: RebuiltV3RuleCatalog,
) -> RebuiltV3ContentDocument {
    RebuiltV3ContentDocument {
        kind: "realmz2.content".into(),
        schema_version: 3,
        campaign: application_campaign(),
        messages: Vec::new(),
        option_labels: Vec::new(),
        battles: Vec::new(),
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
        items,
        item_texts: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
        simple_encounters: Vec::new(),
        complex_encounters: Vec::new(),
        thief_encounters: Vec::new(),
        timed_encounters: Vec::new(),
        spells,
        races: rules.races,
        castes: rules.castes,
    }
}

pub(super) fn scenario() -> RebuiltV3ScenarioDocument {
    RebuiltV3ScenarioDocument {
        kind: "realmz2.scenario".into(),
        schema_version: 3,
        application_hooks: RebuiltV3ApplicationHooks {
            start_game: None,
            party_death: None,
            end_adventure: None,
            shop: None,
            temple: None,
        },
        programs: Vec::new(),
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: None,
    }
}

pub(super) fn application_world() -> RebuiltV3WorldDocument {
    RebuiltV3WorldDocument {
        kind: "realmz2.world".into(),
        schema_version: 3,
        battle_terrain_sets: Vec::new(),
        maps: vec![application_map()],
        player_maps: Vec::new(),
        triggers: Vec::new(),
        transitions: Vec::new(),
        land_layout: None,
        timed_encounters: Vec::new(),
    }
}

fn application_cell() -> RebuiltV3CompactCell {
    let open = RebuiltV3CompactEdge("open".into(), 5, None, None);
    RebuiltV3CompactCell(
        StableId("classic.terrain.0".into()),
        1,
        1,
        None,
        Vec::new(),
        Vec::new(),
        [open.clone(), open.clone(), open.clone(), open],
        Vec::new(),
        0,
        StableId("classic.landlook.0".into()),
        None,
        0,
        1,
    )
}

// The application package needs a valid start map, not playable scenario content.
fn application_map() -> RebuiltV3WorldMap {
    RebuiltV3WorldMap {
        id: StableId("application-library-map".into()),
        name: "Application Library".into(),
        level_type: LevelType::Land,
        level_index: 0,
        width: 90,
        height: 90,
        metadata: RebuiltV3MapMetadata {
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            battle_terrain_set_id: None,
        },
        topology_format: "realmz2.compact-cell-rows.v2".into(),
        cells: vec![application_cell(); 8100],
        boat_replacement_profiles: Some(boat_profiles()),
        random_rectangles: Vec::new(),
    }
}

fn boat_profiles() -> RebuiltV3BoatReplacementProfiles {
    RebuiltV3BoatReplacementProfiles {
        removed: RebuiltV3CompactLandTileProfile(
            StableId("classic.terrain.60".into()),
            0,
            77,
            Some(0),
            60,
            2,
            0,
        ),
        placed: RebuiltV3CompactLandTileProfile(
            StableId("classic.terrain.147".into()),
            0,
            69,
            Some(0),
            147,
            1,
            0,
        ),
    }
}
