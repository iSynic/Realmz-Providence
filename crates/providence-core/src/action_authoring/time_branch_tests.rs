use super::*;
use crate::model::{ExtraActionPoint, NativeRecordId, ProjectSnapshot, StableId};

// Classic 491816ad newland.c:3523-3544 treats -1 as an independent wildcard for
// day/hour and pushes the caller before both XAP branches when GOSUB is active.
#[test]
fn time_branch_exposes_independent_named_tests_and_xap_destinations() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("time-branch".into()));
    snapshot.extra_action_points = [41, 42]
        .into_iter()
        .map(|id| ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: vec![],
        })
        .collect();
    let description = describe(&snapshot, [-1, 17, 91, 41, 42], Default::default());
    assert_eq!(description.authoring.controls[0].label, "Day Test");
    assert_eq!(
        description.authoring.controls[0].choices[0].label,
        "Ignore Day"
    );
    assert!(description.authoring.controls[0].active_fields.is_empty());
    assert_eq!(description.authoring.controls[1].label, "Hour Test");
    assert_eq!(field(&description, "hourLimit").maximum, 23);
    assert_eq!(field(&description, "successMacro").label, "On Or Before");
    assert_eq!(field(&description, "failureMacro").label, "After");
    for key in ["successMacro", "failureMacro"] {
        assert_eq!(
            field(&description, key).target_kind,
            Some(ActionTargetKind::ExtraActionPoint)
        );
        assert!(field(&description, key).preview.is_some());
    }
    assert_eq!(
        roundtrip(&description, [-1, 17, 91, 41, 42]),
        [-1, 17, 91, 41, 42]
    );
}

#[test]
fn ignored_time_test_restores_pending_comparison_without_touching_neighbors() {
    let snapshot = ProjectSnapshot::new_authored(StableId("time-branch-retain".into()));
    let base = [7, 8, -91, 41, 42];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("dayLimitTest".into(), 0);
    authoring.selections.insert("dayLimit".into(), 99);
    let ignored = describe(&snapshot, base, authoring.clone());
    assert_eq!(ignored.authoring.resolved_values["dayLimit"], -1);
    assert_eq!(roundtrip(&ignored, base), [-1, 8, -91, 41, 42]);

    authoring.modes.insert("dayLimitTest".into(), 1);
    let restored = describe(&snapshot, base, authoring);
    assert_eq!(restored.authoring.resolved_values["dayLimit"], 99);
    assert_eq!(roundtrip(&restored, base), [99, 8, -91, 41, 42]);
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.64".into(),
            target_native_id: 64,
            values: decode_form_values("game-time-branch", words).unwrap(),
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
    encode_form_values("game-time-branch", &values, Some(base)).unwrap()
}
