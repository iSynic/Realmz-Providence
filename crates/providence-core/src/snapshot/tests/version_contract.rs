use super::super::*;
use crate::model::StableId;

#[test]
fn every_supported_epoch_reopens_in_the_current_format() {
    let snapshot = ProjectSnapshot::new_authored(StableId("snapshot-epochs".into()));
    for version in 1..=SNAPSHOT_FORMAT_VERSION {
        let mut value = serde_json::to_value(&snapshot).unwrap();
        value["formatVersion"] = version.into();
        let reopened = from_json(&value.to_string()).unwrap();
        assert_eq!(reopened.format_version, SNAPSHOT_FORMAT_VERSION);
        let saved = to_deterministic_json(&reopened).unwrap();
        assert_eq!(from_json(&saved).unwrap(), reopened);
    }
}

#[test]
fn unsupported_epochs_are_rejected_by_both_snapshot_boundaries() {
    for version in [0, SNAPSHOT_FORMAT_VERSION + 1, u32::MAX] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("unsupported-epoch".into()));
        snapshot.format_version = version;
        assert!(matches!(
            to_deterministic_json(&snapshot),
            Err(SnapshotError::UnsupportedVersion(actual)) if actual == version
        ));
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(matches!(
            from_json(&json),
            Err(SnapshotError::UnsupportedVersion(actual)) if actual == version
        ));
    }
}
