use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::SimpleEncounter;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use serde_json::{Value, json};

mod action_availability;
mod action_catalog_paging;
mod battle_selection;
mod branch_charges;
mod classic_choices;
mod companion_geometry;
mod confirmed_settings;
mod direct_values;
mod dungeon_move;
mod eligibility;
mod field_semantics;
mod map_coordinates;
mod misc_character;
mod optional_branches;
mod party_state;
mod pick_count;
mod presentation_cleanup;
mod quest_value;
mod random_regions;
mod shift_position;
mod signed_values;
mod simple_encounters;
mod stamina_change;
mod stock_media;

#[test]
fn action_opcode_route_returns_a_bounded_revisioned_delta() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("opcode-route".into()));
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![providence_core::model::ClassicAction {
            slot: 25,
            raw_opcode: 44,
            target_native_id: 4,
        }],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "action.set-opcode",
        json!({
            "expectedRevision": 0,
            "source": "simple-encounter:7",
            "slot": 25,
            "rawOpcode": 4,
        }),
    )
    .expect("set action opcode");

    assert_eq!(result["revision"], 1);
    assert_eq!(result["changedEntities"], json!(["simple-encounter:7"]));
    assert!(result.get("snapshot").is_none());
    assert_eq!(
        session.snapshot().simple_encounters[0].actions[0].raw_opcode,
        4
    );
}

#[test]
fn adapter_exposes_bounded_simple_encounter_document_commands() {
    simple_encounters::exercise_bounded_document_commands();
}

