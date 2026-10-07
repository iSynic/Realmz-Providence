use super::field_label_cleanup::presentation;

#[test]
fn compact_labels_replace_only_established_donor_fragments() {
    for (opcode, index, expected) in [
        (30, 1, "Check Modifier"),
        (31, 4, "On Failure"),
        (40, 1, "Branch Type"),
        (46, 0, "Quest Flag"),
        (55, 0, "Success Condition"),
        (55, 1, "On Failure"),
        (55, 3, "On Success"),
        (72, 0, "Quest Range Start"),
        (72, 1, "Quest Range End"),
        (72, 2, "Preserved Value 3"),
        (72, 3, "Branch Type"),
        (72, 4, "Destination"),
        (78, 0, "Tile Test"),
        (78, 1, "Specific Tile"),
        (78, 2, "Branch Type"),
        (92, 2, "Map Type"),
        (92, 3, "Encounter Chance Adjustment"),
        (92, 4, "Shape Mode"),
    ] {
        assert_eq!(presentation(opcode, index).unwrap().0, expected);
    }
    assert!(presentation(7, 0).is_none());
}
