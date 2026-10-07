use super::{ActionTarget, ActionTargetStatus};
use crate::model::ProjectSnapshot;
use crate::rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn resources(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    kind: &str,
    resource_type: &str,
) -> Vec<ActionTarget> {
    let by_key = scenario_resources(snapshot, resource_type);
    let scenario_keys = by_key.keys().copied().collect::<BTreeSet<_>>();
    let mut targets = resolved_scenario_targets(by_key, kind, resource_type);
    if let Some(application) = application {
        targets.extend(application_targets(
            application,
            &scenario_keys,
            kind,
            resource_type,
        ));
    }
    targets
}

fn scenario_resources<'a>(
    snapshot: &'a ProjectSnapshot,
    resource_type: &str,
) -> BTreeMap<i32, Vec<&'a crate::model::AssetDescriptor>> {
    let mut by_key = BTreeMap::<_, Vec<_>>::new();
    for asset in &snapshot.assets {
        if let Some(key) = &asset.classic_resource
            && key.resource_type == resource_type
            && supported_key(resource_type, key.resource_id)
        {
            by_key.entry(key.resource_id).or_default().push(asset);
        }
    }
    by_key
}

fn resolved_scenario_targets(
    by_key: BTreeMap<i32, Vec<&crate::model::AssetDescriptor>>,
    kind: &str,
    resource_type: &str,
) -> Vec<ActionTarget> {
    by_key
        .into_iter()
        .filter_map(|(value, assets)| {
            match crate::resource_resolution::unique_resource(assets.into_iter(), kind) {
                crate::resource_resolution::ScenarioResourceResolution::Resolved(asset) => {
                    Some((asset, value))
                }
                _ => None,
            }
        })
        .map(|(asset, value)| ActionTarget {
            identity: asset.identity.clone(),
            value,
            label: asset.label.clone(),
            detail: format!(
                "{} {} · {} bytes",
                resource_type.trim(),
                value,
                asset.byte_length
            ),
            status: ActionTargetStatus::CompatibilityResource,
            preview: Some(asset.identity.0.clone()),
        })
        .collect()
}

fn application_targets(
    application: &ApplicationMediaCatalog,
    scenario_keys: &BTreeSet<i32>,
    kind: &str,
    resource_type: &str,
) -> Vec<ActionTarget> {
    application_keys(application, scenario_keys, resource_type)
        .filter_map(|key| application_target(application, &key, kind, resource_type))
        .collect()
}

fn application_keys<'a>(
    application: &'a ApplicationMediaCatalog,
    scenario_keys: &'a BTreeSet<i32>,
    resource_type: &'a str,
) -> impl Iterator<Item = crate::model::ClassicResourceKey> + 'a {
    application
        .assets
        .iter()
        .filter_map(|asset| asset.descriptor.classic_resource.as_ref())
        .filter(move |key| {
            key.resource_type == resource_type
                && supported_key(resource_type, key.resource_id)
                && !scenario_keys.contains(&key.resource_id)
        })
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
}

fn application_target(
    application: &ApplicationMediaCatalog,
    key: &crate::model::ClassicResourceKey,
    kind: &str,
    resource_type: &str,
) -> Option<ActionTarget> {
    let ApplicationMediaResolution::Resolved(asset) = application.resolve_resource(key, Some(kind))
    else {
        return None;
    };
    let source_name = application
        .sources
        .iter()
        .find(|source| source.identity == asset.source)
        .map(|source| source.native_name.as_str())
        .unwrap_or(asset.source.0.as_str());
    let label = if asset.descriptor.label.trim().is_empty() {
        format!("Stock {} {}", kind, key.resource_id)
    } else {
        asset.descriptor.label.clone()
    };
    Some(ActionTarget {
        identity: asset.descriptor.identity.clone(),
        value: key.resource_id,
        label,
        detail: format!(
            "{} {} · {} · {} bytes",
            resource_type.trim(),
            key.resource_id,
            source_name,
            asset.descriptor.byte_length
        ),
        status: ActionTargetStatus::ApplicationResource,
        preview: Some(format!("Realmz stock · {source_name}")),
    })
}

fn supported_key(resource_type: &str, resource_id: i32) -> bool {
    resource_type != "snd " || resource_id >= 0
}
