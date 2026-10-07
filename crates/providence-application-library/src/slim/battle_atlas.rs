use providence_core::{
    model::{ClassicResourceKey, StableId},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution, RebuiltV3AssetIndex},
};
use std::collections::BTreeSet;

pub(super) fn normalize_legacy_battle_atlas(
    assets: &mut RebuiltV3AssetIndex,
    scenario_keys: &BTreeSet<ClassicResourceKey>,
    application: &ApplicationMediaCatalog,
) -> Result<(), String> {
    let candidates: Vec<_> = assets
        .assets
        .iter_mut()
        .filter(|asset| asset.kind == "battle-tileset" || asset.id.0 == "classic-battle-tiles-302")
        .collect();
    if candidates.is_empty() {
        return Ok(());
    }
    let resource = ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id: 302,
    };
    if scenario_keys.contains(&resource) {
        return Err("scenario-owned PICT 302 must be regenerated through Classic import, not migrated from a legacy battle role".into());
    }
    let ApplicationMediaResolution::Resolved(_) =
        application.resolve_map_tileset(&StableId("dungeon-top-down-302".into()))
    else {
        return Err(
            "legacy battle atlas migration requires the complete unambiguous application PICT 302 grid".into(),
        );
    };
    let [asset] = candidates.as_slice() else {
        return Err("legacy battle atlas is ambiguous".into());
    };
    if asset.id.0 != "classic-battle-tiles-302"
        || asset.kind != "battle-tileset"
        || asset.resource_type.is_some()
        || asset.resource_id.is_some()
        || asset.mime_type.as_deref() != Some("image/png")
        || asset.width != Some(640)
        || asset.height != Some(640)
        || asset.tile_width != Some(32)
        || asset.tile_height != Some(32)
        || asset.columns != Some(20)
        || asset.rows != Some(20)
    {
        return Err("legacy battle atlas does not match its known compiler contract".into());
    }
    // Native ownership, not a role label or byte inequality, authorizes stock removal.
    let asset = candidates.into_iter().next().unwrap();
    asset.resource_type = Some(resource.resource_type);
    asset.resource_id = Some(resource.resource_id);
    asset.kind = "tileset".into();
    Ok(())
}
