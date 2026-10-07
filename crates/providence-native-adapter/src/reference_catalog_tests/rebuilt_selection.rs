use providence_core::model::{AssetDescriptor, StableId};

pub(super) fn verify_rebuilt_item_artwork_inputs(
    snapshot: &providence_core::model::ProjectSnapshot,
    store: &providence_storage::ProjectStore,
    asset: &AssetDescriptor,
) {
    use providence_core::{model::ScenarioApplicationContract, rebuilt::*};
    let mut scenario_snapshot = snapshot.clone();
    scenario_snapshot.scenario_application = Some(ScenarioApplicationContract {
        hooks: Default::default(),
    });
    let scenario = project_rebuilt_v3_scenario(&scenario_snapshot).unwrap();
    let items = project_rebuilt_v3_scenario_item_catalog(snapshot).unwrap();
    let expected_icon = asset.classic_resource.as_ref().unwrap().resource_id;
    assert_eq!(items[0].icon_id, expected_icon);
    let application = appearance_bank(asset);
    let selected = project_rebuilt_v3_reachable_media_with_application(
        snapshot,
        &application,
        &scenario,
        &items[..1],
        &[],
        &[],
        &[],
        false,
    )
    .unwrap();
    let reference = selected
        .references
        .iter()
        .find(|reference| {
            reference.source.0 == "classic.item.800"
                && reference.relation == RebuiltV3MediaRelation::ItemIcon
        })
        .unwrap();
    assert_eq!(reference.resolved_asset_id.as_ref(), Some(&asset.identity));
    assert_eq!(
        reference.resolved_owner,
        Some(RebuiltV3MediaOwner::ScenarioPackage)
    );
    assert_eq!(selected.assets.assets.len(), 1);
    let media =
        crate::rebuilt_publication::read_rebuilt_media_index(store, &selected.assets).unwrap();
    assert_eq!(media.len(), 1);
    assert_eq!(media[0].0, selected.assets.assets[0].path);
    assert_eq!(media[0].1, store.read_blob(&asset.blob).unwrap());
    assert_eq!(selected.assets.assets[0].resource_id, Some(expected_icon));
}
fn appearance_bank(asset: &AssetDescriptor) -> providence_core::rebuilt::ApplicationMediaCatalog {
    use providence_core::rebuilt::{
        ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource,
    };
    let mut application = ApplicationMediaCatalog::empty(StableId("synthetic-application".into()));
    application.sources.push(ApplicationMediaSource {
        identity: StableId("synthetic-appearance-bank".into()),
        native_name: "Synthetic Appearance.rsrc".into(),
        priority: 0,
        blob: asset.classic_payload_blob.clone().unwrap(),
        byte_length: asset.classic_payload_byte_length.unwrap(),
    });
    for (ids, kind) in [(257..377, "portrait"), (9000..9120, "combat-icon")] {
        for id in ids {
            let mut descriptor = asset.clone();
            descriptor.identity = StableId(format!("application:{kind}:{id}"));
            descriptor.kind = kind.into();
            descriptor.classic_resource.as_mut().unwrap().resource_id = id;
            application.assets.push(ApplicationMediaAsset {
                source: StableId("synthetic-appearance-bank".into()),
                source_priority: 0,
                descriptor,
            });
        }
    }
    application
}
