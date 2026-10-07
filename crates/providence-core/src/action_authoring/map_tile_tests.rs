use super::*;
use crate::model::{
    AssetDescriptor, BlobId, ClassicResourceKey, LevelType, MapLevel, ProjectSnapshot, StableId,
};

#[test]
fn change_map_tile_uses_destination_aware_lossless_picker() {
    let snapshot = tile_picker_snapshot();
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.12".into(),
            target_native_id: 12,
            values: decode_form_values("tile-mutation", [4, 8, 9, -91, 0]).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    let tile = description
        .fields
        .iter()
        .find(|field| field.key == "tileValue")
        .unwrap();
    assert_eq!(tile.value_picker_kind, Some(ActionTargetKind::MapTile));
    assert_eq!(
        tile.target_context.map_identity,
        Some(StableId("land:4".into()))
    );
    assert_eq!(tile.value_picker_preview.as_ref().unwrap().value, -91);

    let page = tile_target_page(&snapshot, "", 128, tile.target_context.clone());
    assert!(page.items.iter().any(|item| item.value == -91));
    assert!(page.items.iter().any(|item| item.value == -1091));
    assert!(
        page.total >= 202,
        "all terrain tiles plus used special values"
    );
    let icon_page = tile_target_page(&snapshot, "379", 8, tile.target_context.clone());
    assert!(icon_page.items.iter().any(|item| item.value == 379));
}

fn tile_picker_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("tile-picker".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:4".into()),
        level_type: LevelType::Land,
        native_index: 4,
        name: "Land 4".into(),
        tiles: vec![-91, -1091, 147, 2147, 379],
        runtime: None,
    });
    snapshot.assets.push(special_land(-91));
    snapshot.assets.push(special_land(379));
    snapshot
}

fn tile_target_page(
    snapshot: &ProjectSnapshot,
    search: &str,
    limit: usize,
    context: ActionTargetContext,
) -> ActionTargetPage {
    list_targets(
        snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::MapTile,
            search: search.into(),
            cursor: None,
            limit,
            context,
        },
    )
    .unwrap()
}

#[test]
fn land_picker_previews_normalized_cicns_and_preserves_marker_bands() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("tile-rendering".into()));
    snapshot.assets.push(special_land(-91));
    snapshot.assets.push(special_land(379));
    let context = ActionTargetContext {
        map_identity: Some(StableId("land:0".into())),
        level_type: Some(LevelType::Land),
    };

    let special = super::map_tiles::preview(&snapshot, None, -1091, &context);
    assert_eq!(special.value, -1091);
    assert!(special.label.contains("cicn -91"));
    assert!(special.detail.contains("Exact signed cell value -1091"));

    let secret = super::map_tiles::preview(&snapshot, None, 2147, &context);
    assert_eq!(secret.value, 2147);
    assert!(secret.label.contains("Terrain tile 147"));
    assert!(secret.label.contains("action-point marker"));
    assert!(secret.label.contains("revealed secret"));

    let hidden_secret = super::map_tiles::preview(&snapshot, None, 3147, &context);
    assert_eq!(hidden_secret.value, 3147);
    assert!(hidden_secret.label.contains("hidden secret"));

    let marked_special = super::map_tiles::preview(&snapshot, None, -1091, &context);
    assert!(marked_special.label.contains("action-point marker"));

    let positive_icon = super::map_tiles::preview(&snapshot, None, 379, &context);
    assert_eq!(positive_icon.value, 379);
    assert!(positive_icon.label.contains("cicn 379"));

    let unknown = super::map_tiles::preview(&snapshot, None, i16::MIN, &context);
    assert_eq!(unknown.value, i32::from(i16::MIN));
    assert!(unknown.label.contains("Imported map value"));
}

#[test]
fn map_tile_labels_do_not_repeat_an_id_only_asset_label() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("tile-labels".into()));
    let mut asset = special_land(-91);
    asset.label = "cicn -91".into();
    snapshot.assets.push(asset);
    let context = ActionTargetContext {
        map_identity: Some(StableId("land:0".into())),
        level_type: Some(LevelType::Land),
    };

    let target = super::map_tiles::preview(&snapshot, None, -91, &context);
    assert_eq!(target.label, "cicn -91");
}

#[test]
fn dungeon_picker_preserves_and_describes_complete_cell_words() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-picker".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:2".into()),
        level_type: LevelType::Dungeon,
        native_index: 2,
        name: "Dungeon 2".into(),
        tiles: vec![0, 1, i16::MIN],
        runtime: None,
    });
    let context = ActionTargetContext {
        map_identity: Some(StableId("dungeon:2".into())),
        level_type: Some(LevelType::Dungeon),
    };
    let page = list_targets(
        &snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::MapTile,
            search: String::new(),
            cursor: None,
            limit: 128,
            context: context.clone(),
        },
    )
    .unwrap();
    assert_eq!(page.total, 3);
    assert_eq!(
        super::map_tiles::preview(&snapshot, None, i16::MIN, &context).value,
        i32::from(i16::MIN)
    );
}

