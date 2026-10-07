use super::super::*;
use super::fixtures::{asset, complete_application_appearance_catalog, scenario};

#[test]
fn application_roots_do_not_claim_an_unverified_stock_fallback() {
    let snapshot = ProjectSnapshot::new_authored(StableId("missing-media".into()));
    let references = derive_rebuilt_v3_reachable_media_references(
        &snapshot,
        &scenario(),
        &[],
        &[],
        &[],
        &[],
        false,
    );
    assert_eq!(references.len(), 240);
    assert!(references.iter().all(|reference| {
        reference.requirement == RebuiltV3MediaRequirement::ApplicationRequired
            && reference.resolution == ResolutionState::Missing
    }));
    assert!(matches!(
        project_rebuilt_v3_reachable_media(
            &snapshot,
            &scenario(),
            &[],
            &[],
            &[],
            &[],
            false
        ),
        Err(RebuiltV3ReachableMediaError::UnresolvedRequired(references))
            if references.len() == 240
    ));
}

#[test]
fn scenario_assets_survive_without_references_and_shadow_exact_application_keys() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("layered-override".into()));
    snapshot.assets.push(asset(
        "scenario:portrait:257",
        "portrait",
        Some("cicn"),
        257,
    ));
    snapshot.assets.push(asset(
        "scenario:unused:picture",
        "picture",
        Some("PICT"),
        1234,
    ));
    snapshot
        .assets
        .push(asset("scenario:unused:sound", "sound", Some("snd "), 1234));
    let selection = project_rebuilt_v3_reachable_media_with_application(
        &snapshot,
        &complete_application_appearance_catalog(),
        &scenario(),
        &[],
        &[],
        &[],
        &[],
        false,
    )
    .unwrap();
    let overridden = selection
        .references
        .iter()
        .find(|reference| {
            reference.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "cicn" && resource.resource_id == 257
            })
        })
        .unwrap();
    assert_eq!(overridden.resolution, ResolutionState::Resolved);
    assert_eq!(
        overridden.resolved_owner,
        Some(RebuiltV3MediaOwner::ScenarioPackage)
    );
    assert_eq!(selection.assets.assets.len(), 3);
    assert_eq!(selection.assets.assets[0].id.0, "scenario:portrait:257");
    assert_eq!(selection.assets.assets[1].id.0, "scenario:unused:picture");
    assert_eq!(selection.assets.assets[2].id.0, "scenario:unused:sound");
    assert!(selection.references.iter().all(|reference| {
        !reference
            .resolved_asset_id
            .as_ref()
            .is_some_and(|id| id.0.starts_with("scenario:unused:"))
    }));
}

#[test]
fn exact_resolved_assets_are_deduplicated_and_projected_deterministically() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complete-media".into()));
    snapshot.assets.extend(
        (257..377).map(|id| asset(&format!("portrait:{id}"), "portrait", Some("cicn"), id)),
    );
    snapshot.assets.extend((9000..9120).map(|id| {
        asset(
            &format!("combat-icon:{id}"),
            "combat-icon",
            Some("cicn"),
            id,
        )
    }));
    let first =
        project_rebuilt_v3_reachable_media(&snapshot, &scenario(), &[], &[], &[], &[], false)
            .unwrap();
    let second =
        project_rebuilt_v3_reachable_media(&snapshot, &scenario(), &[], &[], &[], &[], false)
            .unwrap();
    assert_eq!(first, second);
    assert_eq!(first.references.len(), 240);
    assert_eq!(first.assets.assets.len(), 240);
    assert_eq!(first.assets.assets[0].id.0, "combat-icon:9000");
    assert_eq!(first.assets.assets[239].id.0, "portrait:376");
}
