use crate::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE;
use crate::model::AssetDescriptor;
use crate::model::BlobId;
use crate::model::ClassicResourceKey;
use crate::model::ClassicSourceBlob;
use crate::model::ProjectOrigin;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_media_catalog(
        &mut self,
        annex_blob: BlobId,
        source: ClassicSourceBlob,
        assets: Vec<AssetDescriptor>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_scenario_resource_import(&source, &assets)?;
        let incoming_resources = assets
            .iter()
            .filter_map(|asset| asset.classic_resource.clone())
            .collect::<BTreeSet<_>>();
        let mut changed = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .assets
                    .iter()
                    .filter(|asset| {
                        asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE
                            || asset
                                .classic_resource
                                .as_ref()
                                .is_some_and(|resource| incoming_resources.contains(resource))
                    })
                    .map(|asset| asset.identity.clone()),
            )
            .chain(assets.iter().map(|asset| asset.identity.clone()))
            .collect::<Vec<_>>();
        self.snapshot.assets.retain(|asset| {
            asset.source != CLASSIC_SCENARIO_RESOURCE_SOURCE
                && asset
                    .classic_resource
                    .as_ref()
                    .is_none_or(|resource| !incoming_resources.contains(resource))
        });
        self.snapshot.assets.extend(assets);
        self.snapshot
            .classic_resource_removals
            .retain(|resource| !incoming_resources.contains(resource));
        self.snapshot
            .classic_sources
            .retain(|existing| existing.native_path != source.native_path);
        self.snapshot.classic_sources.push(source);
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.normalize();
        changed.sort();
        changed.dedup();
        Ok(changed)
    }

    pub(super) fn upsert_monster_appearance_pair(
        &mut self,
        base: Box<AssetDescriptor>,
        facing: Box<AssetDescriptor>,
    ) -> Result<Vec<StableId>, SessionError> {
        let (base_key, facing_key) = validate_monster_appearance_pair(&base, &facing)?;
        let incoming_identities = BTreeSet::from([base.identity.clone(), facing.identity.clone()]);
        let pair_keys = BTreeSet::from([base_key.clone(), facing_key.clone()]);
        if self.snapshot.assets.iter().any(|asset| {
            incoming_identities.contains(&asset.identity)
                && asset
                    .classic_resource
                    .as_ref()
                    .is_none_or(|resource| !pair_keys.contains(resource))
        }) {
            return Err(SessionError::InvalidMonsterAppearance(
                "a pair identity already belongs to a different resource".into(),
            ));
        }
        let mut changed = self
            .snapshot
            .assets
            .iter()
            .filter(|asset| {
                incoming_identities.contains(&asset.identity)
                    || asset
                        .classic_resource
                        .as_ref()
                        .is_some_and(|resource| pair_keys.contains(resource))
            })
            .map(|asset| asset.identity.clone())
            .collect::<Vec<_>>();
        self.snapshot.assets.retain(|asset| {
            !incoming_identities.contains(&asset.identity)
                && asset
                    .classic_resource
                    .as_ref()
                    .is_none_or(|resource| !pair_keys.contains(resource))
        });
        changed.extend([base.identity.clone(), facing.identity.clone()]);
        self.snapshot.assets.extend([*base, *facing]);
        self.snapshot
            .classic_resource_removals
            .retain(|resource| !pair_keys.contains(resource));
        self.snapshot.normalize();
        changed.sort();
        changed.dedup();
        Ok(changed)
    }

    pub(super) fn remove_monster_appearance_pair(
        &mut self,
        icon_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let (base_key, facing_key) = monster_appearance_pair_keys(icon_id)?;
        let pair_keys = BTreeSet::from([base_key.clone(), facing_key.clone()]);
        let mut changed = self
            .snapshot
            .assets
            .iter()
            .filter(|asset| {
                asset
                    .classic_resource
                    .as_ref()
                    .is_some_and(|resource| pair_keys.contains(resource))
            })
            .map(|asset| asset.identity.clone())
            .collect::<Vec<_>>();
        if changed.is_empty() {
            return Err(SessionError::InvalidMonsterAppearance(format!(
                "scenario override {icon_id}/{} was not found",
                i32::from(icon_id) + crate::monster_appearance::MONSTER_ICON_PAIR_OFFSET
            )));
        }
        self.snapshot.assets.retain(|asset| {
            asset
                .classic_resource
                .as_ref()
                .is_none_or(|resource| !pair_keys.contains(resource))
        });
        if matches!(self.snapshot.origin, ProjectOrigin::Imported { .. }) {
            self.snapshot
                .classic_resource_removals
                .extend([base_key, facing_key]);
        }
        self.snapshot.normalize();
        changed.sort();
        changed.dedup();
        Ok(changed)
    }
}

