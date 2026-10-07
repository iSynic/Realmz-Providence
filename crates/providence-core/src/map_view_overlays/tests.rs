use super::*;
use crate::{
    codecs::{MAPSTATS_CORE_BYTES, decode_landlook_mapstats},
    model::{BlobId, NativeRecordId, PlayerMapRect},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};

fn fixture() -> ProjectSnapshot {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("view".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    session.snapshot().clone()
}

fn record(id: u32) -> PlayerMapRecord {
    PlayerMapRecord {
        identity: StableId(format!("player-map:{id}")),
        native_id: NativeRecordId(id),
        markers: vec![],
        start_x: 4,
        start_y: 7,
        level: 0,
        picture_id: 0,
        icon_size: 16,
        show: 1,
        is_dungeon: false,
        picture_rect: PlayerMapRect {
            top: 0,
            left: 0,
            bottom: 320,
            right: 320,
        },
        note: String::new(),
        authored: true,
    }
}

#[test]
fn signed_marker_hints_preserve_truth_and_do_not_treat_special_art_as_stock_terrain() {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[..6].copy_from_slice(&[
        3003,
        1169,
        180,
        -180,
        0x6000 | 2180,
        2003,
    ]);
    let before = snapshot.clone();
    let view = project(&snapshot, &snapshot.world.maps[0]);
    assert_eq!(view.secret_cells, vec![MapCoordinate { x: 0, y: 0 }]);
    assert_eq!(view.hidden_path_cells, vec![MapCoordinate { x: 1, y: 0 }]);
    assert_eq!(
        view.combat_clearing_cells,
        vec![MapCoordinate { x: 2, y: 0 }, MapCoordinate { x: 4, y: 0 }]
    );
    assert_eq!(snapshot, before);
    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(6);
    let custom = project(&snapshot, &snapshot.world.maps[0]);
    assert!(custom.hidden_path_cells.is_empty() && custom.combat_clearing_cells.is_empty());
}

#[test]
fn exact_mapstats_overrides_stock_hidden_path_hint_and_custom_metadata_is_used() {
    let mut snapshot = fixture();
    let mut bytes = vec![0; MAPSTATS_CORE_BYTES];
    snapshot.terrain_catalog =
        decode_landlook_mapstats(&bytes, 0, "fixture", BlobId("f".repeat(64)))
            .unwrap()
            .profiles;
    snapshot.world.maps[0].tiles[0] = 169;
    assert!(
        project(&snapshot, &snapshot.world.maps[0])
            .hidden_path_cells
            .is_empty()
    );
    bytes[169 * 40 + 10..169 * 40 + 12].copy_from_slice(&1i16.to_be_bytes());
    snapshot.terrain_catalog =
        decode_landlook_mapstats(&bytes, 6, "fixture", BlobId("f".repeat(64)))
            .unwrap()
            .profiles;
    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(6);
    assert_eq!(
        project(&snapshot, &snapshot.world.maps[0]).hidden_path_cells,
        vec![MapCoordinate { x: 0, y: 0 }]
    );
}

#[test]
fn player_map_crops_are_context_exact_bounded_and_do_not_invent_picture_or_text_footprints() {
    let mut snapshot = fixture();
    let mut negative = record(1);
    negative.start_x = -3;
    negative.start_y = 88;
    negative.icon_size = 7;
    let mut picture = record(2);
    picture.picture_id = 301;
    let mut text = record(3);
    text.show = -1;
    let mut dungeon = record(4);
    dungeon.is_dungeon = true;
    let mut other_level = record(5);
    other_level.level = 1;
    let mut outside = record(6);
    outside.start_x = 90;
    snapshot.world.player_maps = vec![
        record(0),
        negative,
        picture,
        text,
        dungeon,
        other_level,
        outside,
    ];
    let before = snapshot.clone();
    let view = project(&snapshot, &snapshot.world.maps[0]);
    assert_eq!(view.player_maps.len(), 2);
    assert_eq!(
        (
            view.player_maps[0].left,
            view.player_maps[0].top,
            view.player_maps[0].right,
            view.player_maps[0].bottom
        ),
        (4, 7, 24, 27)
    );
    assert_eq!(
        (
            view.player_maps[1].left,
            view.player_maps[1].top,
            view.player_maps[1].right,
            view.player_maps[1].bottom
        ),
        (0, 88, 43, 90)
    );
    assert_eq!(
        view.player_maps[1].identity,
        StableId("player-map:1".into())
    );
    assert_eq!(snapshot, before);
}
