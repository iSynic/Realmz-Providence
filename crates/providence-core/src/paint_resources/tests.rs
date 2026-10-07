use super::*;

fn resource(identity: &str) -> PaintResource {
    PaintResource {
        identity: StableId(identity.into()),
        name: "Town paths".into(),
        collection: "Town".into(),
        kind: PaintResourceKind::Palette,
        level_type: LevelType::Land,
        tileset_id: StableId("landlook:0".into()),
        width: 2,
        height: 1,
        cells: vec![
            PaintResourceCell {
                x: 0,
                y: 0,
                tile: 1,
            },
            PaintResourceCell {
                x: 1,
                y: 0,
                tile: 5,
            },
        ],
        favorite: false,
    }
}

#[test]
fn revision_owned_create_replace_delete_and_recent() {
    let original = PaintResources::default();
    let mut current = original
        .changed(
            0,
            PaintResourceChange::Create {
                resource: resource("paths"),
            },
        )
        .unwrap();
    assert!(
        current
            .changed(
                0,
                PaintResourceChange::Delete {
                    identity: StableId("paths".into())
                }
            )
            .is_err()
    );
    assert!(
        current
            .changed(
                1,
                PaintResourceChange::Create {
                    resource: resource("paths")
                }
            )
            .is_err()
    );
    let mut replacement = resource("paths");
    replacement.name = "Village paths".into();
    replacement.favorite = true;
    current = current
        .changed(
            1,
            PaintResourceChange::Replace {
                resource: replacement,
            },
        )
        .unwrap();
    check_recent_and_delete(current);
    assert_eq!(original.revision, 0);
}

fn check_recent_and_delete(mut current: PaintResources) {
    current = current
        .changed(
            2,
            PaintResourceChange::Remember {
                identity: StableId("paths".into()),
            },
        )
        .unwrap();
    assert_eq!(current.recent, [StableId("paths".into())]);
    assert_eq!(
        current
            .changed(
                3,
                PaintResourceChange::Remember {
                    identity: StableId("paths".into())
                }
            )
            .unwrap(),
        current
    );
    current = current
        .changed(
            3,
            PaintResourceChange::Delete {
                identity: StableId("paths".into()),
            },
        )
        .unwrap();
    assert!(current.entries.is_empty() && current.recent.is_empty());
}

#[test]
fn rejects_capacity_geometry_markers_and_duplicate_ids_without_normalizing() {
    let mut value = resource("paths");
    value.cells[0].tile = 1001;
    assert!(value.validate().is_err());
    value.level_type = LevelType::Dungeon;
    value.kind = PaintResourceKind::Stamp;
    value.cells[0].tile = 0x20;
    assert!(value.validate().is_err());
    value.cells[0].tile = 0;
    assert!(value.validate().is_ok());
    value.width = 33;
    assert!(value.validate().is_err());
    let duplicate = PaintResources {
        entries: vec![resource("paths"), resource("paths")],
        ..Default::default()
    };
    assert!(duplicate.validate().is_err());
    let full = PaintResources {
        entries: (0..=RESOURCE_LIMIT)
            .map(|i| resource(&format!("paths:{i}")))
            .collect(),
        ..Default::default()
    };
    assert!(full.validate().is_err());
}
