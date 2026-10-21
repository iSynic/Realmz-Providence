use super::*;

#[test]
fn binary_only_spell_import_preserves_physical_rows_and_fragments() {
    for rows in [0, 2, 300] {
        let (_temporary, store, reopened, bytes) = import_physical(rows);
        let decoded = &reopened.snapshot().scenario_spells;
        assert_eq!(decoded.len(), rows);
        assert!(
            decoded
                .iter()
                .enumerate()
                .all(|(i, r)| usize::from(r.definition.record_index) == i
                    && r.text_source_blob.is_none())
        );
        assert_eq!(
            providence_core::rebuilt::project_rebuilt_v3_spell_catalog(reopened.snapshot())
                .unwrap()
                .len(),
            rows.min(105)
        );
        let source = reopened
            .snapshot()
            .classic_sources
            .iter()
            .find(|s| s.native_path == "Data Spell")
            .unwrap();
        let original = store.read_blob(&source.blob).unwrap();
        assert_eq!(original, bytes);
        assert_eq!(
            providence_core::codecs::encode_scenario_spells(decoded, Some(&original)).unwrap(),
            bytes
        );
        assert!(
            !reopened
                .snapshot()
                .classic_sources
                .iter()
                .any(|s| s.native_path == "Data Spell.rsrc")
        );
        if rows == 300 {
            assert_overflow_guards(&reopened, &original);
        }
    }
}

fn import_physical(rows: usize) -> (tempfile::TempDir, ProjectStore, EditorSession, Vec<u8>) {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("Data Spell");
    let mut bytes = vec![0; rows * 30 + 16];
    if rows > 0 {
        bytes[0] = 17;
        bytes[10] = 9;
    }
    if rows > 105 {
        bytes[105 * 30] = 23;
    }
    bytes[rows * 30..].fill(0xa7);
    fs::write(&path, &bytes).unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("binary-spells".into()));
    let store = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let request = json!({"id":1,"method":"project.import-classic-spells","params":{"expectedRevision":0,"path":path}});
    let mut output = Vec::new();
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{request}\n")),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["count"], rows);
    assert_eq!(response["result"]["trailingBytes"], 16);
    let (store, reopened) = ProjectStore::open_session(store.root()).unwrap();
    (temp, store, reopened, bytes)
}

fn assert_overflow_guards(session: &EditorSession, original: &[u8]) {
    let opened = crate::spell_catalog::open(session, None, "classic.spell.5801").unwrap();
    assert_eq!(opened["empty"], false);
    assert_eq!(opened["editable"], false);
    assert_eq!(opened["runtimeAddressable"], false);
    let page = crate::spell_catalog::dispatch(
        session,
        None,
        "spell.catalog",
        &json!({"query":"5801","showUnused":true}),
    )
    .unwrap();
    assert_eq!(page["items"][0]["editable"], false);
    assert_eq!(page["items"][0]["runtimeAddressable"], false);
    let mut missing = session.snapshot().clone();
    missing.scenario_spells.pop();
    assert!(providence_core::rebuilt::project_rebuilt_v3_spell_catalog(&missing).is_err());
    let mut reindexed = session.snapshot().clone();
    reindexed.scenario_spells[299].definition.record_index = 298;
    assert!(providence_core::rebuilt::project_rebuilt_v3_spell_catalog(&reindexed).is_err());
    let mut signed = session.snapshot().clone();
    signed.scenario_spells[105].definition.classic_id = -5801;
    assert!(providence_core::rebuilt::project_rebuilt_v3_spell_catalog(&signed).is_err());
    let mut changed = session.snapshot().scenario_spells.clone();
    changed[105].definition.to_hit_bonus = -17;
    assert!(providence_core::codecs::encode_scenario_spells(&changed, Some(original)).is_err());
}
