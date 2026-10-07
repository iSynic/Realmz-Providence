use super::*;
use crate::model::{
    NativeRecordId, ProjectSnapshot, StableId, TimedEncounter, TimedEncounterLocationKind,
};

// Classic 491816ad newland.c:3290-3311 changes percent, increment, and day only
// for nonnegative words. Any nonzero reset flag starts the day from today.
#[test]
fn timed_encounter_changes_use_named_keep_set_and_day_base_controls() {
    let snapshot = snapshot();
    let description = describe(&snapshot, [4, -1, 7, 1, -1], Default::default());
    assert_eq!(
        field(&description, "timedEncounter").label,
        "Timed Encounter"
    );
    assert_eq!(
        field(&description, "timedEncounter").target_kind,
        Some(ActionTargetKind::TimedEncounter)
    );
    assert_eq!(description.authoring.controls[0].label, "Activation Chance");
    assert_eq!(
        description.authoring.controls[0].choices[0].label,
        "Keep current"
    );
    assert!(description.authoring.controls[0].active_fields.is_empty());
    assert_eq!(description.authoring.controls[1].label, "Repeat Interval");
    assert_eq!(
        description.authoring.controls[2].label,
        "Next Activation Offset"
    );
    assert_eq!(description.authoring.controls[3].label, "Activation Day");
    assert_eq!(
        description.authoring.controls[3].choices[1].label,
        "Start from current day"
    );
    assert_eq!(field(&description, "percentOrKeep").maximum, 100);
    assert!(
        description
            .summary
            .contains("Activation Chance: Keep current")
    );
    assert!(description.summary.contains("Repeat Interval: 7"));
    assert!(
        description
            .summary
            .contains("Activation Day: Start from current day")
    );
    assert!(!description.summary.contains("-1 percent"));
    assert_eq!(
        roundtrip(&description, [4, -1, 7, 1, -1]),
        [4, -1, 7, 1, -1]
    );
}

#[test]
fn imported_negative_sentinels_and_noncanonical_reset_flags_roundtrip_exactly() {
    let snapshot = snapshot();
    let base = [4, -9, -2, 7, -300];
    let description = describe(&snapshot, base, Default::default());
    assert!(description.authoring.controls[0].display.contains("-9"));
    assert!(description.authoring.controls[3].display.contains("flag 7"));
    assert_eq!(roundtrip(&description, base), base);
}

#[test]
fn explicit_modes_restore_pending_values_and_encode_canonical_choices() {
    let snapshot = snapshot();
    let base = [4, 50, 6, 9, 12];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("percentOrKeepBehavior".into(), 0);
    authoring.selections.insert("percentOrKeep".into(), 85);
    authoring.modes.insert("activationDayBase".into(), 0);
    let kept = describe(&snapshot, base, authoring.clone());
    assert_eq!(kept.authoring.resolved_values["percentOrKeep"], -1);
    assert_eq!(kept.authoring.resolved_values["resetDayFlag"], 0);

    authoring.modes.insert("percentOrKeepBehavior".into(), 1);
    authoring.modes.insert("activationDayBase".into(), 1);
    let restored = describe(&snapshot, base, authoring);
    assert_eq!(restored.authoring.resolved_values["percentOrKeep"], 85);
    assert_eq!(roundtrip(&restored, base), [4, 85, 6, 1, 12]);
}

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-change".into()));
    snapshot.timed_encounters.push(TimedEncounter {
        identity: StableId("timed-encounter:4".into()),
        native_id: NativeRecordId(4),
        day: 10,
        increment: 7,
        percent: 50,
        door: 0,
        required_level: -1,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: -1,
        required_quest: -1,
        location_kind: TimedEncounterLocationKind::Any,
        authored: true,
    });
    snapshot
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.54".into(),
            target_native_id: 54,
            values: decode_form_values("timed-encounter-mutation", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn field<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}

fn roundtrip(description: &ActionFormDescription, base: [i16; 5]) -> [i16; 5] {
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values("timed-encounter-mutation", &values, Some(base)).unwrap()
}
