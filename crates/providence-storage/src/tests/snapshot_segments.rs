use super::*;
use crate::snapshot_segments::{changed_segment_bytes, replace_segment, segment_matches};
use providence_core::snapshot::to_deterministic_json;

#[test]
fn segment_table_matches_every_canonical_field_and_encoding() {
    let base = ProjectSnapshot::new_authored(StableId("base".into()));
    let mut source = snapshot("Segmented");
    source.quest_labels.push(QuestLabel {
        id: 3,
        label: "Quest".into(),
        note: String::new(),
    });
    let canonical: serde_json::Value =
        serde_json::from_str(&to_deterministic_json(&source).unwrap()).unwrap();
    let base_value = serde_json::to_value(&base).unwrap();
    assert_eq!(
        canonical.as_object().unwrap().len(),
        SNAPSHOT_SEGMENTS.len()
    );
    let mut reconstructed = base.clone();
    for name in SNAPSHOT_SEGMENTS {
        let expected = canonical.get(*name).expect("named canonical field");
        let bytes = serde_json::to_vec(expected).unwrap();
        assert!(segment_matches(name, &bytes, &source).unwrap());
        replace_segment(&mut reconstructed, name, &bytes).unwrap();
        let changed = changed_segment_bytes(name, &source, &base).unwrap();
        assert_eq!(changed, (expected != &base_value[*name]).then_some(bytes));
    }
    assert_eq!(reconstructed, source);
    assert!(changed_segment_bytes("unknown", &source, &base).is_err());
    assert!(replace_segment(&mut reconstructed, "messages", b"false").is_err());
}
