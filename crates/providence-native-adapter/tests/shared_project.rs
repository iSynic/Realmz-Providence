//! Exercise real local sockets and the legacy-shaped native stdio proxy.
mod shared_project_client;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::Revision,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use shared_project_client::{OwnedHost, Proxy};

fn meta(session: &Value) -> Value {
    json!({"projectId":session["projectId"],"sessionGeneration":session["sessionGeneration"],"expectedRevision":session["revision"]})
}

#[test]
fn host_crash_restarts_with_a_new_generation_and_recovers_acknowledged_history() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("host-crash".into())),
    )
    .unwrap();
    let mut host = OwnedHost::start(root.path());
    let mut original = Proxy::open(root.path(), false);
    let initial = original.ok("session.describe", json!({}));
    let mut prepare = meta(&initial);
    prepare["steps"] = json!([{"name":"message","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Survives host crash"}}]);
    let preview = original.ok("changes.prepare", prepare);
    let mut commit = meta(&initial);
    commit["operationId"] = json!("before-host-crash");
    commit["previewToken"] = preview["previewToken"].clone();
    assert_eq!(original.ok("changes.commit", commit)["revision"], 1);
    host.crash();
    drop(original);
    let mut replacement = Proxy::open(root.path(), false);
    let current = replacement.ok("session.describe", json!({}));
    assert_ne!(current["sessionGeneration"], initial["sessionGeneration"]);
    assert_eq!(current["revision"], 1);
    let mut read = meta(&current);
    read["nativeId"] = json!(1);
    assert_eq!(
        replacement.ok("message.open", read)["message"]["text"],
        "Survives host crash"
    );
    let mut receipt = meta(&current);
    receipt["operationId"] = json!("before-host-crash");
    assert_eq!(
        replacement.ok("session.operation-status", receipt)["state"],
        "committed"
    );
    let mut undo = meta(&current);
    undo["operationId"] = json!("undo-after-host-crash");
    assert_eq!(replacement.ok("history.undo", undo)["revision"], 2);
    drop(replacement);
    wait_for_writer_release(root.path());
}

#[test]
fn bound_native_control_updates_drafts_without_project_authority_or_a_separate_client_hold() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("native-control".into())),
    )
    .unwrap();
    let mut native = Proxy::open(root.path(), true);
    let opened = native.ok("session.describe", json!({}));
    let binding = &opened["_nativeControl"];
    let mut control = Proxy::native_control(root.path(), binding);
    let draft = control.ok("session.draft", json!({"active":true}));
    assert_eq!(draft["draftActive"], true);
    assert_eq!(draft["clients"].as_array().unwrap().len(), 1);
    assert!(
        !draft
            .to_string()
            .contains(binding["token"].as_str().unwrap())
    );
    let rejected = control.call("history.undo", json!({"expectedRevision":0}));
    assert!(!rejected.ok && rejected.error.unwrap().starts_with("native-control-only:"));
    assert_eq!(
        control.ok("session.draft", json!({"active":false}))["draftActive"],
        false
    );
    native.ok("session.detach", json!({"draftsResolved":true}));
    drop(native);
    // A control transport is not an independent project owner.
    wait_for_writer_release(root.path());
    drop(control);
}

#[test]
fn reconnect_after_owner_rejection_waits_for_retiring_host_before_starting_replacement() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("retiring-host".into())),
    )
    .unwrap();
    let mut native = Proxy::open(root.path(), true);
    native.ok("session.draft", json!({"active":false}));
    let mut observer = Proxy::open_kind(root.path(), "observer");
    observer.ok("session.describe", json!({}));
    let mut replacement = Proxy::traced_native(root.path());
    let opening = replacement.begin_call("session.describe", json!({}));
    replacement.wait_diagnostic("waiting for its previous native connection to detach");
    // The replacement has actually met the still-connected owner. Both old
    // transports now disappear, reproducing the host's final-client handover.
    drop(native);
    drop(observer);
    let reply = replacement.finish_call(opening);
    assert!(reply.ok, "{:?}", reply.error);
    let session = reply.result.unwrap();
    assert_eq!(session["projectId"], "retiring-host");
    assert_eq!(session["revision"], 0);
    replacement.ok(
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    );
    assert_eq!(replacement.ok("session.describe", json!({}))["revision"], 1);
    replacement.ok("session.draft", json!({"active":false}));
    replacement.ok("session.detach", json!({"draftsResolved":true}));
    drop(replacement);
    wait_for_writer_release(root.path());
}

