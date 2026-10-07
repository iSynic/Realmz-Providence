use super::*;
use crate::model::{
    ExtraActionPoint, ExtraCodeRow, LevelType, MapLevel, MapRuntimeMetadata, NativeRecordId,
    RandomRectangle,
};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};

mod random_message;

fn row(id: u32, values: [i16; 5]) -> ExtraCodeRow {
    ExtraCodeRow {
        native_id: NativeRecordId(id),
        values,
    }
}

fn caller(id: u32, opcode: i16, target: i16) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 4,
            raw_opcode: opcode,
            target_native_id: target,
        }],
    }
}

fn area(map: &str, slot: u8) -> RandomRectangle {
    RandomRectangle {
        identity: StableId(format!("{map}:rect:{slot}")),
        top: 1,
        left: 2,
        bottom: 3,
        right: 4,
        chance_ten_thousand: 500,
        battle_range: [0; 2],
        random_doors: [0; 3],
        random_door_percent: [0; 3],
        only: false,
        option: 0,
        sound_id: 0,
        text_id: 0,
    }
}

fn map(kind: LevelType, index: u32) -> MapLevel {
    let identity = format!(
        "{}:{index}",
        if kind == LevelType::Land {
            "land"
        } else {
            "dungeon"
        }
    );
    MapLevel {
        identity: StableId(identity.clone()),
        level_type: kind,
        native_index: index,
        name: "North road".into(),
        tiles: vec![],
        runtime: Some(MapRuntimeMetadata {
            source: "authored".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: None,
            base_scale: None,
            tileset_id: StableId("test-tiles".into()),
            base_tile: None,
            random_rectangles: vec![area(&identity, 8), area(&identity, 3)],
        }),
    }
}

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("repair-test".into()));
    snapshot.extra_action_points.push(caller(158, 92, 10));
    snapshot.world.maps.extend([
        map(LevelType::Land, 1),
        map(LevelType::Land, 2),
        map(LevelType::Dungeon, 1),
    ]);
    snapshot.extra_codes.push(row(10, [1, 3, 0, 250, 0]));
    snapshot
}

fn draft(snapshot: &ProjectSnapshot) -> RepairDraft {
    prepare(
        snapshot,
        Revision(0),
        StableId("extra-action-point:158".into()),
        4,
    )
    .unwrap()
}

fn complete(snapshot: &ProjectSnapshot) -> RepairDraft {
    let mut draft = draft(snapshot);
    for (field, value) in [
        ("bound0", "9"),
        ("bound1", "18"),
        ("bound2", "13"),
        ("bound3", "24"),
    ] {
        change(snapshot, &mut draft, field, value).unwrap();
    }
    draft
}

fn apply(session: &mut EditorSession, edit: ActionSettingsEdit) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplyActionSettings { edit },
        })
        .unwrap();
}

