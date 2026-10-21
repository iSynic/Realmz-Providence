use super::*;
use providence_core::session::ExpectedRevisionCommand;

fn fixture() -> (EditorSession, AtlasEvidence, Value) {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "native-generation".into(),
    )));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles.fill(156);
    snapshot.world.maps[0].runtime.as_mut().unwrap().base_tile = Some(156);
    let atlas = AtlasEvidence {
        tileset_id: StableId("classic.landlook.0".into()),
        asset_identity: StableId("stock-plains".into()),
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        scenario_owned: false,
        tile_fingerprints: providence_core::terrain_joining::layouts()
            .iter()
            .find(|layout| layout.landlook == 0)
            .unwrap()
            .tile_fingerprints
            .clone(),
    };
    let intent = Intent {
        tileset_id: atlas.tileset_id.clone(),
        atlas_blob: atlas.blob.clone(),
        mapping_revision: 0,
        family: "forest".into(),
        density: core::Density::Dense,
        seed: 47,
        mask: (10..20)
            .flat_map(|y| (10..20).map(move |x| MapCoordinate { x, y }))
            .collect(),
        locks: vec![],
        connections: vec![],
    };
    (
        EditorSession::new(snapshot),
        atlas,
        json!({"identity":"land:0","expectedRevision":0,"intent":intent}),
    )
}

#[test]
fn native_preview_apply_and_stale_result_share_the_guarded_core_command() {
    let (mut session, atlas, mut params) = fixture();
    let before = session.snapshot().clone();
    let preview = generate(
        &mut session,
        "terrain-generation.preview",
        &params,
        atlas.clone(),
    )
    .unwrap();
    assert_eq!(preview["canApply"], true);
    assert_eq!(session.snapshot(), &before);
    params["reviewHash"] = preview["reviewHash"].clone();
    let applied = generate(
        &mut session,
        "terrain-generation.apply",
        &params,
        atlas.clone(),
    )
    .unwrap();
    assert_eq!(applied["paintedCells"], preview["paintedCells"]);
    assert_eq!(session.revision().0, 1);
    assert!(generate(&mut session, "terrain-generation.apply", &params, atlas).is_err());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn native_route_query_does_not_need_an_artwork_preview() {
    let (mut session, _, _) = fixture();
    let before = session.snapshot().clone();
    let result = dispatch(&mut session, None, Default::default(), "map-connectivity.preview", &json!({
        "identity":"land:0","expectedRevision":0,"connections":[{"from":{"x":0,"y":0},"to":{"x":2,"y":0}}]
    })).unwrap();
    assert_eq!(result["routes"][0]["status"], "unknown");
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn updating_the_request_revision_cannot_relabel_an_old_review() {
    let (mut session, atlas, mut params) = fixture();
    let preview = generate(
        &mut session,
        "terrain-generation.preview",
        &params,
        atlas.clone(),
    )
    .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Dungeon,
            },
        })
        .unwrap();
    params["expectedRevision"] = json!(session.revision());
    params["reviewHash"] = preview["reviewHash"].clone();
    assert!(generate(&mut session, "terrain-generation.apply", &params, atlas).is_err());
    assert_eq!(session.snapshot().world.maps[0].tiles, vec![156; 8100]);
}

#[test]
fn generation_profiles_use_the_reviewed_atlas_category_labels() {
    let (session, atlas, params) = fixture();
    let mut snapshot = session.snapshot().clone();
    let layout = &providence_core::terrain_joining::layouts()[0];
    snapshot.terrain_mappings.push(TerrainMapping {
        tileset_id: atlas.tileset_id.clone(),
        asset_identity: atlas.asset_identity.clone(),
        scenario_owned: false,
        revision: 1,
        layout_identity: layout.identity.clone(),
        layout_revision: layout.revision,
        accepted_tile_fingerprints: atlas.tile_fingerprints.clone(),
        reviewed_families: ["forest".into()].into(),
        excluded_tiles: Default::default(),
        tile_labels: Default::default(),
        category_labels: [("forest".into(), "Grove canopy".into())].into(),
    });
    let mut session = EditorSession::new(snapshot);
    let result = open(&mut session, &params, Ok(atlas)).unwrap();
    let forest = result["presets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|preset| preset["identity"] == "forest")
        .unwrap();
    assert_eq!(forest["name"], "Grove canopy");
}
