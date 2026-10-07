use super::*;
use crate::model::ScenarioApplicationContract;

#[test]
fn imported_absent_global_stays_absent_through_unrelated_message_edit() {
    // Prince Of Darkness has no Global file. Full import still records empty hooks.
    let mut snapshot = ProjectSnapshot::new_authored(StableId("absent-global".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.scenario_application = Some(ScenarioApplicationContract::default());
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Original".into(),
        authored: true,
    });
    let source = crate::codecs::encode_messages(&snapshot.messages, None).unwrap();
    snapshot.messages[0].authored = false;
    let sources = ClassicCompatibilitySources {
        data_sd2: Some(&source),
        ..Default::default()
    };
    let expected = BTreeMap::from([("Data SD2".into(), source.clone())]);
    certify_classic_no_edit_manifest_with_asset_payloads(
        &snapshot,
        sources,
        &BTreeMap::new(),
        &expected,
    )
    .unwrap();
    snapshot.messages[0].text = "Edited".into();
    snapshot.messages[0].authored = true;
    let certified = certify_classic_owned_edit_manifest_with_asset_payloads(
        &snapshot,
        sources,
        &BTreeMap::new(),
        &expected,
    )
    .unwrap();
    assert!(certified.manifest.get("Global").is_none());
    assert_ne!(certified.manifest.get("Data SD2").unwrap().bytes, source);
}

#[test]
fn existing_empty_global_preserves_unowned_slots_and_fresh_hooks_still_emit() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("global".into()));
    snapshot.scenario_application = Some(ScenarioApplicationContract::default());
    let fresh = compile_classic_slice_manifest(
        &snapshot,
        ClassicCompatibilitySources::default(),
        &BTreeMap::new(),
    )
    .unwrap();
    assert_eq!(fresh.get("Global").unwrap().bytes, vec![0; 60]);
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut source = vec![0; 60];
    source[6..8].copy_from_slice(&(-32768_i16).to_be_bytes());
    source[59] = 0xa5;
    let sources = ClassicCompatibilitySources {
        global: Some(&source),
        ..Default::default()
    };
    let expected = BTreeMap::from([("Global".into(), source.clone())]);
    let result = certify_classic_no_edit_manifest_with_asset_payloads(
        &snapshot,
        sources,
        &BTreeMap::new(),
        &expected,
    )
    .unwrap();
    assert_eq!(result.get("Global").unwrap().bytes, source);
}
