use super::*;
use crate::media_problems::inspect_rebuilt_media_projection;
use crate::media_problems::media_problem_projection;
use crate::media_problems::media_reference_is_problem;
use crate::media_problems::readiness_blocking_media_references;
use crate::rebuilt_publication::read_rebuilt_media_index;
use providence_core::model::AssetDescriptor;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicResourceKey;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::NativeRecordId;
use providence_core::model::PlayerMapRecord;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::model::TerrainProfile;
use providence_core::rebuilt::RebuiltV3MediaRequirement;
use providence_core::rebuilt::RebuiltV3RuntimeMediaReference;
use providence_core::rebuilt::project_rebuilt_v3_asset_index;
use providence_core::references::ResolutionState;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

#[test]
fn rebuilt_media_inspection_groups_problem_targets_and_keeps_stock_fallbacks_nonblocking() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-report".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Repeated Special Land".into(),
        tiles: vec![-91; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.terrain_catalog.push(TerrainProfile {
        source: "controlled media report".into(),
        source_blob: None,
        tile: 7,
        landlook: Some(0),
        movement_sound_id: Some(42),
        movement_cost: 1,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    });

    let report = inspect_rebuilt_media_projection(
        &snapshot,
        Revision(8),
        &empty_runtime_selection(),
        None,
        &json!({"limit": 200}),
    )
    .expect("bounded media report");

    assert_eq!(report["revision"], 8);
    assert_eq!(report["counts"]["references"], 8_341);
    assert_eq!(report["counts"]["problemUses"], 8_340);
    assert_eq!(report["counts"]["problemTargets"], 241);
    assert_eq!(report["counts"]["resolutions"]["stock-fallback"], 1);
    assert_eq!(
        report["counts"]["requirements"]["stock-fallback-allowed"],
        1
    );
    assert_eq!(report["problems"].as_array().unwrap().len(), 200);
    assert_eq!(report["total"], 241);
    assert_eq!(report["truncated"], true);
    assert!(
        report["problems"]
            .as_array()
            .unwrap()
            .iter()
            .any(|problem| problem["uses"] == 8_100)
    );
}

#[test]
fn optional_media_companions_never_block_readiness_or_problem_counts() {
    let reference = RebuiltV3RuntimeMediaReference {
        source: StableId("player-map:2".into()),
        field_path: "markers[0].icon".into(),
        relation: providence_core::rebuilt::RebuiltV3MediaRelation::PlayerMap,
        requirement: RebuiltV3MediaRequirement::OptionalCompanion,
        asset_id: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -130,
        }),
        expected_asset_kind: None,
        resolution: ResolutionState::Ambiguous,
        resolved_asset_id: None,
        resolved_owner: None,
    };

    assert!(!media_reference_is_problem(&reference));
    assert!(readiness_blocking_media_references(&[reference], None).is_empty());
}

#[test]
fn media_problem_projection_reuses_player_map_field_and_byte_provenance() {
    let session = EditorSession::new(player_map_marker_snapshot());
    let reference = RebuiltV3RuntimeMediaReference {
        source: StableId("player-map:2".into()),
        field_path: "markers[0].icon".into(),
        relation: providence_core::rebuilt::RebuiltV3MediaRelation::PlayerMap,
        requirement: RebuiltV3MediaRequirement::StockFallbackAllowed,
        asset_id: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -130,
        }),
        expected_asset_kind: None,
        resolution: ResolutionState::Missing,
        resolved_asset_id: None,
        resolved_owner: None,
    };

    let problem = media_problem_projection(&reference, 3, &session.references())
        .expect("typed media problem");

    assert_eq!(problem["source"], "player-map:2");
    assert_eq!(problem["field"], "markers[0].icon");
    assert_eq!(problem["targetKind"], "icon");
    assert_eq!(problem["targetId"], "-130");
    assert_eq!(problem["uses"], 3);
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data MD2");
    assert_eq!(problem["byteProvenance"]["recordIndex"], 2);
    assert_eq!(problem["byteProvenance"]["byteStart"], 680);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 682);
    assert_eq!(
        problem["repairActions"],
        json!(["import-target", "retarget"])
    );
    assert_eq!(problem["navigation"]["documentKind"], "player-map");
}

