use providence_core::{
    codecs::{SHOP_RECORD_BYTES, TREASURE_RECORD_BYTES},
    model::StableId,
    rebuilt::{RebuiltV3ReachableOwnerError, RebuiltV3ShopError, RebuiltV3TreasureError},
    references::{ByteProvenance, ReferenceDescriptor, RepairAction},
};
use serde_json::{Value, json};
pub(super) fn catalog_item_error_projection(
    references: &[ReferenceDescriptor],
    error: &RebuiltV3ReachableOwnerError,
) -> Option<Value> {
    match error {
        RebuiltV3ReachableOwnerError::Shop(RebuiltV3ShopError::InvalidItem {
            classic_id,
            slot,
            item_id,
        }) => Some(catalog_item_problem_projection(
            references,
            "shop",
            *classic_id,
            *slot,
            *item_id,
            true,
        )),
        RebuiltV3ReachableOwnerError::Shop(RebuiltV3ShopError::MissingItem {
            classic_id,
            slot,
            item_id,
        }) => Some(catalog_item_problem_projection(
            references,
            "shop",
            *classic_id,
            *slot,
            *item_id,
            false,
        )),
        RebuiltV3ReachableOwnerError::Treasure(RebuiltV3TreasureError::MissingItem {
            classic_id,
            slot,
            item_id,
        }) => Some(catalog_item_problem_projection(
            references,
            "treasure",
            *classic_id,
            *slot,
            *item_id,
            false,
        )),
        _ => None,
    }
}
fn catalog_item_problem_projection(
    references: &[ReferenceDescriptor],
    owner_kind: &'static str,
    classic_id: u32,
    slot: usize,
    item_id: i16,
    out_of_range: bool,
) -> Value {
    let source = StableId(format!("{owner_kind}:{classic_id}"));
    let field = format!("itemIds[{slot}]");
    let byte_provenance =
        catalog_item_provenance(references, &source, &field, owner_kind, classic_id, slot);
    let repair_method = if owner_kind == "shop" {
        "shop-reference.retarget"
    } else {
        "treasure-reference.retarget"
    };
    let code = if out_of_range {
        format!("rebuilt.{owner_kind}.item-out-of-range")
    } else {
        format!("rebuilt.{owner_kind}.missing-item")
    };
    let message = if out_of_range {
        format!(
            "{} {} stores out-of-range Classic item {}; expected 1 through 999.",
            source.0, field, item_id
        )
    } else {
        format!("{} {} reaches missing item {}.", source.0, field, item_id)
    };
    json!({
        "id": format!("rebuilt-owner-item|{owner_kind}|{classic_id}|{slot}|{item_id}"),
        "code": code,
        "severity": "error",
        "message": message,
        "source": source,
        "field": field,
        "targetKind": "item",
        "targetId": item_id.to_string(),
        "rawNativeId": item_id,
        "required": true,
        "resolution": if out_of_range { "invalid" } else { "missing" },
        "repairActions": if out_of_range {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::ImportTarget]
        },
        "byteProvenance": byte_provenance,
        "navigation": {
            "documentKind": owner_kind,
            "identity": source,
            "field": field,
        },
        "repair": {
            "method": repair_method,
            "params": {"source": source, "slot": slot},
            "targetParameter": "targetId",
        },
    })
}
fn catalog_item_provenance(
    references: &[ReferenceDescriptor],
    source: &StableId,
    field: &str,
    owner_kind: &str,
    classic_id: u32,
    slot: usize,
) -> Option<ByteProvenance> {
    let descriptor = references
        .iter()
        .find(|reference| &reference.source == source && reference.field.0 == field);
    descriptor
        .and_then(|reference| reference.byte_provenance.clone())
        .or_else(|| {
            let (native_path, record_bytes) = match owner_kind {
                "shop" => ("Data SD", SHOP_RECORD_BYTES),
                "treasure" => ("Data TD", TREASURE_RECORD_BYTES),
                _ => return None,
            };
            let byte_start = classic_id as usize * record_bytes + slot * 2;
            Some(ByteProvenance {
                native_path: native_path.into(),
                record_index: classic_id,
                byte_start: byte_start as u32,
                byte_end: byte_start as u32 + 2,
            })
        })
}