#[test]
fn adapter_exposes_bounded_extra_action_point_document_commands() {
    let mut session = EditorSession::new(demo_snapshot());
    let opened = open_checked_extra_action_point(&mut session);

    let mut edited = opened["extraActionPoint"].clone();
    edited["chancePercent"] = json!(80);
    edited["actions"][0]["targetNativeId"] = json!(999);
    let updated = dispatch_result(
        &mut session,
        "extra-action-point.update",
        json!({"expectedRevision": 0, "extraActionPoint": edited}),
    )
    .expect("update Extra AP document");
    assert_eq!(updated["revision"], 1);
    assert_eq!(updated["changedEntities"], json!(["extra-action-point:40"]));
    assert!(
        updated["affectedDiagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| diagnostic["code"] == "reference.message.missing")
    );

    let repaired = dispatch_result(
        &mut session,
        "action-reference.retarget",
        json!({
            "expectedRevision": 1,
            "source": "extra-action-point:40",
            "slot": 0,
            "targetNativeId": 47
        }),
    )
    .expect("repair Extra AP message target");
    assert_eq!(repaired["revision"], 2);
    assert!(
        repaired["affectedDiagnostics"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

fn open_checked_extra_action_point(session: &mut EditorSession) -> serde_json::Value {
    let list = dispatch_result(
        session,
        "extra-action-point.list",
        json!({"offset": 0, "limit": 1}),
    )
    .expect("bounded Extra AP list");
    assert_eq!(list["total"], 1);
    assert_eq!(list["items"][0]["identity"], "extra-action-point:40");
    assert_eq!(list["items"][0]["usedBy"], 1);

    let opened = dispatch_result(
        session,
        "extra-action-point.open",
        json!({"identity": "extra-action-point:40"}),
    )
    .expect("open Extra AP document");
    assert_eq!(opened["extraActionPoint"]["nativeId"], 40);
    assert_eq!(opened["references"].as_array().unwrap().len(), 2);
    assert_eq!(opened["usedBy"].as_array().unwrap().len(), 1);
    assert_eq!(opened["usedBy"][0]["source"], "extra-action-point:40");
    assert_eq!(opened["usedBy"][0]["field"], "actions[1].target");
    assert!(opened["diagnostics"].as_array().unwrap().is_empty());
    assert_eq!(opened["extraCodeAttachments"].as_array().unwrap().len(), 1);
    assert_eq!(
        opened["extraCodeAttachments"][0]["primary"]["nativeId"],
        311
    );
    assert_eq!(
        opened["extraCodeAttachments"][0]["secondary"]["nativeId"],
        312
    );

    opened
}

#[test]
fn adapter_exposes_bounded_global_macro_commands() {
    let mut session = EditorSession::new(demo_snapshot());
    let opened = dispatch_result(&mut session, "global-macro.open", json!({}))
        .expect("open Global Macro document");
    assert_eq!(opened["revision"], 0);
    assert_eq!(opened["hooks"].as_array().unwrap().len(), 5);
    assert!(opened["assignedScripts"].as_array().unwrap().is_empty());
    assert_eq!(opened["hooks"][0]["hook"], "start");
    assert_eq!(opened["hooks"][0]["byteStart"], 0);
    assert_eq!(opened["hooks"][0]["byteEnd"], 2);

    let updated = dispatch_result(
        &mut session,
        "global-macro.update",
        json!({
            "expectedRevision": 0,
            "hook": "start",
            "target": "extra-action-point:40"
        }),
    )
    .expect("assign start hook");
    assert_eq!(updated["revision"], 1);
    assert_eq!(updated["changedEntities"], json!(["ashen-crown"]));
    assert_eq!(updated["referenceChanges"][0]["resolution"], "resolved");
    assert_eq!(
        updated["referenceChanges"][0]["byteProvenance"]["nativePath"],
        "Global"
    );

    let reopened = dispatch_result(&mut session, "global-macro.open", json!({}))
        .expect("reopen Global Macro document");
    assert_named_global_macro_projection(&reopened);

    let invalid = dispatch_result(
        &mut session,
        "global-macro.update",
        json!({
            "expectedRevision": 1,
            "hook": "death",
            "target": "placed-action-point:land:0:17"
        }),
    )
    .expect_err("Classic Global hooks require Extra Action Points");
    assert!(invalid.contains("extra-action-point:<nonzero-signed-short>"));

    dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 1}))
        .expect("undo Global Macro assignment");
    assert!(session.snapshot().scenario_application.is_none());
}

fn assert_named_global_macro_projection(reopened: &Value) {
    assert_eq!(reopened["hooks"][0]["targetNativeId"], 40);
    assert_eq!(
        reopened["assignedScripts"][0]["identity"],
        "extra-action-point:40"
    );
    assert_eq!(
        reopened["assignedScripts"][0]["steps"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        reopened["assignedScripts"][0]["steps"][0]["definition"]["label"],
        "Show Message"
    );
    assert_eq!(reopened["hooks"][0]["reference"]["resolution"], "resolved");
}

#[test]
fn adapter_exposes_bounded_action_point_document_commands() {
    let mut session = EditorSession::new(demo_snapshot());
    let opened = open_checked_action_point(&mut session);

    let mut edited = opened["actionPoint"].clone();
    edited["chancePercent"] = json!(75);
    edited["actions"][0]["targetNativeId"] = json!(47);
    edited["actions"]
        .as_array_mut()
        .unwrap()
        .push(json!({"slot": 2, "rawOpcode": 8, "targetNativeId": 17}));
    let updated = dispatch_result(
        &mut session,
        "action-point.update",
        json!({"expectedRevision": 0, "actionPoint": edited}),
    )
    .expect("update Action Point document");
    assert_eq!(updated["revision"], 1);
    assert_eq!(
        updated["changedEntities"],
        json!(["action-point:land:0:17", "land:0"])
    );
    assert!(
        updated["affectedDiagnostics"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    let reopened = dispatch_result(
        &mut session,
        "action-point.open",
        json!({"identity": "action-point:land:0:17"}),
    )
    .expect("reopen updated Action Point");
    let same_map = reopened["references"]
        .as_array()
        .unwrap()
        .iter()
        .find(|reference| reference["targetKind"] == "action-point")
        .expect("same-map Action Point reference");
    assert_eq!(same_map["targetId"], "17");
    assert_eq!(same_map["resolution"], "resolved");
    assert_eq!(reopened["usedBy"].as_array().unwrap().len(), 1);
    assert_eq!(reopened["usedBy"][0]["source"], "action-point:land:0:17");
    assert_eq!(reopened["usedBy"][0]["field"], "actions[2].target");

    assert_action_point_create_and_duplicate(&mut session);
    assert_action_point_clear(&mut session);
}

fn open_checked_action_point(session: &mut EditorSession) -> serde_json::Value {
    let list = dispatch_result(
        session,
        "action-point.list",
        json!({"mapIdentity": "land:0", "offset": 0, "limit": 100}),
    )
    .expect("bounded Action Point list");
    assert_eq!(list["total"], 1);
    assert_eq!(list["map"]["name"], "Thornwatch Coast");
    assert_eq!(list["items"][0]["identity"], "action-point:land:0:17");
    assert_eq!(list["items"][0]["coordinate"]["x"], 18);

    let opened = dispatch_result(
        session,
        "action-point.open",
        json!({"identity": "action-point:land:0:17"}),
    )
    .expect("open Action Point document");
    assert_eq!(opened["actionPoint"]["recordIndex"], 17);
    assert_eq!(opened["references"].as_array().unwrap().len(), 2);
    assert!(
        opened["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| diagnostic["code"] == "reference.message.missing")
    );
    opened
}

fn assert_action_point_create_and_duplicate(session: &mut EditorSession) {
    let snapshot = session.snapshot().clone();
    let reviewed = dispatch_result(
        session,
        "action-point.creation-review",
        json!({"expectedRevision":1,"mapIdentity":"land:0","x":20,"y":20}),
    )
    .expect("read-only placement review");
    assert_eq!(reviewed["identity"], "action-point:land:0:0");
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision().0, 1);
    assert!(
        dispatch_result(
            session,
            "action-point.creation-review",
            json!({"expectedRevision":0,"mapIdentity":"land:0","x":20,"y":20})
        )
        .is_err()
    );
    let created = dispatch_result(
        session,
        "action-point.create",
        json!({
            "expectedRevision": 1,
            "mapIdentity": "land:0",
            "x": 20,
            "y": 20
        }),
    )
    .expect("create an Action Point through a bounded command");
    assert_eq!(created["revision"], 2);
    assert_eq!(
        created["changedEntities"],
        json!(["action-point:land:0:0", "land:0"])
    );
    assert!(created.get("snapshot").is_none());

    let duplicated = dispatch_result(
        session,
        "action-point.duplicate",
        json!({
            "expectedRevision": 2,
            "source": "action-point:land:0:17",
            "x": 21,
            "y": 20
        }),
    )
    .expect("duplicate an Action Point into an explicit free coordinate");
    assert_eq!(duplicated["revision"], 3);
    assert_eq!(
        duplicated["changedEntities"],
        json!(["action-point:land:0:1", "land:0"])
    );
    assert!(duplicated.get("snapshot").is_none());
}

fn assert_action_point_clear(session: &mut EditorSession) {
    let cleared = dispatch_result(
        session,
        "action-point.clear",
        json!({
            "expectedRevision": 3,
            "source": "action-point:land:0:0"
        }),
    )
    .expect("clear the fixed Action Point row");
    assert_eq!(cleared["revision"], 4);
    assert_eq!(
        cleared["changedEntities"],
        json!(["action-point:land:0:0", "land:0"])
    );
    assert!(cleared.get("snapshot").is_none());

    let cleared_row = dispatch_result(
        session,
        "action-point.open",
        json!({"identity": "action-point:land:0:0"}),
    )
    .expect("reopen the cleared fixed row");
    assert!(cleared_row["actionPoint"]["coordinate"].is_null());
    assert_eq!(cleared_row["actionPoint"]["classicDoorId"], 0);
    assert!(
        cleared_row["actionPoint"]["actions"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn extra_code_upsert_is_a_bounded_revisioned_command() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result(
        &mut session,
        "extra-code.upsert",
        json!({
            "expectedRevision": 0,
            "row": {"nativeId": 8, "values": [1, -2, 3, -4, 5]}
        }),
    )
    .expect("upsert E-code row");

    assert_eq!(result["changedEntities"], json!(["extra-code:8"]));
    assert!(result.get("snapshot").is_none());
    assert_eq!(session.snapshot().extra_codes[0].values, [1, -2, 3, -4, 5]);
}

#[test]
fn semantic_action_catalog_and_target_search_are_bounded() {
    let mut session = EditorSession::new(demo_snapshot());
    let first = dispatch_result(
        &mut session,
        "action-definition.list",
        json!({"cursor": "0", "limit": 16, "category": "Dialogue"}),
    )
    .expect("list semantic actions");
    assert_semantic_denominators(&first);

    let complete = dispatch_result(
        &mut session,
        "action-definition.list",
        json!({"cursor": "0", "limit": 128}),
    )
    .expect("list the complete authoring denominator");
    assert_eq!(complete["items"].as_array().unwrap().len(), 120);
    assert_eq!(complete["forms"].as_array().unwrap().len(), 62);
    assert!(complete["nextCursor"].is_null());

    let choice = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.3",
            "targetNativeId": 400,
            "values": {"replyPolarity": 1, "branchMode": 1, "branchTarget": 40,
                "promptA": 47, "promptB": 0},
            "context": {}
        }}),
    )
    .expect("describe a selected Choice action");
    assert_choice_projection(&choice);

    let coverage = dispatch_result(&mut session, "action-form.coverage", json!({}))
        .expect("measure semantic coverage");
    assert_eq!(coverage["catalogedActions"], 120);
    assert_eq!(coverage["inventoriedFields"], 382);
    assert_eq!(coverage["editableFields"], 297);
    assert_eq!(coverage["preservedFields"], 64);
    assert_eq!(coverage["unresolvedFields"], 0);

    let targets = dispatch_result(
        &mut session,
        "action-target.list",
        json!({
            "query": {
                "kind": "message",
                "search": "reliquary",
                "limit": 8,
                "context": {}
            }
        }),
    )
    .expect("search semantic action targets");
    assert_eq!(targets["total"], 1);
    assert_eq!(targets["items"][0]["value"], 47);
    assert_eq!(targets["items"][0]["status"], "resolved");
}

fn assert_semantic_denominators(first: &serde_json::Value) {
    assert!(first["total"].as_u64().unwrap() >= 3);
    assert!(first["items"].as_array().unwrap().len() <= 16);
    assert_eq!(first["documentedActionCount"], 120);
    assert_eq!(first["settingsOpcodeCount"], 70);
    assert_eq!(first["settingsLayoutCount"], 61);
}

fn assert_choice_projection(choice: &serde_json::Value) {
    assert_eq!(choice["title"], "Choice Dialog");
    let field = |key: &str| {
        choice["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["key"] == key)
            .unwrap()
    };
    assert_eq!(field("replyPolarity")["label"], "Continue When");
    assert_eq!(field("branchMode")["label"], "Otherwise");
    assert_eq!(field("branchTarget")["targetKind"], "extra-action-point");
    assert_eq!(
        field("promptA")["preview"]["detail"],
        "Captain Veyra lowers her voice: the reliquary is empty."
    );
}

#[test]
fn semantic_step_route_commits_typed_settings_and_returns_the_refreshed_document() {
    let mut session = EditorSession::new(demo_snapshot());
    let applied = dispatch_result(
        &mut session,
        "action-point.step.apply",
        json!({
            "expectedRevision": 0,
            "edit": {
                "source": "action-point:land:0:17",
                "slot": 1,
                "actionIdentity": "realmz.action.19",
                "targetNativeId": 400,
                "settings": {
                    "values": {"messageLow": 12, "messageHigh": 103}
                }
            }
        }),
    )
    .expect("apply a typed Random Message step");
    assert_eq!(applied["change"]["revision"], 1);
    assert_eq!(applied["document"]["revision"], 1);
    assert_eq!(
        applied["document"]["steps"][1]["definition"]["formId"],
        "random-message"
    );
    assert_eq!(
        applied["document"]["steps"][1]["primarySettings"]["typedValues"]["messageHigh"],
        103
    );
    assert_eq!(
        applied["document"]["steps"][1]["primaryUsage"]["status"],
        "in-use"
    );
    assert!(applied.get("snapshot").is_none());

    let moved = dispatch_result(
        &mut session,
        "action-point.step.move",
        json!({
            "expectedRevision": 1,
            "source": "action-point:land:0:17",
            "fromSlot": 1,
            "toSlot": 2
        }),
    )
    .expect("move one step through the bounded route");
    assert_eq!(moved["document"]["steps"][1]["slot"], 2);
}

#[test]
fn record_draft_route_commits_header_and_steps_in_one_revision() {
    let mut session = EditorSession::new(demo_snapshot());
    let applied = dispatch_result(
        &mut session,
        "action-point.apply-draft",
        json!({
            "expectedRevision": 0,
            "draft": {
                "source": "action-point:land:0:17",
                "header": {
                    "coordinate": {"x": 18, "y": 23},
                    "postActionLevel": 0,
                    "postActionX": 19,
                    "postActionY": 23,
                    "chancePercent": 80
                },
                "steps": [
                    {"slot": 0, "actionIdentity": "realmz.action.1", "targetNativeId": 47},
                    {"slot": 1, "actionIdentity": "realmz.action.3", "targetNativeId": 311,
                        "settings": {"values": {"replyPolarity": 1, "branchMode": 1,
                            "branchTarget": 40, "promptA": 12, "promptB": 47}}}
                ]
            }
        }),
    )
    .expect("apply one Action Point record draft");
    assert_eq!(applied["change"]["revision"], 1);
    assert_eq!(applied["document"]["actionPoint"]["chancePercent"], 80);
    assert_eq!(applied["document"]["actionPoint"]["postActionX"], 19);
    assert_eq!(
        applied["document"]["steps"][1]["definition"]["identity"],
        "realmz.action.3"
    );
    assert_eq!(
        applied["document"]["steps"][1]["primarySettings"]["typedValues"]["promptA"],
        12
    );
    assert_eq!(session.undo_history().len(), 1);
}
