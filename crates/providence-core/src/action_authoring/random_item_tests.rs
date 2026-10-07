use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:3548-3565 uses a negative word as Rand(abs(word))
// and writes each award into the fixed treasure.itemid[20] array.
#[test]
fn item_count_mode_exposes_fixed_and_random_author_choices() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-items".into()));
    let fixed = describe(&snapshot, [4, 1, 3, 91, -7], Default::default());
    assert_eq!(fixed.authoring.controls[0].choices[0].label, "Fixed count");
    assert_eq!(field(&fixed, "countOrRandomLimit").label, "Fixed Count");
    assert_eq!(field(&fixed, "countOrRandomLimit").minimum, 0);
    assert_eq!(field(&fixed, "countOrRandomLimit").maximum, 20);
    assert_eq!(roundtrip(&fixed, [4, 1, 3, 91, -7]), [4, 1, 3, 91, -7]);

    let random = describe(&snapshot, [-6, 1, 3, 91, -7], Default::default());
    assert_eq!(random.authoring.controls[0].value, 1);
    assert_eq!(field(&random, "countOrRandomLimit").label, "Random Maximum");
    assert_eq!(field(&random, "countOrRandomLimit").value, 6);
    assert_eq!(field(&random, "countOrRandomLimit").minimum, 1);
    assert!(random.summary.contains("Random Maximum: 6 items"));
    assert_eq!(roundtrip(&random, [-6, 1, 3, 91, -7]), [-6, 1, 3, 91, -7]);
}

#[test]
fn mode_toggle_reuses_magnitude_and_preserves_other_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-items-toggle".into()));
    let base = [5, 11, 19, -222, 333];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("itemCountMode".into(), 1);
    authoring.selections.insert("countOrRandomLimit".into(), 8);
    let random = describe(&snapshot, base, authoring.clone());
    assert_eq!(random.authoring.resolved_values["countOrRandomLimit"], -8);
    assert_eq!(roundtrip(&random, base), [-8, 11, 19, -222, 333]);

    authoring.modes.insert("itemCountMode".into(), 0);
    let fixed = describe(&snapshot, base, authoring);
    assert_eq!(fixed.authoring.resolved_values["countOrRandomLimit"], 8);
    assert_eq!(roundtrip(&fixed, base), [8, 11, 19, -222, 333]);
}

#[test]
fn minimum_signed_import_is_retained_until_author_selects_a_safe_mode() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-items-min".into()));
    let base = [i16::MIN, 11, 19, -222, 333];
    let imported = describe(&snapshot, base, Default::default());
    assert!(imported.authoring.controls[0].active_fields.is_empty());
    assert!(imported.authoring.controls[0].display.contains("retained"));
    assert_eq!(roundtrip(&imported, base), base);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("itemCountMode".into(), 1);
    let unresolved = describe(&snapshot, base, authoring);
    assert!(!unresolved.authoring.errors.is_empty());
}

#[test]
fn combat_spawn_reuses_named_count_semantics_with_its_runtime_limit() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spawn-count".into()));
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("spawnCountMode".into(), 1);
    authoring.selections.insert("countOrRandomLimit".into(), 12);
    let description = describe_opcode(&snapshot, 124, "spawn", [91, 3, 5, 147, 0], authoring);
    assert_eq!(description.authoring.controls[0].label, "Spawn Count");
    assert_eq!(
        description.authoring.resolved_values["countOrRandomLimit"],
        -12
    );
    assert_eq!(
        field(&description, "countOrRandomLimit").label,
        "Random Maximum"
    );
    assert_eq!(field(&description, "countOrRandomLimit").value, 12);
    assert_eq!(field(&description, "countOrRandomLimit").maximum, 100);
    assert_eq!(
        field(&description, "countOrRandomLimit").units.as_deref(),
        Some("monsters")
    );
    assert_eq!(field(&description, "monster").label, "Monster To Spawn");
    assert_eq!(field(&description, "sound").label, "Spawn Sound");
    let allegiance = field(&description, "traitorOverride");
    assert_eq!(allegiance.label, "Spawn Allegiance");
    assert_eq!(
        allegiance
            .choices
            .iter()
            .map(|choice| choice.label.as_str())
            .collect::<Vec<_>>(),
        [
            "Keep the monster's authored allegiance",
            "Use caller/default allegiance",
            "Force enemy side"
        ]
    );
    assert_eq!(
        roundtrip_form(&description, "spawn", [91, 3, 5, 147, 0]),
        [91, 3, -12, 147, 0]
    );
}

#[test]
fn combat_spawn_allegiance_names_signed_runtime_categories_without_normalizing_imports() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spawn-allegiance".into()));
    for (value, selected_label) in [
        (-7, "Keep the monster's authored allegiance"),
        (0, "Use caller/default allegiance"),
        (9, "Force enemy side"),
    ] {
        let base = [91, 3, 5, 147, value];
        let description = describe_opcode(&snapshot, 124, "spawn", base, Default::default());
        let field = field(&description, "traitorOverride");
        assert_eq!(
            field
                .choices
                .iter()
                .find(|choice| choice.value == value)
                .unwrap()
                .label,
            selected_label
        );
        assert_eq!(roundtrip_form(&description, "spawn", base), base);
    }
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.65".into(),
            target_native_id: 65,
            values: decode_form_values("random-items", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn describe_opcode(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    form_id: &str,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: opcode,
            values: decode_form_values(form_id, words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                script_kind: Some("extra-action-point".into()),
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
    roundtrip_form(description, "random-items", base)
}

fn roundtrip_form(description: &ActionFormDescription, form_id: &str, base: [i16; 5]) -> [i16; 5] {
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values(form_id, &values, Some(base)).unwrap()
}
