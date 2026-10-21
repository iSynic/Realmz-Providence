use super::*;
use crate::catalogs::OpenLibraries;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::Value;
mod contracts;
mod control_connections;
mod export_jobs;
mod imports;
mod paint_resources;
mod rejections;
mod replacement;
mod step_context;

struct Fixture {
    session: EditorSession,
    store: ProjectStore,
    libraries: OpenLibraries,
    jobs: ConnectionJobs,
    state: state::State,
    root: tempfile::TempDir,
}
impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let snapshot = ProjectSnapshot::new_authored(StableId("mcp-fixture".into()));
        Self {
            store: ProjectStore::create(root.path(), &snapshot).unwrap(),
            root,
            session: EditorSession::new(snapshot),
            libraries: OpenLibraries::default(),
            jobs: ConnectionJobs::new(Default::default()),
            state: state::State::new("fixture-token", &[]),
        }
    }
    fn attach(&mut self, client: u64, kind: &str) -> Value {
        self.attach_with_access(client, kind, Value::Null)
    }
    fn attach_with_access(&mut self, client: u64, kind: &str, access: Value) -> Value {
        let response = self.request(client, "host.attach", json!({"token":"fixture-token","protocol":providence_session_client::HOST_PROTOCOL,"client":{"kind":kind,"owner":format!("window-{client}"),"fileAccess":access,"supportInputs":[],"authority":providence_session_client::authority_identity(),"build":providence_core::build_identity::current("providence-native-adapter")}}));
        assert!(response.ok, "{:?}", response.error);
        response.result.unwrap()
    }
    fn meta(&self) -> Value {
        json!({"projectId":"mcp-fixture","sessionGeneration":self.state.generation,"expectedRevision":self.session.revision()})
    }
    fn request(&mut self, client: u64, method: &str, params: Value) -> Response {
        self.state.dispatch(
            client,
            Request {
                id: 1,
                method: method.into(),
                params,
            },
            &mut state::Context {
                session: &mut self.session,
                store: &self.store,
                libraries: &mut self.libraries,
                jobs: &mut self.jobs,
            },
        )
    }
    fn reject(&mut self, client: u64, method: &str, params: Value, code: &str) {
        let response = self.request(client, method, params);
        assert!(!response.ok);
        let error = response.error.unwrap();
        assert!(error.starts_with(code), "{method}: {error}");
    }
    fn prepare_message(&mut self, id: u64) -> Response {
        let mut params = self.meta();
        params["steps"] = json!([{"name":"message","tool":"providence_message_create","arguments":{"nativeId":id,"text":"Café"}}]);
        self.request(1, "changes.prepare", params)
    }
}

#[test]
fn the_host_restricts_each_mcp_clients_publication_root_before_compilation() {
    let mut fixture = Fixture::new();
    let output = fixture.root.path().join("output");
    std::fs::create_dir(&output).unwrap();
    fixture.attach_with_access(1, "mcp", json!({"outputRoot":output}));
    fixture.attach(2, "mcp");
    let outside = fixture.root.path().join("escape.realmz2");
    let params = |meta: Value, path: &std::path::Path, operation: &str| {
        let mut result = meta;
        result["path"] = json!(path);
        result["minimumEngineVersion"] = json!("0.1.0");
        result["operationId"] = json!(operation);
        result
    };
    fixture.reject(
        1,
        "project.compile-rebuilt-package",
        params(fixture.meta(), &outside, "outside"),
        "file-access:",
    );
    let inside = output.join("allowed.realmz2");
    fixture.reject(
        2,
        "project.compile-rebuilt-package",
        params(fixture.meta(), &inside, "no-grant"),
        "file-access:",
    );
    let attempted = fixture.request(
        1,
        "project.compile-rebuilt-package",
        params(fixture.meta(), &inside, "allowed"),
    );
    assert!(!attempted.ok);
    let error = attempted.error.unwrap();
    assert!(!error.starts_with("file-access:"), "{error}");
    assert!(!outside.exists() && !inside.exists());
    assert_eq!(fixture.session.revision().0, 0);
}

