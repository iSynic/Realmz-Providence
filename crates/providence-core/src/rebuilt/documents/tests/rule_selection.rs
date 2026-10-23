use super::*;
use crate::{model::*, rebuilt::*};

fn selected_fixture() -> (ProjectSnapshot, ResolvedClassicRules, String) {
    selected_fixture_with(|_| {})
}

fn selected_fixture_with(
    author: impl FnOnce(&mut ProjectSnapshot),
) -> (ProjectSnapshot, ResolvedClassicRules, String) {
    let mut original = snapshot();
    author(&mut original);
    let application_rules = project_rebuilt_v3_rule_catalog(&original).unwrap();
    original.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let media_path = add_media(&mut original);
    original.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: original.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&original).unwrap(),
        native_menu_selection: 10,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    let selected = resolve_classic_rules(
        &original,
        &application_rules,
        &ClassicRuleNameOverrides {
            races: None,
            castes: None,
        },
    )
    .unwrap();
    (original, selected, media_path)
}

#[test]
fn selected_finalization_keeps_original_context_and_full_catalog_after_deduplication() {
    let (original, selected, media_path) = selected_fixture();
    let application_media = application_media_for(&selected.effective_snapshot);
    let inputs = [RebuiltV3FileInput {
        path: &media_path,
        bytes: MEDIA,
    }];
    let mut artifact = compile_rebuilt_document_set_with_selected_rules(
        &selected,
        &application_media,
        &compiler(),
        &inputs,
    )
    .unwrap();
    assert!(artifact.content.document.races.is_empty());
    let before = artifact.clone();
    assert!(
        finalize_rebuilt_v7_document_set(
            &mut artifact,
            &original,
            &compiler(),
            &BTreeMap::new(),
            &inputs
        )
        .is_err()
    );
    assert_eq!(artifact, before);
    finalize_rebuilt_v7_document_set_with_selected_rules(
        &mut artifact,
        &original,
        &compiler(),
        &BTreeMap::new(),
        &inputs,
        &selected,
    )
    .unwrap();
    assert_binding(&artifact, &original, &selected);
    let first = artifact.clone();
    finalize_rebuilt_v7_document_set_with_selected_rules(
        &mut artifact,
        &original,
        &compiler(),
        &BTreeMap::new(),
        &inputs,
        &selected,
    )
    .unwrap();
    assert_eq!(artifact, first);
}

// A selected-rule project with one XAP and the Data ED3 that publication builds for it.
fn built_family_fixture() -> (
    ProjectSnapshot,
    BTreeMap<String, Vec<u8>>,
    ResolvedClassicRules,
    String,
) {
    let (original, selected, media_path) = selected_fixture_with(|snapshot| {
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:0".into()),
            native_id: NativeRecordId(0),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    });
    let built =
        crate::codecs::encode_extra_action_points(&original.extra_action_points, None).unwrap();
    let mut published = original.clone();
    published.classic_sources.push(ClassicSourceBlob {
        native_path: "Data ED3".into(),
        blob: BlobId(format!(
            "sha256:{:x}",
            <sha2::Sha256 as sha2::Digest>::digest(&built)
        )),
        byte_length: built.len() as u64,
    });
    let retained = BTreeMap::from([("Data ED3".to_owned(), built)]);
    (published, retained, selected, media_path)
}

fn finalize_published(
    published: &ProjectSnapshot,
    retained: &BTreeMap<String, Vec<u8>>,
    selected: &ResolvedClassicRules,
    media_path: &str,
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    let application_media = application_media_for(&selected.effective_snapshot);
    let inputs = [RebuiltV3FileInput {
        path: media_path,
        bytes: MEDIA,
    }];
    let mut artifact = compile_rebuilt_document_set_with_selected_rules(
        selected,
        &application_media,
        &compiler(),
        &inputs,
    )
    .unwrap();
    finalize_rebuilt_v7_document_set_with_selected_rules(
        &mut artifact,
        published,
        &compiler(),
        retained,
        &inputs,
        selected,
    )?;
    Ok(artifact)
}

#[test]
fn selected_finalization_binds_the_shipped_inventory_including_a_built_family() {
    let (published, retained, selected, media_path) = built_family_fixture();
    let artifact = finalize_published(&published, &retained, &selected, &media_path).unwrap();
    let records = artifact.content.document.classic_records.unwrap();
    assert_eq!(
        records.rule_selection.unwrap().captured_source_set_sha256,
        classic_source_set_sha256(&published).unwrap()
    );
    // Only families built from authored records may join the captured inventory.
    let mut foreign = published.clone();
    foreign.classic_sources.push(ClassicSourceBlob {
        native_path: "Data LD".into(),
        blob: BlobId(format!(
            "sha256:{:x}",
            <sha2::Sha256 as sha2::Digest>::digest([])
        )),
        byte_length: 0,
    });
    let mut foreign_bytes = retained.clone();
    foreign_bytes.insert("Data LD".into(), Vec::new());
    let error = finalize_published(&foreign, &foreign_bytes, &selected, &media_path).unwrap_err();
    assert!(
        error
            .to_string()
            .contains("differ from the captured rule selection"),
        "{error}"
    );
}

fn assert_binding(
    artifact: &RebuiltV3DocumentSetArtifact,
    original: &ProjectSnapshot,
    selected: &ResolvedClassicRules,
) {
    let content: serde_json::Value =
        serde_json::from_slice(&artifact.content.canonical_json).unwrap();
    assert_eq!(
        content["classicRecords"]["ruleSelection"]["nativeMenuSelection"],
        10
    );
    assert_eq!(
        content["classicRecords"]["ruleSelection"]["projectedRules"]["races"]
            .as_array()
            .unwrap()
            .len(),
        30
    );
    assert_eq!(
        artifact
            .content
            .document
            .classic_records
            .as_ref()
            .unwrap()
            .rule_selection,
        Some(project_rebuilt_v7_rule_selection(original, selected).unwrap())
    );
    assert_eq!(artifact.manifest.manifest.schema_version, 7);
}
