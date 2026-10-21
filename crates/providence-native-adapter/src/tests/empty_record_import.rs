use crate::dispatch_result_with_store;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

#[test]
fn empty_native_tables_import_zero_records_but_first_record_fragments_stay_rejected() {
    for (method, path) in [
        ("project.import-classic-battles", "Data BD"),
        ("project.import-classic-monsters", "Data MD"),
        ("project.import-classic-complex-encounters", "Data ED2"),
        ("project.import-classic-rogue-encounters", "Data TD2"),
        ("project.import-classic-timed-encounters", "Data TD3"),
        ("project.import-classic-treasures", "Data TD"),
        ("project.import-classic-shops", "Data SD"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join(path), [1]).unwrap();
        let before = ProjectSnapshot::new_authored(StableId("empty-native".into()));
        let store = ProjectStore::create(root.path().join("project"), &before).unwrap();
        let mut session = EditorSession::new(before.clone());
        let params = json!({"directory":source,"expectedRevision":0});
        assert!(
            dispatch_result_with_store(&mut session, Some(&store), method, params.clone()).is_err(),
            "{path}"
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(0));
        fs::write(source.join(path), []).unwrap();
        if path == "Data MD" {
            fs::write(source.join("Data DES"), []).unwrap();
        }
        dispatch_result_with_store(&mut session, Some(&store), method, params)
            .unwrap_or_else(|error| panic!("{path}: {error}"));
        let retained = session
            .snapshot()
            .classic_sources
            .iter()
            .find(|row| row.native_path == path)
            .unwrap();
        assert_eq!(retained.byte_length, 0);
        assert!(store.read_blob(&retained.blob).unwrap().is_empty());
        assert!(session.snapshot().battles.is_empty());
        assert!(
            session
                .snapshot()
                .monster_sets
                .iter()
                .all(|set| set.monsters.is_empty())
        );
        assert!(session.snapshot().complex_encounters.is_empty());
        assert!(session.snapshot().rogue_encounters.is_empty());
        assert!(session.snapshot().timed_encounters.is_empty());
        assert!(session.snapshot().treasures.is_empty());
        assert!(session.snapshot().shops.is_empty());
    }
}
