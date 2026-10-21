use super::*;
use crate::{model::*, rebuilt::*};
use std::collections::BTreeMap;

fn fixture(menu: u16) -> (ProjectSnapshot, RebuiltV3RuleCatalog) {
    let mut snapshot = crate::rebuilt::rules::tests::complete_rule_snapshot();
    let mut application = project_rebuilt_v3_rule_catalog(&snapshot).unwrap();
    for caste in &mut application.castes {
        caste.eligible_race_ids.sort();
    }
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&snapshot).unwrap(),
        native_menu_selection: menu,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    (snapshot, application)
}

fn resolve(snapshot: &ProjectSnapshot, app: &RebuiltV3RuleCatalog) -> ResolvedClassicRules {
    resolve_classic_rules(
        snapshot,
        app,
        &ClassicRuleNameOverrides {
            races: None,
            castes: None,
        },
    )
    .unwrap()
}

#[test]
fn selected_application_rules_bind_all_logical_rows_before_exact_deduplication() {
    let (snapshot, application) = fixture(10);
    let selected = resolve(&snapshot, &application);
    assert!(selected.runtime_overrides.races.is_empty());
    let facts = project_rebuilt_v7_rule_selection(&snapshot, &selected).unwrap();
    assert_eq!(
        (facts.race_source, facts.caste_source),
        (NativeRuleSource::Application, NativeRuleSource::Application)
    );
    for (family, rows) in [
        ("race", facts.projected_rules.races),
        ("caste", facts.projected_rules.castes),
    ] {
        assert_eq!(rows.len(), 30);
        for (index, row) in rows.iter().enumerate() {
            assert_eq!(row.id, format!("classic.{family}.{}", index + 1));
            assert_eq!(row.sha256.as_ref().unwrap().len(), 64);
        }
    }
    let unresolved = project_rebuilt_v7_classic_records(&snapshot, &BTreeMap::new()).unwrap();
    assert!(unresolved.rule_selection.is_none());
    assert!(serde_json::to_value(unresolved).unwrap()["ruleSelection"].is_null());
}

#[test]
fn selected_row_digest_includes_names_appearance_eligibility_and_wire_order() {
    let (snapshot, application) = fixture(10);
    let selected = resolve(&snapshot, &application);
    let original = project_rebuilt_v7_rule_selection(&snapshot, &selected).unwrap();
    for field in ["name", "appearance", "eligibility"] {
        let mut changed = resolve(&snapshot, &application);
        match field {
            "name" => changed.effective_snapshot.race_rules[0]
                .definition
                .name
                .push('!'),
            "appearance" => {
                changed.effective_snapshot.race_rules[0]
                    .definition
                    .default_icon_set += 1
            }
            _ => {
                changed.effective_snapshot.race_rules[0]
                    .definition
                    .eligible_caste_ids
                    .clear();
                crate::codecs::derive_caste_eligibility(
                    &changed.effective_snapshot.race_rules,
                    &mut changed.effective_snapshot.caste_rules,
                )
                .unwrap();
            }
        }
        let facts = project_rebuilt_v7_rule_selection(&snapshot, &changed).unwrap();
        assert_ne!(
            facts.projected_rules.races[0], original.projected_rules.races[0],
            "{field}"
        );
        assert_eq!(
            facts.projected_rules.races[1],
            original.projected_rules.races[1]
        );
    }
    let mut reversed = application.clone();
    reversed.castes[0].eligible_race_ids.reverse();
    let selected = resolve(&snapshot, &reversed);
    assert_eq!(selected.runtime_overrides.castes.len(), 1);
    assert_eq!(
        selected.runtime_overrides.castes[0].eligible_race_ids,
        application.castes[0].eligible_race_ids
    );
}

#[test]
fn selected_rule_binding_rejects_stale_context_unverified_capture_and_other_resolution() {
    let (snapshot, application) = fixture(20);
    let selected = resolve(&snapshot, &application);
    for defect in ["source", "capture", "context", "origin"] {
        let mut changed = snapshot.clone();
        match defect {
            "source" => changed.classic_sources.push(ClassicSourceBlob {
                native_path: "extra".into(),
                blob: BlobId(format!("sha256:{}", "b".repeat(64))),
                byte_length: 1,
            }),
            "capture" => {
                changed
                    .classic_rule_selection
                    .as_mut()
                    .unwrap()
                    .evidence_origin = ClassicRuleSelectionEvidence::CapturedNativeSelection {
                    selection_receipt_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
                    menu_payload_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
                    menu_payload_bytes: 1,
                    resource_fork_sha256: "a".repeat(64),
                }
            }
            "context" => changed.classic_rule_selection = None,
            _ => changed.origin = ProjectOrigin::Authored,
        }
        assert!(
            project_rebuilt_v7_rule_selection(&changed, &selected).is_err(),
            "{defect}"
        );
    }
    let mut selected = selected;
    selected.race_source = "application";
    assert!(project_rebuilt_v7_rule_selection(&snapshot, &selected).is_err());
}
