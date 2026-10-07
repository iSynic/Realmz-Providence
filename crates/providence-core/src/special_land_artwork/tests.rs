use super::*;
use crate::model::{BlobId, StableId};

fn asset() -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({"identity":"scenario:overlay:-91","label":"Dome","kind":"special-land-tile",
        "mimeType":"image/png","width":32,"height":32,"classicResource":{"resourceType":"cicn","resourceId":-91},
        "blob":BlobId("a".repeat(64)),"byteLength":1,"source":"Scenario"})).unwrap()
}

#[test]
fn signed_identity_and_exact_scenario_ownership_precede_geometry_and_kind() {
    let mut source = ProjectSnapshot::new_authored(StableId("special".into()));
    source.assets.push(asset());
    let resolved = resolve(&source, None, -91).unwrap();
    assert_eq!(resolved.asset.identity.0, "scenario:overlay:-91");
    assert_eq!(resolved.ownership, "scenario");
    source.assets[0].kind = "picture".into();
    assert!(
        resolve(&source, None, -91)
            .unwrap_err()
            .contains("cannot fall through")
    );
    source.assets[0] = asset();
    source.assets.push(asset());
    assert!(
        resolve(&source, None, -91)
            .unwrap_err()
            .contains("ambiguous")
    );
    assert!(resolve(&source, None, -3091).is_err());
    assert_eq!(choices(&source, None).len(), 1);
    assert!(!choices(&source, None)[0].available);
}

#[test]
fn placement_picker_never_offers_an_empty_resource_as_available() {
    use crate::monster_reference_catalog::{MonsterReferenceQuery, monster_reference_choices};
    let mut source = ProjectSnapshot::new_authored(StableId("new-placement".into()));
    source.assets.push(asset());
    let query = MonsterReferenceQuery {
        field: "specialLand".into(),
        current_value: 0,
        search: String::new(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 64,
    };
    let page = monster_reference_choices(&source, None, &query).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].value, -91);
    assert!(page.items[0].available);
}

#[test]
fn placement_uses_decode_marker_words_once_and_ignore_dungeon_cells() {
    use crate::{
        model::LevelType,
        session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
    };
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "placement-uses".into(),
    )));
    for level_type in [LevelType::Land, LevelType::Dungeon] {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::CreateMap { level_type },
            })
            .unwrap();
    }
    let mut source = session.snapshot().clone();
    let land = source
        .world
        .maps
        .iter_mut()
        .find(|map| map.level_type == LevelType::Land)
        .unwrap();
    land.tiles[91] = -91;
    land.tiles[182] = -1091;
    land.tiles[273] = -2091;
    land.tiles[364] = -3091;
    source
        .world
        .maps
        .iter_mut()
        .find(|map| map.level_type == LevelType::Dungeon)
        .unwrap()
        .tiles[0] = -91;
    let before = source.clone();
    let result = uses(&source, -91);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].identity.0, "land:0");
    assert_eq!(result[0].cells, 3);
    assert_eq!((result[0].first.x, result[0].first.y), (1, 1));
    assert_eq!(uses(&source, -1091)[0].cells, 1);
    assert!(uses(&source, -90).is_empty());
    assert_eq!(source, before);
}
