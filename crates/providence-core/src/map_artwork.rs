//! Exact scenario resource ownership precedes map presentation role checks.

use crate::model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot, StableId};

pub enum MapArtworkResolution<'a> {
    Resolved(&'a AssetDescriptor),
    Missing,
    WrongKind,
    Ambiguous,
}

pub fn resource_key(identity: &StableId) -> Option<ClassicResourceKey> {
    let resource_id = if identity.0 == "dungeon-top-down-302" {
        302
    } else {
        let look = identity
            .0
            .strip_prefix("classic.landlook.")
            .or_else(|| identity.0.strip_prefix("landlook-"))?
            .parse::<i32>()
            .ok()?;
        if !(0..=10).contains(&look) || look == 2 {
            return None;
        }
        300 + look
    };
    Some(ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id,
    })
}

pub fn scenario<'a>(
    snapshot: &'a ProjectSnapshot,
    identity: &StableId,
) -> MapArtworkResolution<'a> {
    let key = resource_key(identity);
    let mut rows = snapshot.assets.iter().filter(|asset| {
        asset.identity == *identity
            || key
                .as_ref()
                .is_some_and(|key| asset.classic_resource.as_ref() == Some(key))
    });
    let Some(asset) = rows.next() else {
        return MapArtworkResolution::Missing;
    };
    if rows.next().is_some() {
        return MapArtworkResolution::Ambiguous;
    }
    if asset.kind != "tileset" || asset.mime_type.as_deref() != Some("image/png") {
        return MapArtworkResolution::WrongKind;
    }
    if key
        .as_ref()
        .is_some_and(|key| asset.classic_resource.as_ref() != Some(key))
    {
        return MapArtworkResolution::WrongKind;
    }
    let full_shared = key.as_ref().is_some_and(|key| key.resource_id == 302);
    if key.is_some()
        && (asset.width != Some(640)
            || asset.height != Some(if full_shared { 640 } else { 320 })
            || asset.tile_width != Some(32)
            || asset.tile_height != Some(32)
            || asset.columns != Some(20)
            || asset.rows != Some(if full_shared { 20 } else { 10 }))
    {
        return MapArtworkResolution::WrongKind;
    }
    MapArtworkResolution::Resolved(asset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::BlobId;

    fn asset() -> AssetDescriptor {
        serde_json::from_value(serde_json::json!({"identity":"scenario:picture:300","label":"Custom Plains","kind":"tileset","mimeType":"image/png",
            "classicResource":{"resourceType":"PICT","resourceId":300},"blob":BlobId("a".repeat(64)),"byteLength":1,"width":640,"height":320,"tileWidth":32,"tileHeight":32,"columns":20,"rows":10,"source":"Scenario"})).unwrap()
    }

    #[test]
    fn exact_picture_key_shadows_stock_even_with_a_different_catalog_identity() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("map-art".into()));
        snapshot.assets.push(asset());
        let identity = StableId("classic.landlook.0".into());
        assert!(matches!(
            scenario(&snapshot, &identity),
            MapArtworkResolution::Resolved(_)
        ));
        snapshot.assets[0].kind = "picture".into();
        assert!(matches!(
            scenario(&snapshot, &identity),
            MapArtworkResolution::WrongKind
        ));
        snapshot.assets.push(asset());
        assert!(matches!(
            scenario(&snapshot, &identity),
            MapArtworkResolution::Ambiguous
        ));
    }

    #[test]
    fn shared_dungeon_sheet_requires_the_complete_exact_grid() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-art".into()));
        let mut art = asset();
        art.classic_resource.as_mut().unwrap().resource_id = 302;
        snapshot.assets.push(art);
        let identity = StableId("dungeon-top-down-302".into());
        assert!(matches!(
            scenario(&snapshot, &identity),
            MapArtworkResolution::WrongKind
        ));
        snapshot.assets[0].height = Some(640);
        snapshot.assets[0].rows = Some(20);
        assert!(matches!(
            scenario(&snapshot, &identity),
            MapArtworkResolution::Resolved(_)
        ));
        assert!(resource_key(&StableId("classic.landlook.2".into())).is_none());
    }
}
