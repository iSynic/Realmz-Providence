use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:309-336 matches monster.name, treats negative
// counts as unbounded, and uses replacementIcon == -1 to select allegiance.
#[test]
fn combat_monster_modes_name_count_and_the_exclusive_mutation() {
    let snapshot = ProjectSnapshot::new_authored(StableId("combat-monster".into()));
    let appearance = describe(&snapshot, [2, 17, -3, 9000, 7], Default::default());
    assert_eq!(control(&appearance, "combatantCountMode").value, 2);
    assert_eq!(
        control(&appearance, "combatantCountMode").choices[2].label,
        "All matching combatants"
    );
    assert_eq!(control(&appearance, "combatantChange").value, 0);
    assert_eq!(
        control(&appearance, "combatantChange").active_fields,
        ["replacementIcon"]
    );
    assert_eq!(field(&appearance, "monsterId").label, "Monster Name Tag");
    assert!(field(&appearance, "monsterId").target_kind.is_none());
    assert_eq!(
        roundtrip(&appearance, [2, 17, -3, 9000, 7]),
        [2, 17, -3, 9000, 7]
    );

    let allegiance = describe(&snapshot, [1, 17, 0, -1, 0], Default::default());
    assert_eq!(control(&allegiance, "combatantCountMode").value, 0);
    assert_eq!(control(&allegiance, "combatantChange").value, 1);
    assert_eq!(
        control(&allegiance, "combatantChange").active_fields,
        ["traitorOverride"]
    );
}

#[test]
fn named_modes_encode_safe_canonical_values_and_preserve_inactive_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("combat-monster-edit".into()));
    let base = [2, 17, 4, 9000, 7];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("combatantCountMode".into(), 1);
    authoring.selections.insert("count".into(), 12);
    authoring.modes.insert("combatantChange".into(), 1);
    authoring.selections.insert("traitorOverride".into(), 0);
    let allegiance = describe(&snapshot, base, authoring);
    assert_eq!(allegiance.authoring.resolved_values["count"], 12);
    assert_eq!(allegiance.authoring.resolved_values["replacementIcon"], -1);
    assert_eq!(allegiance.authoring.resolved_values["traitorOverride"], 0);
    assert_eq!(roundtrip(&allegiance, base), [2, 17, 12, -1, 0]);

    let imported = describe(&snapshot, [2, 17, 4, -1, 9], Default::default());
    assert_eq!(field(&imported, "traitorOverride").choices[1].value, 9);
    assert_eq!(roundtrip(&imported, [2, 17, 4, -1, 9]), [2, 17, 4, -1, 9]);
}

#[test]
fn switching_to_appearance_requires_an_explicit_or_retained_value() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("combat-monster-required".into()));
    snapshot.assets = [9000, 9308]
        .map(|id| {
            serde_json::from_value(serde_json::json!({
                "identity": format!("appearance:{id}"),
                "label": if id == 9000 { "Stone Drake" } else { "Stone Drake Facing" },
                "kind": "icon", "mimeType": "image/png",
                "classicResource": {"resourceType": "cicn", "resourceId": id},
                "blob": format!("fixture-{id}"), "byteLength": 1, "source": "controlled fixture"
            }))
            .unwrap()
        })
        .to_vec();
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("combatantChange".into(), 0);
    let unresolved = describe(&snapshot, [2, 17, 1, -1, 0], authoring.clone());
    assert!(!unresolved.authoring.errors.is_empty());

    authoring.selections.insert("replacementIcon".into(), 9000);
    let resolved = describe(&snapshot, [2, 17, 1, -1, 0], authoring);
    assert!(resolved.authoring.errors.is_empty());
    assert_eq!(resolved.authoring.resolved_values["replacementIcon"], 9000);
    let icon = field(&resolved, "replacementIcon");
    assert_eq!(icon.target_kind, Some(ActionTargetKind::MonsterAppearance));
    assert_eq!(icon.preview.as_ref().unwrap().label, "Stone Drake");

    let page = list_targets(
        &snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::MonsterAppearance,
            search: "drake".into(),
            cursor: None,
            limit: 20,
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].value, 9000);
    assert_eq!(page.items[0].identity.0, "appearance:9000");
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.120".into(),
            target_native_id: 120,
            values: decode_form_values("combat-monster-mutation", words).unwrap(),
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

fn control<'a>(description: &'a ActionFormDescription, key: &str) -> &'a AuthoringModeControl {
    description
        .authoring
        .controls
        .iter()
        .find(|control| control.key == key)
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
    encode_form_values("combat-monster-mutation", &values, Some(base)).unwrap()
}
