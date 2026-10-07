//! Exact resource selection for Player Maps; a marker is one CICN, never an actor pair.
use crate::monster_reference_catalog::{
    MonsterReferenceChoice, MonsterReferencePage, MonsterReferenceQuery,
};
use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};
use std::collections::{BTreeMap, BTreeSet};

pub struct PlayerMapResource<'a> {
    pub asset: Option<&'a AssetDescriptor>,
    pub ownership: &'static str,
    pub reason: String,
}

pub fn resource_type(field: &str) -> Result<&'static str, String> {
    match field {
        "marker" => Ok("cicn"),
        "picture" => Ok("PICT"),
        "scrollingText" => Ok("TEXT"),
        _ => Err("This field does not use the Player Map resource picker.".into()),
    }
}

pub fn resolve<'a>(
    snapshot: &'a ProjectSnapshot,
    application: Option<&'a ApplicationMediaCatalog>,
    field: &str,
    value: i16,
) -> Result<PlayerMapResource<'a>, String> {
    let key = ClassicResourceKey {
        resource_type: resource_type(field)?.into(),
        resource_id: i32::from(value),
    };
    let rows = snapshot
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(&key))
        .collect::<Vec<_>>();
    let (asset, ownership, reason) = match rows.as_slice() {
        [asset] => (Some(*asset), "scenario", ""),
        [] => match application.map(|catalog| catalog.resolve_resource(&key, None)) {
            Some(ApplicationMediaResolution::Resolved(asset)) => {
                (Some(&asset.descriptor), "stock", "")
            }
            Some(ApplicationMediaResolution::Ambiguous) => {
                (None, "stock", "The exact stock resource key is ambiguous.")
            }
            Some(ApplicationMediaResolution::WrongKind) => (
                None,
                "stock",
                "The exact stock resource has the wrong kind.",
            ),
            _ => (
                None,
                "unavailable",
                "This exact resource is missing. Select another resource or retain the imported value.",
            ),
        },
        _ => (
            None,
            "scenario",
            "The exact scenario resource key is ambiguous; stock cannot replace it.",
        ),
    };
    let reason = supported_reason(asset, field, value, reason);
    Ok(PlayerMapResource {
        asset,
        ownership,
        reason: reason.into(),
    })
}

pub fn choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &MonsterReferenceQuery,
) -> Result<MonsterReferencePage, String> {
    let kind = resource_type(&query.field)?;
    let mut ids = snapshot
        .assets
        .iter()
        .chain(
            application
                .into_iter()
                .flat_map(|catalog| catalog.assets.iter().map(|row| &row.descriptor)),
        )
        .filter_map(|asset| asset.classic_resource.as_ref())
        .filter(|key| key.resource_type == kind)
        .filter_map(|key| i16::try_from(key.resource_id).ok())
        .filter(|id| *id != 0)
        .collect::<BTreeSet<_>>();
    if query.current_value != 0 {
        ids.insert(query.current_value);
    }
    let index = resource_index(snapshot, application, kind);
    let rows = ids.into_iter().map(|id| {
        let (asset, ownership, reason) = index.get(&id).copied().unwrap_or((None, "unavailable", "This exact resource is missing. Select another resource or retain the imported value."));
        choice_from_resource(&query.field, id, PlayerMapResource { asset, ownership, reason: supported_reason(asset, &query.field, id, reason).into() })
    }).collect::<Result<Vec<_>, _>>()?;
    filtered_page(rows, query)
}

fn filtered_page(
    mut rows: Vec<MonsterReferenceChoice>,
    query: &MonsterReferenceQuery,
) -> Result<MonsterReferencePage, String> {
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i16>().ok();
    rows.sort_by_key(|row| (exact != Some(row.value), !row.available, row.value));
    let unavailable_total = rows.iter().filter(|row| !row.available).count();
    rows.retain(|row| {
        (query.show_unavailable || row.available || row.value == query.current_value)
            && (query.ownership.is_empty()
                || query.ownership == "all"
                || row.ownership == query.ownership)
            && (needle.is_empty()
                || exact == Some(row.value)
                || format!(
                    "{} {} {} {}",
                    row.label, row.identity, row.detail, row.value
                )
                .to_lowercase()
                .contains(&needle))
    });
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        rows.iter()
            .position(|row| row.value == query.current_value)
            .map_or(0, |index| index / limit * limit)
    } else {
        query.offset
    };
    let total = rows.len();
    Ok(MonsterReferencePage {
        items: rows.into_iter().skip(offset).take(limit).collect(),
        offset,
        total,
        limit,
        unavailable_total,
    })
}