#[test]
fn failed_support_startup_returns_its_exact_cause_on_the_original_stdio_request() {
    let root = tempfile::tempdir().unwrap();
    let missing_support = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("startup-cause".into())),
    )
    .unwrap();
    let before = std::fs::read(root.path().join("project.providence.json")).unwrap();
    let mut proxy = Proxy::with_options(
        root.path(),
        &[
            "--application-library-root".into(),
            missing_support.path().to_string_lossy().into_owned(),
        ],
    );
    let response = proxy.call("session.describe", json!({}));
    assert!(!response.ok);
    let error = response.error.unwrap();
    assert!(error.starts_with("host-startup-failed:"), "{error}");
    assert!(
        error.contains("could not open application media library"),
        "{error}"
    );
    assert_eq!(
        std::fs::read(root.path().join("project.providence.json")).unwrap(),
        before
    );
    assert!(providence_storage::ProjectWriterLock::acquire(root.path()).is_ok());
}

#[test]
fn observer_reads_the_same_host_without_an_editing_capability_or_draft_hold() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("observer-process".into())),
    )
    .unwrap();
    let mut native = Proxy::open(root.path(), true);
    native.ok("session.draft", json!({"active":false}));
    let mut observer = Proxy::open_kind(root.path(), "observer");
    let initial = observer.ok("session.describe", json!({}));
    assert_eq!(initial["clients"].as_array().unwrap().len(), 1);
    for method in [
        "changes.prepare",
        "changes.commit",
        "map.create",
        "history.undo",
        "session.draft",
        "session.write-permit",
        "session.external-edits",
        "session.detach",
    ] {
        let mut params = meta(&initial);
        params["active"] = json!(false);
        let rejected = observer.call(method, params);
        assert!(!rejected.ok, "observer unexpectedly accepted {method}");
        assert!(rejected.error.unwrap().starts_with("observer-read-only:"));
    }
    native.ok(
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    );
    assert_eq!(
        observer.ok("session.collaboration", json!({}))["revision"],
        1
    );
    assert_eq!(
        observer.ok("session.changes", json!({"cursor":0}))["changes"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    native.ok("session.detach", json!({"draftsResolved":true}));
    drop(native);
    assert_eq!(
        observer.ok("session.describe", json!({}))["nativeDraftActive"],
        false
    );
    drop(observer);
    wait_for_writer_release(root.path());
}

#[test]
fn final_disconnect_releases_the_writer_but_retains_an_unresolved_native_hold() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("retained-hold".into())),
    )
    .unwrap();
    let holds = providence_session_client::endpoint::descriptor_path(root.path())
        .unwrap()
        .with_extension("editing-holds.json");
    let mut native = Proxy::open(root.path(), true);
    assert_eq!(
        native.ok("session.describe", json!({}))["nativeDraftActive"],
        true
    );
    drop(native);
    wait_for_writer_release(root.path());
    assert!(holds.is_file());
    let mut assistant = Proxy::open(root.path(), false);
    let description = assistant.ok("session.describe", json!({}));
    assert_eq!(description["nativeDraftActive"], true);
    let mut prepare = meta(&description);
    prepare["steps"] = json!([{"name":"message","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Must remain blocked"}}]);
    let blocked = assistant.call("changes.prepare", prepare);
    assert!(blocked.error.unwrap().starts_with("draft-active:"));
    drop(assistant);
    wait_for_writer_release(root.path());
    std::fs::remove_file(holds).unwrap();
}