#[test]
fn missing_companion_is_a_read_only_required_draft_and_one_complete_undo_entry() {
    let mut session = EditorSession::new(snapshot());
    let before = session.snapshot().clone();
    let initial = draft(&before);
    let view = preview(&before, Revision(0), &initial);
    assert_eq!(view.source_label, "Extra AP 158 · Step 5");
    assert_eq!(initial.input.chance_adjustment, "+2.50");
    assert_eq!(
        initial.input.area.identity,
        Some(StableId("land:1:rect:3".into()))
    );
    assert_eq!(initial.input.bounds, ["", "", "", ""]);
    assert!(!view.can_apply && !view.dirty);
    assert_eq!(session.snapshot(), &before);
    let (edit, intent) = plan(&before, Revision(0), &complete(&before)).unwrap();
    assert_eq!(edit.values, [1, 3, 0, 250, 0]);
    assert_eq!(edit.secondary_values, Some([9, 18, 13, 24, 0]));
    assert_eq!(
        reconcile(&before, Revision(0), &intent, true),
        RepairOutcome::NotApplied
    );
    apply(&mut session, edit);
    assert_eq!(session.undo_history().len(), 1);
    assert!(crate::validation::action_settings::diagnostics(session.snapshot()).is_empty());
    let after = session.snapshot().clone();
    assert_eq!(
        reconcile(&after, session.revision(), &intent, true),
        RepairOutcome::MatchesRepair
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, true),
        RepairOutcome::Unknown
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn wholly_missing_primary_requires_explicit_choices_and_no_implicit_zero_defaults() {
    let mut snapshot = snapshot();
    snapshot.extra_codes.clear();
    let mut draft = draft(&snapshot);
    assert!(
        draft.input.map_kind.is_empty()
            && draft.input.map.identity.is_none()
            && draft.input.chance_adjustment.is_empty()
    );
    assert_eq!(preview(&snapshot, Revision(0), &draft).bound_count, 0);
    for (field, value) in [
        ("mapKind", "land"),
        ("map", "land:1"),
        ("area", "land:1:rect:3"),
        ("chanceAdjustment", "0"),
        ("shapeMode", "-1"),
    ] {
        assert!(plan(&snapshot, Revision(0), &draft).is_err());
        change(&snapshot, &mut draft, field, value).unwrap();
    }
    let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert_eq!(edit.values, [1, 3, 0, 0, -1]);
    assert_eq!(edit.secondary_values, Some([0; 5]));
}

#[test]
fn all_chance_words_round_trip_without_floating_point_and_invalid_text_is_not_normalized() {
    for word in i16::MIN..=i16::MAX {
        assert_eq!(parse_chance(&chance_text(word)), Some(word));
    }
    for invalid in [
        "",
        "1.001",
        "327.68",
        "-327.69",
        "NaN",
        "inf",
        "1e2",
        "--1",
        "1.2.3",
        "1,50",
        "9999999999999999999999",
    ] {
        assert_eq!(parse_chance(invalid), None, "{invalid}");
    }
    let snapshot = snapshot();
    let mut draft = complete(&snapshot);
    change(&snapshot, &mut draft, "bound0", "9a").unwrap();
    assert_eq!(draft.input.bounds[0], "9a");
    let view = preview(&snapshot, Revision(0), &draft);
    assert!(!view.can_apply && view.errors.iter().any(|error| error.field == "bound0"));
}

#[test]
fn modes_reinterpret_one_array_and_preserve_every_inactive_and_spare_word() {
    let mut snapshot = snapshot();
    snapshot.extra_codes.push(row(11, [9, 18, 13, 24, -12345]));
    let mut draft = draft(&snapshot);
    for mode in ["-1", "0", "1", "2"] {
        change(&snapshot, &mut draft, "shapeMode", mode).unwrap();
        let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
        assert_eq!(edit.secondary_values, Some([9, 18, 13, 24, -12345]));
    }
    change(&snapshot, &mut draft, "shapeMode", "1").unwrap();
    assert_eq!(
        preview(&snapshot, Revision(0), &draft).bound_labels[0],
        "Horizontal offset"
    );
    change(&snapshot, &mut draft, "bound0", "-3").unwrap();
    change(&snapshot, &mut draft, "shapeMode", "0").unwrap();
    assert_eq!(draft.input.bounds[0], "-3");
    assert!(draft.mode_changed);
    assert_eq!(
        plan(&snapshot, Revision(0), &draft)
            .unwrap()
            .0
            .secondary_values,
        Some([-3, 18, 13, 24, -12345])
    );
    change(&snapshot, &mut draft, "bound2", "bad").unwrap();
    change(&snapshot, &mut draft, "shapeMode", "-1").unwrap();
    assert!(
        preview(&snapshot, Revision(0), &draft)
            .errors
            .iter()
            .any(|error| error.message.contains("Switch to Set bounds"))
    );
}

#[test]
fn stable_area_slots_survive_compaction_and_references_do_not_choose_replacements() {
    let mut snapshot = snapshot();
    let mut draft = draft(&snapshot);
    assert_eq!(draft.input.area.index, Some(3));
    change(&snapshot, &mut draft, "map", "land:2").unwrap();
    assert_eq!(draft.input.map.index, Some(2));
    assert_eq!(draft.input.area, TargetSelection::default());
    change(&snapshot, &mut draft, "area", "land:2:rect:8").unwrap();
    assert_eq!(draft.input.area.index, Some(8));
    let before = draft.clone();
    assert!(change(&snapshot, &mut draft, "area", "land:1:rect:3").is_err());
    assert_eq!(draft, before);
    change(&snapshot, &mut draft, "mapKind", "dungeon").unwrap();
    assert!(draft.input.map.identity.is_none() && draft.input.area.identity.is_none());
    let original = complete(&snapshot);
    snapshot.world.maps[0].identity = StableId("replacement".into());
    assert!(!preview(&snapshot, Revision(0), &original).can_apply);
}

#[test]
fn duplicate_map_or_area_slots_are_never_silently_resolved() {
    let mut snapshot = snapshot();
    let mut duplicate = snapshot.world.maps[0].clone();
    duplicate.identity = StableId("other-map".into());
    snapshot.world.maps.push(duplicate);
    let prepared = draft(&snapshot);
    assert!(prepared.input.map.identity.is_none());
    assert!(
        map_choices(&snapshot, "land", "North", 0, 128)
            .items
            .iter()
            .filter(|choice| choice.label.starts_with("Land 1"))
            .all(|choice| !choice.selectable)
    );
    snapshot.world.maps.pop();
    snapshot.world.maps[0]
        .runtime
        .as_mut()
        .unwrap()
        .random_rectangles
        .push(area("land:1", 3));
    let prepared = draft(&snapshot);
    assert!(prepared.input.area.identity.is_none());
    assert!(
        area_choices(&snapshot, "land", &prepared.input.map, "Area 3", 0, 128)
            .items
            .iter()
            .all(|choice| !choice.selectable)
    );
}

#[test]
fn private_repair_skips_occupied_and_referenced_missing_rows_and_preserves_shared_sources() {
    let mut before = snapshot();
    before
        .extra_codes
        .extend([row(0, [99; 5]), row(11, [9, 18, 13, 24, -7])]);
    before
        .extra_action_points
        .extend([caller(159, -92, 10), caller(200, 15, 1)]);
    before.normalize();
    let mut draft = complete(&before);
    change(&before, &mut draft, "chanceAdjustment", "42").unwrap();
    let view = preview(&before, Revision(0), &draft);
    assert!(view.isolated && !view.share_allowed);
    assert_eq!(view.shared_count, 2);
    let (edit, intent) = plan(&before, Revision(0), &draft).unwrap();
    assert_eq!(edit.target_native_id, 2);
    assert!(edit.guard.as_ref().unwrap().require_available_rows);
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, edit);
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .filter(|row| [0, 10, 11].contains(&row.native_id.0))
            .cloned()
            .collect::<Vec<_>>(),
        before.extra_codes
    );
    assert_eq!(
        &session.snapshot().extra_action_points[1..],
        &before.extra_action_points[1..]
    );
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, true),
        RepairOutcome::MatchesRepair
    );
    let mut altered = session.snapshot().clone();
    altered
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 10)
        .unwrap()
        .values[0] += 1;
    assert_eq!(
        reconcile(&altered, session.revision(), &intent, true),
        RepairOutcome::Unknown
    );
}

