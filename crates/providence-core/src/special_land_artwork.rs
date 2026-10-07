//! Exact signed CICN ownership for new Special Land placements and recipes.
use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot},
    monster_reference_catalog::MonsterReferenceChoice,
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};
use std::collections::BTreeSet;

#[derive(Debug)]
pub struct SpecialLandArtwork<'a> {
    pub asset: &'a AssetDescriptor,
    pub ownership: &'static str,
}

pub fn resolve<'a>(
    snapshot: &'a ProjectSnapshot,
    application: Option<&'a ApplicationMediaCatalog>,
    id: i16,
) -> Result<SpecialLandArtwork<'a>, String> {
    if !(-999..=-1).contains(&id) {
        return Err("New placements require an exact Special Land ID from -999 to -1; marker encodings are not resource IDs.".into());
    }
    let key = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: i32::from(id),
    };
    let mut matches = snapshot
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(&key));
    let resolved = if let Some(asset) = matches.next() {
        if matches.next().is_some() {
            return Err(
                "The scenario contains ambiguous artwork for this exact resource ID.".into(),
            );
        }
        SpecialLandArtwork {
            asset,
            ownership: "scenario",
        }
    } else {
        let catalog = application.ok_or("The stock artwork library is unavailable.")?;
        match catalog.resolve_resource(&key, None) {
            ApplicationMediaResolution::Resolved(row) => SpecialLandArtwork {
                asset: &row.descriptor,
                ownership: "stock",
            },
            ApplicationMediaResolution::Ambiguous => {
                return Err("Stock artwork is ambiguous for this exact resource ID.".into());
            }
            _ => return Err("Artwork is missing for this exact Special Land resource ID.".into()),
        }
    };
    if resolved.asset.mime_type.as_deref() != Some("image/png")
        || resolved.asset.width != Some(32)
        || resolved.asset.height != Some(32)
        || !matches!(
            resolved.asset.kind.as_str(),
            "special-land-tile" | "icon" | "portrait"
        )
    {
        return Err("The owning resource is not usable 32 × 32 Special Land artwork. A scenario override cannot fall through to stock.".into());
    }
    Ok(resolved)
}

pub fn choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<MonsterReferenceChoice> {
    let ids: BTreeSet<i16> = snapshot
        .assets
        .iter()
        .chain(
            application
                .into_iter()
                .flat_map(|catalog| catalog.assets.iter().map(|row| &row.descriptor)),
        )
        .filter_map(|asset| {
            let key = asset.classic_resource.as_ref()?;
            (key.resource_type == "cicn" && key.resource_id < 0)
                .then(|| i16::try_from(key.resource_id).ok())
                .flatten()
        })
        .collect();
    ids.into_iter()
        .map(|id| {
            let resolved = resolve(snapshot, application, id);
            let (target, label, ownership, reason) = match resolved {
                Ok(row) => (
                    Some(row.asset.identity.0.clone()),
                    row.asset.label.clone(),
                    row.ownership,
                    String::new(),
                ),
                Err(reason) => (
                    None,
                    format!("Special Land {id}"),
                    if snapshot.assets.iter().any(|asset| {
                        asset.classic_resource.as_ref().is_some_and(|key| {
                            key.resource_type == "cicn" && key.resource_id == i32::from(id)
                        })
                    }) {
                        "scenario"
                    } else {
                        "stock"
                    },
                    reason,
                ),
            };
            MonsterReferenceChoice {
                identity: format!("special-land:{id}"),
                target_identity: target,
                value: id,
                label,
                detail: "Exact signed Special Land resource · 32 × 32 transparent overlay".into(),
                ownership: ownership.into(),
                available: reason.is_empty(),
                reason,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialLandUse {
    pub identity: crate::model::StableId,
    pub name: String,
    pub cells: usize,
    pub first: crate::model::MapCoordinate,
}

pub fn uses(snapshot: &ProjectSnapshot, id: i16) -> Vec<SpecialLandUse> {
    snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == crate::model::LevelType::Land)
        .filter_map(|map| {
            let positions: Vec<_> = map
                .tiles
                .iter()
                .enumerate()
                .filter(|(_, raw)| {
                    **raw < 0 && crate::codecs::decode_land_cell(**raw).icon_resource_id == Some(id)
                })
                .map(|(index, _)| index)
                .collect();
            positions.first().map(|first| SpecialLandUse {
                identity: map.identity.clone(),
                name: map.name.clone(),
                cells: positions.len(),
                first: crate::model::MapCoordinate {
                    x: (first % 90) as u8,
                    y: (first / 90) as u8,
                },
            })
        })
        .collect()
}
