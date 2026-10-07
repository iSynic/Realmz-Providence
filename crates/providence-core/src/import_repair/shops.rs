use super::{RepairAssessment, RepairChange, RepairEntry};
use crate::{
    codecs::{decode_shops, source_shop_record},
    model::{ProjectSnapshot, ShopRecord},
};
use std::collections::BTreeMap;

pub(super) fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    assessment: &mut RepairAssessment,
) {
    let Some(bytes) = files.get("Data SD") else {
        return;
    };
    for excluded in decode_shops(bytes).quarantined_records {
        let Some(current) = snapshot
            .shops
            .iter()
            .find(|shop| shop.native_id == excluded.native_id)
        else {
            continue;
        };
        let original = source_shop_record(bytes, excluded.native_id);
        assessment.entries.push(RepairEntry {
            key: format!("shop:{}:quarantine", excluded.native_id.0),
            family: "Shops".into(),
            entity: current.identity.clone(),
            field: "inventory interpretation".into(),
            conflict: current.authored || original.as_ref() != Some(current),
            change: RepairChange::ShopQuarantine {
                expected: Box::new(current.clone()),
                reason: excluded.reason.into(),
            },
        });
    }
}

pub(super) fn apply(snapshot: &mut ProjectSnapshot, expected: &ShopRecord) -> Result<(), String> {
    let index = snapshot
        .shops
        .iter()
        .position(|shop| shop.native_id == expected.native_id)
        .ok_or("Shop destination is unavailable; review the correction again.")?;
    if snapshot.shops[index] != *expected {
        return Err("Shop inventory changed; review the correction again.".into());
    }
    // Removing the decoded interpretation never removes its captured native bytes.
    snapshot.shops.remove(index);
    Ok(())
}