#[test]
fn shared_repair_is_unavailable_and_use_pages_remain_bounded() {
    let mut snapshot = snapshot();
    snapshot
        .extra_action_points
        .extend((200..459).map(|id| caller(id, -92, 10)));
    let mut draft = complete(&snapshot);
    assert_eq!(preview(&snapshot, Revision(0), &draft).shared_count, 260);
    assert_eq!(
        uses(&snapshot, Revision(0), &draft, 1, 9999)
            .unwrap()
            .0
            .len(),
        128
    );
    assert!(!preview(&snapshot, Revision(0), &draft).share_allowed);
    assert!(change(&snapshot, &mut draft, "scope", "shared-actions").is_err());
    draft.scope = RepairScope::SharedActions;
    assert!(
        plan(&snapshot, Revision(0), &draft)
            .unwrap_err()
            .contains("legacy shared-write request is unsupported")
    );
    let rebased = rebase(&snapshot, Revision(1), &draft).unwrap();
    assert_eq!(rebased.scope, RepairScope::OnlyThisAction);
}

#[test]
fn ambiguous_values_remain_blank_and_a_separate_repair_does_not_choose_or_replace_a_duplicate() {
    let mut snapshot = snapshot();
    snapshot
        .extra_codes
        .extend([row(10, [2, 3, 0, 250, 0]), row(11, [9, 18, 13, 24, 8])]);
    let mut draft = complete(&snapshot);
    assert_eq!(draft.input.map, TargetSelection::default());
    assert!(draft.input.area.identity.is_none());
    assert!(!preview(&snapshot, Revision(0), &draft).share_allowed);
    change(&snapshot, &mut draft, "map", "land:1").unwrap();
    change(&snapshot, &mut draft, "area", "land:1:rect:3").unwrap();
    let (edit, _) = plan(&snapshot, Revision(0), &draft).unwrap();
    assert!(edit.guard.as_ref().unwrap().require_available_rows);
    let original = snapshot.extra_codes.clone();
    let mut session = EditorSession::new(snapshot);
    apply(&mut session, edit);
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .filter(|row| [10, 11].contains(&row.native_id.0))
            .cloned()
            .collect::<Vec<_>>(),
        original
    );
}