#[test]
fn the_same_public_build_identity_does_not_authorize_different_uncommitted_sources() {
    let mut fixture = Fixture::new();
    let mut authority = providence_session_client::authority_identity();
    authority["authoritySha256"] = json!("different-uncommitted-source");
    fixture.reject(
        1,
        "host.attach",
        json!({
            "token":"fixture-token","protocol":providence_session_client::HOST_PROTOCOL,
            "client":{"kind":"mcp","supportInputs":[],"authority":authority,
                "build":providence_core::build_identity::current("providence-native-adapter")}
        }),
        "host-incompatible:",
    );
    assert!(fixture.state.clients.is_empty());
    assert_eq!(fixture.session.revision().0, 0);
    fixture.attach(1, "mcp");
}

#[test]
fn attached_observer_cannot_change_its_role_even_with_valid_host_credentials() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "observer");
    fixture.reject(1, "host.attach", json!({"token":"fixture-token","protocol":providence_session_client::HOST_PROTOCOL,"client":{"kind":"mcp","supportInputs":[],"authority":providence_session_client::authority_identity(),"build":providence_core::build_identity::current("providence-native-adapter")}}), "host-authentication:");
    fixture.reject(1, "changes.prepare", fixture.meta(), "observer-read-only:");
    assert_eq!(fixture.state.clients[&1].kind, "observer");
}

#[test]
fn library_reviews_and_edits_keep_their_own_revision_and_history_scope() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "native");
    let mut create = fixture.meta();
    create["setId"] = json!(0);
    create["nativeId"] = json!(9);
    create["operationId"] = json!("a".repeat(64));
    assert!(fixture.request(1, "monster.create", create).ok);
    let (store, session) = providence_storage::MonsterLibraryStore::create(
        fixture.root.path().join("library"),
        StableId("library".into()),
    )
    .unwrap();
    fixture.libraries.monster_library =
        Some(crate::catalogs::OpenMonsterLibrary { store, session });
    let mut review = fixture.meta();
    review["expectedRevision"] = json!(0);
    review["action"] = json!("create-library");
    review["label"] = json!("Guardian");
    review["preferredScenarioMonsterId"] = json!(9);
    let prepared = fixture.request(1, "monster-library.operation.prepare", review.clone());
    assert!(prepared.ok, "{:?}", prepared.error);
    assert_eq!(prepared.result.as_ref().unwrap()["sourceRevision"], 1);
    review["reviewHash"] = prepared.result.unwrap()["reviewHash"].clone();
    review["operationId"] = json!("b".repeat(64));
    let committed = fixture.request(1, "monster-library.operation.commit", review.clone());
    assert!(committed.ok, "{:?}", committed.error);
    assert_eq!(
        committed.result.unwrap()["historyScope"],
        "monster-library; separate Undo/Redo"
    );
    assert_eq!(fixture.session.revision().0, 1);
    assert_eq!(fixture.session.undo_history().len(), 1);
    assert_eq!(
        fixture
            .libraries
            .monster_library
            .as_ref()
            .unwrap()
            .session
            .revision()
            .0,
        1
    );
    review["operationId"] = json!("c".repeat(64));
    let stale = fixture.request(1, "monster-library.operation.prepare", review);
    assert!(!stale.ok);
    assert!(stale.error.unwrap().contains("Library changed"));
}

