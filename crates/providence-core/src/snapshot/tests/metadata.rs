use super::super::*;
use crate::model::StableId;

#[test]
fn version_thirty_one_invents_no_quest_labels() {
    let mut current = ProjectSnapshot::new_authored(StableId("v31".into()));
    current.quest_labels.push(crate::model::QuestLabel {
        id: 12,
        label: "Should not predate the field".into(),
        note: String::new(),
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    value["formatVersion"] = serde_json::json!(31);
    value.as_object_mut().unwrap().remove("questLabels");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v31");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.quest_labels.is_empty());
}

#[test]
fn version_thirty_two_invents_no_classic_resource_removals() {
    let mut current = ProjectSnapshot::new_authored(StableId("v32".into()));
    current
        .classic_resource_removals
        .push(crate::model::ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 392,
        });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    value["formatVersion"] = serde_json::json!(32);
    value
        .as_object_mut()
        .unwrap()
        .remove("classicResourceRemovals");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v32");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.classic_resource_removals.is_empty());
}
