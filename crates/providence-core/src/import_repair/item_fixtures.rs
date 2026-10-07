use crate::{
    codecs::{decode_scenario_item_rules, encode_scenario_item_text_resources},
    model::{
        BlobId, ClassicSourceBlob, ProjectOrigin, ProjectSnapshot, ScenarioStartupAuthoring,
        StableId,
    },
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn capture(
    snapshot: &mut ProjectSnapshot,
    files: &mut BTreeMap<String, Vec<u8>>,
    path: &str,
    bytes: Vec<u8>,
) -> BlobId {
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: path.into(),
        blob: blob.clone(),
        byte_length: bytes.len() as u64,
    });
    files.insert(path.into(), bytes);
    blob
}

pub(super) fn competing_forks() -> (ProjectSnapshot, BTreeMap<String, Vec<u8>>, BlobId) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("item-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "0".repeat(64))),
    };
    let mut files = BTreeMap::new();
    let binary = vec![0; 20_000];
    let blob = capture(&mut snapshot, &mut files, "Data NI", binary.clone());
    let mut rules = decode_scenario_item_rules(&binary, None, blob.clone(), None)
        .unwrap()
        .rules;
    rules[0].definition.name = "Wrong fork zero".into();
    rules[1].definition.name = "Wrong fork one".into();
    let old = encode_scenario_item_text_resources(&rules, None).unwrap();
    let old_blob = capture(&mut snapshot, &mut files, "Data NI.rsrc", old.clone());
    rules[0].definition.name = "Scenario zero".into();
    rules[1].definition.name = "Scenario one".into();
    let corrected = encode_scenario_item_text_resources(&rules, None).unwrap();
    let corrected_blob = capture(&mut snapshot, &mut files, "Scenario.rsrc", corrected);
    snapshot.scenario_item_rules =
        decode_scenario_item_rules(&binary, Some(&old), blob, Some(old_blob))
            .unwrap()
            .rules;
    snapshot.scenario_item_rules[0].definition.name = "Author's edit".into();
    snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Fixture".into(),
        original_source: Some(snapshot.classic_sources[0].clone()),
        security: None,
    });
    (snapshot, files, corrected_blob)
}
