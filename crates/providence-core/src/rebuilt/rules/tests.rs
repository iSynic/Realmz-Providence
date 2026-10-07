use super::*;
use crate::model::{BlobId, RuleNameCatalog, StableId};

mod fixtures;
pub(crate) use fixtures::complete_rule_snapshot;

#[test]
fn complete_catalog_projects_exact_schema_shapes_deterministically() {
    let snapshot = complete_rule_snapshot();
    let projection = project_rebuilt_v3_rule_catalog(&snapshot).expect("rule catalog");
    let encoded = serde_json::to_string(&projection).expect("serialize rules");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_rule_catalog(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value["races"].as_array().unwrap().len(), 30);
    assert_eq!(value["castes"].as_array().unwrap().len(), 30);
    assert_eq!(value["races"][0]["id"], "classic.race.1");
    assert_eq!(
        value["races"][0]["ageChanges"][4].as_array().unwrap().len(),
        15
    );
    assert_eq!(
        value["castes"][0]["spellcasterRows"][3]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        value["castes"][0]["victoryThresholds"]
            .as_array()
            .unwrap()
            .len(),
        30
    );

    let reopened: RebuiltV3RuleCatalog = serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn external_classic_name_catalog_supplies_names_without_mutating_native_rows() {
    let mut snapshot = complete_rule_snapshot();
    for race in &mut snapshot.race_rules {
        race.definition.name.clear();
    }
    for caste in &mut snapshot.caste_rules {
        caste.definition.name.clear();
    }
    let mut race_names = (1..=30).map(|id| format!("Race {id}")).collect::<Vec<_>>();
    let mut caste_names = (1..=30).map(|id| format!("Caste {id}")).collect::<Vec<_>>();
    race_names[0] = "Human".into();
    race_names[19].clear();
    caste_names[0] = "Fighter".into();
    snapshot.rule_names = Some(RuleNameCatalog {
        source: "Data Files/Custom Names.rsrc".into(),
        source_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        race_resource_id: 129,
        caste_resource_id: 131,
        race_names,
        caste_names,
    });

    let projection = project_rebuilt_v3_rule_catalog(&snapshot).expect("named catalog");

    assert_eq!(projection.races[0].name, "Human");
    assert_eq!(projection.races[19].name, "Unnamed Classic race 20");
    assert_eq!(projection.castes[0].name, "Fighter");
    assert!(
        snapshot
            .race_rules
            .iter()
            .all(|rule| rule.definition.name.is_empty())
    );
}

#[test]
fn external_name_catalog_must_keep_exact_classic_resource_identities() {
    let mut snapshot = complete_rule_snapshot();
    snapshot.rule_names = Some(RuleNameCatalog {
        source: "Data Files/Custom Names.rsrc".into(),
        source_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        race_resource_id: 130,
        caste_resource_id: 131,
        race_names: vec![String::new(); 30],
        caste_names: vec![String::new(); 30],
    });

    assert_eq!(
        project_rebuilt_v3_rule_catalog(&snapshot),
        Err(RebuiltV3RuleCatalogError::InvalidNameCatalog(
            "resource identities must be STR# 129 and STR# 131".into()
        ))
    );
}

#[test]
fn asymmetric_eligibility_is_not_silently_accepted() {
    let mut snapshot = complete_rule_snapshot();
    snapshot.caste_rules[0].definition.eligible_race_ids.pop();

    assert!(matches!(
        project_rebuilt_v3_rule_catalog(&snapshot),
        Err(RebuiltV3RuleCatalogError::AsymmetricEligibility { .. })
    ));
}

#[test]
fn rule_eligibility_is_derived_as_typed_resolved_references() {
    let references = crate::session::references_for(&complete_rule_snapshot());

    assert_eq!(references.len(), 60);
    assert!(references.iter().all(|reference| {
        matches!(
            reference.target_kind,
            crate::references::TargetKind::Race | crate::references::TargetKind::Caste
        ) && reference.resolution == crate::references::ResolutionState::Resolved
    }));
}

#[test]
fn standard_item_catalog_resolves_caste_starting_item_references() {
    let mut snapshot = complete_rule_snapshot();
    snapshot.caste_rules[0].definition.starting_item_ids = vec![
        StableId("classic.item.37".into()),
        StableId("classic.item.900".into()),
    ];

    let missing = crate::session::references_for(&snapshot)
        .into_iter()
        .find(|reference| reference.field.0 == "startingItemIds[0]")
        .expect("starting item reference");
    assert_eq!(
        missing.resolution,
        crate::references::ResolutionState::Missing
    );

    snapshot.item_rules = (1..=799)
        .map(crate::rebuilt::items::item_rule_fixture)
        .collect();
    let resolved = crate::session::references_for(&snapshot)
        .into_iter()
        .find(|reference| reference.field.0 == "startingItemIds[0]")
        .expect("starting item reference");
    assert_eq!(resolved.target_id, "classic.item.37");
    assert_eq!(
        resolved.resolution,
        crate::references::ResolutionState::Resolved
    );

    let scenario_missing = crate::session::references_for(&snapshot)
        .into_iter()
        .find(|reference| reference.field.0 == "startingItemIds[1]")
        .expect("scenario starting item reference");
    assert_eq!(
        scenario_missing.resolution,
        crate::references::ResolutionState::Missing
    );
    snapshot.scenario_item_rules = (0..200)
        .map(crate::rebuilt::items::scenario_item_rule_fixture)
        .collect();
    let scenario_resolved = crate::session::references_for(&snapshot)
        .into_iter()
        .find(|reference| reference.field.0 == "startingItemIds[1]")
        .expect("scenario starting item reference");
    assert_eq!(scenario_resolved.target_id, "classic.item.900");
    assert_eq!(
        scenario_resolved.resolution,
        crate::references::ResolutionState::Resolved
    );
}
