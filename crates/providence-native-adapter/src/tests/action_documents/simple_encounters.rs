use crate::{demo::demo_snapshot, dispatch_result};
use providence_core::session::EditorSession;
use serde_json::{Value, json};

pub(super) fn exercise_bounded_document_commands() {
    let mut session = EditorSession::new(demo_snapshot());
    let opened = list_and_open(&mut session);
    let applied = update_and_apply(&mut session, opened);
    apply_automatic_result(&mut session, &applied);
    retarget_undo_and_copy(&mut session);
}

fn list_and_open(session: &mut EditorSession) -> Value {
    let list = dispatch_result(
        session,
        "encounter.list-simple",
        json!({"offset": 0, "limit": 1}),
    )
    .expect("bounded encounter list");
    assert_eq!(list["total"], 1);
    assert_eq!(list["items"].as_array().unwrap().len(), 1);
    assert!(!list["truncated"].as_bool().unwrap());

    let opened = dispatch_result(
        session,
        "encounter.open-simple",
        json!({"identity": "simple-encounter:3"}),
    )
    .expect("open encounter document");
    assert_eq!(opened["encounter"]["nativeId"], 3);
    assert_eq!(opened["references"].as_array().unwrap().len(), 2);
    assert_eq!(opened["steps"][0]["definition"]["label"], "Show Message");
    opened
}

fn update_and_apply(session: &mut EditorSession, opened: Value) -> Value {
    let mut edited = opened["encounter"].clone();
    edited["texts"][0] = json!("Pay the toll and enter quietly");
    edited["choiceResults"][0] = json!(2);
    let update = dispatch_result(
        session,
        "encounter.update-simple",
        json!({"expectedRevision": 0, "encounter": edited}),
    )
    .expect("update encounter form");
    assert_eq!(update["revision"], 1);

    let applied = dispatch_result(
        session,
        "encounter.apply-simple-draft",
        json!({"expectedRevision": 1, "draft": complete_draft()}),
    )
    .expect("apply complete encounter draft");
    assert_eq!(applied["document"]["encounter"]["maxTimes"], 4);
    assert_eq!(applied["document"]["steps"][1]["slot"], 31);
    let prompts = dispatch_result(session, "encounter.list-prompts", json!({"query": "gate"}))
        .expect("search prompt messages");
    assert!(prompts["items"].as_array().is_some());
    applied
}

fn complete_draft() -> Value {
    json!({
        "source": "simple-encounter:3", "nativeId": 3,
        "promptMessageNativeId": 12, "canBackOut": true,
        "maxTimes": 4, "casteSuccess": 0,
        "texts": ["One", "Two", "Three", "Four"],
        "choiceResults": [1, 2, 3, 4],
        "steps": [
            {"slot": 0, "actionIdentity": "realmz.action.1", "targetNativeId": 47},
            {"slot": 31, "actionIdentity": "realmz.action.34", "targetNativeId": 0}
        ]
    })
}

fn apply_automatic_result(session: &mut EditorSession, applied: &Value) {
    let mut automatic = applied["document"]["encounter"].clone();
    automatic["choiceResults"] = json!([-4, 0, 0, 0]);
    automatic["texts"] = json!(["", "", "", ""]);
    let steps = applied["document"]["steps"].as_array().unwrap();
    let steps = steps
        .iter()
        .map(|step| {
            json!({
                "slot": step["slot"],
                "actionIdentity": step["definition"]["identity"],
                "gosub": step["rawOpcode"].as_i64().unwrap_or(0) < 0,
                "targetNativeId": step["targetNativeId"]
            })
        })
        .collect::<Vec<_>>();
    let result = dispatch_result(
        session,
        "encounter.apply-simple-draft",
        json!({
            "expectedRevision": 2,
            "draft": {
                "source": automatic["identity"], "nativeId": automatic["nativeId"],
                "promptMessageNativeId": automatic["promptMessageNativeId"],
                "canBackOut": automatic["canBackOut"], "maxTimes": automatic["maxTimes"],
                "casteSuccess": automatic["casteSuccess"], "texts": automatic["texts"],
                "choiceResults": automatic["choiceResults"], "steps": steps
            }
        }),
    )
    .expect("apply signed automatic result");
    assert_eq!(result["document"]["encounter"]["choiceResults"][0], -4);
}

fn retarget_undo_and_copy(session: &mut EditorSession) {
    let prompt = dispatch_result(
        session,
        "encounter.prompt.retarget",
        json!({
            "expectedRevision": 3, "source": "simple-encounter:3", "targetNativeId": 47
        }),
    )
    .expect("retarget encounter prompt");
    assert_eq!(prompt["revision"], 4);
    assert_eq!(
        session.snapshot().simple_encounters[0].prompt_message_native_id,
        47
    );
    dispatch_result(session, "history.undo", json!({"expectedRevision": 4}))
        .expect("undo prompt repair");
    assert_eq!(
        session.snapshot().simple_encounters[0].prompt_message_native_id,
        12
    );
    let copied = dispatch_result(
        session,
        "encounter.copy-simple",
        json!({
            "expectedRevision": 5, "source": "simple-encounter:3"
        }),
    )
    .expect("copy encounter without renumbering existing records");
    assert_ne!(copied["document"]["encounter"]["nativeId"], 3);
}
