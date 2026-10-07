use super::super::*;
use crate::model::{
    AssetDescriptor, BlobId, ClassicResourceKey, LevelType, MapLevel, MapRuntimeMetadata,
    NativeRecordId, PlayerMapMarker, PlayerMapRecord, PlayerMapRect,
};
use crate::rebuilt::ApplicationMediaAsset;

pub(in super::super) fn scenario() -> RebuiltV3ScenarioDocument {
    RebuiltV3ScenarioDocument {
        kind: "realmz2.scenario".into(),
        schema_version: 3,
        application_hooks: crate::rebuilt::RebuiltV3ApplicationHooks {
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

pub(in super::super) fn asset(
    id: &str,
    kind: &str,
    resource_type: Option<&str>,
    resource_id: i32,
) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(id.into()),
        label: id.into(),
        kind: kind.into(),
        mime_type: Some("image/png".into()),
        classic_resource: resource_type.map(|resource_type| ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled media-selection fixture".into(),
    }
}

pub(in super::super) fn complete_application_appearance_catalog() -> ApplicationMediaCatalog {
    let source = StableId("classic-application:appearance".into());
    let mut descriptors = (257..377)
        .map(|id| {
            asset(
                &format!("application:portrait:{id}"),
                "portrait",
                Some("cicn"),
                id,
            )
        })
        .chain((9000..9120).map(|id| {
            asset(
                &format!("application:combat-icon:{id}"),
                "combat-icon",
                Some("cicn"),
                id,
            )
        }))
        .map(|descriptor| ApplicationMediaAsset {
            source: source.clone(),
            source_priority: 0,
            descriptor,
        })
        .collect::<Vec<_>>();
    descriptors.reverse();
    ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: source,
            native_name: "Appearance.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "d".repeat(64))),
            byte_length: 1,
        }],
        assets: descriptors,
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}

pub(super) fn land_map(landlook: i8, special_tile: Option<i16>) -> MapLevel {
    let mut tiles = vec![7; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE];
    if let Some(tile) = special_tile {
        tiles[0] = tile;
    }
    MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles,
        runtime: Some(MapRuntimeMetadata {
            source: "controlled".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(landlook),
            base_scale: Some(1),
            tileset_id: StableId(format!("classic.landlook.{landlook}")),
            base_tile: Some(4),
            random_rectangles: Vec::new(),
        }),
    }
}

pub(super) fn moon_blade() -> RebuiltV3ItemDefinition {
    RebuiltV3ItemDefinition {
        id: StableId("classic.item.1".into()),
        classic_id: 1,
        name: "Moon Blade".into(),
        unidentified_name: "Blade".into(),
        description: String::new(),
        icon_id: 7,
        item_type: 0,
        strength_bonus: 0,
        blunt: 0,
        hands: 0,
        luck_bonus: 0,
        movement_bonus: 0,
        armor_bonus: 0,
        magic_resistance_bonus: 0,
        damage_bonus: 0,
        spell_point_bonus: 0,
        sound_id: 12,
        weight: 0,
        cost: 0,
        initial_charges: 0,
        cursed_item_id: None,
        magical: false,
        item_category_mask_low: 0,
        item_category_mask_high: 0,
        race_restrictions: 0,
        caste_restrictions: 0,
        specific_race_id: None,
        specific_caste_id: None,
        race_class_only: 0,
        caste_class_only: 0,
        versus_small: 0,
        versus_large: 0,
        heat: 0,
        cold: 0,
        electric: 0,
        versus_undead: 0,
        versus_demon_devil: 0,
        versus_evil: 0,
        special: [0; 5],
        weight_per_charge: 0,
        drop_on_empty: false,
    }
}

pub(super) fn player_map_context() -> (ProjectSnapshot, RebuiltV3ScenarioDocument) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-icons".into()));
    snapshot.world.player_maps.extend([
        player_map(
            0,
            PlayerMapMarker {
                icon_id: 137,
                x: 4,
                y: 5,
            },
            0,
            "X marks the gate",
        ),
        player_map(
            19,
            PlayerMapMarker {
                icon_id: -130,
                x: 7,
                y: 8,
            },
            30_019,
            "Dormant source evidence",
        ),
    ]);

    let mut runtime_scenario = scenario();
    runtime_scenario
        .programs
        .push(crate::rebuilt::RebuiltV3ScenarioProgram {
            id: StableId("trigger:player-map".into()),
            owner_kind: crate::rebuilt::RebuiltV3ProgramOwnerKind::Trigger,
            owner_id: StableId("action-point:land:0:0".into()),
            instructions: vec![crate::rebuilt::RebuiltV3ClassicInstruction {
                kind: crate::rebuilt::RebuiltV3InstructionKind::ClassicAction,
                slot: 0,
                raw_opcode: 29,
                opcode: 29,
                id: 0,
                gosub: false,
                extra_code: None,
            }],
        });
    (snapshot, runtime_scenario)
}

pub(super) fn player_marker_application() -> ApplicationMediaCatalog {
    let source = StableId("classic-application:player-map".into());
    ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: source.clone(),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "e".repeat(64))),
            byte_length: 1,
        }],
        assets: [137, 138]
            .into_iter()
            .map(|resource_id| ApplicationMediaAsset {
                source: source.clone(),
                source_priority: 0,
                descriptor: asset(
                    &format!("application:player-map:{resource_id}"),
                    "icon",
                    Some("cicn"),
                    resource_id,
                ),
            })
            .collect(),
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}

pub(super) fn world_application() -> ApplicationMediaCatalog {
    let mut application = complete_application_appearance_catalog();
    let source = application.sources[0].identity.clone();
    let mut landlook = asset("application:pict:303", "picture", Some("PICT"), 303);
    landlook.mime_type = Some("image/png".into());
    landlook.width = Some(640);
    landlook.height = Some(320);
    let overlay = asset(
        "application:special-land:-91",
        "special-land-tile",
        Some("cicn"),
        -91,
    );
    application.assets.extend([
        ApplicationMediaAsset {
            source: source.clone(),
            source_priority: 0,
            descriptor: landlook,
        },
        ApplicationMediaAsset {
            source,
            source_priority: 0,
            descriptor: overlay,
        },
    ]);

    application
}

fn player_map(
    native_id: u32,
    marker: PlayerMapMarker,
    picture_id: i16,
    note: &str,
) -> PlayerMapRecord {
    PlayerMapRecord {
        identity: StableId(format!("player-map:{native_id}")),
        native_id: NativeRecordId(native_id),
        markers: vec![marker],
        start_x: 0,
        start_y: 0,
        level: 0,
        picture_id,
        icon_size: 16,
        show: 1,
        is_dungeon: false,
        picture_rect: PlayerMapRect::default(),
        note: note.into(),
        authored: false,
    }
}
