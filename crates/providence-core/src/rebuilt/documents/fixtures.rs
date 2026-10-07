use super::*;
use crate::model::{
    AssetDescriptor, BlobId, LevelType, MapLevel, MapRuntimeMetadata, StableId, StartLocation,
    TerrainProfile,
};

const MEDIA: &[u8] = b"controlled tileset payload";

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = crate::rebuilt::content::tests::complete_content_snapshot();
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: crate::model::MapCoordinate { x: 0, y: 0 },
    });
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![7; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "controlled Map Stats".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(2),
            base_scale: Some(1),
            tileset_id: StableId("classic.landlook.2".into()),
            base_tile: Some(4),
            random_rectangles: Vec::new(),
        }),
    });
    snapshot.terrain_catalog = [7, 60, 147]
        .into_iter()
        .map(|tile| TerrainProfile {
            source: "controlled Map Stats".into(),
            source_blob: None,
            tile,
            landlook: Some(2),
            movement_sound_id: Some(12),
            movement_cost: 2,
            solid_type: 0,
            walkable: true,
            shore: false,
            boat_requirement: 0,
            path: false,
            blocks_los: false,
            fly_float: false,
            forest_type: 0,
            combat_build: [[tile; 3]; 3],
        })
        .collect();
    snapshot
}

pub(super) fn compiler() -> RebuiltV3CompilerIdentity {
    RebuiltV3CompilerIdentity {
        version: "0.1.0".into(),
        commit: "controlled-commit".into(),
        minimum_engine_version: "0.1.0".into(),
    }
}

pub(super) fn add_media(snapshot: &mut ProjectSnapshot) -> String {
    let hash = sha256_hex(MEDIA);
    snapshot.assets.push(AssetDescriptor {
        identity: StableId("classic.landlook.2".into()),
        label: "Landlook 2".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{hash}")),
        byte_length: MEDIA.len() as u64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(320),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(32),
        tile_height: Some(32),
        columns: Some(10),
        rows: Some(10),
        landlook: Some(2),
        base_tile: Some(4),
        source: "controlled payload".into(),
    });
    format!("assets/media/{hash}.png")
}

pub(super) fn application_media_for(snapshot: &ProjectSnapshot) -> ApplicationMediaCatalog {
    let resources = application_resources(snapshot);
    let source = StableId("classic-application:test".into());
    ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: source.clone(),
            native_name: "Application.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: 1,
        }],
        assets: resources
            .into_iter()
            .map(|(resource, expected_kind)| application_asset(&source, resource, expected_kind))
            .collect(),
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}

fn application_resources(
    snapshot: &ProjectSnapshot,
) -> BTreeMap<crate::model::ClassicResourceKey, Option<String>> {
    let runtime = project_rebuilt_v3_reachable_runtime(snapshot).unwrap();
    let references = crate::rebuilt::derive_rebuilt_v3_reachable_media_references(
        snapshot,
        &runtime.scenario,
        &runtime.item_spells.items,
        &runtime.item_spells.spells,
        &runtime.combat.monsters,
        &runtime.rogue_encounters,
        !runtime.combat.battles.is_empty(),
    );
    let mut resources = BTreeMap::<crate::model::ClassicResourceKey, Option<String>>::new();
    for reference in references.into_iter().filter(|reference| {
        matches!(
            reference.requirement,
            crate::rebuilt::RebuiltV3MediaRequirement::ApplicationRequired
                | crate::rebuilt::RebuiltV3MediaRequirement::StockFallbackAllowed
                | crate::rebuilt::RebuiltV3MediaRequirement::OptionalCompanion
        )
    }) {
        let Some(resource) = reference.classic_resource else {
            continue;
        };
        let entry = resources.entry(resource).or_default();
        if entry.is_none() {
            *entry = reference.expected_asset_kind;
        }
    }
    resources
}

fn application_asset(
    source: &StableId,
    resource: crate::model::ClassicResourceKey,
    expected_kind: Option<String>,
) -> crate::rebuilt::ApplicationMediaAsset {
    crate::rebuilt::ApplicationMediaAsset {
        source: source.clone(),
        source_priority: 0,
        descriptor: AssetDescriptor {
            identity: StableId(format!(
                "application:{}:{}",
                resource.resource_type.trim(),
                resource.resource_id
            )),
            label: format!(
                "Application {} {}",
                resource.resource_type, resource.resource_id
            ),
            kind: expected_kind.unwrap_or_else(|| {
                match (resource.resource_type.as_str(), resource.resource_id) {
                    ("snd ", _) => "sound".into(),
                    ("PICT", _) => "picture".into(),
                    ("cicn", id) if id < 0 => "special-land-tile".into(),
                    _ => "icon".into(),
                }
            }),
            mime_type: Some(if resource.resource_type == "snd " {
                "audio/wav".into()
            } else {
                "image/png".into()
            }),
            classic_resource: Some(resource),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "c".repeat(64))),
            byte_length: 1,
            classic_payload_blob: Some(BlobId(format!("sha256:{}", "d".repeat(64)))),
            classic_payload_byte_length: Some(1),
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
            source: "controlled application catalog".into(),
        },
    }
}
