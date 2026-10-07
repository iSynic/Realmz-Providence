use super::*;
use crate::codecs::encode_player_map_name_resources;
use crate::compiler::ClassicOwnedResourceEdit;

pub(super) fn certify(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    baseline: &mut BTreeMap<String, Vec<u8>>,
    payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<ClassicOwnedResourceEdit>, ClassicOwnedEditCertificationError> {
    let path = "Scenario.rsrc";
    let (Some(original), Some(output)) = (baseline.get(path), manifest.get(path)) else {
        return Ok(Vec::new());
    };
    if original == &output.bytes {
        return Ok(Vec::new());
    }
    let mut encoded = original.clone();
    let mut resource_keys = Vec::new();
    if let Some(catalog) = snapshot.player_map_names.as_ref() {
        let sources: Vec<_> = snapshot
            .classic_sources
            .iter()
            .filter(|source| source.native_path == path)
            .collect();
        if sources.len() != 1 || catalog.source_blob.as_ref() != Some(&sources[0].blob) {
            return Err(
                ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec![path.into()]),
            );
        }
        encoded = encode_player_map_name_resources(catalog, Some(original))
            .map_err(|error| ClassicOwnedEditCertificationError::Compile(error.into()))?;
        resource_keys.extend(["STR#:-102".into(), "STR#:-101".into()]);
    }
    // Compose the two independently owned families against the same source container.
    // The TEXT codec rejects changed unowned style fields and preserves other resources.
    encoded = crate::codecs::compile_classic_text_resource_fork(
        &snapshot.assets,
        payloads,
        Some(&encoded),
    )
    .map_err(|error| ClassicOwnedEditCertificationError::Compile(error.into()))?;
    for asset in &snapshot.assets {
        if matches!(asset.kind.as_str(), "text-resource" | "text-style-resource")
            && let Some(key) = &asset.classic_resource
        {
            resource_keys.push(format!("{}:{}", key.resource_type, key.resource_id));
        }
    }
    if encoded != output.bytes {
        return Err(
            ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec![path.into()]),
        );
    }
    let edit = ClassicOwnedResourceEdit {
        native_path: path.into(),
        resource_keys,
        before_bytes: original.len(),
        after_bytes: encoded.len(),
    };
    baseline.insert(path.into(), encoded);
    Ok(vec![edit])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{codecs::*, model::*};

    fn fixture() -> (ProjectSnapshot, NativeManifest, BTreeMap<String, Vec<u8>>) {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("names-owned".into()));
        let mut names = PlayerMapNameCatalog {
            source_blob: Some(BlobId("names-source".into())),
            available_names: vec!["Original".into()],
            unavailable_names: vec!["Unknown".into()],
        };
        let resources = write_resource_fork(&[ResourceEntry {
            resource_type: *b"TEXT",
            id: 7,
            name: "Preserved".into(),
            attributes: 4,
            data: vec![1, 2, 3],
        }])
        .unwrap();
        let original = encode_player_map_name_resources(&names, Some(&resources)).unwrap();
        snapshot.classic_sources.push(ClassicSourceBlob {
            native_path: "Scenario.rsrc".into(),
            blob: names.source_blob.clone().unwrap(),
            byte_length: original.len() as u64,
        });
        names.available_names[0] = "Reviewed".into();
        let encoded = encode_player_map_name_resources(&names, Some(&original)).unwrap();
        snapshot.player_map_names = Some(names);
        let mut manifest = NativeManifest::default();
        manifest.insert_generated(
            "Scenario.rsrc",
            NativeFileFamily::ScenarioResourceFork,
            encoded,
        );
        (
            snapshot,
            manifest,
            BTreeMap::from([("Scenario.rsrc".into(), original)]),
        )
    }

    #[test]
    fn name_edit_certifies_the_complete_preserved_container() {
        let (snapshot, manifest, mut baseline) = fixture();
        let edits = certify(&snapshot, &manifest, &mut baseline, &BTreeMap::new()).unwrap();
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].resource_keys, ["STR#:-102", "STR#:-101"]);
        assert!(certify_classic_manifest_owned_edits(manifest, &baseline, None).is_ok());
    }

    #[test]
    fn text_and_name_edits_certify_together_but_unowned_neighbors_do_not() {
        let (mut snapshot, mut manifest, mut baseline) = fixture();
        let mut entries = parse_resource_entries_preserving_duplicates(
            &manifest.get("Scenario.rsrc").unwrap().bytes,
        )
        .unwrap();
        let text = entries
            .iter_mut()
            .find(|entry| entry.resource_type == *b"TEXT")
            .unwrap();
        text.data = b"Caf\x8e".to_vec();
        let output = write_resource_fork(&entries).unwrap();
        let decoded =
            decode_classic_text_assets(&output, CLASSIC_SCENARIO_RESOURCE_SOURCE).unwrap();
        let mut payloads = BTreeMap::new();
        for row in decoded {
            payloads.insert(
                row.asset.classic_payload_blob.as_ref().unwrap().0.clone(),
                row.classic_payload,
            );
            snapshot.assets.push(row.asset);
        }
        manifest.insert_generated(
            "Scenario.rsrc",
            NativeFileFamily::ScenarioResourceFork,
            output,
        );
        let edits = certify(&snapshot, &manifest, &mut baseline, &payloads).unwrap();
        assert!(edits[0].resource_keys.contains(&"TEXT:7".into()));
        assert!(certify_classic_manifest_owned_edits(manifest.clone(), &baseline, None).is_ok());
        let mut entries = parse_resource_entries_preserving_duplicates(
            &manifest.get("Scenario.rsrc").unwrap().bytes,
        )
        .unwrap();
        entries.push(ResourceEntry {
            resource_type: *b"PICT",
            id: 128,
            name: "Unowned injection".into(),
            attributes: 0,
            data: vec![9],
        });
        manifest.insert_generated(
            "Scenario.rsrc",
            NativeFileFamily::ScenarioResourceFork,
            write_resource_fork(&entries).unwrap(),
        );
        assert!(certify(&snapshot, &manifest, &mut baseline, &payloads).is_err());
    }

    #[test]
    fn unrelated_resource_edits_and_source_substitution_are_rejected() {
        let (mut snapshot, mut manifest, mut baseline) = fixture();
        let mut entries = parse_resource_entries_preserving_duplicates(
            &manifest.get("Scenario.rsrc").unwrap().bytes,
        )
        .unwrap();
        entries
            .iter_mut()
            .find(|entry| entry.resource_type == *b"TEXT")
            .unwrap()
            .data[0] ^= 1;
        manifest.insert_generated(
            "Scenario.rsrc",
            NativeFileFamily::ScenarioResourceFork,
            write_resource_fork(&entries).unwrap(),
        );
        assert!(certify(&snapshot, &manifest, &mut baseline, &BTreeMap::new()).is_err());
        let (_, manifest, mut baseline) = fixture();
        snapshot.player_map_names.as_mut().unwrap().source_blob =
            Some(BlobId("wrong-source".into()));
        assert!(certify(&snapshot, &manifest, &mut baseline, &BTreeMap::new()).is_err());
    }
}
