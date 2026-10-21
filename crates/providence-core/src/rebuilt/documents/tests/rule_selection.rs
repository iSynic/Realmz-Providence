use super::*;
use crate::{model::*, rebuilt::*};

fn selected_fixture() -> (ProjectSnapshot, ResolvedClassicRules, String) {
    let mut original = snapshot();
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
