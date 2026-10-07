use super::super::*;
use super::fixtures::{asset, land_map, moon_blade, scenario, world_application};

#[test]
fn application_landlook_and_special_land_resolve_without_package_duplication() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("layered-world-media".into()));
    snapshot.world.maps.push(land_map(3, Some(-1091)));
    let application = world_application();
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
    let landlook = selection
        .references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::MapTileset)
        .unwrap();
    let overlay = selection
        .references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::SpecialLandOverlay)
        .unwrap();
    assert_eq!(
        landlook.requirement,
        RebuiltV3MediaRequirement::ApplicationRequired
    );
    assert_eq!(
        overlay.requirement,
        RebuiltV3MediaRequirement::ApplicationRequired
    );
    assert_eq!(landlook.resolution, ResolutionState::StockFallback);
    assert_eq!(overlay.resolution, ResolutionState::StockFallback);
    assert!(selection.assets.assets.is_empty());
}

#[test]
fn map_assets_require_either_a_scenario_or_application_owner() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-policy".into()));
    snapshot.world.maps.push(land_map(2, None));
    let item = moon_blade();
    let references = derive_rebuilt_v3_reachable_media_references(
        &snapshot,
        &scenario(),
        &[item],
        &[],
        &[],
        &[],
        false,
    );
    let tileset = references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::MapTileset)
        .unwrap();
    assert_eq!(
        tileset.requirement,
        RebuiltV3MediaRequirement::ApplicationRequired
    );
    assert_eq!(tileset.resolution, ResolutionState::Missing);
    let item_icon = references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::ItemIcon)
        .unwrap();
    assert_eq!(
        item_icon.requirement,
        RebuiltV3MediaRequirement::StockFallbackAllowed
    );
    assert_eq!(item_icon.resolution, ResolutionState::StockFallback);
    let item_sound = references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::ItemSound)
        .unwrap();
    assert_eq!(
        item_sound.classic_resource.as_ref().unwrap().resource_id,
        612
    );
}

#[test]
fn exact_keys_with_the_wrong_runtime_role_do_not_satisfy_media_requirements() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("wrong-role".into()));
    snapshot.assets.push(asset(
        "not-a-portrait",
        "special-land-tile",
        Some("cicn"),
        257,
    ));
    snapshot
        .assets
        .push(asset("classic.landlook.2", "portrait", None, 0));
    snapshot.world.maps.push(land_map(2, None));

    let references = derive_rebuilt_v3_reachable_media_references(
        &snapshot,
        &scenario(),
        &[],
        &[],
        &[],
        &[],
        false,
    );
    let portrait = references
        .iter()
        .find(|reference| {
            reference.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "cicn" && resource.resource_id == 257
            })
        })
        .unwrap();
    assert_eq!(portrait.expected_asset_kind.as_deref(), Some("portrait"));
    assert_eq!(portrait.resolution, ResolutionState::Missing);
    let tileset = references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::MapTileset)
        .unwrap();
    assert_eq!(tileset.expected_asset_kind.as_deref(), Some("tileset"));
    assert_eq!(tileset.resolution, ResolutionState::Missing);
}