#[test]
fn dungeon_cell_features_are_named_and_preserve_owned_workflow_bits() {
    let snapshot = ProjectSnapshot::new_authored(StableId("dungeon-controls".into()));
    let imported = (crate::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK
        | crate::codecs::DUNGEON_NOTE_MARKER_MASK
        | crate::codecs::DUNGEON_ACTION_POINT_MARKER_MASK
        | crate::codecs::DUNGEON_REVEALED_SECRET_MASK
        | crate::codecs::DUNGEON_WALL_MASK) as i16;
    let mut query = ActionFormDescribeQuery {
        action_identity: "realmz.action.12".into(),
        target_native_id: 12,
        values: decode_form_values("tile-mutation", [2, 3, 4, imported, 1]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    };
    let initial = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(initial.authoring.controls.len(), 12);
    assert_eq!(
        initial
            .authoring
            .controls
            .iter()
            .find(|control| control.key == "dungeon.wall")
            .unwrap()
            .value,
        1
    );
    assert!(
        initial.authoring.controls[0]
            .display
            .contains("Action Point marker")
    );

    query
        .context
        .authoring
        .modes
        .insert("dungeon.wall".into(), 0);
    query
        .context
        .authoring
        .modes
        .insert("dungeon.verticalDoor".into(), 1);
    let edited = describe_action_form(&snapshot, &query).unwrap();
    let value = edited.authoring.resolved_values["tileValue"] as u16;
    assert_eq!(value & crate::codecs::DUNGEON_WALL_MASK, 0);
    assert_ne!(value & crate::codecs::DUNGEON_VERTICAL_DOOR_MASK, 0);
    assert_ne!(value & crate::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK, 0);
    assert_ne!(value & crate::codecs::DUNGEON_NOTE_MARKER_MASK, 0);
    assert_ne!(value & crate::codecs::DUNGEON_ACTION_POINT_MARKER_MASK, 0);
    assert_ne!(value & crate::codecs::DUNGEON_REVEALED_SECRET_MASK, 0);
}

#[test]
fn land_destination_retains_inactive_dungeon_choices_without_applying_them() {
    let snapshot = ProjectSnapshot::new_authored(StableId("land-controls".into()));
    let mut query = ActionFormDescribeQuery {
        action_identity: "realmz.action.12".into(),
        target_native_id: 12,
        values: decode_form_values("tile-mutation", [0, 2, 3, 147, 0]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    };
    query
        .context
        .authoring
        .modes
        .insert("dungeon.wall".into(), 1);
    let description = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(description.authoring.controls.len(), 3);
    assert!(
        description
            .authoring
            .controls
            .iter()
            .all(|control| control.key.starts_with("land."))
    );
    assert_eq!(description.authoring.resolved_values["tileValue"], 147);
}

#[test]
fn land_cell_markers_are_named_and_recompose_the_exact_cell_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("land-marker-controls".into()));
    let mut query = ActionFormDescribeQuery {
        action_identity: "realmz.action.12".into(),
        target_native_id: 12,
        values: decode_form_values("tile-mutation", [0, 8, 9, 147, 0]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    };
    query
        .context
        .authoring
        .modes
        .insert("land.markerBand".into(), 2);
    query.context.authoring.modes.insert("land.note".into(), 1);
    query.context.authoring.modes.insert("land.path".into(), 0);
    let edited = describe_action_form(&snapshot, &query).unwrap();
    let value = edited.authoring.resolved_values["tileValue"];
    let cell = crate::codecs::decode_land_cell(value);
    assert_eq!(value, 0x4000 | 2147);
    assert_eq!(cell.terrain_tile, Some(147));
    assert_eq!(cell.marker_band, 2);
    assert!(cell.revealed_secret);
    assert!(cell.note_marker);
    assert!(!cell.path_marker);

    let state = edited
        .authoring
        .controls
        .iter()
        .find(|control| control.key == "land.markerBand")
        .unwrap();
    assert_eq!(
        state
            .choices
            .iter()
            .map(|choice| choice.label.as_str())
            .collect::<Vec<_>>(),
        [
            "None",
            "Action Point",
            "AP + revealed secret",
            "AP + hidden secret"
        ]
    );
}

#[test]
fn negative_special_land_values_keep_marker_bands_without_invalid_bit_markers() {
    let snapshot = ProjectSnapshot::new_authored(StableId("negative-special-controls".into()));
    let mut query = ActionFormDescribeQuery {
        action_identity: "realmz.action.12".into(),
        target_native_id: 12,
        values: decode_form_values("tile-mutation", [4, 8, 9, -186, 0]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    };
    query
        .context
        .authoring
        .modes
        .insert("land.markerBand".into(), 2);
    query.context.authoring.modes.insert("land.note".into(), 1);
    let edited = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(edited.authoring.resolved_values["tileValue"], -2186);
    assert_eq!(edited.authoring.controls.len(), 1);
    assert_eq!(edited.authoring.controls[0].key, "land.markerBand");
    assert_eq!(
        edited.authoring.controls[0]
            .choices
            .iter()
            .map(|choice| choice.value)
            .collect::<Vec<_>>(),
        [0, 1, 2]
    );

    query.context.authoring.modes.clear();
    query.values.insert("tileValue".into(), -3186);
    let imported = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(imported.authoring.resolved_values["tileValue"], -3186);
    assert_eq!(imported.authoring.controls[0].value, 3);
    assert_eq!(imported.authoring.controls[0].choices.len(), 1);
}

fn special_land(resource_id: i16) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(format!("cicn.{resource_id}")),
        label: if resource_id < 0 {
            "Violet Gate".into()
        } else {
            "Village Keeper".into()
        },
        kind: if resource_id < 0 {
            "special-land-tile".into()
        } else {
            "icon".into()
        },
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: i32::from(resource_id),
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        byte_length: 4,
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
        landlook: Some(0),
        base_tile: Some(1),
        source: "fixture".into(),
    }
}
