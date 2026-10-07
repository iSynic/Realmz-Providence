use super::tests::{complete_application_appearance_catalog, scenario};
use super::*;
#[test]
fn application_appearance_bank_resolves_without_entering_the_scenario_package() {
    let snapshot = ProjectSnapshot::new_authored(StableId("layered-media".into()));
    let application = complete_application_appearance_catalog();
    let selection = project_rebuilt_v3_reachable_media_with_application(
        &snapshot,
        &application,
        &scenario(),
        &[],
        &[],
        &[],
        &[],
        false,
    )
    .unwrap();
    assert_eq!(selection.references.len(), 240);
    assert!(selection.references.iter().all(|reference| {
        reference.requirement == RebuiltV3MediaRequirement::ApplicationRequired
            && reference.resolution == ResolutionState::StockFallback
            && reference.resolved_owner == Some(RebuiltV3MediaOwner::ClassicApplication)
            && reference.resolved_asset_id.is_some()
    }));
    assert!(selection.assets.assets.is_empty());
}
