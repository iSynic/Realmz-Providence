use super::*;
use crate::model::{ProjectSnapshot, QuestLabel, ScriptDescriptor, StableId};

#[test]
fn version_thirty_three_invents_no_script_descriptors() {
    let mut current = ProjectSnapshot::new_authored(StableId("v33".into()));
    current.script_descriptors.push(ScriptDescriptor {
        source: StableId("extra-action-point:17".into()),
        text: "Should not predate the field".into(),
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    value["formatVersion"] = serde_json::json!(33);
    value.as_object_mut().unwrap().remove("scriptDescriptors");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v33");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.script_descriptors.is_empty());
}

#[test]
fn script_descriptors_are_deterministic_snapshot_truth() {
    let mut current = ProjectSnapshot::new_authored(StableId("descriptors".into()));
    current.script_descriptors.extend([
        ScriptDescriptor {
            source: StableId("extra-action-point:17".into()),
            text: "Moon Gate battle".into(),
        },
        ScriptDescriptor {
            source: StableId("action-point:land:0:17".into()),
            text: "Moon Gate ambush".into(),
        },
    ]);
    let encoded = to_deterministic_json(&current).expect("encode descriptors");
    let reopened = from_json(&encoded).expect("reopen descriptors");
    assert_eq!(
        reopened.script_descriptors[0].source.0,
        "action-point:land:0:17"
    );
    assert_eq!(
        reopened.script_descriptors[1].source.0,
        "extra-action-point:17"
    );
    assert_eq!(to_deterministic_json(&reopened).unwrap(), encoded);
}

#[test]
fn quest_labels_are_deterministic_snapshot_truth() {
    let mut current = ProjectSnapshot::new_authored(StableId("quests".into()));
    current.quest_labels.extend([
        QuestLabel {
            id: 12,
            label: "Second".into(),
            note: "Later id".into(),
        },
        QuestLabel {
            id: 3,
            label: "First".into(),
            note: "Earlier id".into(),
        },
    ]);
    let encoded = to_deterministic_json(&current).expect("encode quest labels");
    let reopened = from_json(&encoded).expect("reopen quest labels");
    assert_eq!(reopened.quest_labels[0].id, 3);
    assert_eq!(reopened.quest_labels[1].id, 12);
    assert_eq!(to_deterministic_json(&reopened).unwrap(), encoded);
}