pub fn choice(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    field: &str,
    value: i16,
) -> Result<MonsterReferenceChoice, String> {
    let resolved = resolve(snapshot, application, field, value)?;
    choice_from_resource(field, value, resolved)
}

fn choice_from_resource(
    field: &str,
    value: i16,
    resolved: PlayerMapResource<'_>,
) -> Result<MonsterReferenceChoice, String> {
    let asset = resolved.asset;
    let identity = format!("player-map-resource:{}:{value}", resource_type(field)?);
    Ok(MonsterReferenceChoice {
        identity,
        target_identity: asset.map(|asset| asset.identity.0.clone()),
        value,
        label: asset.map(|asset| asset.label.clone()).unwrap_or_else(|| {
            format!(
                "Missing {} {value}",
                resource_type(field).unwrap_or_default()
            )
        }),
        detail: asset
            .map(|asset| {
                format!(
                    "Exact {} {value} · {} · {} bytes",
                    resource_type(field).unwrap_or_default(),
                    asset.kind,
                    asset.byte_length
                )
            })
            .unwrap_or_default(),
        ownership: resolved.ownership.into(),
        available: asset.is_some() && resolved.reason.is_empty(),
        reason: resolved.reason,
    })
}

type IndexedResource<'a> = (Option<&'a AssetDescriptor>, &'static str, &'static str);

fn supported_reason<'a>(
    asset: Option<&AssetDescriptor>,
    field: &str,
    value: i16,
    reason: &'a str,
) -> &'a str {
    if let Some(asset) = asset {
        let supported = if field == "scrollingText" {
            matches!(asset.kind.as_str(), "text" | "text-resource")
                && asset.mime_type.as_deref() == Some("text/plain")
                && value < 0
        } else {
            asset.mime_type.as_deref() == Some("image/png")
        };
        if !supported {
            return "The exact resource cannot be used in this field.";
        }
    }
    reason
}

// Build once per catalog query: paging and full-catalog search must not repeatedly scan every resource.
fn resource_index<'a>(
    snapshot: &'a ProjectSnapshot,
    application: Option<&'a ApplicationMediaCatalog>,
    kind: &str,
) -> BTreeMap<i16, IndexedResource<'a>> {
    let mut index = stock_resource_index(application, kind);
    let mut scenario: BTreeMap<i16, Vec<&AssetDescriptor>> = BTreeMap::new();
    for asset in &snapshot.assets {
        if let Some(id) = resource_id(asset, kind) {
            scenario.entry(id).or_default().push(asset);
        }
    }
    for (id, rows) in scenario {
        index.insert(
            id,
            match rows.as_slice() {
                [asset] => (Some(*asset), "scenario", ""),
                _ => (
                    None,
                    "scenario",
                    "The exact scenario resource key is ambiguous; stock cannot replace it.",
                ),
            },
        );
    }
    index
}

fn resource_id(asset: &AssetDescriptor, kind: &str) -> Option<i16> {
    asset
        .classic_resource
        .as_ref()
        .filter(|key| key.resource_type == kind)
        .and_then(|key| i16::try_from(key.resource_id).ok())
}

fn stock_resource_index<'a>(
    application: Option<&'a ApplicationMediaCatalog>,
    kind: &str,
) -> BTreeMap<i16, IndexedResource<'a>> {
    let mut index = BTreeMap::new();
    if let Some(application) = application {
        let priorities = application
            .sources
            .iter()
            .map(|source| source.priority)
            .collect::<BTreeSet<_>>();
        for priority in priorities {
            let mut level: BTreeMap<i16, Vec<&AssetDescriptor>> = BTreeMap::new();
            for row in &application.assets {
                if row.source_priority != priority {
                    continue;
                }
                if let Some(id) = resource_id(&row.descriptor, kind) {
                    level.entry(id).or_default().push(&row.descriptor);
                }
            }
            for (id, rows) in level {
                index.insert(
                    id,
                    match rows.as_slice() {
                        [asset] => (Some(*asset), "stock", ""),
                        _ => (None, "stock", "The exact stock resource key is ambiguous."),
                    },
                );
            }
            for row in &application.ambiguous_resources {
                if row.source_priority == priority
                    && row.resource.resource_type == kind
                    && let Ok(id) = i16::try_from(row.resource.resource_id)
                {
                    index.insert(
                        id,
                        (None, "stock", "The exact stock resource key is ambiguous."),
                    );
                }
            }
        }
    }
    index
}

#[cfg(test)]
mod tests;
