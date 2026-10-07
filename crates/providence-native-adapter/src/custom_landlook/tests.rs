use super::*;
use crate::{demo::demo_snapshot, dispatch_result_with_store};

struct Fixture {
    temporary: tempfile::TempDir,
    store: ProjectStore,
    session: EditorSession,
}
impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let mut snapshot = demo_snapshot();
        snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
            source: "fixture".into(),
            source_blob: None,
            landlook: Some(6),
            tileset_id: StableId("classic.landlook.6".into()),
            base_tile: Some(0),
            base_scale: Some(0),
            dark: false,
            uses_los: false,
            random_rectangles: vec![],
        });
        let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
        let bytes = vec![0; 8104];
        let decoded =
            decode_custom_landlook_mapstats(&bytes, 6, store.put_blob(&bytes).unwrap()).unwrap();
        snapshot.landlook_catalogs.push(decoded.catalog);
        snapshot.terrain_catalog = decoded.profiles;
        let native =
            encode_scenario_picture_pict(&vec![255; 640 * 320 * 4], 640, 320, false).unwrap();
        let runtime = encode_runtime_rgba_png(&vec![255; 640 * 320 * 4], 640, 320).unwrap();
        let mut asset = material::descriptor(6, None, &runtime, &native);
        asset.blob = store.put_blob(&runtime).unwrap();
        asset.classic_payload_blob = Some(store.put_blob(&native).unwrap());
        snapshot.assets.push(asset);
        store.save_snapshot(&snapshot).unwrap();
        Self {
            temporary,
            store,
            session: EditorSession::new(snapshot),
        }
    }
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        dispatch_result_with_store(&mut self.session, Some(&self.store), method, params)
    }
    fn params(&self, operation: &str, destination: i8) -> Value {
        json!({"identity":"land:0","expectedRevision":self.session.revision(),"draft":{"operation":operation,"sourceLook":6,"destination":destination,"replace":false,"assignMap":false}})
    }
}

#[test]
fn clone_review_is_pure_and_atomic_history_persists_exact_resources() {
    let mut fixture = Fixture::new();
    let mut params = fixture.params("clone", 7);
    let review = fixture
        .request("custom-landlook.preview", params.clone())
        .unwrap();
    assert_eq!(fixture.session.revision().0, 0);
    assert_eq!(fixture.session.snapshot().assets.len(), 1);
    params["reviewHash"] = review["reviewHash"].clone();
    fixture
        .request("custom-landlook.apply", params.clone())
        .unwrap();
    assert_eq!(fixture.session.revision().0, 1);
    assert_eq!(fixture.session.snapshot().assets.len(), 2);
    assert!(fixture.request("custom-landlook.apply", params).is_err());
    let kept = fixture.session.snapshot().clone();
    fixture
        .request("history.undo", json!({"expectedRevision":1}))
        .unwrap();
    assert_eq!(fixture.session.snapshot().assets.len(), 1);
    assert!(
        !fixture
            .session
            .snapshot()
            .landlook_catalogs
            .iter()
            .any(|row| row.landlook == 7)
    );
    fixture
        .request("history.redo", json!({"expectedRevision":2}))
        .unwrap();
    assert_eq!(fixture.session.snapshot(), &kept);
    fixture
        .store
        .save_snapshot(fixture.session.snapshot())
        .unwrap();
    let reopened = ProjectStore::open(fixture.temporary.path().join("project")).unwrap();
    assert_eq!(reopened.1, kept);
}

#[test]
fn import_review_binds_file_content_preserves_behavior_and_protects_stock() {
    let mut fixture = Fixture::new();
    let path = fixture.temporary.path().join("tile.png");
    let mut params = fixture.params("import", 6);
    params["draft"]["replace"] = json!(true);
    params["draft"]["path"] = json!(path);
    params["draft"]["mode"] = json!("tile");
    params["draft"]["tile"] = json!(1);
    let write = |color: u8| {
        std::fs::write(
            &path,
            encode_runtime_rgba_png(&vec![color; 32 * 32 * 4], 32, 32).unwrap(),
        )
        .unwrap()
    };
    write(0);
    let review = fixture
        .request("custom-landlook.preview", params.clone())
        .unwrap();
    params["reviewHash"] = review["reviewHash"].clone();
    write(125);
    assert!(
        fixture
            .request("custom-landlook.apply", params.clone())
            .unwrap_err()
            .contains("Review impact again")
    );
    assert_eq!(fixture.session.revision().0, 0);
    let before = fixture.session.snapshot().terrain_catalog.clone();
    let review = fixture
        .request("custom-landlook.preview", params.clone())
        .unwrap();
    params["reviewHash"] = review["reviewHash"].clone();
    fixture
        .request("custom-landlook.apply", params.clone())
        .unwrap();
    assert_eq!(fixture.session.snapshot().terrain_catalog, before);
    params["expectedRevision"] = json!(1);
    params["draft"]["tile"] = json!(60);
    assert!(
        fixture
            .request("custom-landlook.preview", params.clone())
            .unwrap_err()
            .contains("protected")
    );
    params["draft"]["destination"] = json!(0);
    assert!(
        fixture
            .request("custom-landlook.preview", params)
            .unwrap_err()
            .contains("Stock")
    );
}
