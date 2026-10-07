use crate::{
    codecs,
    model::{BlobId, ProjectOrigin, ProjectSnapshot, StableId},
    validation::{
        Severity,
        presentation::{self, FindingImpact},
    },
};

#[test]
fn imported_unmatchable_caste_is_explained_without_changing_its_reference() {
    let mut data = vec![0; 20_000];
    data[50..52].copy_from_slice(&i16::MIN.to_be_bytes());
    let source = BlobId(format!("sha256:{}", "0".repeat(64)));
    let mut snapshot = ProjectSnapshot::new_authored(StableId("preserved-item-use".into()));
    snapshot.scenario_item_rules =
        codecs::decode_scenario_item_rules(&data, None, source.clone(), None)
            .unwrap()
            .rules;
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: source,
    };
    let reference_before = snapshot.scenario_item_rules[0]
        .definition
        .specific_caste_id
        .clone();
    let findings = super::diagnostics_for(&snapshot);
    let finding = findings
        .iter()
        .find(|d| d.code == "item.caste.unmatchable-preserved")
        .unwrap();
    assert_eq!(finding.severity, Severity::Information);
    assert!(finding.message.contains("no normal caste matches"));
    assert_eq!(
        presentation::impact(&finding.code, finding.severity, false, false),
        FindingImpact::PreservationDetail
    );
    assert_eq!(
        snapshot.scenario_item_rules[0].definition.specific_caste_id,
        reference_before
    );
    assert_eq!(
        codecs::encode_scenario_item_rules(&snapshot.scenario_item_rules, &data).unwrap(),
        data
    );
    snapshot.origin = ProjectOrigin::Authored;
    assert!(
        super::diagnostics_for(&snapshot)
            .iter()
            .any(|d| d.code == "reference.caste.missing" && d.severity == Severity::Error)
    );
}
