use super::{PictInspection, ResourceEntry, sample};

#[test]
fn empty_catalog_keeps_its_family_specific_acceptance() {
    let report = PictInspection::default().report("controlled-empty", &[], &[], None);
    assert!(report.accepted);
    assert_eq!(report.report["resources"], 0);
}

#[test]
fn sample_requires_one_unambiguous_identity() {
    let missing = sample(&[], 7);
    assert_eq!(missing["error"], "resource is unavailable");
    let entry = ResourceEntry {
        resource_type: *b"PICT",
        id: 7,
        name: "controlled duplicate".into(),
        attributes: 0,
        data: Vec::new(),
    };
    let ambiguous = sample(&[&entry, &entry], 7);
    assert_eq!(ambiguous["error"], "resource identity is ambiguous");
}