#[test]
fn allocation_intent_is_enforced_atomically_even_when_an_unreferenced_row_appears() {
    let mut snapshot = snapshot();
    snapshot.extra_action_points.push(caller(159, 92, 10));
    let (edit, _) = plan(&snapshot, Revision(0), &complete(&snapshot)).unwrap();
    snapshot
        .extra_codes
        .push(row(edit.target_native_id as u32, [1; 5]));
    let mut session = EditorSession::new(snapshot);
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionSettings { edit },
        })
        .unwrap_err();
    assert!(error.to_string().contains("available rows"));
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

#[test]
fn stale_rebase_checks_action_kind_and_current_retained_values_without_applying() {
    let mut snapshot = snapshot();
    snapshot.extra_codes.push(row(11, [9, 18, 13, 24, 7]));
    let original = draft(&snapshot);
    snapshot.extra_codes[0].values[3] = 300;
    snapshot.extra_codes[1].values[4] = 8;
    assert_eq!(preview(&snapshot, Revision(1), &original).phase, "stale");
    let comparison = compare(&snapshot, Revision(1), &original);
    assert!(
        comparison.can_rebase
            && comparison
                .changes
                .iter()
                .any(|row| row[0] == "Chance change")
    );
    assert!(
        comparison
            .context_message
            .contains("Additional retained settings changed")
    );
    let rebased = rebase(&snapshot, Revision(1), &original).unwrap();
    assert_eq!(rebased.input.chance_adjustment, "+2.50");
    assert_eq!(rebased.input.retained_spare, 8);
    assert!(plan(&snapshot, Revision(1), &rebased).is_ok());
    snapshot.extra_action_points[0].actions[0].raw_opcode = 2;
    assert!(!compare(&snapshot, Revision(2), &original).can_rebase);
    assert!(rebase(&snapshot, Revision(2), &original).is_err());
    assert_eq!(
        preview(&snapshot, Revision(2), &original).phase,
        "unsupported"
    );
}

#[test]
fn lost_result_never_infers_non_application_from_a_restart_or_changed_state() {
    let snapshot = snapshot();
    let (edit, intent) = plan(&snapshot, Revision(0), &complete(&snapshot)).unwrap();
    assert_eq!(
        reconcile(&snapshot, Revision(0), &intent, false),
        RepairOutcome::Unknown
    );
    assert_eq!(
        reconcile(&snapshot, Revision(1), &intent, true),
        RepairOutcome::Unknown
    );
    let mut session = EditorSession::new(snapshot.clone());
    apply(&mut session, edit);
    assert_eq!(
        reconcile(session.snapshot(), session.revision(), &intent, false),
        RepairOutcome::MatchesRepair
    );
    let mut changed = session.snapshot().clone();
    changed.extra_codes.last_mut().unwrap().values[4] += 1;
    assert_eq!(
        reconcile(&changed, session.revision(), &intent, true),
        RepairOutcome::Unknown
    );
    changed.extra_action_points.clear();
    assert_eq!(
        reconcile(&changed, session.revision(), &intent, true),
        RepairOutcome::SourceGone
    );
}

#[test]
fn allocation_exhaustion_keeps_the_draft_and_does_not_recycle_nonzero_rows() {
    let mut snapshot = snapshot();
    snapshot.extra_action_points.push(caller(159, 92, 10));
    snapshot.extra_codes = (0..=32768)
        .map(|id| row(id, if id == 10 { [1, 3, 0, 250, 0] } else { [1; 5] }))
        .collect();
    let draft = complete(&snapshot);
    let before = draft.clone();
    let view = preview(&snapshot, Revision(0), &draft);
    assert!(!view.can_apply && view.notice_title == "No separate settings available");
    assert!(view.allocation_unavailable);
    assert_eq!(draft, before);
    assert_eq!(snapshot.extra_codes.len(), 32769);
}
