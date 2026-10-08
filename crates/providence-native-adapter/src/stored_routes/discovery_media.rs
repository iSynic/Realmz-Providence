use crate::catalogs::CatalogViews;
use providence_core::{
    discovery::{DiscoveryLink, flow::FlowTarget},
    references::ResolutionState,
};
use providence_core::{
    model::{AssetDescriptor, ClassicResourceKey},
    rebuilt::ApplicationMediaResolution,
};
use serde_json::{Value, json};

pub(super) fn flow_target(link: &DiscoveryLink, catalogs: CatalogViews<'_>) -> Option<FlowTarget> {
    let resource_type = match link.target_kind.as_str() {
        "monster-appearance" | "icon" | "special-land-tile" => "cicn",
        "picture" => "PICT",
        "sound" => "snd ",
        "text-resource" => "TEXT",
        _ => return None,
    };
    let resource_id = link.target_id.parse::<i32>().ok()?;
    let mut target = FlowTarget {
        identity: None,
        scope: "stock".into(),
        resolution: ResolutionState::Missing,
        reason: "The exact Stock resource is unavailable.".into(),
    };
    let Some(catalog) = catalogs.application_media else {
        return Some(target);
    };
    let key = ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id,
    };
    match catalog.resolve_resource(&key, None) {
        ApplicationMediaResolution::Resolved(asset)
            if resource_kind_matches(&asset.descriptor, resource_type) =>
        {
            target.identity = Some(asset.descriptor.identity.0.clone());
            target.resolution = ResolutionState::Resolved;
            target.reason.clear();
        }
        ApplicationMediaResolution::Ambiguous => {
            target.resolution = ResolutionState::Ambiguous;
            target.reason =
                "The exact Stock resource is ambiguous; restore its ownership before opening."
                    .into();
        }
        ApplicationMediaResolution::WrongKind | ApplicationMediaResolution::Resolved(_) => {
            target.reason = "The exact Stock resource has the wrong content kind.".into();
        }
        ApplicationMediaResolution::Missing => {}
    }
    Some(target)
}

pub(super) fn kind(asset: &AssetDescriptor) -> &str {
    match asset
        .classic_resource
        .as_ref()
        .map(|key| key.resource_type.as_str())
    {
        Some("cicn") => "icon",
        Some("PICT") => "picture",
        Some("snd ") => "sound",
        Some("TEXT") => "text-resource",
        _ => &asset.kind,
    }
}

pub(super) fn connect_targets(result: &mut Value, catalogs: CatalogViews<'_>) {
    if let Some(items) = result.get_mut("items").and_then(Value::as_array_mut) {
        for link in items {
            resolve(link, catalogs);
        }
    }
    if let Some(items) = result
        .get_mut("trace")
        .and_then(|trace| trace.get_mut("items"))
        .and_then(Value::as_array_mut)
    {
        for item in items {
            if let Some(link) = item.get_mut("link") {
                resolve(link, catalogs);
            }
        }
    }
}

pub(super) fn connect_record_targets(result: &mut Value, catalogs: CatalogViews<'_>) {
    for key in ["incomingReferences", "outgoingReferences"] {
        if let Some(rows) = result.get_mut(key).and_then(Value::as_array_mut) {
            for link in rows {
                resolve(link, catalogs);
            }
        }
    }
}

fn resolve(link: &mut Value, catalogs: CatalogViews<'_>) {
    if link["resolution"] != "stock-fallback" {
        return;
    }
    link["targetIdentity"] = Value::Null;
    link["availabilityReason"] = json!("The exact Stock resource is unavailable.");
    let Some(catalog) = catalogs.application_media else {
        return;
    };
    let resource_type = match link["targetKind"].as_str().unwrap_or("") {
        "monster-appearance" | "icon" => "cicn",
        "picture" => "PICT",
        "sound" => "snd ",
        "text-resource" => "TEXT",
        _ => return,
    };
    let Some(resource_id) = link["targetId"]
        .as_str()
        .and_then(|id| id.parse::<i32>().ok())
    else {
        return;
    };
    let resource = ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id,
    };
    match catalog.resolve_resource(&resource, None) {
        ApplicationMediaResolution::Resolved(asset) => {
            let compatible = resource_kind_matches(&asset.descriptor, resource_type);
            if !compatible {
                link["availabilityReason"] =
                    json!("The exact Stock resource has the wrong content kind.");
                return;
            }
            link["availabilityReason"] = json!("");
            link["targetIdentity"] = json!(asset.descriptor.identity);
            link["targetLabel"] = json!(asset.descriptor.label);
            link["targetScope"] = json!("stock");
        }
        ApplicationMediaResolution::Ambiguous => {
            link["availabilityReason"] = json!(
                "The exact Stock resource is ambiguous; restore its ownership before opening."
            )
        }
        ApplicationMediaResolution::WrongKind => {
            link["availabilityReason"] =
                json!("The exact Stock resource has the wrong content kind.")
        }
        ApplicationMediaResolution::Missing => {
            link["availabilityReason"] = json!("The exact Stock resource is unavailable.")
        }
    }
}

fn resource_kind_matches(asset: &AssetDescriptor, resource_type: &str) -> bool {
    match resource_type {
        "cicn" => matches!(
            asset.kind.as_str(),
            "icon" | "portrait" | "special-land-tile"
        ),
        "PICT" => asset.kind == "picture",
        "snd " => asset.kind == "sound",
        "TEXT" => asset.kind == "text-resource",
        _ => false,
    }
}