#[test]
fn native_fallback_receipts_satisfy_feature_commands_without_changing_revisions() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("native-fallback".into())),
    )
    .unwrap();
    let mut native = Proxy::open(root.path(), true);
    native.ok("session.draft", json!({"active":false}));
    let created = native.ok(
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    );
    assert_eq!(created["revision"], 1);
    let summary = native.ok("session.describe", json!({}));
    let operation = summary["undoEntry"]["operationId"].as_str().unwrap();
    assert_eq!(operation.len(), 64);
    assert!(operation.bytes().all(|byte| byte.is_ascii_hexdigit()));
    let conflict = native.call(
        "map.create",
        json!({"expectedRevision":0,"levelType":"dungeon"}),
    );
    assert!(!conflict.ok);
    assert!(conflict.error.unwrap().starts_with("revision-conflict:"));
    native.ok("session.detach", json!({"draftsResolved":true}));
    drop(native);
    wait_for_writer_release(root.path());
    let (_, session) = ProjectStore::open_session(root.path()).unwrap();
    assert_eq!(session.snapshot().world.maps.len(), 1);
}

#[test]
fn native_and_assistant_proxies_share_guarded_history_and_survive_detach() {
    let root = tempfile::tempdir().unwrap();
    ProjectStore::create_new(
        root.path(),
        &ProjectSnapshot::new_authored(StableId("shared-process".into())),
    )
    .unwrap();
    let mut native = Proxy::open(root.path(), true);
    let mut assistant = Proxy::open(root.path(), false);
    let initial = native.ok("session.describe", json!({}));
    let other = assistant.ok("session.describe", json!({}));
    assert_eq!(initial["sessionGeneration"], other["sessionGeneration"]);
    let base = meta(&initial);
    let mut prepare = base.clone();
    prepare["steps"] = json!([{"name":"one","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Café"}}]);
    assert!(
        assistant
            .call("changes.prepare", prepare.clone())
            .error
            .unwrap()
            .starts_with("draft-active:")
    );
    native.ok("session.draft", json!({"active":false}));
    native.ok("session.external-edits", json!({"allowed":true}));
    let prepared = assistant.ok("changes.prepare", prepare);
    let mut commit = base;
    commit["operationId"] = json!("process-edit");
    commit["previewToken"] = prepared["previewToken"].clone();
    assert!(
        assistant
            .call("changes.commit", commit.clone())
            .error
            .unwrap()
            .starts_with("native-sync-required:")
    );
    let intent = native.ok("session.collaboration", json!({}))["writeIntent"].clone();
    native.ok(
        "session.write-permit",
        json!({"token":intent["token"],"revision":0,"inputFrozen":true}),
    );
    assert_eq!(assistant.ok("changes.commit", commit)["revision"], 1);
    verify_shared_history(native, &mut assistant);
    drop(assistant);
    wait_for_writer_release(root.path());
    let (_, session) = ProjectStore::open_session(root.path()).unwrap();
    assert_eq!(session.revision(), Revision(3));
    assert_eq!(session.snapshot().messages[0].text, "Café");
}

fn verify_shared_history(mut native: Proxy, assistant: &mut Proxy) {
    let changed = native.ok("session.describe", json!({}));
    assert_eq!(changed["undoEntry"]["operationId"], "process-edit");
    // Native commands keep their original revision shape; the proxy supplies
    // session identity and a receipt ID, never a replacement expected revision.
    let undone = native.ok("history.undo", json!({"expectedRevision":1}));
    assert_eq!(undone["revision"], 2);
    assert!(
        !native
            .call("history.redo", json!({"expectedRevision":1}))
            .ok
    );
    native.ok("session.detach", json!({"draftsResolved":true}));
    drop(native);
    let current = assistant.ok("session.describe", json!({}));
    let mut redo = meta(&current);
    redo["operationId"] = json!("process-redo");
    assert_eq!(assistant.ok("history.redo", redo)["revision"], 3);
}

fn wait_for_writer_release(root: &std::path::Path) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match providence_storage::ProjectWriterLock::acquire(root) {
            Ok(lock) => {
                drop(lock);
                return;
            }
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    && std::time::Instant::now() < deadline =>
            {
                std::thread::sleep(std::time::Duration::from_millis(10))
            }
            Err(error) => panic!("host did not release its writer after final detach: {error}"),
        }
    }
}