#[test]
fn support_replacement_requires_the_only_clean_native_client() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "native");
    let mut params = fixture.meta();
    params["options"] = json!([]);
    fixture.reject(
        1,
        "session.replace-support",
        params.clone(),
        "draft-active:",
    );
    params["active"] = json!(false);
    assert!(fixture.request(1, "session.draft", params.clone()).ok);
    fixture.attach(2, "mcp");
    fixture.reject(
        1,
        "session.replace-support",
        params.clone(),
        "support-in-use:",
    );
    fixture.state.disconnect(2).unwrap();
    let old_generation = fixture.state.generation.clone();
    let replaced = fixture.request(1, "session.replace-support", params);
    assert!(replaced.ok, "{:?}", replaced.error);
    assert_ne!(fixture.state.generation, old_generation);
    assert_eq!(fixture.session.revision().0, 0);
    assert!(!fixture.session.can_undo());
    assert_eq!(replaced.result.unwrap()["supportChanged"], true);
}

#[test]
fn invalid_support_replacement_keeps_the_old_session_usable() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "native");
    let mut params = fixture.meta();
    params["active"] = json!(false);
    assert!(fixture.request(1, "session.draft", params.clone()).ok);
    let generation = fixture.state.generation.clone();
    params["options"] = json!(["--unsupported", fixture.root.path()]);
    fixture.reject(
        1,
        "session.replace-support",
        params,
        "unsupported application-support option:",
    );
    assert_eq!(fixture.state.generation, generation);
    assert!(fixture.request(1, "session.describe", fixture.meta()).ok);
    assert_eq!(fixture.session.revision().0, 0);
}

#[test]
fn shared_receipt_replays_only_the_same_operation_after_revision_advances() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    fixture.attach(2, "mcp");
    let prepared = fixture.prepare_message(1);
    assert!(prepared.ok);
    let mut commit = fixture.meta();
    commit["previewToken"] = prepared.result.unwrap()["previewToken"].clone();
    commit["operationId"] = json!("one");
    assert!(fixture.request(1, "changes.commit", commit.clone()).ok);
    assert!(fixture.request(2, "changes.commit", commit.clone()).ok);
    assert_eq!(fixture.session.revision().0, 1);
    let receipt = fixture
        .request(1, "session.operation-status", commit.clone())
        .result
        .unwrap();
    assert_eq!(
        receipt["provenance"]["hostProtocol"],
        providence_session_client::HOST_PROTOCOL
    );
    assert_eq!(receipt["response"]["result"]["sourceRevision"], 1);
    assert_eq!(
        receipt["response"]["result"]["provenance"],
        receipt["provenance"]
    );
    commit["previewToken"] = json!("tampered");
    assert!(
        fixture
            .request(1, "changes.commit", commit)
            .error
            .unwrap()
            .starts_with("operation-conflict:")
    );
    let (_, reopened) = ProjectStore::open_session(fixture.root.path()).unwrap();
    assert_eq!(reopened.revision().0, 1);
    assert!(reopened.can_undo());
    let attribution = reopened
        .undo_history()
        .last()
        .unwrap()
        .attribution
        .as_ref()
        .unwrap();
    assert_eq!(attribution.operation_id, "one");
    assert_eq!(attribution.client_kind, "mcp");
}