pub(super) fn validate_classic_scenario_resource_import(
    source: &ClassicSourceBlob,
    assets: &[AssetDescriptor],
) -> Result<(), SessionError> {
    if source.native_path != "Scenario.rsrc" || source.byte_length == 0 {
        return Err(SessionError::InvalidClassicImport(
            "media catalog source must be a non-empty Scenario.rsrc".into(),
        ));
    }
    let mut identities = BTreeSet::new();
    let mut resources = BTreeSet::new();
    for asset in assets {
        let Some(resource) = &asset.classic_resource else {
            return Err(SessionError::InvalidClassicImport(format!(
                "media asset '{}' lacks an exact Classic resource key",
                asset.identity.0
            )));
        };
        if !matches!(
            resource.resource_type.as_str(),
            "PICT" | "cicn" | "snd " | "TEXT" | "styl"
        ) || !identities.insert(asset.identity.clone())
            || !resources.insert(resource.clone())
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "media asset '{}' has an unsupported or duplicate identity/resource key",
                asset.identity.0
            )));
        }
        let expected_identity = resource_asset_identity(asset, resource)?;
        let valid_shape = resource_asset_shape(asset, resource);
        let permits_empty_payload = matches!(resource.resource_type.as_str(), "TEXT" | "styl");
        if asset.identity.0 != expected_identity
            || asset.source != CLASSIC_SCENARIO_RESOURCE_SOURCE
            || (!permits_empty_payload && asset.byte_length == 0)
            || asset.classic_payload_blob.is_none()
            || asset
                .classic_payload_byte_length
                .is_none_or(|length| !permits_empty_payload && length == 0)
            || !valid_shape
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "media asset '{}' has non-canonical identity, provenance, payload, or runtime metadata",
                asset.identity.0
            )));
        }
    }
    Ok(())
}

pub(super) fn monster_appearance_pair_keys(
    icon_id: i16,
) -> Result<(ClassicResourceKey, ClassicResourceKey), SessionError> {
    let base_id = i32::from(icon_id);
    let facing_id = base_id + crate::monster_appearance::MONSTER_ICON_PAIR_OFFSET;
    if base_id <= 0 || facing_id > i32::from(i16::MAX) {
        return Err(SessionError::InvalidMonsterAppearance(format!(
            "base icon id {icon_id} cannot name a positive signed-short pair separated by {}",
            crate::monster_appearance::MONSTER_ICON_PAIR_OFFSET
        )));
    }
    Ok((
        ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: base_id,
        },
        ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: facing_id,
        },
    ))
}

pub(super) fn validate_monster_appearance_pair(
    base: &AssetDescriptor,
    facing: &AssetDescriptor,
) -> Result<(ClassicResourceKey, ClassicResourceKey), SessionError> {
    let base_key = base.classic_resource.as_ref().ok_or_else(|| {
        SessionError::InvalidMonsterAppearance("base image lacks a Classic resource key".into())
    })?;
    let icon_id = i16::try_from(base_key.resource_id).map_err(|_| {
        SessionError::InvalidMonsterAppearance(format!(
            "base resource id {} does not fit a signed short",
            base_key.resource_id
        ))
    })?;
    let (expected_base, expected_facing) = monster_appearance_pair_keys(icon_id)?;
    if base_key != &expected_base
        || facing.classic_resource.as_ref() != Some(&expected_facing)
        || base.identity == facing.identity
    {
        return Err(SessionError::InvalidMonsterAppearance(format!(
            "the pair must own exact cicn resources {} and {} with distinct identities",
            expected_base.resource_id, expected_facing.resource_id
        )));
    }
    for (role, asset) in [("base", base), ("facing", facing)] {
        if asset.classic_payload_blob.is_none()
            || asset
                .classic_payload_byte_length
                .is_none_or(|length| length == 0)
            || asset.byte_length == 0
        {
            return Err(SessionError::InvalidMonsterAppearance(format!(
                "{role} image is missing a durable runtime or Classic payload"
            )));
        }
    }
    Ok((expected_base, expected_facing))
}

pub(super) fn monster_appearance_pair_base(
    snapshot: &ProjectSnapshot,
    resource: &ClassicResourceKey,
) -> Option<i16> {
    if resource.resource_type != "cicn" {
        return None;
    }
    let offset = crate::monster_appearance::MONSTER_ICON_PAIR_OFFSET;
    let candidates = [resource.resource_id, resource.resource_id - offset];
    candidates.into_iter().find_map(|base_id| {
        let icon_id = i16::try_from(base_id).ok()?;
        let (base, facing) = monster_appearance_pair_keys(icon_id).ok()?;
        let has_base = snapshot
            .assets
            .iter()
            .any(|asset| asset.classic_resource.as_ref() == Some(&base));
        let has_facing = snapshot
            .assets
            .iter()
            .any(|asset| asset.classic_resource.as_ref() == Some(&facing));
        (has_base && has_facing).then_some(icon_id)
    })
}

