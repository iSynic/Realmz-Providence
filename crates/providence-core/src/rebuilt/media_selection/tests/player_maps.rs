use super::super::*;
use super::fixtures::{player_map_context, player_marker_application};
use std::collections::BTreeSet;

#[test]
fn classic_player_map_icons_are_optional_runtime_companions_not_package_assets() {
    let (snapshot, runtime_scenario) = player_map_context();
    let references = derive_rebuilt_v3_reachable_media_references(
        &snapshot,
        &runtime_scenario,
        &[],
        &[],
        &[],
        &[],
        false,
    );
    let player_map = references
        .iter()
        .filter(|reference| reference.relation == RebuiltV3MediaRelation::PlayerMap)
        .collect::<Vec<_>>();
    assert_eq!(player_map.len(), 2);
    assert!(player_map.iter().all(|reference| {
        reference.requirement == RebuiltV3MediaRequirement::OptionalCompanion
    }));
    assert_eq!(
        player_map
            .iter()
            .map(|reference| { reference.classic_resource.as_ref().unwrap().resource_id })
            .collect::<BTreeSet<_>>(),
        BTreeSet::from([137, 138])
    );
}

#[test]
fn player_map_companions_resolve_to_the_exact_application_assets() {
    let (snapshot, runtime_scenario) = player_map_context();
    let application = player_marker_application();
    let layered = derive_rebuilt_v3_reachable_media_references_with_application(
        &snapshot,
        &application,
        &runtime_scenario,
        &[],
        &[],
        &[],
        &[],
        false,
    )
    .into_iter()
    .filter(|reference| reference.relation == RebuiltV3MediaRelation::PlayerMap)
    .collect::<Vec<_>>();
    assert!(layered.iter().all(|reference| {
        reference.resolution == ResolutionState::StockFallback
            && reference.resolved_owner == Some(RebuiltV3MediaOwner::ClassicApplication)
            && reference.resolved_asset_id.is_some()
    }));
}
