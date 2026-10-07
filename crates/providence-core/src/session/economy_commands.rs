use crate::codecs::SHOP_ITEM_SLOTS;
use crate::codecs::SHOP_RECORD_BYTES;
use crate::codecs::TREASURE_ITEM_SLOTS;
use crate::codecs::TREASURE_RECORD_BYTES;
use crate::codecs::certified_shop_source;
use crate::codecs::certified_treasure_source;
use crate::codecs::validate_shop_record_shape;
use crate::codecs::validate_treasure_record_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::NativeRecordId;
use crate::model::ProjectOrigin;
use crate::model::ShopRecord;
use crate::model::StableId;
use crate::model::TreasureRecord;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_treasure_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        treasures: Vec<TreasureRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_treasure_import(&sources, &treasures)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .treasures
                    .iter()
                    .chain(treasures.iter())
                    .map(|treasure| treasure.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.treasures = treasures;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_treasure(
        &mut self,
        mut treasure: Box<TreasureRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        treasure.authored = true;
        validate_treasure_record_shape(&treasure).map_err(|error| {
            SessionError::InvalidTreasure {
                identity: treasure.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        let existing = self
            .snapshot
            .treasures
            .iter_mut()
            .find(|candidate| candidate.identity == treasure.identity)
            .ok_or_else(|| SessionError::TreasureNotFound(treasure.identity.clone()))?;
        if existing.native_id != treasure.native_id {
            return Err(SessionError::InvalidTreasure {
                identity: treasure.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = treasure.identity.clone();
        *existing = *treasure;
        Ok(vec![identity])
    }

    pub(super) fn create_treasure(
        &mut self,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = economy_identity("treasure", native_id);
        if native_id.0 > MAX_ECONOMY_NATIVE_ID {
            return Err(SessionError::InvalidTreasure {
                identity,
                reason: format!("native record id must be in 0..={MAX_ECONOMY_NATIVE_ID}"),
            });
        }
        if self
            .snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == "Data TD")
            .and_then(|source| {
                certified_treasure_source(&source.blob.0, source.byte_length as usize)
            })
            .is_some_and(|extent| native_id.0 as usize >= extent.authored_records)
        {
            return Err(SessionError::InvalidTreasure {
                identity,
                reason: "the target slot overlaps preserved compatibility payload".into(),
            });
        }
        if self
            .snapshot
            .treasures
            .iter()
            .any(|record| record.native_id == native_id)
        {
            return Err(SessionError::InvalidTreasure {
                identity,
                reason: "native record id is already occupied".into(),
            });
        }
        self.snapshot.treasures.push(empty_treasure(native_id));
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn clear_treasure(
        &mut self,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = economy_identity("treasure", native_id);
        let existing = self
            .snapshot
            .treasures
            .iter_mut()
            .find(|candidate| candidate.native_id == native_id)
            .ok_or_else(|| SessionError::TreasureNotFound(identity.clone()))?;
        let stable_identity = existing.identity.clone();
        *existing = empty_treasure(native_id);
        existing.identity = stable_identity.clone();
        Ok(vec![stable_identity])
    }

    pub(super) fn retarget_treasure_item(
        &mut self,
        source: StableId,
        slot: u8,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if !(1..=999).contains(&target_id) || usize::from(slot) >= TREASURE_ITEM_SLOTS {
            return Err(SessionError::InvalidTreasureReference { source, slot });
        }
        let treasure = self
            .snapshot
            .treasures
            .iter_mut()
            .find(|candidate| candidate.identity == source)
            .ok_or_else(|| SessionError::TreasureNotFound(source.clone()))?;
        treasure.item_ids[usize::from(slot)] = target_id;
        treasure.authored = true;
        Ok(vec![source])
    }

    pub(super) fn import_classic_shop_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        shops: Vec<ShopRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_shop_import(&sources, &shops)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .shops
                    .iter()
                    .chain(shops.iter())
                    .map(|shop| shop.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.shops = shops;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_shop(
        &mut self,
        mut shop: Box<ShopRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        shop.authored = true;
        validate_shop_record_shape(&shop).map_err(|error| SessionError::InvalidShop {
            identity: shop.identity.clone(),
            reason: error.to_string(),
        })?;
        let existing = self
            .snapshot
            .shops
            .iter_mut()
            .find(|candidate| candidate.identity == shop.identity)
            .ok_or_else(|| SessionError::ShopNotFound(shop.identity.clone()))?;
        if existing.native_id != shop.native_id {
            return Err(SessionError::InvalidShop {
                identity: shop.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = shop.identity.clone();
        *existing = *shop;
        Ok(vec![identity])
    }

    pub(super) fn create_shop(
        &mut self,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = economy_identity("shop", native_id);
        if native_id.0 > MAX_ECONOMY_NATIVE_ID {
            return Err(SessionError::InvalidShop {
                identity,
                reason: format!("native record id must be in 0..={MAX_ECONOMY_NATIVE_ID}"),
            });
        }
        if self
            .snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == "Data SD")
            .and_then(|source| certified_shop_source(&source.blob.0, source.byte_length as usize))
            .is_some_and(|extent| native_id.0 as usize >= extent.authored_records)
        {
            return Err(SessionError::InvalidShop {
                identity,
                reason: "the target slot overlaps preserved compatibility payload".into(),
            });
        }
        if self
            .snapshot
            .shops
            .iter()
            .any(|record| record.native_id == native_id)
        {
            return Err(SessionError::InvalidShop {
                identity,
                reason: "native record id is already occupied".into(),
            });
        }
        if self.snapshot.classic_sources.iter().any(|source| {
            source.native_path == "Data SD"
                && u64::from(native_id.0)
                    < source.byte_length / crate::codecs::SHOP_RECORD_BYTES as u64
        }) {
            return Err(SessionError::InvalidShop {
                identity,
                reason:
                    "the target slot contains retained source data excluded from the Shop table"
                        .into(),
            });
        }
        self.snapshot.shops.push(empty_shop(native_id));
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn clear_shop(
        &mut self,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = economy_identity("shop", native_id);
        let existing = self
            .snapshot
            .shops
            .iter_mut()
            .find(|candidate| candidate.native_id == native_id)
            .ok_or_else(|| SessionError::ShopNotFound(identity.clone()))?;
        let stable_identity = existing.identity.clone();
        *existing = empty_shop(native_id);
        existing.identity = stable_identity.clone();
        Ok(vec![stable_identity])
    }

    pub(super) fn retarget_shop_item(
        &mut self,
        source: StableId,
        slot: u16,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if !(1..=999).contains(&target_id) || usize::from(slot) >= SHOP_ITEM_SLOTS {
            return Err(SessionError::InvalidShopReference { source, slot });
        }
        let shop = self
            .snapshot
            .shops
            .iter_mut()
            .find(|candidate| candidate.identity == source)
            .ok_or_else(|| SessionError::ShopNotFound(source.clone()))?;
        shop.item_ids[usize::from(slot)] = target_id;
        shop.authored = true;
        Ok(vec![source])
    }
}

const MAX_ECONOMY_NATIVE_ID: u32 = i16::MAX as u32;

fn economy_identity(prefix: &str, native_id: NativeRecordId) -> StableId {
    StableId(format!("{prefix}:{}", native_id.0))
}

fn empty_treasure(native_id: NativeRecordId) -> TreasureRecord {
    TreasureRecord {
        identity: economy_identity("treasure", native_id),
        native_id,
        item_ids: vec![0; TREASURE_ITEM_SLOTS],
        experience: 0,
        gold: 0,
        gems: 0,
        jewelry: 0,
        authored: true,
    }
}

fn empty_shop(native_id: NativeRecordId) -> ShopRecord {
    ShopRecord {
        identity: economy_identity("shop", native_id),
        native_id,
        item_ids: vec![0; SHOP_ITEM_SLOTS],
        quantities: vec![0; SHOP_ITEM_SLOTS],
        inflation: 0,
        authored: true,
    }
}

pub(super) fn validate_classic_treasure_import(
    sources: &[ClassicSourceBlob],
    treasures: &[TreasureRecord],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data TD")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded treasures require Data TD provenance".into(),
        ));
    };
    let complete_rows = certified_treasure_source(&source.blob.0, source.byte_length as usize)
        .map(|extent| extent.authored_records)
        .unwrap_or(source.byte_length as usize / TREASURE_RECORD_BYTES);
    if complete_rows != treasures.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data TD complete-row count does not match the decoded treasure count".into(),
        ));
    }
    for (index, treasure) in treasures.iter().enumerate() {
        validate_treasure_record_shape(treasure)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if treasure.native_id.0 != index as u32
            || treasure.identity.0 != format!("treasure:{index}")
            || treasure.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data TD record {index} does not have canonical imported identity/state"
            )));
        }
    }
    Ok(())
}

pub(super) fn validate_classic_shop_import(
    sources: &[ClassicSourceBlob],
    shops: &[ShopRecord],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data SD")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded shops require Data SD provenance".into(),
        ));
    };
    let source_bytes = source.byte_length as usize;
    if shops.len() * SHOP_RECORD_BYTES > source_bytes {
        return Err(SessionError::InvalidClassicImport(
            "Data SD decoded shop prefix exceeds its source length".into(),
        ));
    }
    let mut identities = std::collections::BTreeSet::new();
    for shop in shops {
        let index = shop.native_id.0 as usize;
        validate_shop_record_shape(shop)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if index >= source_bytes / SHOP_RECORD_BYTES
            || !identities.insert(shop.native_id)
            || shop.identity.0 != format!("shop:{index}")
            || shop.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data SD record {index} does not have canonical imported identity/state"
            )));
        }
    }
    Ok(())
}