#[test]
fn external_commit_waits_for_frozen_native_input_and_can_be_cancelled_by_late_typing() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let prepared = fixture.prepare_message(1);
    let mut commit = fixture.meta();
    commit["previewToken"] = prepared.result.unwrap()["previewToken"].clone();
    commit["operationId"] = json!("permitted-edit");
    fixture.attach(2, "native");
    let mut native = fixture.meta();
    native["active"] = json!(false);
    assert!(fixture.request(2, "session.draft", native.clone()).ok);
    fixture.reject(1, "changes.commit", commit.clone(), "edits-paused:");
    native["allowed"] = json!(true);
    assert!(
        fixture
            .request(2, "session.external-edits", native.clone())
            .ok
    );
    fixture.reject(1, "changes.commit", commit.clone(), "native-sync-required:");
    let pending = fixture
        .request(2, "session.collaboration", native.clone())
        .result
        .unwrap();
    native["token"] = pending["writeIntent"]["token"].clone();
    native["revision"] = json!(0);
    native["inputFrozen"] = json!(true);
    // Late typing revokes the intent without ever applying the prepared changes.
    native["active"] = json!(true);
    assert!(fixture.request(2, "session.draft", native.clone()).ok);
    assert!(
        !fixture
            .request(2, "session.write-permit", native.clone())
            .ok
    );
    fixture.reject(1, "changes.commit", commit.clone(), "draft-active:");
    native["active"] = json!(false);
    assert!(fixture.request(2, "session.draft", native.clone()).ok);
    fixture.reject(1, "changes.commit", commit.clone(), "native-sync-required:");
    let pending = fixture
        .request(2, "session.collaboration", native.clone())
        .result
        .unwrap();
    native["token"] = pending["writeIntent"]["token"].clone();
    assert!(
        fixture
            .request(2, "session.write-permit", native.clone())
            .ok
    );
    assert!(fixture.request(1, "changes.commit", commit).ok);
    assert_eq!(fixture.session.revision().0, 1);
    assert!(
        fixture
            .request(2, "session.collaboration", native)
            .result
            .unwrap()["writeIntent"]
            .is_null()
    );
}

#[test]
fn pending_operation_survives_reopen_and_blocks_a_different_write() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let mut pending = fixture.meta();
    pending["operationId"] = json!("interrupted");
    receipts::begin(
        &fixture.store,
        &Request {
            id: 1,
            method: "changes.commit".into(),
            params: pending,
        },
    )
    .unwrap();
    fixture.state = state::State::new("fixture-token", &[]);
    fixture.state.load_receipt_gate(&fixture.store).unwrap();
    fixture.attach(1, "mcp");
    let mut edit = fixture.meta();
    edit["operationId"] = json!("different");
    assert!(
        fixture
            .request(1, "history.undo", edit)
            .error
            .unwrap()
            .starts_with("operation-unresolved:")
    );
    let description = fixture.request(1, "session.collaboration", fixture.meta());
    assert_eq!(
        description.result.unwrap()["unresolvedOperations"][0]["operationId"],
        "interrupted"
    );
}

#[test]
fn disconnected_native_draft_blocks_mcp_without_replacing_the_draft() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    fixture.attach(2, "native");
    let mut params = fixture.meta();
    params["active"] = json!(true);
    assert!(fixture.request(2, "session.draft", params.clone()).ok);
    assert!(
        fixture
            .prepare_message(1)
            .error
            .unwrap()
            .starts_with("draft-active:")
    );
    fixture.state.disconnect(2).unwrap();
    assert!(
        fixture
            .prepare_message(1)
            .error
            .unwrap()
            .starts_with("draft-active:")
    );
    params["active"] = json!(false);
    assert!(
        fixture
            .request(1, "session.draft", params)
            .error
            .unwrap()
            .contains("native draft owner")
    );
    assert!(fixture.session.snapshot().messages.is_empty());
}

#[test]
fn capability_catalog_routes_are_recognized_by_the_real_adapter() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("routes".into())));
    let mut host = Fixture::new();
    host.attach(1, "native");
    for capability in providence_session_client::capabilities::all() {
        let mut jobs = crate::validation_jobs::Jobs::with_catalogs(Default::default());
        let result = if capability.method.starts_with("export.")
            || capability
                .method
                .starts_with("project.import-classic-scenario.")
        {
            let mut params = host.meta();
            params["operationId"] = json!(capability.method);
            host.request(1, capability.method, params)
        } else {
            crate::dispatch(
                &mut session,
                None,
                Default::default(),
                None,
                &mut jobs,
                Request {
                    id: 1,
                    method: capability.method.into(),
                    params: json!({"expectedRevision":0}),
                },
            )
        };
        if let Some(error) = result.error {
            assert!(
                !error.to_lowercase().contains("unknown method")
                    && !error
                        .to_lowercase()
                        .contains("unknown item authoring command"),
                "{}: {error}",
                capability.method
            );
        }
    }
}
