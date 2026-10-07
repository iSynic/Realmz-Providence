use super::*;
use std::path::PathBuf;

struct Temporary(PathBuf);
impl Temporary {
    fn new() -> Self {
        let root = tempfile::Builder::new()
            .prefix("providence-new-baseline-")
            .tempdir()
            .unwrap()
            .keep();
        Self(root)
    }
}
impl Drop for Temporary {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn support() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../godot/bundled/realmz-reference")
}

#[test]
fn explicit_stock_initialization_is_authored_persisted_and_media_free() {
    let temporary = Temporary::new();
    let baseline = Baseline::read("new-baseline", &support()).unwrap();
    assert!(matches!(baseline.snapshot.origin, ProjectOrigin::Authored));
    assert!(baseline.snapshot.assets.is_empty() && baseline.snapshot.classic_sources.is_empty());
    assert_eq!(baseline.snapshot.race_rules.len(), 30);
    assert_eq!(baseline.snapshot.caste_rules.len(), 30);
    assert_eq!(baseline.snapshot.standard_spells.len(), 420);
    assert_eq!(baseline.snapshot.scenario_item_rules.len(), 200);
    assert!(
        baseline
            .snapshot
            .scenario_item_rules
            .iter()
            .all(|row| row.definition.name.is_empty() && row.definition.item_type == 0)
    );
    assert_eq!(baseline.snapshot.landlook_catalogs.len(), 7);
    assert!(
        baseline
            .snapshot
            .scenario_application
            .as_ref()
            .unwrap()
            .hooks
            .start_game
            .is_none()
    );
    let before = baseline.snapshot.clone();
    let blobs = baseline.blobs.clone();
    let store = baseline
        .create(temporary.0.join("project").to_str().unwrap())
        .unwrap();
    let (_, reopened) = ProjectStore::open(store.root()).unwrap();
    assert_eq!(reopened, before);
    for (identity, bytes) in blobs {
        assert_eq!(store.read_blob(&identity).unwrap(), bytes);
    }
}

#[test]
fn missing_support_fails_before_any_destination_is_created() {
    let temporary = Temporary::new();
    assert!(
        Baseline::read("new-baseline", &temporary.0)
            .err()
            .unwrap()
            .contains("Data Race")
    );
    assert!(fs::read_dir(&temporary.0).unwrap().next().is_none());
}

#[test]
fn initialization_never_overwrites_an_occupied_destination() {
    let temporary = Temporary::new();
    fs::write(temporary.0.join("owner-data"), b"preserve").unwrap();
    assert!(
        Baseline::read("new-baseline", &support())
            .unwrap()
            .create(temporary.0.to_str().unwrap())
            .is_err()
    );
    assert_eq!(
        fs::read(temporary.0.join("owner-data")).unwrap(),
        b"preserve"
    );
    assert!(!temporary.0.join("project.providence.json").exists());
}
