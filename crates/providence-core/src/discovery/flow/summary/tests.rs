use super::*;
use crate::{
    model::{
        ClassicAction, ExtraActionPoint, NativeRecordId, ProjectSnapshot, ScenarioMessage,
        SimpleEncounter, StableId,
    },
    session::EditorSession,
};

fn fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("flow-summary".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 40,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![action(0, 1, 349), action(2, 47, 9), action(4, 999, 77)],
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:349".into()),
        native_id: NativeRecordId(349),
        text: "The eastern gate opens.".into(),
        authored: true,
    });
    snapshot
}

fn action(slot: u8, raw_opcode: i16, target_native_id: i16) -> ClassicAction {
    ClassicAction {
        slot,
        raw_opcode,
        target_native_id,
    }
}

#[test]
fn complete_program_summary_keeps_empty_slots_and_unknown_instructions() {
    let session = EditorSession::new(fixture());
    let selection = FlowSelection::record("extra-action-point:40", "scenario");
    let summary =
        describe_selection(session.snapshot(), session.discovery(), None, &selection).unwrap();
    assert_eq!(summary.steps.len(), 8);
    assert_eq!(summary.used_steps, 3);
    assert_eq!(summary.unknown_steps, 1);
    assert_eq!(summary.steps[1].status, "empty");
    assert_eq!(summary.steps[4].status, "unknown");
    assert!(summary.steps[4].links.is_empty());
    assert!(summary.steps[4].warning.contains("preserved"));
    assert!(summary.steps[0].fields.iter().any(|field| {
        field
            .preview
            .as_ref()
            .is_some_and(|preview| preview.identity.0 == "message:349")
    }));
    assert_eq!(summary.steps[2].source, "extra-action-point:40");
    assert_eq!(summary.steps[2].field, "actions[2].targetNativeId");
}

#[test]
fn unknown_negative_instruction_does_not_infer_a_return() {
    let mut snapshot = fixture();
    snapshot.extra_action_points[0].actions[2].raw_opcode = -128;
    let session = EditorSession::new(snapshot);
    let summary = describe_selection(
        session.snapshot(),
        session.discovery(),
        None,
        &FlowSelection::record("extra-action-point:40", "scenario"),
    )
    .unwrap();
    let step = &summary.steps[4];
    assert_eq!(step.status, "unknown");
    assert!(!step.summary.contains("Returns"));
    assert!(step.condition.contains("no effect is inferred"));
}

#[test]
fn shortened_program_preview_discloses_its_scope() {
    let mut snapshot = fixture();
    snapshot.extra_action_points[0]
        .actions
        .push(action(6, 39, 91));
    let session = EditorSession::new(snapshot);
    let summary = describe_selection(
        session.snapshot(),
        session.discovery(),
        None,
        &FlowSelection::record("extra-action-point:40", "scenario"),
    )
    .unwrap();
    assert!(summary.card_text.starts_with("First 3 of 4:"));
    assert!(summary.summary.contains("First 3 of 4:"));
    assert_eq!(summary.steps[6].card_summary, "Run XAP 91");
}

#[test]
fn ranged_summary_retains_original_positions_and_distinct_selection() {
    let mut snapshot = fixture();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![action(8, 1, 349), action(10, 1, 349), action(15, 47, 9)],
        choice_results: [2, 0, 0, 0],
        can_back_out: true,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 349,
        texts: ["Enter".into(), String::new(), String::new(), String::new()],
        authored: true,
    });
    let session = EditorSession::new(snapshot);
    let mut selection = FlowSelection::record("simple-encounter:0:result:1", "scenario");
    selection.entry_position = Some(2);
    selection.through_position = Some(5);
    let summary =
        describe_selection(session.snapshot(), session.discovery(), None, &selection).unwrap();
    assert_eq!(summary.selection, selection);
    assert_eq!(summary.used_steps, 1);
    assert_eq!(summary.steps[2].slot, 10);
    assert_eq!(summary.steps[2].position, 2);
    assert!(!summary.steps[0].in_range && !summary.steps[7].in_range);
    assert!(summary.steps[2].in_range);
    assert_eq!(summary.steps[2].source, "simple-encounter:0");
    assert_eq!(summary.steps[2].field, "actions[10].targetNativeId");
}

#[test]
fn missing_settings_preserve_the_step_without_invented_effects() {
    let mut snapshot = fixture();
    snapshot.extra_action_points[0].actions = vec![action(3, 46, 999)];
    let session = EditorSession::new(snapshot);
    let summary = describe_selection(
        session.snapshot(),
        session.discovery(),
        None,
        &FlowSelection::record("extra-action-point:40", "scenario"),
    )
    .unwrap();
    assert_eq!(summary.used_steps, 1);
    assert_eq!(summary.unknown_steps, 0);
    assert_eq!(summary.steps[3].status, "unavailable");
    assert!(summary.steps[3].warning.contains("999"));
    assert!(summary.steps[3].fields.is_empty());
}

#[test]
fn text_excerpt_is_bounded_without_changing_authored_text() {
    let mut snapshot = fixture();
    snapshot.messages[0].text = "ø".repeat(4000);
    let session = EditorSession::new(snapshot);
    let summary = describe_selection(
        session.snapshot(),
        session.discovery(),
        None,
        &FlowSelection::record("message:349", "scenario"),
    )
    .unwrap();
    assert!(summary.excerpt_truncated);
    assert!(summary.excerpt.chars().count() <= 2401);
    assert_eq!(session.snapshot().messages[0].text.chars().count(), 4000);
}

#[test]
fn summary_does_not_accept_invalid_ranges() {
    let mut selection = FlowSelection::record("simple-encounter:1:result:0", "scenario");
    selection.entry_position = Some(7);
    selection.through_position = Some(3);
    assert!(selection.validate().is_err());
}
