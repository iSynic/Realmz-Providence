use super::*;
use crate::codecs::decode_custom_landlook_mapstats;
use crate::model::{BlobId, RandomRectangle};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn fixture() -> EditorSession {
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("settings".into())));
    for revision in 0..3 {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(revision),
                command: EditorCommand::CreateMap {
                    level_type: if revision == 2 {
                        LevelType::Dungeon
                    } else {
                        LevelType::Land
                    },
                },
            })
            .unwrap();
    }
    let mut snapshot = session.snapshot().clone();
    let mut bytes = vec![0; MAPSTATS_REFERENCE_BYTES];
    bytes[8040..8044].copy_from_slice(&[0, 156, 0, 3]);
    let custom = decode_custom_landlook_mapstats(&bytes, 6, BlobId("e".repeat(64))).unwrap();
    snapshot.landlook_catalogs.push(custom.catalog);
    for map in snapshot
        .world
        .maps
        .iter_mut()
        .filter(|map| map.level_type == LevelType::Land)
    {
        let runtime = map.runtime.as_mut().unwrap();
        runtime.landlook = Some(6);
        runtime.tileset_id = StableId("classic.landlook.6".into());
        runtime.base_tile = Some(156);
        runtime.source_blob = Some(BlobId("a".repeat(64)));
        runtime.random_rectangles.push(RandomRectangle {
            identity: StableId(format!("{}:random:0", map.identity.0)),
            top: -10,
            left: -2,
            bottom: 100,
            right: 95,
            chance_ten_thousand: -1,
            battle_range: [-2, 300],
            random_doors: [1, 2, 3],
            random_door_percent: [-100, 0, 100],
            only: true,
            option: 77,
            sound_id: -9,
            text_id: 44,
        });
    }
    EditorSession::new(snapshot)
}

fn edit(session: &EditorSession, identity: &str) -> LevelSettingsEdit {
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == identity)
        .unwrap();
    let runtime = map.runtime.as_ref().unwrap();
    LevelSettingsEdit {
        name: map.name.clone(),
        dark: runtime.dark,
        uses_los: runtime.uses_los,
        landlook: runtime.landlook,
        shared_base_tile: None,
    }
}

fn apply(
    session: &mut EditorSession,
    identity: &str,
    edit: LevelSettingsEdit,
) -> Result<crate::session::ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: EditorCommand::ApplyLevelSettings {
            identity: StableId(identity.into()),
            edit,
        },
    })
}

#[test]
fn visible_level_settings_and_shared_base_commit_together_preserving_regions_source_and_history() {
    let mut session = fixture();
    let before = session.snapshot().clone();
    let mut edited = edit(&session, "land:0");
    edited.name = "North Bridge".into();
    edited.dark = true;
    edited.uses_los = true;
    edited.shared_base_tile = Some(159);
    let preview = preview_level_settings(&before, &StableId("land:0".into()), &edited).unwrap();
    assert_eq!(preview.affected_maps.len(), 2);
    assert_eq!(session.snapshot(), &before);
    apply(&mut session, "land:0", edited).unwrap();
    let after = session.snapshot().clone();
    assert_eq!(session.revision().0, 1);
    assert_eq!(after.world.maps[0].name, "North Bridge");
    for index in 0..2 {
        let runtime = after.world.maps[index].runtime.as_ref().unwrap();
        assert_eq!(runtime.base_tile, Some(159));
        assert_eq!(runtime.base_scale, Some(3));
        assert_eq!(
            runtime.random_rectangles,
            before.world.maps[index]
                .runtime
                .as_ref()
                .unwrap()
                .random_rectangles
        );
        assert_eq!(
            runtime.source_blob,
            before.world.maps[index]
                .runtime
                .as_ref()
                .unwrap()
                .source_blob
        );
        assert_eq!(
            after.world.maps[index].tiles,
            before.world.maps[index].tiles
        );
    }
    assert_eq!(after.world.maps[2], before.world.maps[2]);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn settings_reject_protected_stock_bases_missing_custom_catalogs_and_invalid_dungeon_renderers_atomically()
 {
    let mut session = fixture();
    let before = session.snapshot().clone();
    let mut stock = edit(&session, "land:0");
    stock.landlook = Some(0);
    stock.shared_base_tile = Some(3);
    stock.name = "Must not commit".into();
    assert!(apply(&mut session, "land:0", stock).is_err());
    let mut missing = edit(&session, "land:0");
    missing.landlook = Some(7);
    assert!(apply(&mut session, "land:0", missing).is_err());
    let mut dungeon = edit(&session, "dungeon:0");
    dungeon.landlook = Some(0);
    assert!(apply(&mut session, "dungeon:0", dungeon).is_err());
    let mut bounds = edit(&session, "land:0");
    bounds.shared_base_tile = Some(201);
    assert!(apply(&mut session, "land:0", bounds).is_err());
    let current = edit(&session, "land:0");
    assert!(
        !preview_level_settings(&before, &StableId("land:0".into()), &current)
            .unwrap()
            .can_apply
    );
    assert!(apply(&mut session, "land:0", current).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 0);
}
