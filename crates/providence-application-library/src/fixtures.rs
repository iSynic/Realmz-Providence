use std::{fs, io::Cursor, path::Path};

use providence_core::{
    model::{
        CampaignContact, CampaignContactProvenance, CampaignMetadata, CampaignRestrictions,
        LevelType, MapCoordinate, ProjectSnapshot, StableId, StartLocation,
    },
    rebuilt::{
        RebuiltV3ApplicationHooks, RebuiltV3AssetIndex, RebuiltV3AssetRecord,
        RebuiltV3BoatReplacementProfiles, RebuiltV3Campaign, RebuiltV3CampaignContact,
        RebuiltV3CompactCell, RebuiltV3CompactEdge, RebuiltV3CompactLandTileProfile,
        RebuiltV3CompilerIdentity, RebuiltV3ContentDocument, RebuiltV3FileInput,
        RebuiltV3ItemDefinition, RebuiltV3Manifest, RebuiltV3MapMetadata,
        RebuiltV3ScenarioDocument, RebuiltV3SpellDefinition, RebuiltV3WorldDocument,
        RebuiltV3WorldMap, compile_rebuilt_v3_manifest,
    },
};
use providence_rebuilt_package::{inspect_rebuilt_v3_archive, write_rebuilt_v3_archive};
use serde::Serialize;
use sha2::{Digest, Sha256};

mod alignment;

pub use alignment::write_alignment_fixtures;

fn override_asset(
    source: &providence_core::rebuilt::ApplicationMediaAsset,
    kind: &str,
) -> RebuiltV3AssetRecord {
    let descriptor = &source.descriptor;
    let digest = descriptor
        .blob
        .0
        .strip_prefix("sha256:")
        .expect("derived media uses a SHA-256 blob");
    RebuiltV3AssetRecord {
        id: StableId("fixture-portrait-257".into()),
        label: "Scenario portrait 257 override".into(),
        kind: kind.into(),
        mime_type: descriptor.mime_type.clone(),
        resource_type: Some("cicn".into()),
        resource_id: Some(257),
        scenario_music_slot: None,
        bytes: descriptor.byte_length,
        sha256: digest.into(),
        path: format!("assets/media/{digest}.png"),
        width: descriptor.width,
        height: descriptor.height,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
    }
}

fn write_scenario_fixture(
    path: &Path,
    commit: &str,
    id: &str,
    item: RebuiltV3ItemDefinition,
    spell: RebuiltV3SpellDefinition,
    media: Option<(RebuiltV3AssetRecord, &[u8])>,
) -> Result<(RebuiltV3Manifest, String), String> {
    let project_id = StableId(format!("providence-alignment-{id}"));
    let snapshot = scenario_snapshot(project_id.clone());
    let content = RebuiltV3ContentDocument {
        kind: "realmz2.content".into(),
        schema_version: 3,
        campaign: scenario_campaign(project_id),
        messages: Vec::new(),
        option_labels: Vec::new(),
        battles: Vec::new(),
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
        items: vec![item],
        item_texts: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
        simple_encounters: Vec::new(),
        complex_encounters: Vec::new(),
        thief_encounters: Vec::new(),
        timed_encounters: Vec::new(),
        spells: vec![spell],
        races: Vec::new(),
        castes: Vec::new(),
    };
    let asset_index = RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets: media
            .as_ref()
            .map(|(asset, _)| vec![asset.clone()])
            .unwrap_or_default(),
    };
    let mut files = vec![
        ("content.json".to_string(), canonical(&content)?),
        ("world.json".to_string(), canonical(&fixture_world())?),
        ("scenario.json".to_string(), canonical(&empty_scenario())?),
        ("assets/index.json".to_string(), canonical(&asset_index)?),
    ];
    if let Some((asset, payload)) = media {
        files.push((asset.path, payload.to_vec()));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let inputs = inputs(&files);
    let mut capabilities = vec![
        "realmz.core.classic-rules-v1".into(),
        "realmz.scenario.classic-vm-v1".into(),
        "realmz.world.topology-v2".into(),
    ];
    if !asset_index.assets.is_empty() {
        capabilities.push("realmz.presentation.content-addressed-media-v1".into());
    }
    let manifest = compile_rebuilt_v3_manifest(
        &snapshot,
        &RebuiltV3CompilerIdentity {
            version: env!("CARGO_PKG_VERSION").into(),
            commit: commit.into(),
            minimum_engine_version: "0.1.0".into(),
        },
        &capabilities,
        &inputs,
    )
    .map_err(|error| error.to_string())?;
    let archive = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
        .map_err(|error| error.to_string())?
        .into_inner();
    inspect_rebuilt_v3_archive(Cursor::new(&archive)).map_err(|error| error.to_string())?;
    fs::write(path, &archive)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok((manifest.manifest, sha256(&archive)))
}

fn scenario_snapshot(project_id: StableId) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(project_id);
    snapshot.campaign = Some(CampaignMetadata {
        name: "Providence Rebuilt Alignment Fixture".into(),
        version: "1".into(),
        author: "Providence".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Absent,
        description: "Deterministic application composition fixture.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 0,
        maximum_party_levels: 0,
        guidance_authored: false,
        restrictions: restrictions(),
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("fixture-map".into()),
        coordinate: MapCoordinate { x: 0, y: 0 },
    });
    snapshot
}

fn scenario_campaign(id: StableId) -> RebuiltV3Campaign {
    RebuiltV3Campaign {
        id,
        name: "Providence Rebuilt Alignment Fixture".into(),
        version: "1".into(),
        author: "Providence".into(),
        contact: RebuiltV3CampaignContact {
            email: String::new(),
            web: String::new(),
            date: String::new(),
            fee: String::new(),
        },
        description: "Deterministic application composition fixture.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 0,
        maximum_party_levels: 0,
        guidance_authored: false,
        restrictions: restrictions(),
    }
}

fn restrictions() -> CampaignRestrictions {
    CampaignRestrictions {
        description: String::new(),
        max_party_size: 6,
        max_level: 40,
        banned_races: Vec::new(),
        banned_castes: Vec::new(),
    }
}

fn fixture_world() -> RebuiltV3WorldDocument {
    let edge = RebuiltV3CompactEdge("open".into(), 5, None, None);
    let cell = RebuiltV3CompactCell(
        StableId("classic.terrain.0".into()),
        1,
        1,
        None,
        Vec::new(),
        Vec::new(),
        [edge.clone(), edge.clone(), edge.clone(), edge],
        Vec::new(),
        0,
        StableId("classic.landlook.0".into()),
        None,
        0,
        1,
    );
    RebuiltV3WorldDocument {
        kind: "realmz2.world".into(),
        schema_version: 3,
        battle_terrain_sets: Vec::new(),
        maps: vec![RebuiltV3WorldMap {
            id: StableId("fixture-map".into()),
            name: "Fixture Map".into(),
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
            cells: vec![cell; 8100],
            boat_replacement_profiles: Some(RebuiltV3BoatReplacementProfiles {
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
            }),
            random_rectangles: Vec::new(),
        }],
        player_maps: Vec::new(),
        triggers: Vec::new(),
        transitions: Vec::new(),
        land_layout: None,
        timed_encounters: Vec::new(),
    }
}

fn empty_scenario() -> RebuiltV3ScenarioDocument {
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

fn canonical(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
    serde_json::to_vec(&value).map_err(|error| error.to_string())
}

fn inputs(files: &[(String, Vec<u8>)]) -> Vec<RebuiltV3FileInput<'_>> {
    files
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput {
            path: path.as_str(),
            bytes,
        })
        .collect()
}

fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
