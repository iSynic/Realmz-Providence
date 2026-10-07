mod bootstrap;
mod contact;
mod fixtures;
mod metadata;
mod rules;
mod source_catalogs;
mod spell_economy;
mod version_contract;
mod world;

use super::*;
use crate::model::{NativeRecordId, ScenarioMessage, StableId};

#[test]
fn portable_snapshot_is_deterministic_and_reopens_semantically() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("portable".into()));
    snapshot.messages = vec![
        ScenarioMessage {
            identity: StableId("message:9".into()),
            native_id: NativeRecordId(9),
            text: "Later".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:1".into()),
            native_id: NativeRecordId(1),
            text: "Earlier".into(),
            authored: true,
        },
    ];

    let json = to_deterministic_json(&snapshot).expect("serialize");
    let reopened = from_json(&json).expect("reopen");

    assert_eq!(reopened.messages[0].native_id, NativeRecordId(1));
    assert_eq!(
        json,
        to_deterministic_json(&reopened).expect("serialize again")
    );
}
