use super::*;
use crate::{dispatch_result, dispatch_result_with_store};
use providence_core::{
    codecs::MAPSTATS_REFERENCE_BYTES, model::ProjectSnapshot, session::Revision,
};

fn fixture(path: &std::path::Path) -> (ProjectStore, ProjectSnapshot) {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "native-tile-behavior".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let store = ProjectStore::create(path, session.snapshot()).unwrap();
    let mut bytes = vec![0; MAPSTATS_REFERENCE_BYTES];
    bytes[58..60].copy_from_slice(&[0x82, 0x17]);
    let blob = store.put_blob(&bytes).unwrap();
    let decoded = decode_custom_landlook_mapstats(&bytes, 6, blob).unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(6);
    (store, snapshot)
}

#[test]
fn stored_behavior_uses_one_command_preserves_clear_source_and_supports_history_reopen() {
    let temp = tempfile::tempdir().unwrap();
    let (store, snapshot) = fixture(temp.path());
    let mut session = EditorSession::new(snapshot.clone());
    let params = json!({"identity":"land:0","expectedRevision":0,"tile":1});
    let opened = dispatch(
        &mut session,
        Some(&store),
        CatalogViews::default(),
        "tile-behavior.open",
        &params,
    )
    .unwrap();
    let mut changed = params.clone();
    changed["edit"] = opened["edit"].clone();
    changed["edit"]["clearTile"] = json!(155);
    changed["edit"]["path"] = json!(true);
    changed["edit"]["movementTime"] = json!(7);
    changed["edit"]["combatBuild"][1][1] = json!(400);
    let preview = dispatch(
        &mut session,
        Some(&store),
        CatalogViews::default(),
        "tile-behavior.preview",
        &changed,
    )
    .unwrap();
    assert_eq!(preview["canApply"], true);
    assert_eq!(preview["total"], 1);
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision(), Revision(0));
    dispatch_result_with_store(
        &mut session,
        Some(&store),
        "tile-behavior.apply",
        changed.clone(),
    )
    .unwrap();
    assert_eq!(session.revision(), Revision(1));
    let source = store
        .read_blob(&session.snapshot().landlook_catalogs[0].source_blob)
        .unwrap();
    assert_eq!(source[78..80], 155i16.to_be_bytes());
    assert_eq!(source[58..60], [0x82, 0x17]);
    assert!(
        dispatch_result_with_store(&mut session, Some(&store), "tile-behavior.apply", changed)
            .is_err()
    );
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":2})).unwrap();
    store
        .checkpoint_session(&session, &json!({"method":"tile-behavior.apply"}))
        .unwrap();
    let (_, reopened) = ProjectStore::open_session(temp.path()).unwrap();
    assert_eq!(reopened.snapshot(), session.snapshot());
}
