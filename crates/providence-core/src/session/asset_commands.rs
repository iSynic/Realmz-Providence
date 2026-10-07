use super::media_commands::monster_appearance_pair_base;
use super::reference_targets::asset_reference_identity;
use super::{EditorSession, SessionError};
use crate::model::{AssetDescriptor, ProjectOrigin, StableId};

impl EditorSession {
    pub(super) fn upsert_text_resource_pair(
        &mut self,
        text: AssetDescriptor,
        style: AssetDescriptor,
    ) -> Result<Vec<StableId>, SessionError> {
        let valid = text.kind == "text-resource"
            && style.kind == "text-style-resource"
            && text.identity != style.identity
            && text.classic_resource.as_ref().is_some_and(|key| {
                key.resource_type == "TEXT"
                    && i16::try_from(key.resource_id).is_ok()
                    && style.classic_resource.as_ref().is_some_and(|other| {
                        other.resource_type == "styl" && other.resource_id == key.resource_id
                    })
            });
        if !valid {
            return Err(SessionError::InvalidMediaPair("TEXT and formatting must have distinct identities and the same signed resource number".into()));
        }
        self.check_asset_upsert(&text)?;
        self.check_asset_upsert(&style)?;
        let mut changed = self.apply_asset_upsert(text)?;
        changed.extend(self.apply_asset_upsert(style)?);
        changed.sort();
        changed.dedup();
        Ok(changed)
    }

    pub(super) fn apply_asset_upsert(
        &mut self,
        asset: AssetDescriptor,
    ) -> Result<Vec<StableId>, SessionError> {
        self.check_asset_upsert(&asset)?;
        let identity = asset.identity.clone();
        let previous_resource = self
            .snapshot
            .assets
            .iter()
            .find(|existing| existing.identity == identity)
            .and_then(|existing| existing.classic_resource.clone());
        let next_resource = asset.classic_resource.clone();
        let previous_reference_identity = self
            .snapshot
            .assets
            .iter()
            .find(|existing| existing.identity == identity)
            .and_then(asset_reference_identity);
        let next_reference_identity = asset_reference_identity(&asset);
        if let Some(existing) = self
            .snapshot
            .assets
            .iter_mut()
            .find(|existing| existing.identity == identity)
        {
            *existing = asset;
        } else {
            self.snapshot.assets.push(asset);
        }
        if let Some(resource) = next_resource.as_ref() {
            self.snapshot
                .classic_resource_removals
                .retain(|removed| removed != resource);
        }
        if matches!(self.snapshot.origin, ProjectOrigin::Imported { .. })
            && previous_resource != next_resource
            && let Some(resource) = previous_resource
        {
            self.snapshot.classic_resource_removals.push(resource);
        }
        self.snapshot.normalize();
        let mut changed = vec![identity];
        changed.extend(previous_reference_identity);
        changed.extend(next_reference_identity);
        changed.sort();
        changed.dedup();
        Ok(changed)
    }

    pub(super) fn check_asset_upsert(&self, asset: &AssetDescriptor) -> Result<(), SessionError> {
        if let Some(resource) = asset.classic_resource.as_ref()
            && monster_appearance_pair_base(&self.snapshot, resource).is_some()
        {
            return Err(SessionError::InvalidMonsterAppearance(
                "an existing monster appearance pair must be replaced atomically".into(),
            ));
        }
        if let Some(resource) = &asset.classic_resource
            && self.snapshot.assets.iter().any(|existing| {
                existing.identity != asset.identity
                    && existing.classic_resource.as_ref() == Some(resource)
            })
        {
            return Err(SessionError::DuplicateAssetResource {
                resource_type: resource.resource_type.clone(),
                resource_id: resource.resource_id,
            });
        }
        Ok(())
    }

    pub(super) fn apply_asset_removal(
        &mut self,
        identity: StableId,
    ) -> Result<Vec<StableId>, SessionError> {
        let existing = self
            .snapshot
            .assets
            .iter()
            .find(|asset| asset.identity == identity)
            .cloned()
            .ok_or_else(|| SessionError::AssetNotFound(identity.clone()))?;
        self.check_asset_removal(&identity)?;
        let reference_identity = asset_reference_identity(&existing);
        let before = self.snapshot.assets.len();
        self.snapshot
            .assets
            .retain(|asset| asset.identity != identity);
        debug_assert_eq!(self.snapshot.assets.len() + 1, before);
        if matches!(self.snapshot.origin, ProjectOrigin::Imported { .. })
            && let Some(resource) = existing.classic_resource
        {
            self.snapshot.classic_resource_removals.push(resource);
        }
        self.snapshot.normalize();
        let mut changed = vec![identity];
        changed.extend(reference_identity);
        Ok(changed)
    }
}