fn resource_asset_identity(
    asset: &AssetDescriptor,
    resource: &ClassicResourceKey,
) -> Result<String, SessionError> {
    Ok(match asset.kind.as_str() {
        "tileset" if resource.resource_type == "PICT" && resource.resource_id == 302 => {
            "dungeon-top-down-302".into()
        }
        "tileset"
            if resource.resource_type == "PICT"
                && resource.resource_id != 302
                && (300..=310).contains(&resource.resource_id) =>
        {
            format!("classic.landlook.{}", resource.resource_id - 300)
        }
        "picture" if resource.resource_type == "PICT" => {
            format!("picture:{}", resource.resource_id)
        }
        "sound" if resource.resource_type == "snd " => {
            format!("sound:{}", resource.resource_id)
        }
        "special-land-tile" if resource.resource_type == "cicn" && resource.resource_id < 0 => {
            format!("special-land.{}", resource.resource_id)
        }
        "portrait"
            if resource.resource_type == "cicn" && (257..=376).contains(&resource.resource_id) =>
        {
            format!("portrait:{}", resource.resource_id)
        }
        "combat-icon"
            if resource.resource_type == "cicn"
                && (9000..=9119).contains(&resource.resource_id) =>
        {
            format!("combat-icon:{}", resource.resource_id)
        }
        "icon" if resource.resource_type == "cicn" && resource.resource_id >= 0 => {
            format!("icon:{}", resource.resource_id)
        }
        "text-resource" if resource.resource_type == "TEXT" => {
            format!("classic-resource:TEXT:{}", resource.resource_id)
        }
        "text-style-resource" if resource.resource_type == "styl" => {
            format!("classic-resource:styl:{}", resource.resource_id)
        }
        _ => {
            return Err(SessionError::InvalidClassicImport(format!(
                "media asset '{}' kind does not match its Classic resource key",
                asset.identity.0
            )));
        }
    })
}

fn resource_asset_shape(asset: &AssetDescriptor, resource: &ClassicResourceKey) -> bool {
    match asset.kind.as_str() {
        "tileset" => {
            asset.mime_type.as_deref() == Some("image/png")
                && asset.extension.as_deref() == Some("png")
                && tileset_grid_matches(asset, resource)
                && asset.duration_ms.is_none()
                && asset.sample_rate.is_none()
                && asset.channels.is_none()
        }
        "picture" | "icon" | "special-land-tile" | "portrait" | "combat-icon" => {
            asset.mime_type.as_deref() == Some("image/png")
                && asset.extension.as_deref() == Some("png")
                && asset.width.unwrap_or_default() > 0
                && asset.height.unwrap_or_default() > 0
                && asset.duration_ms.is_none()
                && asset.sample_rate.is_none()
                && asset.channels.is_none()
        }
        "sound" => {
            asset.mime_type.as_deref() == Some("audio/wav")
                && asset.extension.as_deref() == Some("wav")
                && asset.duration_ms.is_some()
                && asset.sample_rate.unwrap_or_default() > 0
                && matches!(asset.channels, Some(1 | 2))
                && asset.width.is_none()
                && asset.height.is_none()
        }
        "text-resource" => {
            asset.mime_type.as_deref() == Some("text/plain")
                && asset.extension.as_deref() == Some("txt")
                && asset.width.is_none()
                && asset.height.is_none()
                && asset.duration_ms.is_none()
                && asset.sample_rate.is_none()
                && asset.channels.is_none()
        }
        "text-style-resource" => {
            asset.mime_type.as_deref() == Some("application/octet-stream")
                && asset.extension.as_deref() == Some("bin")
                && asset.width.is_none()
                && asset.height.is_none()
                && asset.duration_ms.is_none()
                && asset.sample_rate.is_none()
                && asset.channels.is_none()
        }
        _ => false,
    }
}

fn tileset_grid_matches(asset: &AssetDescriptor, resource: &ClassicResourceKey) -> bool {
    if resource.resource_id == 302 {
        asset.width == Some(64)
            && asset.height == Some(64)
            && asset.tile_width == Some(16)
            && asset.tile_height == Some(16)
            && asset.columns == Some(4)
            && asset.rows == Some(4)
            && asset.landlook == Some(2)
    } else {
        asset.width == Some(640)
            && asset.height == Some(320)
            && asset.tile_width == Some(32)
            && asset.tile_height == Some(32)
            && asset.columns == Some(20)
            && asset.rows == Some(10)
            && asset.landlook == Some((resource.resource_id - 300) as i8)
    }
}
