use super::*;

fn trouble() -> AtlasEvidence {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/trouble-custom2.json")).unwrap();
    AtlasEvidence {
        tileset_id: StableId("classic.landlook.7".into()),
        asset_identity: StableId("trouble-atlas".into()),
        blob: BlobId("sha256:fixture".into()),
        scenario_owned: true,
        tile_fingerprints: serde_json::from_value(fixture["tileFingerprints"].clone()).unwrap(),
    }
}

#[test]
fn unrelated_custom_props_do_not_disable_exact_terrain_families() {
    let atlas = trouble();
    for family in ["water", "mountains", "forest"] {
        assert_eq!(
            atlas.family_layout(family, Some(7)).unwrap().identity,
            "classic-plains"
        );
    }
    assert_eq!(atlas.matches(&layouts()[0]), 187);
    assert!(atlas.semantics(155, Some(7)).is_none());
    assert_eq!(
        atlas.semantics(156, Some(7)).unwrap().category,
        land_tile_catalog::LandTileCategory::Open
    );
    assert_eq!(
        atlas.semantics(17, Some(7)).unwrap().notes,
        "Boundary runs from bottom-left to right midpoint."
    );
}

#[test]
fn changing_one_mouth_invalidates_only_water_and_its_label() {
    let mut atlas = trouble();
    atlas.tile_fingerprints[20] = "changed artwork".into();
    assert!(atlas.family_layout("water", Some(7)).is_none());
    assert!(atlas.semantics(21, Some(7)).is_none());
    assert!(atlas.family_layout("mountains", Some(7)).is_some());
    assert!(atlas.family_layout("forest", Some(7)).is_some());
}

#[test]
fn castle_keeps_exact_stock_names_without_claiming_plains_joining() {
    let castle = layouts()
        .iter()
        .find(|layout| layout.landlook == 4)
        .unwrap();
    let mut atlas = trouble();
    atlas.tile_fingerprints = castle.tile_fingerprints.clone();
    assert_eq!(
        atlas.semantics(44, Some(4)).unwrap().name,
        land_tile_catalog::semantics(4, 44).unwrap().name
    );
    assert!(atlas.family_layout("water", Some(4)).is_none());
}

#[test]
fn fingerprint_geometry_is_exact_and_one_changed_pixel_affects_one_slot() {
    let mut rgba = vec![0; 640 * 320 * 4];
    let before = fingerprint_rgba(&rgba, 640, 320).unwrap();
    rgba[(32 * 640 + 32) * 4] = 255;
    let after = fingerprint_rgba(&rgba, 640, 320).unwrap();
    let changed: Vec<_> = before
        .iter()
        .zip(&after)
        .enumerate()
        .filter(|(_, (a, b))| a != b)
        .map(|(i, _)| i + 1)
        .collect();
    assert_eq!(changed, vec![22]);
    assert!(fingerprint_rgba(&rgba, 320, 640).is_err());
    assert!(fingerprint_rgba(&rgba[..rgba.len() - 1], 640, 320).is_err());
}

#[test]
fn mapped_custom_water_uses_canonical_apply_and_rejects_changed_artwork() {
    use crate::{
        session::*,
        smart_terrain::{self, SmartTerrainIntent},
    };
    let atlas = trouble();
    let mut snapshot = custom_snapshot(&atlas);
    let identity = StableId("land:0".into());
    let request = SmartTerrainIntent {
        tileset_id: atlas.tileset_id.clone(),
        preset: "water".into(),
        mask: (10..14)
            .flat_map(|y| (10..14).map(move |x| MapCoordinate { x, y }))
            .collect(),
        atlas_blob: Some(atlas.blob.clone()),
        mapping_revision: 0,
        tolerance: smart_terrain::ShapeTolerance::Literal,
    };
    let plan =
        smart_terrain::preview_mapped(&snapshot, &identity, &request, Some(&atlas), &mut || false)
            .unwrap();
    assert!(plan.unresolved.is_empty());
    assert_eq!(plan.paint.painted_cells.len(), 16);
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplySmartTerrain(crate::smart_terrain::Apply {
                identity: identity.clone(),
                intent: request.clone(),
                atlas: Some(atlas.clone()),
            }),
        })
        .unwrap();
    assert_eq!(session.revision().0, 1);
    snapshot.assets[0].blob = BlobId("changed-atlas".into());
    assert!(
        smart_terrain::preview_mapped(&snapshot, &identity, &request, Some(&atlas), &mut || false)
            .is_err()
    );
    let mut current = atlas.clone();
    current.blob = snapshot.assets[0].blob.clone();
    assert!(
        smart_terrain::preview_mapped(&snapshot, &identity, &request, Some(&current), &mut || {
            false
        })
        .is_err()
    );
}

fn custom_snapshot(atlas: &AtlasEvidence) -> ProjectSnapshot {
    use crate::session::*;
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "mapped-water".into(),
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
    let runtime = snapshot.world.maps[0].runtime.as_mut().unwrap();
    runtime.landlook = Some(7);
    runtime.tileset_id = atlas.tileset_id.clone();
    snapshot.assets.push(
        serde_json::from_value(serde_json::json!({"identity":atlas.asset_identity,
        "label":"Custom 2","kind":"tileset","mimeType":"image/png","blob":atlas.blob,"byteLength":1,
        "classicResource":{"resourceType":"PICT","resourceId":307},"width":640,"height":320,
        "tileWidth":32,"tileHeight":32,"columns":20,"rows":10,"source":"Scenario"}))
        .unwrap(),
    );
    snapshot
}
