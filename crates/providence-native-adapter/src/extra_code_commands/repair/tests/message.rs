use super::*;

fn message_session(shared: bool) -> EditorSession {
    let mut snapshot = session(shared).snapshot().clone();
    for row in &mut snapshot.extra_action_points {
        row.actions[0].raw_opcode = 19;
    }
    snapshot.extra_codes[0].values = [1, 3, -32768, 731, 32767];
    for id in 1..=9 {
        snapshot
            .messages
            .push(providence_core::model::ScenarioMessage {
                identity: StableId(format!("message:{id}")),
                native_id: NativeRecordId(id),
                text: format!("Message {id} full text\n  with café  "),
                authored: true,
            });
    }
    EditorSession::new(snapshot)
}

fn change(session: &mut EditorSession, view: &Value, field: &str, value: &str) -> Value {
    let result = wire(
        session,
        None,
        "action-settings.change-repair",
        json!({"draft":view["draft"],"field":field,"value":value}),
    );
    assert_eq!(result["ok"], true, "{result}");
    result["result"].clone()
}

#[test]
fn range_pages_exact_choices_and_peek_are_revision_bound_nonmutating_reads() {
    let mut session = message_session(false);
    let before = session.persisted_state();
    let view = prepared(&mut session);
    let view = change(&mut session, &view, "lastMessage", "9");
    let page = wire(
        &mut session,
        None,
        "action-settings.preview-repair",
        json!({"draft":view["draft"],"offset":4}),
    );
    assert_eq!(
        page["result"]["range"]["entries"].as_array().unwrap().len(),
        4
    );
    assert_eq!(page["result"]["range"]["entries"][0]["value"], 5);
    let choices = wire(
        &mut session,
        None,
        "action-settings.repair-choices",
        json!({"draft":view["draft"],"field":"firstMessage","query":"café","limit":2}),
    );
    assert_eq!(choices["result"]["total"], 9);
    assert_eq!(choices["result"]["items"].as_array().unwrap().len(), 2);
    let peek = wire(
        &mut session,
        None,
        "action-settings.peek-repair-message",
        json!({"draft":view["draft"],"identity":"message:2"}),
    );
    assert_eq!(peek["result"]["text"], "Message 2 full text\n  with café  ");
    let chosen = wire(
        &mut session,
        None,
        "action-settings.choose-repair-message",
        json!({"draft":view["draft"],"field":"firstMessage","identity":"message:2","waitsForClick":false}),
    );
    assert_eq!(chosen["result"]["draft"]["input"]["firstMessage"], "-2");
    let mut stale = view["draft"].clone();
    stale["revision"] = 99.into();
    let peek = wire(
        &mut session,
        None,
        "action-settings.peek-repair-message",
        json!({"draft":stale,"identity":"message:2"}),
    );
    assert_eq!(peek["ok"], false);
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn shared_message_commit_is_one_persistent_history_entry_with_exact_confirmation() {
    let mut session = message_session(true);
    let before = session.snapshot().clone();
    let root = tempfile::Builder::new()
        .prefix("message-repair-wire-")
        .tempdir()
        .unwrap();
    let store = ProjectStore::create(root.path().join("project"), &before).unwrap();
    let view = prepared(&mut session);
    let view = change(&mut session, &view, "firstMessage", "2");
    let view = change(&mut session, &view, "scope", "confirmed-actions");
    assert_eq!(
        view["draft"]["confirmedCallers"].as_array().unwrap().len(),
        1
    );
    let mut forged = view["draft"].clone();
    forged["confirmedCallers"] = json!([]);
    let rejected = wire(
        &mut session,
        None,
        "action-settings.commit-repair",
        json!({"expectedRevision":0,"draft":forged}),
    );
    assert_eq!(rejected["ok"], false);
    assert_eq!(session.snapshot(), &before);
    let applied = wire(
        &mut session,
        Some(&store),
        "action-settings.commit-repair",
        json!({"expectedRevision":0,"draft":view["draft"]}),
    );
    assert_eq!(applied["ok"], true, "{applied}");
    assert_eq!(
        session.snapshot().extra_codes[0].values,
        [2, 3, -32768, 731, 32767]
    );
    assert_eq!(
        session.snapshot().extra_action_points,
        before.extra_action_points
    );
    assert_eq!(session.undo_history().len(), 1);
    let saved = wire(&mut session, Some(&store), "project.save", json!({}));
    assert_eq!(saved["ok"], true, "{saved}");
    let (_, mut reopened) = ProjectStore::open_session(root.path().join("project")).unwrap();
    assert_eq!(reopened.snapshot(), session.snapshot());
    reopened
        .execute(providence_core::session::ExpectedRevisionCommand {
            expected_revision: reopened.revision(),
            command: providence_core::session::EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(reopened.snapshot(), &before);
}
