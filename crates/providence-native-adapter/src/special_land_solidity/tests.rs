use super::*;
use providence_core::model::{ProjectOrigin, ProjectSnapshot, StableId};

#[test]
fn reviewed_collision_source_is_retained_undoable_and_does_not_create_an_import_annex() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("collision-table".into()));
    let store = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let mut bytes = vec![0; 1024];
    bytes[15] = 1;
    bytes[62] = 1;
    let input = temp.path().join("Data Solids");
    std::fs::write(&input, &bytes).unwrap();
    let preview = dispatch(
        &mut session,
        Some(&store),
        "special-land-solidity.preview",
        &json!({"path":input}),
    )
    .unwrap();
    assert_eq!(preview["solidIds"], json!([15, 62]));
    assert_eq!(session.revision().0, 0);
    let args = json!({"path":input,"expectedRevision":0,"expectedSha256":preview["sourceSha256"]});
    dispatch(
        &mut session,
        Some(&store),
        "special-land-solidity.initialize",
        &args,
    )
    .unwrap();
    let catalog = session
        .snapshot()
        .world
        .special_land_solidity
        .as_ref()
        .unwrap();
    assert_eq!(store.read_blob(&catalog.source_blob).unwrap(), bytes);
    assert!(catalog.solid[15] && catalog.solid[62] && !catalog.solid[16]);
    assert_eq!(session.snapshot().origin, ProjectOrigin::Authored);
    assert!(session.snapshot().classic_sources.is_empty());
    assert!(
        dispatch(
            &mut session,
            Some(&store),
            "special-land-solidity.initialize",
            &args
        )
        .is_err()
    );
    session
        .execute(providence_core::session::ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(session.snapshot().world.special_land_solidity.is_none());
}

#[test]
fn native_transport_saves_and_reopens_the_initialized_table() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("collision-transport".into()));
    let directory = temp.path().join("project");
    let store = ProjectStore::create(&directory, &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let input = temp.path().join("Data Solids");
    let mut bytes = vec![0; 1024];
    bytes[15] = 1;
    std::fs::write(&input, &bytes).unwrap();
    let request = json!({"id":1,"method":"special-land-solidity.initialize","params":{
        "path":input,"expectedRevision":0,"expectedSha256":format!("{:x}",Sha256::digest(&bytes))}});
    let mut output = Vec::new();
    crate::transport::serve_io(
        &mut session,
        Some(&store),
        std::io::Cursor::new(format!("{request}\n")),
        &mut output,
    )
    .unwrap();
    let reply: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    let (_, reopened) = ProjectStore::open_session(&directory).unwrap();
    assert_eq!(
        reopened.snapshot().world.special_land_solidity,
        session.snapshot().world.special_land_solidity
    );
    assert!(reopened.can_undo());
}

#[test]
fn malformed_changed_and_stale_sources_cannot_initialize_collision_rules() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("collision-guards".into()));
    let store = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let input = temp.path().join("Data Solids");
    for length in [0, 1023, 1025] {
        std::fs::write(&input, vec![0; length]).unwrap();
        assert!(
            dispatch(
                &mut session,
                Some(&store),
                "special-land-solidity.preview",
                &json!({"path":input})
            )
            .is_err()
        );
    }
    std::fs::write(&input, vec![0; 1024]).unwrap();
    let preview = dispatch(
        &mut session,
        Some(&store),
        "special-land-solidity.preview",
        &json!({"path":input}),
    )
    .unwrap();
    let mut args =
        json!({"path":input,"expectedRevision":1,"expectedSha256":preview["sourceSha256"]});
    assert!(
        dispatch(
            &mut session,
            Some(&store),
            "special-land-solidity.initialize",
            &args
        )
        .is_err()
    );
    args["expectedRevision"] = json!(0);
    let mut changed = vec![0; 1024];
    changed[15] = 1;
    std::fs::write(&input, changed).unwrap();
    assert!(
        dispatch(
            &mut session,
            Some(&store),
            "special-land-solidity.initialize",
            &args
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &snapshot);
}