fn player_map_marker_snapshot() -> ProjectSnapshot {
    use providence_core::model::{PlayerMapMarker, PlayerMapRect};

    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-problem".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Controlled player map".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut markers = vec![
        PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0,
        };
        10
    ];
    markers[0].icon_id = -130;
    snapshot.world.player_maps.push(PlayerMapRecord {
        identity: StableId("player-map:2".into()),
        native_id: NativeRecordId(2),
        markers,
        start_x: 0,
        start_y: 0,
        level: 0,
        picture_id: 0,
        icon_size: 1,
        show: 0,
        is_dungeon: false,
        picture_rect: PlayerMapRect::default(),
        note: "Controlled marker".into(),
        authored: false,
    });
    snapshot
}

#[test]
fn readiness_media_denominator_excludes_nonblocking_stock_gaps() {
    let reference = |source: &str,
                     field: &str,
                     requirement: RebuiltV3MediaRequirement,
                     resource_id: i32| RebuiltV3RuntimeMediaReference {
        source: StableId(source.into()),
        field_path: field.into(),
        relation: providence_core::rebuilt::RebuiltV3MediaRelation::PlayerMap,
        requirement,
        asset_id: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        }),
        expected_asset_kind: None,
        resolution: ResolutionState::Missing,
        resolved_asset_id: None,
        resolved_owner: None,
    };
    let references = vec![
        reference(
            "player-map:7",
            "picture",
            RebuiltV3MediaRequirement::PackageRequired,
            30_007,
        ),
        reference(
            "player-map:2",
            "markers[0].icon",
            RebuiltV3MediaRequirement::StockFallbackAllowed,
            -130,
        ),
        reference(
            "classic.spell.1101",
            "lookStart.frames[0]",
            RebuiltV3MediaRequirement::StockFallbackAllowed,
            11_992,
        ),
    ];

    let selected =
        readiness_blocking_media_references(&references, Some(&StableId("player-map:2".into())));

    assert_eq!(selected.len(), 2);
    assert!(
        selected
            .iter()
            .any(|reference| reference.source.0 == "player-map:7")
    );
    assert!(
        selected
            .iter()
            .any(|reference| reference.source.0 == "player-map:2")
    );
    assert!(
        !selected
            .iter()
            .any(|reference| reference.source.0 == "classic.spell.1101")
    );
}

#[test]
fn rebuilt_media_resolution_reads_only_selected_verified_store_blobs() {
    let temporary = tempdir().expect("temporary root");
    let root = temporary.path().join("project");
    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-resolution".into()));
    let store = ProjectStore::create(&root, &snapshot).expect("create store");
    let bytes = b"verified package media";
    let asset = controlled_tileset_descriptor(&store, bytes);
    snapshot.assets.push(asset.clone());
    let mut alias = asset;
    alias.identity = StableId("asset:tileset-alias".into());
    snapshot.assets.push(alias);
    let unused_bytes = b"unselected package media";
    let mut unused = snapshot.assets[0].clone();
    unused.identity = StableId("asset:unused-picture".into());
    unused.label = "Unused scenario picture".into();
    unused.kind = "picture".into();
    unused.blob = store.put_blob(unused_bytes).expect("store unused media");
    unused.byte_length = unused_bytes.len() as u64;
    unused.width = Some(16);
    unused.height = Some(16);
    unused.tile_width = None;
    unused.tile_height = None;
    unused.columns = None;
    unused.rows = None;
    unused.landlook = None;
    unused.base_tile = None;
    snapshot.assets.push(unused);

    let full_index = project_rebuilt_v3_asset_index(&snapshot).expect("project media index");
    assert_eq!(full_index.assets.len(), 3);
    let selected_index = providence_core::rebuilt::RebuiltV3AssetIndex {
        kind: full_index.kind,
        schema_version: full_index.schema_version,
        assets: full_index
            .assets
            .into_iter()
            .filter(|asset| asset.kind == "tileset")
            .collect(),
    };
    let resolved =
        read_rebuilt_media_index(&store, &selected_index).expect("resolve selected media");

    assert_eq!(resolved.len(), 1);
    assert!(resolved[0].0.starts_with("assets/media/"));
    assert!(resolved[0].0.ends_with(".png"));
    assert_eq!(resolved[0].1, bytes);
}

fn controlled_tileset_descriptor(store: &ProjectStore, bytes: &[u8]) -> AssetDescriptor {
    let blob = store.put_blob(bytes).expect("store media");
    AssetDescriptor {
        identity: StableId("asset:tileset".into()),
        label: "Landlook 2".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob,
        byte_length: bytes.len() as u64,
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
    }
}
